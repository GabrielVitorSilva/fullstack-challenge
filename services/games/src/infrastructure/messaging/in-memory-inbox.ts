import type { IInbox } from "../../application/ports/inbox.port";

/**
 * Volatile in-memory inbox — suitable for unit tests and local development.
 *
 * In production, replace with a DB-backed implementation that wraps the check
 * and mark in the same transaction as the domain write (see IInbox for details).
 */
export class InMemoryInbox implements IInbox {
  private readonly _processed = new Set<string>();

  async hasProcessed(messageKey: string): Promise<boolean> {
    return this._processed.has(messageKey);
  }

  async markProcessed(messageKey: string): Promise<void> {
    this._processed.add(messageKey);
  }

  get size(): number {
    return this._processed.size;
  }
}
