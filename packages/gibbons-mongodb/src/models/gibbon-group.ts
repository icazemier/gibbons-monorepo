import { Buffer } from 'node:buffer';
import { Gibbon } from '@icazemier/gibbons';
import {
  Binary,
  ClientSession,
  Collection,
  FindCursor,
  FindOneAndUpdateOptions,
  MongoClient,
  UpdateFilter,
} from 'mongodb';
import { Config, IGibbonGroup, GibbonLike } from '../interfaces/index.js';
import { GibbonModel } from './gibbon-model.js';

/**
 * Model for managing group documents in MongoDB.
 * Groups are pre-populated slots that can be allocated and assigned permissions.
 */
export class GibbonGroup extends GibbonModel {
  protected dbCollection!: Collection<IGibbonGroup>;

  /**
   * Byte length of the *permission* bitmaps this model reads and writes on group
   * documents. Distinct from the inherited `byteLength`, which sizes *group*
   * bitmaps: a group document is addressed by group position but carries a
   * permission mask, so the two dimensions resize independently via
   * `expandGroups`/`expandPermissions`.
   */
  protected permissionByteLength: number;

  /**
   * @param mongoClient - Connected MongoDB client instance
   * @param config - Configuration containing group and permission byte lengths
   */
  constructor(mongoClient: MongoClient, config: Config) {
    const { groupByteLength, permissionByteLength } = config;
    super(mongoClient, groupByteLength);
    this.permissionByteLength = permissionByteLength;
  }

  /**
   * Keeps the permission-bitmap size in sync after `expandPermissions` /
   * `shrinkPermissions`. Without this the group model would keep minting
   * permission masks at the old width and every merge against a resized mask
   * would throw `Incoming Gibbon is too big`.
   *
   * @param newByteLength - The new permission byte length (positive integer)
   */
  public setPermissionByteLength(newByteLength: number): void {
    if (!Number.isInteger(newByteLength) || newByteLength < 1) {
      throw new RangeError('permissionByteLength must be a positive integer');
    }
    this.permissionByteLength = newByteLength;
  }

  /** {@inheritDoc GibbonModel.initialize} */
  async initialize(dbName: string, collectionName: string): Promise<void> {
    this.dbCollection = this.mongoClient.db(dbName).collection(collectionName);
  }

  /**
   * Maps the `permissionsGibbon` field of a group document from MongoDB Binary to a Gibbon instance.
   *
   * @example
   * ```
   * const group = {
   *    _id: ObjectId,
   *    permissionsGibbon: Binary,
   *    gibbonGroupPosition: 1,
   *    gibbonIsAllocated: true
   * };
   *
   * const transformed = GibbonGroup.mapPermissionsBinaryToGibbon(group);
   * // transformed.permissionsGibbon is now a Gibbon instance
   * ```
   *
   * @param group - Group document with Binary permissionsGibbon
   * @returns Group document with permissionsGibbon decoded as Gibbon
   */
  protected static mapPermissionsBinaryToGibbon<T extends IGibbonGroup>(
    group: T
  ): IGibbonGroup {
    const buffer = Buffer.from((group.permissionsGibbon as Binary).buffer);

    const transformedGroup = {
      ...group,
      ...{ permissionsGibbon: Gibbon.decode(buffer) },
    };
    return transformedGroup;
  }

  /**
   * Validates whether the given groups are allocated (or non-allocated) in the database.
   *
   * @param groups - Group positions to validate
   * @param allocated - When `true` (default), checks that groups are allocated; when `false`, checks they are not
   * @param session - Optional MongoDB client session for transactional operations
   * @returns `true` if all given group positions match the expected allocation state
   */
  public async validate(
    groups: GibbonLike,
    allocated = true,
    session?: ClientSession
  ): Promise<boolean> {
    const groupPositions = this.ensureGibbon(groups).getPositionsArray();
    // `countDocuments({ $in: [] })` is 0, which would equal an empty
    // `groupPositions.length` and report "all allocated" for nothing at all.
    // Fail closed, matching the PostgreSQL adapter.
    if (groupPositions.length === 0) {
      return false;
    }

    const filter = {
      gibbonGroupPosition: {
        $in: groupPositions,
      },
      gibbonIsAllocated: allocated ? true : { $ne: true },
    };

    const count = await this.dbCollection.countDocuments(filter, { session });
    return count === groupPositions.length;
  }

  /**
   * Fetches all given groups and merges their subscribed permissions into a single Gibbon.
   * Useful for computing a user's aggregated permissions from their group memberships.
   *
   * @param groups - Group positions to collect permissions from
   * @param session - Optional MongoDB client session for transactional operations
   * @returns A Gibbon with all permissions from the given groups merged together
   */
  async getPermissionsGibbonForGroups(
    groups: GibbonLike,
    session?: ClientSession
  ): Promise<Gibbon> {
    const groupPositions = this.ensureGibbon(groups).getPositionsArray();

    const filter = {
      gibbonGroupPosition: {
        $in: groupPositions,
      },
    };

    const projection = {
      _id: 0,
      permissionsGibbon: 1,
    };

    // Get FindCursor instance for groups
    const groupCursor = this.dbCollection.find(filter, { projection, session });

    // Create fresh permissions space as we're rebuilding permissions scratch
    const permissionGibbon = Gibbon.create(this.permissionByteLength);
    // Iterate through all these specific groups and collect permissions
    for await (const group of groupCursor) {
      const buffer = Buffer.from((group.permissionsGibbon as Binary).buffer);
      permissionGibbon.mergeWithGibbon(Gibbon.decode(buffer));
    }
    return permissionGibbon;
  }

  /**
   * Finds group documents matching the given positions.
   * The returned documents have `permissionsGibbon` decoded as Gibbon instances.
   *
   * @param groups - Group positions to query for
   * @returns A MongoDB FindCursor of matching group documents
   */
  public find(groups: GibbonLike): FindCursor<IGibbonGroup> {
    const filter = {
      gibbonGroupPosition: {
        $in: this.ensureGibbon(groups).getPositionsArray(),
      },
    };

    return this.dbCollection
      .find(filter)
      .map((group) => GibbonGroup.mapPermissionsBinaryToGibbon(group));
  }

  /**
   * Finds groups where the given permissions are subscribed.
   *
   * @param permissions - Permission positions to search for
   * @param allocated - When `true` (default), only returns allocated groups
   * @returns A MongoDB FindCursor of matching group documents
   */
  findByPermissions(
    permissions: GibbonLike,
    allocated = true
  ): FindCursor<IGibbonGroup> {
    const $bitsAnySet = new Binary(this.ensureGibbon(permissions).toBuffer());

    const filter = {
      gibbonIsAllocated: allocated || { $ne: true },
      permissionsGibbon: {
        $bitsAnySet,
      },
    };

    return this.dbCollection
      .find(filter)
      .map((group) => GibbonGroup.mapPermissionsBinaryToGibbon(group));
  }

  /**
   * Finds the first available non-allocated group, allocates it,
   * and stores the given additional data.
   *
   * @param data - Additional data to store on the group document (e.g. name, description)
   * @param session - Optional MongoDB client session for transactional operations
   * @returns The newly allocated group document
   * @throws Error when all group slots are already allocated
   */
  async allocate<T extends Record<string, unknown>>(
    data: T,
    session?: ClientSession
  ): Promise<IGibbonGroup> {
    const sanitized = GibbonGroup.sanitizeData(data);
    // Prevent overwriting managed fields
    delete sanitized.gibbonGroupPosition;
    delete sanitized.gibbonIsAllocated;
    delete sanitized.permissionsGibbon;

    // Query for a non-allocated group
    const filter = {
      gibbonIsAllocated: false,
    };

    // Sort, get one from the beginning
    const options = {
      returnDocument: 'after',
      sort: ['gibbonGroupPosition', 1],
      session,
    } as FindOneAndUpdateOptions;

    // Prepare an update, ensure we allocate
    const $set = {
      ...sanitized,
      gibbonIsAllocated: true,
      permissionsGibbon: Gibbon.create(this.permissionByteLength).toBuffer(),
    } as UpdateFilter<IGibbonGroup>;

    const group = await this.dbCollection.findOneAndUpdate(
      filter,
      { $set },
      options
    );
    if (!group) {
      throw new Error(
        'Not able to allocate group, seems all groups are allocated'
      );
    }

    return GibbonGroup.mapPermissionsBinaryToGibbon(group);
  }

  /**
   * Finds all groups that have any of the given permissions set,
   * and unsets those permission bits.
   *
   * @param permissions - Permission positions to unset from groups
   * @param session - Optional MongoDB client session for transactional operations
   */
  async unsetPermissions(
    permissions: GibbonLike,
    session?: ClientSession
  ): Promise<void> {
    const permissionsToUnset = this.ensureGibbon(permissions);
    const permissionsToUnsetBinary = new Binary(permissionsToUnset.toBuffer());
    const permissionPositionsToUnset = permissionsToUnset.getPositionsArray();

    // Loop through all groups check if there are any positions, then
    // be sure to unset these permissions
    const filter = {
      permissionsGibbon: {
        $bitsAnySet: permissionsToUnsetBinary,
      },
    };

    const groupCursor = this.dbCollection.find(filter, { session });
    for await (const group of groupCursor) {
      const { gibbonGroupPosition } = group;
      const permissionBuffer = Buffer.from(
        (group.permissionsGibbon as Binary).buffer
      );

      const permissionsGibbon = Gibbon.decode(permissionBuffer)
        .unsetAllFromPositions(permissionPositionsToUnset)
        .toBuffer();

      const groupFilter = {
        gibbonGroupPosition,
      };
      // Update permissions in this group
      await this.dbCollection.updateOne(
        groupFilter,
        {
          $set: {
            permissionsGibbon,
          },
        },
        { session }
      );
    }
    await groupCursor.close();
  }

  /**
   * Resets the given groups to their default (non-allocated) state.
   * Clears their permissions and marks them as available for re-allocation.
   *
   * Note: removing group membership from users is handled by the facade.
   *
   * @param groups - Group positions to deallocate
   * @param session - Optional MongoDB client session for transactional operations
   */
  async deallocate(groups: GibbonLike, session?: ClientSession): Promise<void> {
    const $in = this.ensureGibbon(groups).getPositionsArray();

    const filter = {
      gibbonGroupPosition: {
        $in,
      },
    };

    const projection = {
      gibbonGroupPosition: 1,
    };

    const groupCursor = this.dbCollection.find(filter, {
      projection,
      session,
    });

    for await (const group of groupCursor) {
      // Fetch position for update
      const { gibbonGroupPosition } = group;

      // Prepare to reset values to defaults
      await this.dbCollection.replaceOne(
        {
          gibbonGroupPosition,
        },
        {
          // Reset to default values
          gibbonGroupPosition,
          // New Gibbon, no permissions set
          permissionsGibbon: Gibbon.create(
            this.permissionByteLength
          ).toBuffer(),
          // Set to be available for allocations again
          gibbonIsAllocated: false,
        },
        { session }
      );
    }
    await groupCursor.close();
  }

  /**
   * Merges the given permissions into each of the specified groups.
   *
   * Note: updating user permissions is handled by the facade.
   *
   * @param groups - Gibbon representing groups to update
   * @param permissions - Gibbon representing permissions to subscribe
   * @param session - Optional MongoDB client session for transactional operations
   */
  async subscribePermissions(
    groups: Gibbon,
    permissions: Gibbon,
    session?: ClientSession
  ): Promise<void> {
    const groupCursor = this.dbCollection.find(
      {
        gibbonGroupPosition: { $in: groups.getPositionsArray() },
      },
      {
        projection: {
          gibbonGroupPosition: 1,
          permissionsGibbon: 1,
        },
        session,
      }
    );

    for await (const group of groupCursor) {
      const { permissionsGibbon, gibbonGroupPosition } = group;
      const permissionsBuffer = Buffer.from(
        (permissionsGibbon as Binary).buffer
      );

      await this.dbCollection.updateOne(
        { gibbonGroupPosition },
        {
          $set: {
            permissionsGibbon: Gibbon.decode(permissionsBuffer)
              .mergeWithGibbon(permissions)
              .toBuffer(),
          },
        },
        { session }
      );
    }
    await groupCursor.close();
  }

  /**
   * Returns a cursor over all allocated group documents.
   * The returned documents have `permissionsGibbon` decoded as Gibbon instances.
   *
   * @returns A MongoDB FindCursor of all allocated group documents
   */
  public findAllocated(): FindCursor<IGibbonGroup> {
    return this.dbCollection
      .find({ gibbonIsAllocated: true })
      .map((group) => GibbonGroup.mapPermissionsBinaryToGibbon(group));
  }

  /**
   * Updates custom metadata on an allocated group (e.g. name, description).
   * Does not modify `gibbonGroupPosition`, `gibbonIsAllocated` or `permissionsGibbon`.
   *
   * @param groupPosition - The position of the group to update
   * @param data - Key-value pairs to set on the group document
   * @param session - Optional MongoDB client session for transactional operations
   * @returns The updated group document, or `null` if no allocated group was found at that position
   */
  public async updateMetadata<T extends Record<string, unknown>>(
    groupPosition: number,
    data: T,
    session?: ClientSession
  ): Promise<IGibbonGroup | null> {
    const sanitized = GibbonGroup.sanitizeData(data);
    // Prevent overwriting managed fields
    delete sanitized.gibbonGroupPosition;
    delete sanitized.gibbonIsAllocated;
    delete sanitized.permissionsGibbon;

    const options: FindOneAndUpdateOptions = {
      returnDocument: 'after',
      session,
    };
    const result = await this.dbCollection.findOneAndUpdate(
      { gibbonGroupPosition: groupPosition, gibbonIsAllocated: true },
      { $set: sanitized as Partial<IGibbonGroup> },
      options
    );
    return result ? GibbonGroup.mapPermissionsBinaryToGibbon(result) : null;
  }

  /**
   * Resizes the `permissionsGibbon` field in every group document
   * to the given byte length and updates the model's internal byte length.
   *
   * @param newByteLength - Target byte length for permission gibbons
   * @param session - Optional MongoDB client session for transactional operations
   */
  async resizePermissions(
    newByteLength: number,
    session?: ClientSession
  ): Promise<void> {
    const cursor = this.dbCollection.find({}, { session });
    for await (const group of cursor) {
      const resized = GibbonGroup.resizeGibbon(
        group.permissionsGibbon as Binary,
        newByteLength
      );
      await this.dbCollection.updateOne(
        { gibbonGroupPosition: group.gibbonGroupPosition },
        { $set: { permissionsGibbon: resized } },
        { session }
      );
    }
    await cursor.close();
  }

  /**
   * Unsets the given permission bits from the specified groups.
   * This is the reverse of {@link subscribePermissions}.
   *
   * Note: recalculating user permissions is handled by the facade.
   *
   * @param groups - Gibbon representing groups to update
   * @param permissions - Gibbon representing permissions to unsubscribe
   * @param session - Optional MongoDB client session for transactional operations
   */
  async unsubscribePermissions(
    groups: Gibbon,
    permissions: Gibbon,
    session?: ClientSession
  ): Promise<void> {
    const permissionPositionsToUnset = permissions.getPositionsArray();

    const groupCursor = this.dbCollection.find(
      {
        gibbonGroupPosition: { $in: groups.getPositionsArray() },
      },
      {
        projection: {
          gibbonGroupPosition: 1,
          permissionsGibbon: 1,
        },
        session,
      }
    );

    for await (const group of groupCursor) {
      const { permissionsGibbon, gibbonGroupPosition } = group;
      const permissionsBuffer = Buffer.from(
        (permissionsGibbon as Binary).buffer
      );

      await this.dbCollection.updateOne(
        { gibbonGroupPosition },
        {
          $set: {
            permissionsGibbon: Gibbon.decode(permissionsBuffer)
              .unsetAllFromPositions(permissionPositionsToUnset)
              .toBuffer(),
          },
        },
        { session }
      );
    }
    await groupCursor.close();
  }
}
