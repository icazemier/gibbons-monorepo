/**
 * Keeps each package's literal dependency ranges equal to the catalog.
 *
 * Published packages cannot reference the catalog directly — JSR ships without
 * the dependency rather than resolving `catalog:`, which is why
 * `publishable-deps.ts` rejects it. Writing the versions out by hand instead
 * puts the same number in four files: two `package.json` and, downstream, two
 * `deno.json` import maps.
 *
 * So the catalog stays the single place a shared version is authored, and the
 * literal ranges become a generated artifact — the same arrangement the import
 * map already uses. Bump `pnpm-workspace.yaml`, run `pnpm lint:fix`, and every
 * copy follows. `pnpm lint` fails when one has drifted.
 *
 * Only names present in the catalog are governed. A dependency the catalog does
 * not mention is the package's own business and is left alone.
 *
 * Pure: all filesystem access lives in the CLI.
 */
import type { DependencyRanges, PackageManifest } from './deno-import-map.ts';

/** Fields whose ranges a consumer resolves, so drift there is publishable. */
const GOVERNED_FIELDS = ['dependencies', 'peerDependencies'] as const;

export type GovernedField = (typeof GOVERNED_FIELDS)[number];

export interface RangeDrift {
  readonly field: GovernedField;
  readonly name: string;
  readonly declared: string;
  readonly expected: string;
}

export interface ResolvedRanges {
  /** The manifest fields as they should be written. */
  readonly fields: Readonly<
    Record<GovernedField, DependencyRanges | undefined>
  >;
  readonly drifts: readonly RangeDrift[];
}

/**
 * Compares every catalogued dependency the manifest declares against the
 * catalog, and returns both the corrected fields and what had drifted.
 */
export const resolveCatalogRanges = (
  manifest: PackageManifest,
  catalog: ReadonlyMap<string, string>
): ResolvedRanges => {
  const drifts: RangeDrift[] = [];
  const fields: Record<GovernedField, DependencyRanges | undefined> = {
    dependencies: manifest.dependencies,
    peerDependencies: manifest.peerDependencies,
  };

  for (const field of GOVERNED_FIELDS) {
    const declared = manifest[field];
    if (declared === undefined) continue;

    const corrected: Record<string, string> = {};
    for (const [name, range] of Object.entries(declared)) {
      const expected = catalog.get(name);
      if (expected !== undefined && expected !== range) {
        drifts.push({ field, name, declared: range, expected });
        corrected[name] = expected;
        continue;
      }
      corrected[name] = range;
    }
    fields[field] = corrected;
  }

  return { fields, drifts };
};
