import { Injectable } from '@nestjs/common';
import type { Tx } from '../database/db.service.js';

/**
 * Per-church counters that leave no gaps.
 *
 * The counter row is incremented inside the same transaction that uses the
 * number, so Postgres holds a lock on that one row until the transaction
 * commits: a second clerk saving at the same moment waits a few milliseconds
 * and gets the next number. If the insert then fails, the increment rolls back
 * with it, which is exactly why entry numbers have no gaps.
 *
 * Different keys are different rows, so income never waits for expenses and
 * September never waits for October.
 */
@Injectable()
export class SequenceService {
  /**
   * The next number for this key. **Only** call this inside the transaction
   * that writes the record using it, or the numbers will have gaps.
   */
  async next(tx: Tx, key: string): Promise<number> {
    const rows = await tx.$queryRaw<{ last_value: number }[]>`
      insert into sequences (key, last_value, updated_at)
      values (${key}, 1, now())
      on conflict (key)
      do update set last_value = sequences.last_value + 1, updated_at = now()
      returning last_value`;
    return rows[0]!.last_value;
  }
}
