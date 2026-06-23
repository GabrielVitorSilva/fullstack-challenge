import { parseGameEvent, type GameServerEvent } from "./ws-events";

export type GameSocketListener = (event: GameServerEvent) => void;
export type ConnectionStateListener = (state: ConnectionState) => void;
export type ConnectionState = "connecting" | "connected" | "disconnected";

const INITIAL_RECONNECT_DELAY_MS = 1_000;
const MAX_RECONNECT_DELAY_MS = 30_000;
const BACKOFF_FACTOR = 2;

export class GameSocketService {
  private ws: WebSocket | null = null;
  private readonly eventListeners = new Set<GameSocketListener>();
  private readonly stateListeners = new Set<ConnectionStateListener>();
  private reconnectTimeout: ReturnType<typeof setTimeout> | null = null;
  private reconnectDelay = INITIAL_RECONNECT_DELAY_MS;
  private closed = false;

  constructor(private readonly url: string) {}

  connect(): void {
    if (this.closed) return;
    this.setConnectionState("connecting");
    this.openSocket();
  }

  disconnect(): void {
    this.closed = true;
    this.clearReconnectTimer();
    this.ws?.close();
    this.ws = null;
    this.setConnectionState("disconnected");
  }

  onEvent(listener: GameSocketListener): () => void {
    this.eventListeners.add(listener);
    return () => this.eventListeners.delete(listener);
  }

  onConnectionState(listener: ConnectionStateListener): () => void {
    this.stateListeners.add(listener);
    return () => this.stateListeners.delete(listener);
  }

  private openSocket(): void {
    const ws = new WebSocket(this.url);
    this.ws = ws;

    ws.onopen = () => {
      this.reconnectDelay = INITIAL_RECONNECT_DELAY_MS;
      this.setConnectionState("connected");
    };

    ws.onmessage = (msg: MessageEvent<string>) => {
      const event = parseGameEvent(msg.data);
      if (event) {
        this.eventListeners.forEach((l) => l(event));
      }
    };

    ws.onerror = () => {
      // onclose fires immediately after onerror — reconnect there
    };

    ws.onclose = () => {
      if (this.closed) return;
      this.setConnectionState("disconnected");
      this.scheduleReconnect();
    };
  }

  private scheduleReconnect(): void {
    this.clearReconnectTimer();
    this.reconnectTimeout = setTimeout(() => {
      if (!this.closed) {
        this.setConnectionState("connecting");
        this.openSocket();
      }
    }, this.reconnectDelay);
    this.reconnectDelay = Math.min(
      this.reconnectDelay * BACKOFF_FACTOR,
      MAX_RECONNECT_DELAY_MS,
    );
  }

  private clearReconnectTimer(): void {
    if (this.reconnectTimeout !== null) {
      clearTimeout(this.reconnectTimeout);
      this.reconnectTimeout = null;
    }
  }

  private setConnectionState(state: ConnectionState): void {
    this.stateListeners.forEach((l) => l(state));
  }
}
