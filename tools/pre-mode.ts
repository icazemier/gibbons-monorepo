/**
 * Decides whether a release branch publishes a prerelease or a stable version.
 *
 * GitFlow gives this repo two release branches: `development` publishes the
 * beta channel, `main` publishes `latest`. changesets models that with a
 * prerelease mode it expects a human to toggle by hand — `changeset pre enter`
 * before the first beta and `changeset pre exit` before promoting. Deriving the
 * mode from the branch instead removes the toggle, and with it the failure
 * where a forgotten `pre exit` publishes a beta to `latest`.
 *
 * Everything here is pure so the decision can be tested without a git
 * repository; `apply-pre-mode.ts` reads the state and runs the commands.
 */

/**
 * The prerelease state as `.changeset/pre.json` records it.
 *
 * `changeset pre exit` rewrites the file with mode `exit` rather than deleting
 * it, so the file existing says nothing on its own — only the mode does. A
 * third state is needed for "no file at all", which is what a stable release
 * requires.
 */
export type PreState = 'pre' | 'exit' | 'none';

/**
 * What has to happen before `changeset version` or `changeset publish` runs.
 *
 * `discard` exists because `changeset publish` picks its dist tag on whether a
 * pre state file is present, never on the mode inside it. A leftover `exit`
 * file therefore publishes a finished stable release under the beta tag and
 * leaves `latest` behind — so on a stable branch the file has to be gone, not
 * merely exited.
 */
export type PreModeAction = 'exit' | 'discard' | 'stable' | 'keep' | 'enter';

/** The branches that publish to the `latest` dist tag. */
export const STABLE_BRANCHES: ReadonlySet<string> = new Set(['main', 'master']);

/** The dist tag every non-stable release branch publishes under. */
export const PRERELEASE_TAG = 'beta';

export const decidePreMode = (
  branch: string,
  state: PreState
): PreModeAction => {
  if (STABLE_BRANCHES.has(branch)) {
    if (state === 'pre') return 'exit';
    return state === 'exit' ? 'discard' : 'stable';
  }

  return state === 'pre' ? 'keep' : 'enter';
};
