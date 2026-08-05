import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
} from 'vitest';
import { Pool } from 'pg';
import { Gibbon } from '@icazemier/gibbons';
import { GibbonsPostgreSql } from './gibbons-postgresql.js';
import { PostgreSqlSeeder } from './seeder.js';
import { ConfigLoader } from './config.js';
import { PostgreSqlTestServer } from '../test/helper/postgresql-memory-server.js';
import {
  seedTestFixtures,
  seedUserTestFixtures,
  tearDownGroupTestFixtures,
  tearDownPermissionTestFixtures,
  tearDownUserTestFixtures,
} from '../test/helper/seeders.js';
import { Config } from './interfaces/index.js';
import { hasAllRequired } from './utils.js';
import { GibbonGroup } from './models/index.js';

/**
 * Regression tests for the fail-open and unbounded-mutation defects found in
 * the security review. Each `it` fails against the pre-fix implementation.
 */
describe('security regressions', () => {
  let adapter: GibbonsPostgreSql;
  let pool: Pool;
  let config: Config;

  beforeAll(async () => {
    pool = new Pool({ connectionString: PostgreSqlTestServer.uri });
    config = await ConfigLoader.load('gibbons-postgresql-sample');

    const seeder = new PostgreSqlSeeder(pool, config);
    await seeder.initialize();

    adapter = new GibbonsPostgreSql(PostgreSqlTestServer.uri, config);
    await adapter.initialize();

    await seedTestFixtures(pool, config);
  });

  afterAll(async () => {
    await tearDownGroupTestFixtures(pool, config);
    await tearDownPermissionTestFixtures(pool, config);
    await pool.end();
    await adapter.getPool().end();
  });

  beforeEach(async () => {
    await seedUserTestFixtures(pool, config);
  });

  afterEach(async () => {
    await tearDownUserTestFixtures(pool, config);
  });

  const countUsers = async (): Promise<number> => {
    const { rows } = await pool.query<{ count: string }>(
      `SELECT COUNT(*)::text AS count FROM ${config.dbStructure.user.tableName}`
    );
    return Number(rows[0].count);
  };

  describe('unbounded mutations are refused', () => {
    // `{ metadata: {} }` satisfies a "is the property present?" guard but
    // compiles to `WHERE TRUE`, which previously deleted every user.
    it('removeUser rejects a filter that carries keys but constrains nothing', async () => {
      const before = await countUsers();
      expect(before).toBeGreaterThan(0);

      await expect(adapter.removeUser({ metadata: {} })).rejects.toThrow(
        /narrows the result set/
      );
      expect(await countUsers()).toBe(before);
    });

    it('removeUser still rejects a wholly empty filter', async () => {
      const before = await countUsers();
      await expect(adapter.removeUser({})).rejects.toThrow(
        /narrows the result set/
      );
      expect(await countUsers()).toBe(before);
    });

    it('removeUser accepts a filter that does constrain', async () => {
      const before = await countUsers();
      const removed = await adapter.removeUser({
        metadata: { email: 'not-a-real-user@example.com' },
      });
      expect(removed).toBe(0);
      expect(await countUsers()).toBe(before);
    });

    it('subscribeUsersToGroups refuses to grant to every user', async () => {
      await expect(
        adapter.subscribeUsersToGroups({ metadata: {} }, [1])
      ).rejects.toThrow(/narrows the result set/);
    });

    it('unsubscribeUsersFromGroups refuses to affect every user', async () => {
      await expect(adapter.unsubscribeUsersFromGroups({}, [1])).rejects.toThrow(
        /narrows the result set/
      );
    });

    it('updateUserMetadata refuses to write to an arbitrary row', async () => {
      await expect(
        adapter.updateUserMetadata({ metadata: {} }, { name: 'overwritten' })
      ).rejects.toThrow(/narrows the result set/);
    });
  });

  describe('authorization fails closed on an empty requirement', () => {
    it('validateUserPermissionsForAllPermissions denies when nothing is required', () => {
      const noPermissions = Gibbon.create(config.permissionByteLength);
      expect(
        adapter.validateUserPermissionsForAllPermissions(noPermissions, [])
      ).toBe(false);
    });

    it('validateUserGroupsForAllGroups denies when nothing is required', () => {
      const noGroups = Gibbon.create(config.groupByteLength);
      expect(adapter.validateUserGroupsForAllGroups(noGroups, [])).toBe(false);
    });

    it('still grants when the subject holds every required bit', () => {
      const holder = Gibbon.create(
        config.permissionByteLength
      ).setAllFromPositions([1, 2, 3]);
      expect(
        adapter.validateUserPermissionsForAllPermissions(holder, [1, 2])
      ).toBe(true);
    });

    it('still denies when the subject is missing a required bit', () => {
      const holder = Gibbon.create(
        config.permissionByteLength
      ).setAllFromPositions([1]);
      expect(
        adapter.validateUserPermissionsForAllPermissions(holder, [1, 2])
      ).toBe(false);
    });
  });

  describe('hasAllRequired', () => {
    it('is not vacuously true for an empty requirement', () => {
      const empty = Gibbon.create(8);
      expect(empty.hasAllFromGibbon(Gibbon.create(8))).toBe(true);
      expect(hasAllRequired(empty, Gibbon.create(8))).toBe(false);
    });
  });

  describe('group and permission bitmaps are sized independently', () => {
    // A group row is addressed by group position but carries a *permission*
    // mask. The group model used to size that mask from groupByteLength, so any
    // config where the two differ produced masks of the wrong width — and every
    // subsequent merge threw `Incoming Gibbon is too big`, blocking revocation.
    it('mints permission masks at permissionByteLength, not groupByteLength', async () => {
      const group = new GibbonGroup(pool, {
        ...config,
        groupByteLength: 2,
        permissionByteLength: 8,
      });

      const aggregate = await group.getPermissionsGibbonForGroups([]);
      expect(aggregate.arrayBuffer.byteLength).toBe(8);
    });
  });
});
