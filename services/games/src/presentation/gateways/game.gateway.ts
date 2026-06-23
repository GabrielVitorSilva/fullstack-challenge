import {
  OnGatewayConnection,
  OnGatewayInit,
  WebSocketGateway,
  WebSocketServer,
} from "@nestjs/websockets";
import { Server, WebSocket } from "ws";
import { RoundLifecycleService } from "../../application/services/round-lifecycle.service";
import type { GameWsEvent, LiveBetSnapshot, RoundStateEvent } from "../../domain/game-events";
import { GAME_WS_EVENT, betStatusToSnapshotStatus } from "../../domain/game-events";
import { RoundStatus } from "../../domain/round-status";

// Kong strips the "/games" prefix before forwarding to this service,
// so the gateway must listen at "/ws" (not "/games/ws").
@WebSocketGateway({ path: "/ws" })
export class GameGateway implements OnGatewayInit, OnGatewayConnection {
  @WebSocketServer()
  private server!: Server;

  constructor(private readonly lifecycle: RoundLifecycleService) {}

  afterInit(): void {
    this.lifecycle.setBroadcast((event) => this.broadcastAll(event));
  }

  handleConnection(client: WebSocket): void {
    // Sync the new client to the current round state immediately
    const round = this.lifecycle.getCurrentRound();
    if (!round) return;

    const multiplier = this.lifecycle.getCurrentMultiplier();
    const bettingEndsAt = this.lifecycle.getCurrentBettingEndsAt();

    const phase =
      round.status === RoundStatus.BETTING
        ? "BETTING"
        : round.status === RoundStatus.IN_PROGRESS
          ? "IN_PROGRESS"
          : "CRASHED";

    const bets: LiveBetSnapshot[] = round.bets
      .map((bet) => {
        const snapshotStatus = betStatusToSnapshotStatus(bet.status);
        if (!snapshotStatus) return null;
        return {
          betId: bet.id,
          playerId: bet.playerId,
          amountCents: bet.amount.toCents().toString(),
          status: snapshotStatus,
        } satisfies LiveBetSnapshot;
      })
      .filter((b): b is LiveBetSnapshot => b !== null);

    const stateEvent: RoundStateEvent = {
      type: GAME_WS_EVENT.ROUND_STATE,
      roundId: round.id,
      phase,
      multiplier,
      ...(bettingEndsAt ? { bettingEndsAt } : {}),
      ...(bets.length > 0 ? { bets } : {}),
    };

    this.sendTo(client, stateEvent);
  }

  private broadcastAll(event: GameWsEvent): void {
    if (!this.server) return;
    const payload = JSON.stringify(event);
    this.server.clients.forEach((client) => {
      if (client.readyState === WebSocket.OPEN) {
        client.send(payload);
      }
    });
  }

  private sendTo(client: WebSocket, event: GameWsEvent): void {
    if (client.readyState === WebSocket.OPEN) {
      client.send(JSON.stringify(event));
    }
  }
}
