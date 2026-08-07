/**
 * Derives each package's `deno.json` import map from its `package.json`.
 *
 * JSR cannot resolve pnpm's `catalog:` protocol. Publishing without an import
 * map does not fail: `jsr publish` reports "Ignoring failed to resolve
 * package.json dependency" for every catalog entry and ships a package whose
 * npm dependencies are simply absent. The import map is what makes them
 * resolvable, so it is load-bearing rather than decorative — and the failure
 * mode is silent, which is why it is checked mechanically.
 *
 * The map is therefore a generated artifact, in the same sense a lockfile is:
 * this module computes what it must contain, the CLI writes it, and CI fails
 * when the committed copy has drifted. `package.json` remains the only place a
 * dependency version is authored.
 *
 * Everything exported here is pure. All filesystem and process access lives in
 * `check-deno-import-map.ts`, which keeps this testable against literals.
 */

/** A dependency block as it appears in a manifest: name to version range. */
export type DependencyRanges = Readonly<Record<string, string>>;

export interface PackageManifest {
  readonly name: string;
  readonly dependencies?: DependencyRanges;
  readonly peerDependencies?: DependencyRanges;
  /** Unused by the import map; carried so publish checks see every field. */
  readonly optionalDependencies?: DependencyRanges;
}

/** An import map, keyed by the specifier a source file writes. */
export type ImportMap = Readonly<Record<string, string>>;

export interface NpmSpecifier {
  readonly name: string;
  /** Null when the specifier carries no version at all, which is a defect. */
  readonly range: string | null;
  /** Leading slash included, or empty when the whole package is imported. */
  readonly subpath: string;
}

/**
 * How a committed import map can disagree with its manifest.
 *
 * The kinds differ in more than wording. `stale-range` and `missing-import`
 * are both repaired by regenerating the map. `unbacked-import` cannot be:
 * an import with no backing dependency is a manifest bug, and silently
 * deleting the entry would hide it.
 */
export type ProblemKind = 'stale-range' | 'missing-import' | 'unbacked-import';

export interface Problem {
  readonly alias: string;
  readonly kind: ProblemKind;
  readonly detail: string;
}

export interface ResolvedImportMap {
  readonly imports: ImportMap;
  readonly problems: readonly Problem[];
}

const CATALOG_PROTOCOL = 'catalog:';
const NPM_PROTOCOL = 'npm:';

/**
 * Reads the `catalog:` block of pnpm-workspace.yaml.
 *
 * Deliberately narrow rather than a general YAML parser: it accepts one flat
 * block of two-space-indented entries and throws on any line it does not
 * recognise, so a catalog it cannot read fails the build instead of quietly
 * resolving to nothing. The accepted shapes are pinned by the test suite.
 */
export const parseCatalog = (yaml: string): ReadonlyMap<string, string> => {
  const catalog = new Map<string, string>();
  let insideCatalog = false;

  for (const rawLine of yaml.split('\n')) {
    const line = rawLine.replace(/\r$/, '');
    if (!line.trim() || line.trim().startsWith('#')) continue;

    // An unindented line opens a new top-level key, closing any catalog block.
    if (!/^\s/.test(line)) {
      insideCatalog = /^catalog:\s*$/.test(line);
      continue;
    }
    if (!insideCatalog) continue;

    const entry = /^ {2}("?)([^"\s:]+)\1:[ \t]*(\S.*)$/.exec(line);
    if (entry === null) {
      throw new Error(`pnpm-workspace.yaml: unreadable catalog entry: ${line}`);
    }
    catalog.set(entry[2], stripYamlValue(entry[3]));
  }

  return catalog;
};

const stripYamlValue = (value: string): string => {
  const quoted = /^(["'])(.*)\1\s*$/.exec(value);
  if (quoted !== null) return quoted[2];
  return value.split(' #')[0].trim();
};

/**
 * Splits an import-map value into the parts an npm specifier is built from.
 * Returns null for anything that is not `npm:` — jsr:, https: and node:
 * specifiers carry no npm version and are none of this module's business.
 */
export const parseNpmSpecifier = (specifier: string): NpmSpecifier | null => {
  if (!specifier.startsWith(NPM_PROTOCOL)) return null;

  const rest = specifier.slice(NPM_PROTOCOL.length);
  const scoped = rest.startsWith('@');
  const versionAt = rest.indexOf('@', scoped ? 1 : 0);

  if (versionAt === -1) {
    const nameEnd = scoped
      ? rest.indexOf('/', rest.indexOf('/') + 1)
      : rest.indexOf('/');
    return nameEnd === -1
      ? { name: rest, range: null, subpath: '' }
      : {
          name: rest.slice(0, nameEnd),
          range: null,
          subpath: rest.slice(nameEnd),
        };
  }

  const name = rest.slice(0, versionAt);
  const remainder = rest.slice(versionAt + 1);
  const subpathAt = remainder.indexOf('/');

  return subpathAt === -1
    ? { name, range: remainder, subpath: '' }
    : {
        name,
        range: remainder.slice(0, subpathAt),
        subpath: remainder.slice(subpathAt),
      };
};

export const formatNpmSpecifier = (
  name: string,
  range: string,
  subpath = ''
): string => `${NPM_PROTOCOL}${name}@${range}${subpath}`;

/**
 * The range a manifest declares for a dependency, with `catalog:` resolved.
 *
 * Only dependencies and peerDependencies count. The import map exists so a
 * consumer can resolve what the published source imports, and a devDependency
 * is by definition absent for them.
 */
export const resolveDeclaredRange = (
  manifest: PackageManifest,
  catalog: ReadonlyMap<string, string>,
  name: string
): string | undefined => {
  const declared =
    manifest.dependencies?.[name] ?? manifest.peerDependencies?.[name];
  if (declared === undefined) return undefined;
  if (!declared.startsWith(CATALOG_PROTOCOL)) return declared;

  const namedCatalog = declared.slice(CATALOG_PROTOCOL.length);
  if (namedCatalog !== '') {
    throw new Error(
      `${name} uses named catalog "${declared}", which is not supported`
    );
  }

  const fromCatalog = catalog.get(name);
  if (fromCatalog === undefined) {
    throw new Error(
      `${name} is "catalog:" but pnpm-workspace.yaml has no entry`
    );
  }
  return fromCatalog;
};

const runtimeDependencies = (
  manifest: PackageManifest,
  catalog: ReadonlyMap<string, string>
): ReadonlyMap<string, string> => {
  const names = new Set([
    ...Object.keys(manifest.dependencies ?? {}),
    ...Object.keys(manifest.peerDependencies ?? {}),
  ]);

  const ranges = new Map<string, string>();
  for (const name of names) {
    const range = resolveDeclaredRange(manifest, catalog, name);
    if (range === undefined) continue;
    ranges.set(name, range);
  }
  return ranges;
};

/**
 * Computes the import map a package should have, alongside every way its
 * current one disagrees with the manifest.
 *
 * Both directions are checked because they fail differently. A stale range
 * breaks the Deno smoke test loudly. A dependency with no entry at all breaks
 * nothing until it reaches JSR, which drops it from the published package
 * without an error — so it is caught here, where it is still cheap.
 *
 * Existing keys keep their position, so regenerating stays a small diff, and
 * specifiers this module does not own are passed through untouched.
 */
export const resolveImportMap = (
  manifest: PackageManifest,
  catalog: ReadonlyMap<string, string>,
  imports: ImportMap
): ResolvedImportMap => {
  const required = runtimeDependencies(manifest, catalog);
  const resolved: Record<string, string> = {};
  const problems: Problem[] = [];
  const covered = new Set<string>();

  for (const [alias, specifier] of Object.entries(imports)) {
    const parsed = parseNpmSpecifier(specifier);
    if (parsed === null) {
      resolved[alias] = specifier;
      continue;
    }

    const expectedRange = required.get(parsed.name);
    if (expectedRange === undefined) {
      resolved[alias] = specifier;
      problems.push({
        alias,
        kind: 'unbacked-import',
        detail: `"${parsed.name}" is neither a dependency nor a peerDependency of ${manifest.name}`,
      });
      continue;
    }

    covered.add(parsed.name);
    const expected = formatNpmSpecifier(
      parsed.name,
      expectedRange,
      parsed.subpath
    );
    resolved[alias] = expected;

    if (expected !== specifier) {
      problems.push({
        alias,
        kind: 'stale-range',
        detail: `is "${specifier}", but package.json declares ${expectedRange}`,
      });
    }
  }

  for (const [name, range] of required) {
    if (covered.has(name)) continue;
    resolved[name] = formatNpmSpecifier(name, range);
    problems.push({
      alias: name,
      kind: 'missing-import',
      detail: `is a runtime dependency with no import entry, so JSR would drop it from the published package`,
    });
  }

  return { imports: resolved, problems };
};

/** Whether regenerating the map resolves every problem found. */
export const isRepairable = (problems: readonly Problem[]): boolean =>
  problems.every(({ kind }) => kind !== 'unbacked-import');
