import type { Round } from "../round";

export interface IRoundRepository {
  findById(roundId: string): Promise<Round | undefined>;
  findAll(): Promise<Round[]>;
  save(round: Round): Promise<void>;
}
