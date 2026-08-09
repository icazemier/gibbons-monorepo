import { describe, it } from 'node:test';
import { deepStrictEqual, ok } from 'node:assert/strict';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { resolveCatalogRanges } from './catalog-ranges.ts';
import { readCatalog } from './package-files.ts';

/**
 * The real catalog, so the fixture cannot become a stale second copy of it.
 * Expectations are derived from whatever it currently holds — bumping a version
 * in `pnpm-workspace.yaml` never touches this file.
 */
const catalog = await readCatalog(
  join(dirname(fileURLToPath(import.meta.url)), '..', 'pnpm-workspace.yaml')
);

const [governedName, governedRange] = [...catalog.entries()][0];

/** A range guaranteed to differ from whatever the catalog says. */
const staleRange = '^0.0.1-stale';

describe('resolveCatalogRanges', () => {
  it('has a catalog to test against', () => {
    ok(catalog.size > 1);
  });

  it('reports a stale range and supplies the catalog value', () => {
    const { fields, drifts } = resolveCatalogRanges(
      {
        name: 'pkg',
        version: '1.0.0',
        dependencies: { [governedName]: staleRange },
      },
      catalog
    );
    deepStrictEqual(drifts, [
      {
        field: 'dependencies',
        name: governedName,
        declared: staleRange,
        expected: governedRange,
      },
    ]);
    deepStrictEqual(fields.dependencies, { [governedName]: governedRange });
  });

  it('reports nothing when the declared range already matches', () => {
    const { drifts } = resolveCatalogRanges(
      {
        name: 'pkg',
        version: '1.0.0',
        dependencies: { [governedName]: governedRange },
      },
      catalog
    );
    deepStrictEqual(drifts, []);
  });

  it('leaves a dependency the catalog does not mention alone', () => {
    const { fields, drifts } = resolveCatalogRanges(
      {
        name: 'pkg',
        version: '1.0.0',
        dependencies: { 'not-in-the-catalog': staleRange },
      },
      catalog
    );
    deepStrictEqual(drifts, []);
    deepStrictEqual(fields.dependencies, { 'not-in-the-catalog': staleRange });
  });

  it('governs peerDependencies too, since consumers resolve them', () => {
    const { drifts } = resolveCatalogRanges(
      {
        name: 'pkg',
        version: '1.0.0',
        peerDependencies: { [governedName]: staleRange },
      },
      catalog
    );
    deepStrictEqual(drifts, [
      {
        field: 'peerDependencies',
        name: governedName,
        declared: staleRange,
        expected: governedRange,
      },
    ]);
  });

  it('preserves declaration order when correcting', () => {
    const { fields } = resolveCatalogRanges(
      {
        name: 'pkg',
        version: '1.0.0',
        dependencies: {
          'not-in-the-catalog': staleRange,
          [governedName]: staleRange,
        },
      },
      catalog
    );
    deepStrictEqual(Object.keys(fields.dependencies ?? {}), [
      'not-in-the-catalog',
      governedName,
    ]);
  });

  it('ignores an empty catalog rather than blanking the manifest', () => {
    const { fields, drifts } = resolveCatalogRanges(
      {
        name: 'pkg',
        version: '1.0.0',
        dependencies: { [governedName]: staleRange },
      },
      new Map()
    );
    deepStrictEqual(drifts, []);
    deepStrictEqual(fields.dependencies, { [governedName]: staleRange });
  });

  it('handles a manifest with no dependency blocks', () => {
    const { fields, drifts } = resolveCatalogRanges(
      { name: 'pkg', version: '1.0.0' },
      catalog
    );
    deepStrictEqual(drifts, []);
    deepStrictEqual(fields.dependencies, undefined);
  });
});
