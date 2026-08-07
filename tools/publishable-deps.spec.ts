import { describe, it } from 'node:test';
import { deepStrictEqual } from 'node:assert/strict';
import { findUnpublishableRanges } from './publishable-deps.ts';

describe('findUnpublishableRanges', () => {
  it('catches the exact shape that shipped broken in 2.0.0', () => {
    deepStrictEqual(
      findUnpublishableRanges({
        name: '@icazemier/gibbons-mongodb',
        dependencies: {
          '@icazemier/gibbons': 'catalog:',
          cosmiconfig: 'catalog:',
          yargs: 'catalog:',
        },
      }),
      [
        {
          field: 'dependencies',
          name: '@icazemier/gibbons',
          range: 'catalog:',
        },
        { field: 'dependencies', name: 'cosmiconfig', range: 'catalog:' },
        { field: 'dependencies', name: 'yargs', range: 'catalog:' },
      ]
    );
  });

  it('passes a manifest carrying only literal ranges', () => {
    deepStrictEqual(
      findUnpublishableRanges({
        name: 'pkg',
        dependencies: { cosmiconfig: '^10.0.0', 'pg-cursor': '^2.21.0' },
        peerDependencies: { pg: '^8.11.0' },
      }),
      []
    );
  });

  it('catches a named catalog, not just the default one', () => {
    deepStrictEqual(
      findUnpublishableRanges({
        name: 'pkg',
        dependencies: { yargs: 'catalog:tooling' },
      }),
      [{ field: 'dependencies', name: 'yargs', range: 'catalog:tooling' }]
    );
  });

  it('catches the workspace protocol in peerDependencies', () => {
    deepStrictEqual(
      findUnpublishableRanges({
        name: 'pkg',
        peerDependencies: { '@icazemier/gibbons': 'workspace:^' },
      }),
      [
        {
          field: 'peerDependencies',
          name: '@icazemier/gibbons',
          range: 'workspace:^',
        },
      ]
    );
  });

  it('checks optionalDependencies, which consumers also resolve', () => {
    deepStrictEqual(
      findUnpublishableRanges({
        name: 'pkg',
        optionalDependencies: { fsevents: 'catalog:' },
      }),
      [{ field: 'optionalDependencies', name: 'fsevents', range: 'catalog:' }]
    );
  });

  it('ignores a range that merely mentions a protocol word', () => {
    deepStrictEqual(
      findUnpublishableRanges({
        name: 'pkg',
        dependencies: { 'my-catalog:parser': '^1.0.0' },
      }),
      []
    );
  });

  it('reports nothing when no published field is declared', () => {
    deepStrictEqual(findUnpublishableRanges({ name: 'pkg' }), []);
  });
});
