import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
} from 'vitest';
import { Collection, MongoClient } from 'mongodb';
import { Gibbon } from '@icazemier/gibbons';
import { GibbonsMongoDb } from './gibbons-mongo-db.js';
import { MongoDbSeeder } from './seeder.js';
import { ConfigLoader } from './config.js';
import { MongoDbTestServer } from '../test/helper/mongodb-memory-server.js';
import {
  seedTestFixtures,
  seedUserTestFixtures,
  tearDownGroupTestFixtures,
  tearDownPermissionTestFixtures,
  tearDownUserTestFixtures,
} from '../test/helper/seeders.js';
import { TestUser } from '../test/interfaces/test-interfaces.js';
import { Config } from './interfaces/index.js';
import { hasAllRequired } from './utils.js';
import { GibbonGroup } from './models/index.js';

/**
 * Regression tests for the fail-open and unbounded-mutation defects found in
 * the security review. Each `it` fails against the pre-fix implementation.
 */
describe('security regressions', () => {
  let mongoDbAdapter: GibbonsMongoDb;
  let mongoClient: MongoClient;
  let userCollection: Collection<TestUser>;
  let config: Config;

  beforeAll(async () => {
    mongoClient = await new MongoClient(MongoDbTestServer.uri).connect();
    config = await ConfigLoader.load('gibbons-mongodb-sample');

    userCollection = mongoClient
      .db(config.dbName)
      .collection<TestUser>(config.dbStructure.user.collectionName);

    const mongoDbSeeder = new MongoDbSeeder(mongoClient, config);
    await mongoDbSeeder.initialize();

    mongoDbAdapter = new GibbonsMongoDb(MongoDbTestServer.uri, config);
    await mongoDbAdapter.initialize();

    await seedTestFixtures(mongoClient, config);
  });

  beforeEach(async () => {
    await seedUserTestFixtures(mongoClient, config);
  });

  afterEach(async () => {
    await tearDownUserTestFixtures(mongoClient, config);
  });

  afterAll(async () => {
    await tearDownGroupTestFixtures(mongoClient, config);
    await tearDownPermissionTestFixtures(mongoClient, config);
    await mongoDbAdapter.getMongoClient().close();
    await mongoClient.close();
  });

  describe('unbounded mutations are refused', () => {
    it('removeUser rejects an empty filter instead of emptying the collection', async () => {
      const before = await userCollection.countDocuments();
      expect(before).toBeGreaterThan(0);

      await expect(mongoDbAdapter.removeUser({})).rejects.toThrow(
        /narrows the result set/
      );
      expect(await userCollection.countDocuments()).toBe(before);
    });

    it('removeUser accepts a filter that does constrain', async () => {
      const before = await userCollection.countDocuments();
      const removed = await mongoDbAdapter.removeUser({
        email: 'not-a-real-user@example.com',
      });
      expect(removed).toBe(0);
      expect(await userCollection.countDocuments()).toBe(before);
    });

    it('subscribeUsersToGroups refuses to grant to every user', async () => {
      await expect(
        mongoDbAdapter.subscribeUsersToGroups({}, [1])
      ).rejects.toThrow(/narrows the result set/);
    });

    it('unsubscribeUsersFromGroups refuses to affect every user', async () => {
      await expect(
        mongoDbAdapter.unsubscribeUsersFromGroups({}, [1])
      ).rejects.toThrow(/narrows the result set/);
    });

    it('updateUserMetadata refuses to write to an arbitrary user', async () => {
      await expect(
        mongoDbAdapter.updateUserMetadata({}, { name: 'overwritten' })
      ).rejects.toThrow(/narrows the result set/);
    });
  });

  describe('authorization fails closed on an empty requirement', () => {
    it('validateUserPermissionsForAllPermissions denies when nothing is required', () => {
      const noPermissions = Gibbon.create(config.permissionByteLength);
      expect(
        mongoDbAdapter.validateUserPermissionsForAllPermissions(
          noPermissions,
          []
        )
      ).toBe(false);
    });

    it('validateUserGroupsForAllGroups denies when nothing is required', () => {
      const noGroups = Gibbon.create(config.groupByteLength);
      expect(mongoDbAdapter.validateUserGroupsForAllGroups(noGroups, [])).toBe(
        false
      );
    });

    it('still grants when the subject holds every required bit', () => {
      const holder = Gibbon.create(
        config.permissionByteLength
      ).setAllFromPositions([1, 2, 3]);
      expect(
        mongoDbAdapter.validateUserPermissionsForAllPermissions(holder, [1, 2])
      ).toBe(true);
    });

    it('still denies when the subject is missing a required bit', () => {
      const holder = Gibbon.create(
        config.permissionByteLength
      ).setAllFromPositions([1]);
      expect(
        mongoDbAdapter.validateUserPermissionsForAllPermissions(holder, [1, 2])
      ).toBe(false);
    });

    it('validateAllocatedGroups denies an empty position set', async () => {
      await expect(mongoDbAdapter.validateAllocatedGroups([])).resolves.toBe(
        false
      );
    });

    it('validateAllocatedPermissions denies an empty position set', async () => {
      await expect(
        mongoDbAdapter.validateAllocatedPermissions([])
      ).resolves.toBe(false);
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
    // A group document is addressed by group position but carries a *permission*
    // mask. The group model used to size that mask from groupByteLength, so any
    // config where the two differ produced masks of the wrong width — and every
    // subsequent merge threw `Incoming Gibbon is too big`, blocking revocation.
    it('mints permission masks at permissionByteLength, not groupByteLength', async () => {
      const asymmetricConfig: Config = {
        ...config,
        dbName: 'gibbons_asymmetric_bytelength_test',
        groupByteLength: 2,
        permissionByteLength: 8,
      };

      const group = new GibbonGroup(mongoClient, asymmetricConfig);
      await group.initialize(
        asymmetricConfig.dbName,
        asymmetricConfig.dbStructure.group.collectionName
      );

      const aggregate = await group.getPermissionsGibbonForGroups([]);
      expect(aggregate.arrayBuffer.byteLength).toBe(
        asymmetricConfig.permissionByteLength
      );

      await mongoClient.db(asymmetricConfig.dbName).dropDatabase();
    });
  });
});
