/**
 * Inbox port for deduplicating incoming integration messages.
 *
 * Prevents at-least-once delivery from causing duplicate side effects. Under
 * normal conditions the state-machine checks inside each use case are
 * sufficient. The inbox adds a fast-path guard before any domain work, which
 * is useful when reprocessing large backlogs or when a bug temporarily allowed
 * a terminal state to be revisited.
 *
 * Recommended key format: `${event.type}:${event.correlationId}` — unique per
 * bet lifecycle event because correlationId = betId and each event type fires
 * at most once per bet.
 *
 * Production implementation: a DB table with a unique constraint on (key) and
 * a TTL so old entries are cleaned up automatically. The check and mark must
 * run inside the same transaction as the domain write to guarantee that a
 * process crash between them cannot leave the inbox inconsistent.
 */
export interface IInbox {
  hasProcessed(messageKey: string): Promise<boolean>;
  markProcessed(messageKey: string): Promise<void>;
}
