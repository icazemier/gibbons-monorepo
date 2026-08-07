/**
 * Detects pnpm workspace-only protocols left in the dependency fields that get
 * published to a registry.
 *
 * `catalog:` and `workspace:` are resolved by `pnpm publish`/`pnpm pack`, never
 * by `npm publish`. semantic-release publishes with npm, so a catalog entry in
 * `dependencies` ships to the registry verbatim and every npm/yarn/bun install
 * of that package fails with EUNSUPPORTEDPROTOCOL. A pnpm workspace resolves it
 * fine locally, so nothing catches it before release — 2.0.0 through 3.0.1 were
 * published broken.
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
