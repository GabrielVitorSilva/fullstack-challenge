import { describe, expect, it } from "bun:test";
import {
  CREDIT_WALLET_COMMAND,
  DEBIT_WALLET_COMMAND,
  WALLET_CREDITED_EVENT,
  WALLET_DEBIT_FAILED_EVENT,
  WALLET_DEBITED_EVENT,
  buildCreditWalletCommand,
  buildDebitWalletCommand,
  buildWalletCreditedEvent,
  buildWalletDebitFailedEvent,
  buildWalletDebitedEvent,
} from "../../src/index";

describe("DebitWalletCommand", () => {
  it("has the correct type discriminant", () => {
    const cmd = buildDebitWalletCommand("bet-1", "round-1", "player-1", 500n);
    expect(cmd.type).toBe(DEBIT_WALLET_COMMAND);
  });

  it("serializes amountCents as a string", () => {
    const cmd = buildDebitWalletCommand("bet-1", "round-1", "player-1", 9_007_199_254_740_993n);
    expect(typeof cmd.amountCents).toBe("string");
    expect(cmd.amountCents).toBe("9007199254740993");
  });

  it("uses betId as correlationId", () => {
    const cmd = buildDebitWalletCommand("bet-42", "round-1", "player-1", 100n);
    expect(cmd.correlationId).toBe("bet-42");
    expect(cmd.betId).toBe("bet-42");
  });

  it("has an ISO-8601 occurredAt", () => {
    const cmd = buildDebitWalletCommand("bet-1", "round-1", "player-1", 100n);
    expect(() => new Date(cmd.occurredAt)).not.toThrow();
    expect(new Date(cmd.occurredAt).toISOString()).toBe(cmd.occurredAt);
  });

  it("survives a JSON round-trip without data loss", () => {
    const original = buildDebitWalletCommand("bet-1", "round-1", "player-1", 500n);
    const roundTripped = JSON.parse(JSON.stringify(original));
    expect(roundTripped.type).toBe(original.type);
    expect(roundTripped.betId).toBe(original.betId);
    expect(roundTripped.roundId).toBe(original.roundId);
    expect(roundTripped.playerId).toBe(original.playerId);
    expect(roundTripped.amountCents).toBe(original.amountCents);
    expect(roundTripped.correlationId).toBe(original.correlationId);
    expect(roundTripped.occurredAt).toBe(original.occurredAt);
  });
});

describe("CreditWalletCommand", () => {
  it("has the correct type discriminant", () => {
    const cmd = buildCreditWalletCommand("bet-1", "round-1", "player-1", 1250n);
    expect(cmd.type).toBe(CREDIT_WALLET_COMMAND);
  });

  it("carries the payout amount as string", () => {
    const cmd = buildCreditWalletCommand("bet-1", "round-1", "player-1", 1250n);
    expect(cmd.amountCents).toBe("1250");
  });

  it("uses betId as correlationId", () => {
    const cmd = buildCreditWalletCommand("bet-99", "round-1", "player-1", 1250n);
    expect(cmd.correlationId).toBe("bet-99");
  });
});

describe("WalletDebitedEvent", () => {
  it("has the correct type discriminant", () => {
    const event = buildWalletDebitedEvent("bet-1", "round-1", "player-1", 500n);
    expect(event.type).toBe(WALLET_DEBITED_EVENT);
  });

  it("carries all identifying fields", () => {
    const event = buildWalletDebitedEvent("bet-1", "round-1", "player-1", 500n);
    expect(event.betId).toBe("bet-1");
    expect(event.roundId).toBe("round-1");
    expect(event.playerId).toBe("player-1");
    expect(event.amountCents).toBe("500");
  });
});

describe("WalletDebitFailedEvent", () => {
  it("has the correct type discriminant", () => {
    const event = buildWalletDebitFailedEvent("bet-1", "round-1", "player-1", "INSUFFICIENT_FUNDS");
    expect(event.type).toBe(WALLET_DEBIT_FAILED_EVENT);
  });

  it("carries the failure reason", () => {
    const event = buildWalletDebitFailedEvent("bet-1", "round-1", "player-1", "INSUFFICIENT_FUNDS");
    expect(event.reason).toBe("INSUFFICIENT_FUNDS");
  });

  it("supports WALLET_NOT_FOUND reason", () => {
    const event = buildWalletDebitFailedEvent("bet-1", "round-1", "player-1", "WALLET_NOT_FOUND");
    expect(event.reason).toBe("WALLET_NOT_FOUND");
  });
});

describe("WalletCreditedEvent", () => {
  it("has the correct type discriminant", () => {
    const event = buildWalletCreditedEvent("bet-1", "round-1", "player-1", 1250n);
    expect(event.type).toBe(WALLET_CREDITED_EVENT);
  });

  it("carries all identifying fields", () => {
    const event = buildWalletCreditedEvent("bet-1", "round-1", "player-1", 1250n);
    expect(event.betId).toBe("bet-1");
    expect(event.roundId).toBe("round-1");
    expect(event.playerId).toBe("player-1");
    expect(event.amountCents).toBe("1250");
  });
});

describe("contract type discriminants are unique", () => {
  it("each message type has a distinct string literal", () => {
    const types = new Set([
      DEBIT_WALLET_COMMAND,
      CREDIT_WALLET_COMMAND,
      WALLET_DEBITED_EVENT,
      WALLET_DEBIT_FAILED_EVENT,
      WALLET_CREDITED_EVENT,
    ]);
    expect(types.size).toBe(5);
  });
});
