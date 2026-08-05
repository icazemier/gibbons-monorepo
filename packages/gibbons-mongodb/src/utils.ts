import { ClientSession, MongoClient, Filter, Document } from 'mongodb';
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
 * Guard for statements that must never run unbounded.
 *
 * An empty MongoDB filter matches every document, so `deleteMany({})` or
 * `updateMany({}, …)` would silently touch the whole collection. Mutating
 * helpers route their caller-supplied filter through this first.
 *
 * @throws Error when the filter would match every document.
 */
export function assertSelective<T extends Document>(
  filter: Filter<T>,
  operation: string
): Filter<T> {
  if (Object.keys(filter).length === 0) {
    throw new Error(
      `${operation} requires a filter that actually narrows the result set. ` +
        `An empty filter would affect every user.`
    );
  }
  return filter;
}

/**
 * Runs a callback inside a MongoDB transaction using the convenient API.
 * Handles session lifecycle, commit, abort, and transient-error retries automatically.
 *
 * @param client - Connected MongoClient instance
 * @param fn - Async callback receiving the session; all DB operations inside should pass `{ session }`
 * @returns The value returned by `fn`
 */
export async function withTransaction<T>(
  client: MongoClient,
  fn: (session: ClientSession) => Promise<T>
): Promise<T> {
  const session = client.startSession();
  try {
    let result!: T;
    await session.withTransaction(async (s) => {
      result = await fn(s);
    });
    return result;
  } finally {
    try {
      await session.endSession();
    } catch {
      // Swallow endSession errors so they don't mask the original error
    }
  }
}

export class Utils {
  /**
   * Generates a sequence 1 - n (amount) to use as async generator
   *
   * @param {number} amount - The number of items to generate in the sequence
   * @returns An async iterable that yields numbers from 1 to amount
   *
   * @example
   * ```typescript
   * // Generate sequence from 1 to 5
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
