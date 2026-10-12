# AGENTS.md

Two packages publish the `@icazemier/gibbons-*` adapters to **both npm and JSR**. The release plumbing is unusually strict because JSR resolves dependencies through `deno.json`, not `package.json`. Most "obvious" changes (bumping a dependency, editing a manifest) fail silently at publish time unless the generated files are kept in sync.

## Commands

```bash
pnpm install --frozen-lockfile   # sole installer; pnpm is pinned via packageManager (12.11.2)
pnpm build                       # build every package (dual ESM/CJS + docs)
pnpm test                        # tools tests, then every package's tests
pnpm lint                        # typecheck + deno import-map check + eslint
pnpm lint:fix                    # same, applying fixes — INCLUDES regenerating deno.json
pnpm test:tools                  # node --test tools/*.spec.ts
pnpm typecheck                   # tsc --noEmit over tools/ only
```

Target one package with filters, e.g. `pnpm --filter @icazemier/gibbons-postgresql test`. `nvm` is pinned to Node 24 (`.nvmrc`).

## package.json is the single source of truth

- `deno.json` (version + import map) is a **generated artifact** regenerated from each `package.json` by `pnpm lint:fix`. `pnpm lint` fails when the committed copy has drifted.
- **Move a dependency range, then run `pnpm lint:fix` and commit both files.** A stale `deno.json` silently republishes an already-shipped version on JSR.
- Runtime `dependencies` / `peerDependencies` must use **literal ranges, never `catalog:`**. JSR cannot read pnpm's `catalog:` protocol — it logs a warning and publishes the package with those dependencies **missing**. Only `devDependencies` use `catalog:`.
- Shared dev-dependency versions are authored once in the `catalog:` block of `pnpm-workspace.yaml` and referenced as `catalog:`.

## Build is a dual ESM/CJS emit

Each package builds `build/esm` and `build/cjs` from `src/`, then `fixup.mjs` writes a per-format `package.json` (`type: module` / `type: commonjs`) into each. `exports` carries conditional `types` subpaths for both. Don't hand-edit `build/` — it's gitignored and regenerated.

## Tools run through Node type stripping

`tools/` is TypeScript executed directly (`node --test tools/*.spec.ts`), no build step ahead of `pnpm lint`. `tools/` holds repo-level checks: `check-deno-import-map.ts` (source-of-truth guard), `catalog-ranges.ts`, `publishable-deps.ts` (no `catalog:` in published fields), `verify-published.ts` (both registries serve every version), `apply-pre-mode.ts` (switches changesets pre-mode from the branch name).

## Tests need real databases, but are self-contained

Each package's `vite.config.ts` `globalSetup` spins up `mongodb-memory-server` (a MongoDB replica set, binary downloaded to `node_modules/.cache`) and `embedded-postgres` (a real PG instance). No `.env` is required — the `.env.sample` files are optional overrides. First test run downloads binaries; expect them in `node_modules/.cache/mongodb-binaries`. These are the `allowBuilds` entries in `pnpm-workspace.yaml` — don't remove them.

## Releases: changesets + GitFlow

- `development` publishes the **beta** channel (`-beta.N`); `main` publishes `latest`. `main` accepts **development only** (enforced by `guard-release-flow.yml`).
- Merging into `development`/`main` **is the whole release** — the `Release` workflow versions, publishes (npm → JSR → tag), and auto-merges its own bot PRs (`chore: version packages`, `chore: back-merge main into development`). **Ignore those PRs; do not touch them.**
- A merge with **no changesets publishes nothing** — that's correct for tooling/CI/test changes. Only add a changeset (`pnpm changeset`) for user-facing changes. Pick bump by consumer impact (major = breaking, minor = new capability, patch = bugfix to existing behaviour).
- Pre-mode is automatic via `apply-pre-mode.ts`; never run `changeset pre enter`/`pre exit` by hand.
- Publishing uses OIDC trusted publishing (npm + JSR) — no tokens to rotate.

## Gotchas worth knowing

- `@changesets/cli` and `jsr` are **pinned exactly** in the catalog — they decide what reaches the registry, so their version is not a caret's call.
- `pnpm/action-setup` must be at v6.0.10+ or the OIDC-token-based npm publish 404s.
- CI skips `changeset-release/**` and `chore/backmerge-main` bot branches by design (avoids `action_required` runs under `first_time_contributors`). A red "workflow file issue" CI run on the version-branch is expected noise, not a failure.
- The `catalog-ranges` lint deliberately excludes `devDependencies`, so dev-dep catalog drift is not flagged — check `pnpm-workspace.yaml` manually when bumping dev tooling.
- `[skip ci]` in a commit message skips CI jobs and release back-merge.
- If the global pnpm is too old to run `packageManager`-pinned scripts (ENOEXEC), upgrade it — `corepack`/a fresh global pnpm both work.

## Existing instruction sources

`README.md` (dev overview), `RELEASING.md` (full release mechanics), `packages/*/README.md` (per-package usage).
