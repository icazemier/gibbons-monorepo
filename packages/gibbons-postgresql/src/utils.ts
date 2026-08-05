import type { Pool, PoolClient } from 'pg';
import type { Gibbon } from '@icazemier/gibbons';

/**
 * Authorization predicate for "actual holds every required bit".
 *
 * Plain bitmask containment is *vacuously true* against an empty requirement
 * set — `(byte & 0) === 0` holds for every byte — so `hasAllFromGibbon` returns
 * `true` for a user with no permissions at all whenever the required set is
 * empty. A caller that derives its requirement dynamically (`routePermissions
 * [path] ?? []`, an empty parse result) would get an open gate from a lookup
 * miss. Authorization fails closed here: nothing required means nothing proven.
 *
 * @param actual - Bits the subject actually holds
 * @param required - Bits the subject must hold; empty is never satisfied
 */
export function hasAllRequired(actual: Gibbon, required: Gibbon): boolean {
  if (required.getPositionsArray().length === 0) {
    return false;
  }
  return actual.hasAllFromGibbon(required);
}

/**
 * Runs a callback inside a PostgreSQL transaction.
 * Acquires a client from the pool, issues `BEGIN`, invokes `fn(client)`, and then
 * `COMMIT`s on success or `ROLLBACK`s on failure. The client is always released
 * back to the pool.
 *
 * @param pool - Connected PostgreSQL pool
 * @param fn - Async callback receiving the transactional client; pass it to every
 *             query you want to run inside the transaction.
 * @returns The value returned by `fn`
 */
export async function withTransaction<T>(
  pool: Pool,
  fn: (client: PoolClient) => Promise<T>
): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    try {
      await client.query('ROLLBACK');
    } catch (rollbackErr) {
      throw new AggregateError(
        [err, rollbackErr],
        'Transaction failed and ROLLBACK also failed',
        { cause: rollbackErr }
      );
    }
    throw err;
  } finally {
    client.release();
  }
}

export class Utils {
  /**
   * Generates a sequence 1 - n (amount) to use as async generator.
   *
   * @param amount - The number of items to generate in the sequence
   * @returns An async iterable that yields numbers from 1 to amount
   *
   * @example
   * ```typescript
   * for await (const num of Utils.sequenceGenerator(5)) {
   *   console.log(num); // Prints: 1, 2, 3, 4, 5
   * }
   * ```
   */
  public static async *sequenceGenerator(
    amount: number
  ): AsyncGenerator<number> {
    if (!Number.isInteger(amount) || amount < 0) {
      throw new RangeError('amount must be a non-negative integer');
    }
    for (let i = 1; i <= amount; i++) {
      yield i;
    }
  }
}
