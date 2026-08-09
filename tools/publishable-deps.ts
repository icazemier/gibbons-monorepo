/**
 * Detects pnpm workspace-only protocols left in the dependency fields that get
 * published to a registry.
 *
 * `catalog:` and `workspace:` are resolved by `pnpm publish`/`pnpm pack`, never
 * by `npm publish`. Under semantic-release, which published with npm, a catalog
 * entry in `dependencies` shipped to the registry verbatim and every
 * npm/yarn/bun install of that package failed with EUNSUPPORTEDPROTOCOL — that
 * is how 2.0.0 through 3.0.1 were published broken, because a pnpm workspace
 * resolves it fine locally and nothing exercised the consumer's path.
 *
 * Releases now go through `changeset publish`, which delegates to `pnpm publish`
 * and does resolve both protocols, so that particular failure can no longer
 * reach npm. This check stays because JSR still cannot resolve them: the
 * `deno.json` import map is generated from these ranges, and `jsr publish`
 * responds to one it cannot read by dropping the dependency and publishing
 * anyway.
 *
 * `devDependencies` are deliberately not checked: consumers never resolve them,
 * so the catalog stays useful for shared tooling.
 */
import type { PackageManifest } from './deno-import-map.ts';

/** Fields a registry consumer resolves when installing the package. */
const PUBLISHED_FIELDS = [
  'dependencies',
  'peerDependencies',
  'optionalDependencies',
] as const;

export type PublishedField = (typeof PUBLISHED_FIELDS)[number];

/** Protocols pnpm understands and registries do not. */
const WORKSPACE_PROTOCOLS = ['catalog:', 'workspace:'] as const;

export interface UnpublishableRange {
  readonly field: PublishedField;
  readonly name: string;
  readonly range: string;
}

const usesWorkspaceProtocol = (range: string): boolean =>
  WORKSPACE_PROTOCOLS.some((protocol) => range.startsWith(protocol));

/**
 * Every dependency whose range cannot survive `npm publish`, in declaration
 * order so the report reads like the manifest.
 */
export const findUnpublishableRanges = (
  manifest: PackageManifest
): readonly UnpublishableRange[] => {
  const found: UnpublishableRange[] = [];

  for (const field of PUBLISHED_FIELDS) {
    const ranges = manifest[field];
    if (ranges === undefined) continue;

    for (const [name, range] of Object.entries(ranges)) {
      if (usesWorkspaceProtocol(range)) {
        found.push({ field, name, range });
      }
    }
  }

  return found;
};
