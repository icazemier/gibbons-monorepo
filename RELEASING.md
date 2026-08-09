# Releasing

Both packages release independently through
[changesets](https://github.com/changesets/changesets). Versions live in each
package's `package.json`; nothing is derived from commit messages.

## Branches

| branch        | dist tag  | what it publishes                    |
| ------------- | --------- | ------------------------------------ |
| `development` | `beta`    | prereleases, e.g. `3.1.0-beta.2`     |
| `main`        | `latest`  | stable releases, e.g. `3.1.0`        |

GitFlow, no exceptions: a working branch merges into `development`, and
`development` is promoted to `main` with a merge commit. Prerelease mode is
switched on and off from the branch name by `tools/apply-pre-mode.ts`, so
nobody has to remember `changeset pre enter` or `changeset pre exit`.

## Writing a changeset

A change that users should see needs a changeset. Add one before opening the
pull request:

```bash
pnpm changeset
```

It asks which packages changed, whether the change is major/minor/patch, and
for a one-line summary. That writes a markdown file under `.changeset/`, which
you commit alongside the code.

Changes with nothing user-facing in them — CI, tooling, tests, refactors — need
no changeset. A pull request without one simply releases nothing, which is the
correct outcome for that kind of change.

Pick the bump by what it does to a consumer:

| bump  | when                                                          |
| ----- | ------------------------------------------------------------- |
| major | anything a consumer must adapt to: removed or renamed exports, changed behaviour, a narrowed peer range, a config contract change |
| minor | new capability that existing code keeps working through, including a **widened** peer range |
| patch | a fix to behaviour that was already meant to work             |

## How a release happens

Merging into `development` or `main` starts the Release workflow, and a release
takes **two merges**:

1. The workflow sees pending changesets and opens a **`chore: version packages`**
   pull request. It carries the new version, the generated `CHANGELOG.md` and
   the regenerated `deno.json`. Read the version in that PR — it is the release
   you are about to cut.
2. Merging that PR starts the workflow again. With no changesets left it
   publishes instead: npm first, then JSR, then a GitHub release and tag.

Two merges rather than one is not a workaround. `main` and `development` both
require pull requests, so nothing can push a version commit straight to a
release branch — and it means the version is reviewable before it exists
anywhere public.

A release cut on `main` is followed by an automatic **back-merge** pull request
into `development`. Merge it. Until it lands, `development` still believes the
old version is current and will compute its next beta from it.

## Publishing credentials

There are none to rotate. Both registries use OIDC trusted publishing, so the
workflow proves its identity to npm and JSR with a short-lived token minted per
run. `changeset publish` delegates to `pnpm publish` inside the workspace, which
reads that token itself.

The one moving part worth knowing: this needs `pnpm/action-setup` at v6.0.10 or
newer. Older releases bootstrapped a pnpm that could not see the OIDC token, and
the publish failed with a 404.

## Versions are authored in exactly one place

`package.json` is it. `deno.json` mirrors the version and the import map, both
generated from the manifest, and `pnpm lint` fails when the committed copy has
drifted:

```bash
pnpm lint       # verifies
pnpm lint:fix   # regenerates
```

This matters more than it looks. JSR publishes the version `deno.json` states,
so a stale one silently republishes a version that already shipped.
