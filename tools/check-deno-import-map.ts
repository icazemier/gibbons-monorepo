/**
 * Guards what each package declares about its dependencies.
 *
 * Two checks, both about drift that only shows up after publishing:
 *   - no pnpm-only range protocol survives into a published field, which would
 *     make the package uninstallable (see `publishable-deps.ts`);
 *   - every package's `deno.json` import map matches its `package.json`, and
 *     with `--fix` is regenerated from it. See `deno-import-map.ts` for why the
 *     map is load-bearing and why drift in it fails silently at publish time.
 *
 * Runs on plain Node through type stripping, so `pnpm lint` needs no build
 * step ahead of it.
 */
import { readFile, readdir, writeFile } from 'node:fs/promises';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import process from 'node:process';
import { error, log } from 'node:console';
import {
  isRepairable,
  isVersionCurrent,
  projectDenoConfig,
  resolveImportMap,
  type Problem,
} from './deno-import-map.ts';
import {
  readCatalog,
  readPackageFiles,
  type PackageFiles,
} from './package-files.ts';
import { findUnpublishableRanges } from './publishable-deps.ts';
import { resolveCatalogRanges } from './catalog-ranges.ts';

const repositoryRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const packagesDirectory = join(repositoryRoot, 'packages');
const workspaceFile = join(repositoryRoot, 'pnpm-workspace.yaml');

const packageDirectories = async (): Promise<readonly string[]> => {
  const entries = await readdir(packagesDirectory, { withFileTypes: true });
  return entries
    .filter((entry) => entry.isDirectory())
    .map((entry) => join(packagesDirectory, entry.name));
};

const regenerate = async (
  files: PackageFiles,
  imports: Readonly<Record<string, string>>
): Promise<void> => {
  const projected = projectDenoConfig(files.config, files.manifest, imports);
  const contents = JSON.stringify(projected, undefined, 2);
  await writeFile(files.denoFile, `${contents}\n`, 'utf-8');
};

/**
 * Rewrites only the dependency blocks, reading the manifest fresh so every
 * other field and the key order survive untouched.
 */
const rewriteManifestRanges = async (
  files: PackageFiles,
  fields: Readonly<Record<string, Readonly<Record<string, string>> | undefined>>
): Promise<void> => {
  const parsed: unknown = JSON.parse(
    await readFile(files.manifestFile, 'utf-8')
  );
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    throw new Error(`${files.manifestFile} must contain a JSON object`);
  }

  const updated: Record<string, unknown> = { ...parsed };
  for (const [field, ranges] of Object.entries(fields)) {
    if (ranges !== undefined) updated[field] = ranges;
  }

  await writeFile(
    files.manifestFile,
    `${JSON.stringify(updated, undefined, 2)}\n`,
    'utf-8'
  );
};

const report = (denoFile: string, problems: readonly Problem[]): void => {
  log(relative(repositoryRoot, denoFile));
  for (const { alias, kind, detail } of problems) {
    log(`  ${alias} (${kind}) ${detail}`);
  }
};

const run = async (): Promise<void> => {
  const shouldFix = process.argv.includes('--fix');
  const catalog = await readCatalog(workspaceFile);
  const directories = await packageDirectories();
  const packages = await Promise.all(directories.map(readPackageFiles));

  let unresolved = 0;
  let unpublishable = 0;

  // Checked first and fatal on its own: a workspace protocol is also unusable
  // input for the import map, which would fail second with a worse message.
  // Never auto-fixable — only a human knows which literal range was meant.
  for (const files of packages) {
    for (const { field, name, range } of findUnpublishableRanges(
      files.manifest
    )) {
      error(
        `${files.manifest.name}: ${field}."${name}" is "${range}" — a pnpm-only protocol that JSR cannot resolve, so it would publish without the dependency. Use a literal range.`
      );
      unpublishable += 1;
    }
  }

  if (unpublishable > 0) {
    error(
      `\n${String(unpublishable)} dependency range(s) cannot be published. Replace each with the literal range it resolves to.`
    );
    process.exitCode = 1;
    return;
  }

  // The catalog is where a shared version is authored; the literal ranges in
  // each manifest are generated from it. Runs before the import map, which is
  // generated from those ranges in turn.
  let drifted = 0;
  for (const files of packages) {
    const { fields, drifts } = resolveCatalogRanges(files.manifest, catalog);
    if (drifts.length === 0) continue;

    if (shouldFix) {
      await rewriteManifestRanges(files, fields);
      log(
        `${relative(repositoryRoot, files.manifestFile)} updated from catalog`
      );
      continue;
    }

    for (const { field, name, declared, expected } of drifts) {
      error(
        `${files.manifest.name}: ${field}."${name}" is "${declared}" but the catalog says "${expected}". Run "pnpm lint:fix".`
      );
      drifted += 1;
    }
  }

  if (drifted > 0) {
    process.exitCode = 1;
    return;
  }

  // Re-read once, because --fix above may have rewritten the manifests the
  // import map is derived from.
  const current = shouldFix
    ? await Promise.all(directories.map(readPackageFiles))
    : packages;

  let stale = 0;
  for (const files of current) {
    const { imports, problems } = resolveImportMap(
      files.manifest,
      catalog,
      files.config.imports ?? {}
    );
    // JSR publishes the version deno.json states, so a stale one republishes a
    // version that already shipped. Regenerating fixes it whatever the map says.
    const versionCurrent = isVersionCurrent(files.config, files.manifest);
    if (problems.length === 0 && versionCurrent) continue;

    if (shouldFix && isRepairable(problems)) {
      await regenerate(files, imports);
      log(`${relative(repositoryRoot, files.denoFile)} regenerated`);
      continue;
    }

    if (!versionCurrent) {
      error(
        `${files.manifest.name}: deno.json says version "${files.config.version ?? '(absent)'}" but package.json says "${files.manifest.version}". Run "pnpm lint:fix".`
      );
      stale += 1;
    }
    if (problems.length === 0) continue;

    report(files.denoFile, problems);
    unresolved += problems.length;
  }

  if (stale > 0) process.exitCode = 1;

  if (unresolved > 0) {
    error(
      `\n${String(unresolved)} import map problem(s). "pnpm lint:fix" regenerates stale and missing entries; an unbacked-import needs the dependency added to package.json, or the import removed; an inexpressible-range needs package.json to state a range Deno parses, such as "^7.0.0" rather than ">=6.0.0 <8.0.0".`
    );
    process.exitCode = 1;
  }
};

await run();
