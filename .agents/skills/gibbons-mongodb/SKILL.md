---
name: Gibbons MongoDB
description: Develop inside the @icazemier/gibbons-mongodb adapter — API surface, running tests against the in-memory replica set, the dual ESM/CJS build, and the deno.json sync gotcha. Load when working in packages/gibbons-mongodb or editing this package's code, tests, or dependencies.
---

# Gibbons MongoDB — package dev workflow

The MongoDB adapter lives at `packages/gibbons-mongodb/`. It stores user groups
and permissions as compact bitmasks (`Binary`) in MongoDB. Everything below is
specific to this package; for repo-wide release/build rules read the root
`AGENTS.md` first.

## Key entrypoints

- `src/index.ts` — public exports (interfaces, models, config, facade, seeder, utils).
- `src/gibbons-mongo-db.ts` — the `GibbonsMongoDb` facade; all permission/group/user methods live here.
- `src/seeder.ts` — `MongoDbSeeder`, seeds pre-allocated slot documents.
- `src/config.ts` — `ConfigLoader` (cosmiconfig-based; `.gibbons-mongodbrc.json` etc.).
- `src/utils.ts` — bitwise helpers, `withTransaction`.
- `src/bin/` — the `gibbons-mongodb init` CLI.

## Commands

Run from the repo root with the package filter (faster than `pnpm test` over the whole repo):

```bash
pnpm --filter @icazemier/gibbons-mongodb test        # vitest + coverage
pnpm --filter @icazemier/gibbons-mongodb build       # dual ESM/CJS + docs
pnpm --filter @icazemier/gibbons-mongodb test -- --run src/gibbons-mongo-db.spec.ts   # single spec
```

`NODE_ENV=test` is set by the script; the `vite.config.ts` `globalSetup` spins up a
`MongoMemoryReplSet` (2-node replica set) with a binary cached in
`node_modules/.cache/mongodb-binaries`. No `.env` is needed — `.env.sample` is
optional. First run downloads the MongoDB binary; the `allowBuilds` entry in
`pnpm-workspace.yaml` must not be removed or the seeder setup fails.

Tests use `fileParallelism: false` (shared DB), `testTimeout: 30000`, and
`hookTimeout: 120000` (slow DB startup). Coverage excludes `src/bin`, `interfaces`,
and `src/index.ts`.

## Testing quirks

- Integration specs are named `*.spec.ts` next to the source in `src/` (e.g.
  `gibbons-mongo-db.spec.ts`, `transactions.spec.ts`, `security.spec.ts`) plus
  shared fixtures in `test/helper/` (`fixtures.ts`, `seeders.ts`).
- A real Mongo `MongoClient` is created from `process.env.MONGO_URI` set by the
  globalSetup — tests must not assume a standalone server (transactions need the
  replica set).
- Keep new tests consistent with existing `*.spec.ts` files; assertions use the
  `vitest` expect style.

## API / model notes

- Every public method accepts an optional `session`; multi-step methods
  auto-wrap in a transaction when none is passed.
- `validateUserPermissionsFor*` / `validateUserGroupsFor*` are **synchronous** and
  never touch the DB.
- Slots = `byteLength * 8` (256 bytes → 2048). Allocating past capacity throws;
  growth/shrink is via `expandPermissions`/`expandGroups`/`shrink*`.
- `mongodb` is a **peer dependency** (`^6.0.0 || ^7.0.0`) — consumers bring the driver.

## Gotchas when editing this package

- **Dependency ranges**: author in `package.json` only, then run `pnpm lint:fix`
  from the root and commit both `package.json` **and** the regenerated `deno.json`.
  A stale `deno.json` silently republishes an already-shipped version on JSR.
  Runtime `dependencies`/`peerDependencies` must use literal ranges, never `catalog:`.
- **Build output** (`build/esm`, `build/cjs`) is gitignored and regenerated; never
  hand-edit it.
- **User-facing changes need a changeset**: `pnpm changeset`, bump by consumer
  impact (patch = bugfix, minor = new capability, major = breaking).
- **Conventional commits** for commit messages.
