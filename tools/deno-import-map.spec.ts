import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  formatNpmSpecifier,
  isRepairable,
  parseCatalog,
  parseNpmSpecifier,
  resolveDeclaredRange,
  resolveImportMap,
  type PackageManifest,
} from './deno-import-map.ts';
import { readCatalog, readPackageFiles } from './package-files.ts';

const repositoryRoot = join(dirname(fileURLToPath(import.meta.url)), '..');

const catalogOf = (...entries: [string, string][]) => new Map(entries);

describe('parseCatalog', () => {
  it('reads entries, quoted keys and ranges containing spaces', () => {
    const catalog = parseCatalog(
      [
        'packages:',
        '  - "packages/*"',
        '',
        '# Single source of truth',
        'catalog:',
        '  # shared runtime',
        '  cosmiconfig: ^10.0.0',
        '  "@icazemier/gibbons": ^6.0.7',
        '  mongodb: "^6.0.0 || ^7.0.0"',
        '  yargs: ^17.7.2 # pinned deliberately',
        '',
      ].join('\n')
    );

    assert.deepEqual(
      [...catalog],
      [
        ['cosmiconfig', '^10.0.0'],
        ['@icazemier/gibbons', '^6.0.7'],
        ['mongodb', '^6.0.0 || ^7.0.0'],
        ['yargs', '^17.7.2'],
      ]
    );
  });

  it('stops reading at the next top-level key', () => {
    const catalog = parseCatalog(
      [
        'catalog:',
        '  eslint: ^10.8.0',
        'onlyBuiltDependencies:',
        '  - esbuild',
        '',
      ].join('\n')
    );

    assert.deepEqual([...catalog.keys()], ['eslint']);
  });

  it('ignores indented lines outside a catalog block', () => {
    const catalog = parseCatalog(
      ['packages:', '  - "packages/*"', ''].join('\n')
    );

    assert.equal(catalog.size, 0);
  });

  it('throws on a shape it cannot read rather than resolving to nothing', () => {
    assert.throws(
      () =>
        parseCatalog(
          ['catalog:', '  cosmiconfig:', '    version: ^10.0.0', ''].join('\n')
        ),
      /unreadable catalog entry/
    );
  });
});

describe('parseNpmSpecifier', () => {
  it('splits a plain specifier', () => {
    assert.deepEqual(parseNpmSpecifier('npm:cosmiconfig@^10.0.0'), {
      name: 'cosmiconfig',
      range: '^10.0.0',
      subpath: '',
    });
  });

  it('keeps a scoped name intact', () => {
    assert.deepEqual(parseNpmSpecifier('npm:@icazemier/gibbons@^6.0.7'), {
      name: '@icazemier/gibbons',
      range: '^6.0.7',
      subpath: '',
    });
  });

  it('separates a subpath from the range', () => {
    assert.deepEqual(parseNpmSpecifier('npm:yargs@^17.7.2/helpers'), {
      name: 'yargs',
      range: '^17.7.2',
      subpath: '/helpers',
    });
  });

  it('keeps a range containing an or-clause whole', () => {
    assert.deepEqual(parseNpmSpecifier('npm:mongodb@^6.0.0 || ^7.0.0'), {
      name: 'mongodb',
      range: '^6.0.0 || ^7.0.0',
      subpath: '',
    });
  });

  it('reports a missing range as null instead of guessing', () => {
    assert.deepEqual(parseNpmSpecifier('npm:mongodb'), {
      name: 'mongodb',
      range: null,
      subpath: '',
    });
    assert.deepEqual(parseNpmSpecifier('npm:@icazemier/gibbons'), {
      name: '@icazemier/gibbons',
      range: null,
      subpath: '',
    });
  });

  it('ignores specifiers from other registries', () => {
    assert.equal(parseNpmSpecifier('jsr:@std/assert@^1.0.0'), null);
    assert.equal(parseNpmSpecifier('node:path'), null);
    assert.equal(parseNpmSpecifier('https://deno.land/x/thing/mod.ts'), null);
  });

  it('round-trips through formatNpmSpecifier', () => {
    for (const specifier of [
      'npm:cosmiconfig@^10.0.0',
      'npm:@icazemier/gibbons@^6.0.7',
      'npm:yargs@^17.7.2/helpers',
      'npm:mongodb@^6.0.0 || ^7.0.0',
    ]) {
      const parsed = parseNpmSpecifier(specifier);
      if (parsed === null || parsed.range === null) {
        throw new Error(`expected "${specifier}" to parse with a range`);
      }

      assert.equal(
        formatNpmSpecifier(parsed.name, parsed.range, parsed.subpath),
        specifier
      );
    }
  });
});

describe('resolveDeclaredRange', () => {
  const catalog = catalogOf(['cosmiconfig', '^10.0.0']);

  it('follows catalog: into the workspace catalog', () => {
    const manifest: PackageManifest = {
      name: 'pkg',
      dependencies: { cosmiconfig: 'catalog:' },
    };

    assert.equal(
      resolveDeclaredRange(manifest, catalog, 'cosmiconfig'),
      '^10.0.0'
    );
  });

  it('returns a literal range unchanged', () => {
    const manifest: PackageManifest = {
      name: 'pkg',
      dependencies: { 'pg-cursor': '^2.21.0' },
    };

    assert.equal(
      resolveDeclaredRange(manifest, catalog, 'pg-cursor'),
      '^2.21.0'
    );
  });

  it('reads peerDependencies when the name is not a dependency', () => {
    const manifest: PackageManifest = {
      name: 'pkg',
      peerDependencies: { mongodb: '^6.0.0' },
    };

    assert.equal(resolveDeclaredRange(manifest, catalog, 'mongodb'), '^6.0.0');
  });

  it('prefers dependencies over peerDependencies', () => {
    const manifest: PackageManifest = {
      name: 'pkg',
      dependencies: { pg: '^8.11.0' },
      peerDependencies: { pg: '^7.0.0' },
    };

    assert.equal(resolveDeclaredRange(manifest, catalog, 'pg'), '^8.11.0');
  });

  it('is undefined for a name the manifest never declares', () => {
    assert.equal(
      resolveDeclaredRange({ name: 'pkg' }, catalog, 'vitest'),
      undefined
    );
  });

  it('throws when catalog: names an entry the catalog lacks', () => {
    const manifest: PackageManifest = {
      name: 'pkg',
      dependencies: { yargs: 'catalog:' },
    };

    assert.throws(
      () => resolveDeclaredRange(manifest, catalog, 'yargs'),
      /pnpm-workspace.yaml has no entry/
    );
  });

  it('refuses a named catalog rather than resolving it wrongly', () => {
    const manifest: PackageManifest = {
      name: 'pkg',
      dependencies: { cosmiconfig: 'catalog:tooling' },
    };

    assert.throws(
      () => resolveDeclaredRange(manifest, catalog, 'cosmiconfig'),
      /named catalog/
    );
  });
});

describe('resolveImportMap', () => {
  const catalog = catalogOf(['cosmiconfig', '^10.0.0'], ['yargs', '^17.7.2']);

  const manifest: PackageManifest = {
    name: '@icazemier/gibbons-mongodb',
    dependencies: { cosmiconfig: 'catalog:', yargs: 'catalog:' },
    peerDependencies: { mongodb: '^6.0.0' },
  };

  const inSync = {
    mongodb: 'npm:mongodb@^6.0.0',
    cosmiconfig: 'npm:cosmiconfig@^10.0.0',
    yargs: 'npm:yargs@^17.7.2',
    'yargs/helpers': 'npm:yargs@^17.7.2/helpers',
  };

  it('finds nothing wrong with a map that matches the manifest', () => {
    const { imports, problems } = resolveImportMap(manifest, catalog, inSync);

    assert.deepEqual(problems, []);
    assert.deepEqual(imports, inSync);
  });

  it('flags a range the catalog has moved past, and corrects it', () => {
    const { imports, problems } = resolveImportMap(manifest, catalog, {
      ...inSync,
      cosmiconfig: 'npm:cosmiconfig@^9.0.0',
    });

    assert.deepEqual(problems, [
      {
        alias: 'cosmiconfig',
        kind: 'stale-range',
        detail:
          'is "npm:cosmiconfig@^9.0.0", but package.json declares ^10.0.0',
      },
    ]);
    assert.equal(imports.cosmiconfig, 'npm:cosmiconfig@^10.0.0');
  });

  it('corrects a subpath entry without losing the subpath', () => {
    const { imports } = resolveImportMap(manifest, catalog, {
      ...inSync,
      'yargs/helpers': 'npm:yargs@^16.0.0/helpers',
    });

    assert.equal(imports['yargs/helpers'], 'npm:yargs@^17.7.2/helpers');
  });

  it('adds a runtime dependency that has no entry, which JSR would drop', () => {
    const { mongodb, ...withoutMongodb } = inSync;
    void mongodb;

    const { imports, problems } = resolveImportMap(
      manifest,
      catalog,
      withoutMongodb
    );

    assert.deepEqual(problems, [
      {
        alias: 'mongodb',
        kind: 'missing-import',
        detail:
          'is a runtime dependency with no import entry, so JSR would drop it from the published package',
      },
    ]);
    assert.equal(imports.mongodb, 'npm:mongodb@^6.0.0');
  });

  it('treats a subpath entry as covering its package', () => {
    const { yargs, ...withoutBareYargs } = inSync;
    void yargs;

    const { problems } = resolveImportMap(manifest, catalog, withoutBareYargs);

    assert.deepEqual(problems, []);
  });

  it('reports an import backed by no dependency and leaves it in place', () => {
    const drifted = { ...inSync, vitest: 'npm:vitest@^4.1.10' };
    const { imports, problems } = resolveImportMap(manifest, catalog, drifted);

    assert.deepEqual(problems, [
      {
        alias: 'vitest',
        kind: 'unbacked-import',
        detail:
          '"vitest" is neither a dependency nor a peerDependency of @icazemier/gibbons-mongodb',
      },
    ]);
    assert.equal(imports.vitest, 'npm:vitest@^4.1.10');
  });

  it('adopts a widened peer range verbatim', () => {
    const widened: PackageManifest = {
      ...manifest,
      peerDependencies: { mongodb: '^6.0.0 || ^7.0.0' },
    };

    const { imports } = resolveImportMap(widened, catalog, inSync);

    assert.equal(imports.mongodb, 'npm:mongodb@^6.0.0 || ^7.0.0');
  });

  it('supplies a range for an entry that carries none', () => {
    const { imports, problems } = resolveImportMap(manifest, catalog, {
      ...inSync,
      mongodb: 'npm:mongodb',
    });

    assert.deepEqual(
      problems.map(({ kind }) => kind),
      ['stale-range']
    );
    assert.equal(imports.mongodb, 'npm:mongodb@^6.0.0');
  });

  it('passes through specifiers from other registries untouched', () => {
    const { imports, problems } = resolveImportMap(manifest, catalog, {
      ...inSync,
      '@std/assert': 'jsr:@std/assert@^1.0.0',
    });

    assert.deepEqual(problems, []);
    assert.equal(imports['@std/assert'], 'jsr:@std/assert@^1.0.0');
  });

  it('keeps existing keys in order so regenerating stays a small diff', () => {
    const { imports } = resolveImportMap(manifest, catalog, {
      yargs: 'npm:yargs@^17.7.2',
      cosmiconfig: 'npm:cosmiconfig@^9.0.0',
      mongodb: 'npm:mongodb@^6.0.0',
    });

    assert.deepEqual(Object.keys(imports), ['yargs', 'cosmiconfig', 'mongodb']);
  });

  it('regenerating a corrected map is stable', () => {
    const once = resolveImportMap(manifest, catalog, {
      ...inSync,
      cosmiconfig: 'npm:cosmiconfig@^9.0.0',
    });
    const twice = resolveImportMap(manifest, catalog, once.imports);

    assert.deepEqual(twice.problems, []);
    assert.deepEqual(twice.imports, once.imports);
  });
});

describe('isRepairable', () => {
  it('is true when regenerating the map is enough', () => {
    assert.equal(
      isRepairable([
        { alias: 'a', kind: 'stale-range', detail: '' },
        { alias: 'b', kind: 'missing-import', detail: '' },
      ]),
      true
    );
  });

  it('is false when a manifest change is needed', () => {
    assert.equal(
      isRepairable([{ alias: 'a', kind: 'unbacked-import', detail: '' }]),
      false
    );
  });
});

/**
 * The checked-in files are the artifact this tool exists to protect, so they
 * are asserted directly. This fails for real if anyone edits a version in one
 * place and not the other.
 */
describe('the committed packages', () => {
  it('have import maps that match their manifests', async () => {
    const catalog = await readCatalog(
      join(repositoryRoot, 'pnpm-workspace.yaml')
    );
    const packagesDirectory = join(repositoryRoot, 'packages');
    const entries = await readdir(packagesDirectory, { withFileTypes: true });
    const directories = entries.filter((entry) => entry.isDirectory());

    assert.ok(directories.length > 0, 'expected at least one package');

    for (const entry of directories) {
      const files = await readPackageFiles(join(packagesDirectory, entry.name));
      assert.notEqual(
        files.config.imports,
        undefined,
        `${entry.name} has no import map, so JSR would drop every dependency`
      );

      const { problems } = resolveImportMap(
        files.manifest,
        catalog,
        files.config.imports ?? {}
      );

      assert.deepEqual(problems, [], `${entry.name} import map has drifted`);
    }
  });

  it('resolve every catalog entry their manifests reference', async () => {
    const catalog = await readCatalog(
      join(repositoryRoot, 'pnpm-workspace.yaml')
    );
    const packagesDirectory = join(repositoryRoot, 'packages');
    const entries = await readdir(packagesDirectory, { withFileTypes: true });

    for (const entry of entries.filter((candidate) =>
      candidate.isDirectory()
    )) {
      const { manifest } = await readPackageFiles(
        join(packagesDirectory, entry.name)
      );
      const declared = {
        ...manifest.dependencies,
        ...manifest.peerDependencies,
      };

      for (const [name, range] of Object.entries(declared)) {
        assert.equal(
          typeof resolveDeclaredRange(manifest, catalog, name),
          'string',
          `${entry.name} declares ${name} as "${range}", which does not resolve`
        );
      }
    }
  });
});
