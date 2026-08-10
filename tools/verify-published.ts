/**
 * Asserts that both registries actually serve the version each package declares.
 *
 * Publishing is idempotent by design — npm and JSR both skip a version they
 * already have and exit 0 — so a green publish step proves nothing shipped. The
 * 3.1.0 release is the reason this exists: npm served it while JSR was still on
 * 3.0.2, and every step in the run had reported success.
 *
 * Every package is checked on every run, including ones that got no release.
 * Their declared version is already published, so the assertion holds for them
 * too, and a registry that silently fell behind is caught rather than assumed.
 */
import { readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { setTimeout as sleep } from 'node:timers/promises';
import { log, error } from 'node:console';
import process from 'node:process';
import { isRecord, readManifest } from './package-files.ts';

/**
 * Both registries answer with a `versions` map keyed by version. Anything else
 * — an error body, a 404 page, a rename — counts as not served rather than
 * throwing, because the caller retries.
 */
export const servesVersion = (body: unknown, version: string): boolean =>
  isRecord(body) &&
  isRecord(body.versions) &&
  Object.hasOwn(body.versions, version);

export const registryUrls = (name: string): readonly RegistryTarget[] => [
  { label: 'npm', url: `https://registry.npmjs.org/${name}` },
  { label: 'JSR', url: `https://jsr.io/${name}/meta.json` },
];

export interface RegistryTarget {
  readonly label: string;
  readonly url: string;
}

// A publish is visible within seconds, but not always instantly, so a miss is
// retried before it is called a failure.
const RETRIES = 5;
const RETRY_DELAY_MS = 4000;

const isServed = async (
  target: RegistryTarget,
  version: string
): Promise<boolean> => {
  for (let attempt = 1; attempt <= RETRIES; attempt++) {
    try {
      const response = await globalThis.fetch(target.url, {
        headers: { accept: 'application/json' },
      });
      if (response.ok && servesVersion(await response.json(), version)) {
        return true;
      }
    } catch (reason) {
      // Unreachable is indistinguishable from not-caught-up-yet, so it retries
      // rather than crashing the run.
      const message = reason instanceof Error ? reason.message : String(reason);
      log(`  ${target.label}: unreachable (${message}), retrying`);
    }
    if (attempt < RETRIES) await sleep(RETRY_DELAY_MS);
  }
  return false;
};

const packageManifestFiles = async (
  packagesDirectory: string
): Promise<readonly string[]> => {
  const entries = await readdir(packagesDirectory, { withFileTypes: true });
  return entries
    .filter((entry) => entry.isDirectory())
    .map((entry) => join(packagesDirectory, entry.name, 'package.json'));
};

let failed = false;

for (const manifestFile of await packageManifestFiles('packages')) {
  const { name, version } = await readManifest(manifestFile);
  log(`${name}@${version}`);

  for (const target of registryUrls(name)) {
    if (await isServed(target, version)) {
      log(`  ${target.label}: serving ${version}`);
    } else {
      error(`  ${target.label}: does NOT serve ${version}`);
      failed = true;
    }
  }
}

if (failed) {
  error('a package is missing from a registry; the release did not fully ship');
  process.exit(1);
}

log('every package is live on npm and JSR');
