---
name: Gibbons Update Dependencies
description: Safely bump a dependency in the gibbons monorepo — the catalog-first workflow, the deno.json import-map sync, pinned-exact tooling, changeset rules, and how to review Dependabot PRs. Load before touching any dependency range, pnpm-workspace.yaml, or Dependabot PR in this repo.
---

# Gibbons — update dependencies

This repo publishes to **both npm and JSR**, and JSR resolves dependencies through
`deno.json`, not `package.json`. A wrong bump fails **silently** at publish time —
`jsr publish` drops any dependency it cannot read and publishes anyway. Read the
root `AGENTS.md` first; this skill is the dependency-specific playbook.

## The single source of truth

Shared versions are authored **once**, in the `catalog:` block of
`pnpm-workspace.yaml`. The literal ranges in each `package.json` and the `deno.json`
import maps are **generated artifacts**:

- `pnpm lint:fix` regenerates package.json literal ranges **and** deno.json from the catalog.
- `pnpm lint` fails on any drift between the three.
- A stale `deno.json` silently republishes an already-shipped version on JSR.

So the rule is: **bump the catalog, run `pnpm lint:fix`, commit all three files.**

## Which field governs a bump

| Dependency kind | Range authored in | Must match catalog? |
|---|---|---|
| Shared runtime deps (`@icazemier/gibbons`, `cosmiconfig`, `yargs`) | `catalog:` in `pnpm-workspace.yaml` | Yes — package.json literal range is **generated** from it |
| Shared dev deps | `catalog:` in `pnpm-workspace.yaml` | No lint check (deliberately excluded) |
| Package-private deps | directly in `package.json` | No (own business) |

## Hard rules — do not break these

- **Runtime `dependencies`/`peerDependencies`/`optionalDependencies` must be literal ranges, never `catalog:`.** JSR cannot read `catalog:` — it logs a warning and publishes the package with the dependency **missing**. Enforced by `tools/publishable-deps.ts`. Only `devDependencies` may use `catalog:`.
- **`jsr` and `@changesets/cli` are pinned exactly** (e.g. `jsr: 0.14.3`, `@changesets/cli: 2.31.1`), not ranged — they decide what reaches the registry, so their version is not a caret's call.
- **`mongodb` majors are deliberately ignored by Dependabot** — a mongodb major widens the published `peerDependencies` range (breaking for consumers) and changes session semantics the test suite pins. Tracked as its own work, not a routine bump.
- A runtime dependency bump **needs a changeset** (consumer impact: major = breaking, minor = new capability, patch = bugfix). A dev-dependency bump usually does not.

## Manual bump workflow

```bash
# 1. Edit the catalog block in pnpm-workspace.yaml (for shared deps)
#    OR edit package.json directly (for a package-private dep)

# 2. Regenerate the derived files and run the full lint gate
pnpm lint:fix
pnpm lint          # must pass — catches catalog/package/deno.json drift

# 3. If it's a runtime dep, add a changeset for consumer impact
pnpm changeset

# 4. Run the affected package's tests + build
pnpm --filter @icazemier/gibbons-mongodb test
pnpm --filter @icazemier/gibbons-mongodb build

# 5. Commit all touched files: pnpm-workspace.yaml + package.json(s) + deno.json(s) + changeset
```

Conventional commits only. If the install pulled a package with a lifecycle
script not already in `allowBuilds` (`pnpm-workspace.yaml`), pnpm pauses it —
run `pnpm approve` to review before continuing. Never add a package to
`allowBuilds` blindly; it's a supply-chain decision.

## Reviewing Dependabot PRs (the common case)

Dependabot is configured to target `development` (`target-branch: development`),
so dependency PRs land there and reach `main` only through a release promotion.
Dev-tooling bumps are grouped into one PR (`dev-dependencies` group).

For each Dependabot PR:

1. **Check the bump type.** If it touches a *runtime* dep (`@icazemier/gibbons`,
   `cosmiconfig`, `yargs`), the catalog in `pnpm-workspace.yaml` must be the
   changed file — the package.json literal range follows. If Dependabot changed
   package.json directly instead, reject it and bump the catalog yourself.
2. **Confirm `pnpm lint` passes** — it catches any catalog/deno.json drift the bot
   may have left.
3. **Runtime dep bump → needs a changeset.** Add one with the right bump level.
4. **Check the lockfile + build/test.** Run `pnpm install --frozen-lockfile`,
   `pnpm build`, and the affected package's tests.
5. **Ignore `mongodb` major PRs** (by design — see hard rules) unless they're
   intentional tracked work.

## The release verify flake (read before any release-adjacent work)

`verify-published` runs on every release and asserts both registries serve every
package's declared version. It has failed three times — not because a publish
was lost, but because **npm's CDN propagation lag for `gibbons-mongodb` is the
longest of anything in the repo**, and mongodb is always checked first (`packages/`
sorts alphabetically, npm before JSR). Every failure so far was the same shape:
npm still not serving mongodb's new version after the whole retry window, while
the version was served moments later.

| release | window | result |
|---|---|---|
| `3.1.0` | no retries | ❌ npm served it, JSR was stale |
| `3.1.2-beta.1` | ~20s (5×4s) | ❌ propagation > 20s |
| `3.1.2-beta.2` | ~60s (12×5s) | ❌ mongodb npm still not served after 57s |
| current | **~120s (24×5s)** | should outlast measured >57s worst case |

Lessons:

- **A `-beta.N`/release failing `Verify both registries serve every version` is
  usually a propagation flake, not a lost publish.** Before assuming a real
  failure, check whether npm actually serves the version now (it almost always
  does). If it does, the fix is to widen the window — see `RETRIES`/`RETRY_DELAY_MS`
  in `tools/verify-published.ts` — and rerun, not to republish.
- `gibbons-mongodb` is the slowest npm publisher and is verified first, so it
  pays the whole retry budget. `gibbons-postgresql` propagates fast. Never shrink
  the window below the measured worst case for mongodb.
- The fix lives in the retry constants, **not** in publish logic — publishing is
  idempotent (both registries skip an existing version), so a green publish with
  a red verify means propagation, never a need to republish.

## Promotion gotcha: a `development → main` merge needs a changeset to ship

`development` publishes `-beta.N`; `main` publishes `latest`. A plain
`development → main` merge with **no pending changesets publishes nothing** —
the release workflow exits pre-mode, `changeset version` finds nothing to
consume, and `changeset publish` skips versions that already exist on npm (the
beta versions), so `latest` stays stale.

To promote already-released beta fixes to `latest`, add a **patch changeset** for
the affected packages on `development`, merge it (produces the next `-beta.N`),
then merge `development → main`. The promote merge consumes the changeset after
exiting pre-mode, bumping `X-beta.N → X` and shipping the stable version to
`latest`.

## Gotchas

- Dev-dep catalog drift is **not lint-flagged** (`catalog-ranges` excludes
  `devDependencies`), so check `pnpm-workspace.yaml` manually when a dev bump is
  grouped there.
- A dependency added to the catalog must also be declared by the packages that
  consume it, or `pnpm lint` reports it as an unbacked import.
- Deno parses ranges its own way — an inexpressible range (e.g. `>=6.0.0 <8.0.0`)
  needs a range Deno parses like `^7.0.0`; `pnpm lint` calls this out.
- After any dependency change, commit `deno.json` alongside `package.json` —
  a stale import map is a silent JSR republish.
