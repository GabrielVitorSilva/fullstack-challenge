import type { MessageEnvelope } from "@crash/contracts";
import type { Round } from "../../domain/round";

/**
 * Atomic write port: persists round state and outbound integration messages
 * in a single logical operation.
 *
 * Why this matters: if `save` and `publish` are two separate calls, a process
 * crash between them leaves the system in an inconsistent state — state was
 * updated but the downstream service never received the command.
 *
 * Implementations backed by a relational database should write to both the
 * rounds table and an outbox table inside the same transaction. A separate
 * relay process (or CDC hook) then reads from the outbox and publishes to the
 * broker, guaranteeing at-least-once delivery regardless of process failures.
 *
 * The in-memory implementation (InMemoryOutbox) is used in tests and simulates
 * atomicity because both writes happen in the same process synchronously.
 */
export interface IOutbox {
  saveAndEmit(round: Round, events: ReadonlyArray<MessageEnvelope>): Promise<void>;
}
