/**
 * Common envelope for all integration messages.
 *
 * correlationId ties a command to its resulting events (use betId as the value).
 * occurredAt is an ISO-8601 string so the payload serializes cleanly to JSON.
 */
export interface MessageEnvelope {
  readonly correlationId: string;
  readonly occurredAt: string;
}
