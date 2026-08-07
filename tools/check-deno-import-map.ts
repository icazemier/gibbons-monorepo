/**
 * Verifies — or with `--fix`, regenerates — every package's `deno.json` import
 * map from its `package.json`. See `deno-import-map.ts` for why the map is
 * load-bearing and why drift in it fails silently at publish time.
 *
 * Runs on plain Node through type stripping, so `pnpm lint` needs no build
 * step ahead of it.
 */
import { readdir, writeFile } from 'node:fs/promises';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import process from 'node:process';
import { error, log } from 'node:console';
import {
  isRepairable,
  resolveImportMap,
  type Problem,
} from './deno-import-map.ts';
import {
  readCatalog,
  readPackageFiles,
  type PackageFiles,
} from './package-files.ts';

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
  const contents = JSON.stringify({ ...files.config, imports }, undefined, 2);
  await writeFile(files.denoFile, `${contents}\n`, 'utf-8');
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

  for (const files of packages) {
    const { imports, problems } = resolveImportMap(
      files.manifest,
      catalog,
      files.config.imports ?? {}
    );
    if (problems.length === 0) continue;

    if (shouldFix && isRepairable(problems)) {
      await regenerate(files, imports);
      log(`${relative(repositoryRoot, files.denoFile)} regenerated`);
      continue;
    }

    report(files.denoFile, problems);
    unresolved += problems.length;
  }

  if (unresolved > 0) {
    error(
      `\n${String(unresolved)} import map problem(s). "pnpm lint:fix" regenerates stale and missing entries; an unbacked-import needs the dependency added to package.json, or the import removed.`
    );
    process.exitCode = 1;
  }
};

await run();
