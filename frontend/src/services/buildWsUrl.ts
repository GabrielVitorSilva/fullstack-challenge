/**
 * Derives the WebSocket URL for the games real-time feed.
 *
 * The URL is built from VITE_API_BASE_URL (the Kong gateway base), which is
 * the same origin already used by all REST calls. This keeps WS and HTTP
 * traffic on the same host:port, making both dev and production work without
 * any nginx WebSocket proxy.
 *
 * Examples:
 *   VITE_API_BASE_URL=http://localhost:8000  →  ws://localhost:8000/games/ws
 *   VITE_API_BASE_URL=https://api.example.com  →  wss://api.example.com/games/ws
 */
export function buildWsUrl(): string {
  const apiBase = import.meta.env.VITE_API_BASE_URL ?? "http://localhost:8000";
  const wsProtocol = apiBase.startsWith("https") ? "wss:" : "ws:";
  const { host } = new URL(apiBase);
  return `${wsProtocol}//${host}/games/ws`;
}
