import type { Round } from "../round";

export interface IRoundRepository {
  findById(roundId: string): Promise<Round | undefined>;
  save(round: Round): Promise<void>;
}
