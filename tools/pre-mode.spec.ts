import { describe, it } from 'node:test';
import { strictEqual } from 'node:assert/strict';
import { STABLE_BRANCHES, decidePreMode } from './pre-mode.ts';

/**
 * The two directions this decision can be wrong are not symmetric. Publishing a
 * stable release under the beta tag leaves `latest` pointing at an older
 * version; publishing a beta to `latest` ships unfinished work to everyone who
 * installs the package. Both are covered below.
 */
describe('decidePreMode', () => {
  it('leaves prerelease mode when a stable branch is still in it', () => {
    strictEqual(decidePreMode('main', 'pre'), 'exit');
  });

  it('discards the state file a "pre exit" leaves behind', () => {
    strictEqual(decidePreMode('main', 'exit'), 'discard');
  });

  it('does nothing on a stable branch with no state file', () => {
    strictEqual(decidePreMode('main', 'none'), 'stable');
  });

  it('treats master as stable as well', () => {
    strictEqual(decidePreMode('master', 'pre'), 'exit');
  });

  it('enters prerelease mode on a release branch that is not in it', () => {
    strictEqual(decidePreMode('development', 'none'), 'enter');
  });

  it('re-enters after a "pre exit" left the file behind', () => {
    strictEqual(decidePreMode('development', 'exit'), 'enter');
  });

  it('keeps a release branch already in prerelease mode', () => {
    strictEqual(decidePreMode('development', 'pre'), 'keep');
  });

  it('treats any unrecognised branch as a prerelease branch', () => {
    strictEqual(decidePreMode('fix/some-branch', 'none'), 'enter');
  });
});

describe('STABLE_BRANCHES', () => {
  it('matches the branches the release workflow publishes latest from', () => {
    strictEqual(STABLE_BRANCHES.has('main'), true);
    strictEqual(STABLE_BRANCHES.has('master'), true);
    strictEqual(STABLE_BRANCHES.has('development'), false);
  });
});
