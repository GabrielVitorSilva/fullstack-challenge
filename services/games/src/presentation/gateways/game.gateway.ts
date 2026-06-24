import {
  OnGatewayConnection,
  OnGatewayInit,
  WebSocketGateway,
  WebSocketServer,
} from "@nestjs/websockets";
import { Server, WebSocket } from "ws";
import { RoundLifecycleService } from "../../application/services/round-lifecycle.service";
import type { GameWsEvent } from "../../domain/game-events";
import { buildRoundStateEvent } from "../mappers/round-state.mapper";

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

    const stateEvent = buildRoundStateEvent(
      round,
      this.lifecycle.getCurrentMultiplier(),
      this.lifecycle.getCurrentBettingEndsAt(),
      (betId) => this.lifecycle.getCashoutDetail(betId),
    );

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
