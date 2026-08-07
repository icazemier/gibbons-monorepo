/**
 * Installs each package the way a consumer does, from a packed tarball into a
 * throwaway project outside the workspace, and imports it both ways.
 *
 * This exists because every other check in this repo runs *inside* the pnpm
 * workspace, where workspace-only conveniences resolve fine. That blind spot
 * shipped `catalog:` in published dependency ranges for three releases: local
 * installs, CI, the Bun and Deno jobs and `jsr publish --dry-run` were all
 * green while `npm install` of the published package died with
 * EUNSUPPORTEDPROTOCOL.
 *
 * The lint guard in `publishable-deps.ts` blocks that one mistake by name. This
 * blocks the whole category, because it exercises the real path: npm resolving
 * the real manifest against the real registry, then Node loading the built
 * output through the package's own `exports` map.
 *
 * Runs on plain Node through type stripping, like the other tools.
 */
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import process from 'node:process';
import { error, log } from 'node:console';

const repositoryRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const packagesDirectory = join(repositoryRoot, 'packages');

/** npm, not pnpm: pnpm would resolve workspace conveniences a consumer cannot. */
const npm = (arguments_: readonly string[], cwd: string): string =>
  execFileSync('npm', [...arguments_], {
    cwd,
    encoding: 'utf-8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });

const packageDirectories = (): readonly string[] =>
  readdirSync(packagesDirectory, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => join(packagesDirectory, entry.name));

/** The tarball npm would upload, built from the manifest as it stands. */
const pack = (packageDirectory: string, destination: string): string => {
  npm(['pack', '--pack-destination', destination], packageDirectory);
  const tarballs = readdirSync(destination).filter((file) =>
    file.endsWith('.tgz')
  );
  const tarball = tarballs.at(-1);
  if (tarball === undefined) {
    throw new Error(`npm pack produced no tarball in ${destination}`);
  }
  return join(destination, tarball);
};

const readName = (packageDirectory: string): string => {
  const manifest: unknown = JSON.parse(
    npm(['pkg', 'get', 'name'], packageDirectory)
  );
  if (typeof manifest !== 'string') {
    throw new Error(`${packageDirectory}: "name" must be a string`);
  }
  return manifest;
};

/**
 * Installs the tarball into an empty project and loads it as both module
 * systems, since the packages ship a dual build and only one of the two would
 * catch a broken `exports` map.
 */
const installAndImport = (name: string, tarball: string): void => {
  const consumer = mkdtempSync(join(tmpdir(), 'gibbons-consumer-'));
  try {
    writeFileSync(
      join(consumer, 'package.json'),
      `${JSON.stringify({ name: 'consumer', version: '0.0.0', private: true }, undefined, 2)}\n`,
      'utf-8'
    );
    npm(['install', tarball, '--no-audit', '--no-fund'], consumer);

    writeFileSync(
      join(consumer, 'esm.mjs'),
      `import * as loaded from '${name}';\nif (Object.keys(loaded).length === 0) throw new Error('${name}: ESM entry exported nothing');\n`,
      'utf-8'
    );
    execFileSync(process.execPath, ['esm.mjs'], { cwd: consumer });

    writeFileSync(
      join(consumer, 'cjs.cjs'),
      `const loaded = require('${name}');\nif (Object.keys(loaded).length === 0) throw new Error('${name}: CJS entry exported nothing');\n`,
      'utf-8'
    );
    execFileSync(process.execPath, ['cjs.cjs'], { cwd: consumer });
  } finally {
    rmSync(consumer, { recursive: true, force: true });
  }
};

const run = (): void => {
  const staging = mkdtempSync(join(tmpdir(), 'gibbons-tarballs-'));
  let failures = 0;

  try {
    for (const packageDirectory of packageDirectories()) {
      const name = readName(packageDirectory);
      try {
        installAndImport(name, pack(packageDirectory, staging));
        log(`${name}: installs from a tarball and loads as ESM and CJS`);
      } catch (cause) {
        error(
          `${name}: a consumer cannot install or load this package\n${String(cause)}`
        );
        failures += 1;
      }
    }
  } finally {
    rmSync(staging, { recursive: true, force: true });
  }

  if (failures > 0) {
    error(
      `\n${String(failures)} package(s) would ship broken. Build them first if you have not, then check that every published dependency range is one npm can resolve.`
    );
    process.exitCode = 1;
  }
};

run();
