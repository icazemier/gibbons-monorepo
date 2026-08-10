/**
 * Puts changesets' prerelease mode in step with the branch being released.
 *
 * Runs before `changeset version` and before `changeset publish`, so neither
 * ever depends on someone having remembered `pre enter` / `pre exit`. See
 * `pre-mode.ts` for the decision this executes.
 */
import { existsSync, readFileSync, rmSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import process from 'node:process';
import { log } from 'node:console';
import { PRERELEASE_TAG, decidePreMode, type PreState } from './pre-mode.ts';

const repositoryRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const preStateFile = join(repositoryRoot, '.changeset', 'pre.json');

/** GITHUB_REF_NAME is the branch being released; git is the local fallback. */
const currentBranch = (): string =>
  process.env.GITHUB_REF_NAME ??
  execFileSync('git', ['rev-parse', '--abbrev-ref', 'HEAD'], {
    encoding: 'utf-8',
  }).trim();

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const isRecordedMode = (value: unknown): value is 'pre' | 'exit' =>
  value === 'pre' || value === 'exit';

const readPreState = (): PreState => {
  if (!existsSync(preStateFile)) return 'none';

  const parsed: unknown = JSON.parse(readFileSync(preStateFile, 'utf-8'));
  if (!isRecord(parsed)) {
    throw new Error(`${preStateFile} must contain a JSON object`);
  }
  if (!isRecordedMode(parsed.mode)) {
    throw new Error(
      `${preStateFile}: unrecognised mode ${JSON.stringify(parsed.mode)}`
    );
  }
  return parsed.mode;
};

const runChangeset = (...args: string[]): void => {
  execFileSync('changeset', args, { stdio: 'inherit', cwd: repositoryRoot });
};

const branch = currentBranch();
const action = decidePreMode(branch, readPreState());

switch (action) {
  case 'exit':
    runChangeset('pre', 'exit');
    rmSync(preStateFile, { force: true });
    log(`${branch}: left prerelease mode, releasing to latest`);
    break;
  case 'discard':
    rmSync(preStateFile);
    log(`${branch}: discarded a stale pre state, releasing to latest`);
    break;
  case 'stable':
    log(`${branch}: stable, releasing to latest`);
    break;
  case 'keep':
    log(`${branch}: already in prerelease mode (${PRERELEASE_TAG})`);
    break;
  case 'enter':
    runChangeset('pre', 'enter', PRERELEASE_TAG);
    log(`${branch}: entered prerelease mode (${PRERELEASE_TAG})`);
    break;
}
