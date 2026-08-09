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

Merge, and it releases. That is the whole flow.

Merging into `development` or `main` starts the Release workflow. After the
tests, lint and the consumer-install check pass, it consumes any pending
changesets into the version, the changelog, the lockfile and `deno.json`,
commits that bump to the branch, and publishes: npm first, then JSR, then a
GitHub release and tag. A merge carrying no changesets publishes nothing, which
is the right outcome for a change with nothing user-facing in it.

A release cut on `main` is back-merged into `development` automatically, so the
beta channel computes its next version from what has actually shipped.

You will see two short-lived pull requests go by, `chore: version packages` and
`chore: back-merge main into development`. **Ignore them.** The workflow opens
and merges each one itself; they exist only because the `Release branches`
ruleset requires changes to arrive by pull request, and nothing here can bypass
that — GitHub only accepts the Actions app as a bypass actor on
organisation-owned repositories, and this one belongs to a user.

That constraint is also why publishing happens inside the same run as the
version bump rather than being triggered by the merge: merges made with
`GITHUB_TOKEN` deliberately start no workflow run. The same property is what
stops a release from re-triggering itself.

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
