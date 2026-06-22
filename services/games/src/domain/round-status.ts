export enum RoundStatus {
  BETTING = "BETTING",
  IN_PROGRESS = "IN_PROGRESS",
  CRASHED = "CRASHED",
  CANCELLED = "CANCELLED",
}

export const VALID_TRANSITIONS: Record<RoundStatus, RoundStatus[]> = {
  [RoundStatus.BETTING]: [RoundStatus.IN_PROGRESS, RoundStatus.CANCELLED],
  [RoundStatus.IN_PROGRESS]: [RoundStatus.CRASHED],
  [RoundStatus.CRASHED]: [],
  [RoundStatus.CANCELLED]: [],
};
