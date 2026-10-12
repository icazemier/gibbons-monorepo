---
name: Gibbons PostgreSQL
description: Develop inside the @icazemier/gibbons-postgresql adapter — API surface, running tests against an embedded real Postgres, the dual ESM/CJS build, and the deno.json sync gotcha. Load when working in packages/gibbons-postgresql or editing this package's code, tests, or dependencies.
---

# Gibbons PostgreSQL — package dev workflow

The PostgreSQL adapter lives at `packages/gibbons-postgresql/`. It stores user
groups and permissions as compact bitmasks (`BYTEA`) in Postgres. Everything
below is specific to this package; for repo-wide release/build rules read the
root `AGENTS.md` first.

## Key entrypoints

- `src/index.ts` — public exports; this package also re-exports `PgCursor`,
  `combineClauses`, `quoteIdent`, `assertSelective`, and their types beyond the
  shared interfaces/models.
- `src/gibbons-postgresql.ts` — the `GibbonsPostgreSql` facade; all permission/group/user methods.
- `src/seeder.ts` — `PostgreSqlSeeder`; creates tables, a helper SQL function, and pre-allocated slots.
- `src/config.ts` — `ConfigLoader` (cosmiconfig-based; `.gibbons-postgresqlrc.json` etc.).
- `src/sql.ts` — portable SQL helpers (`quoteIdent`, `assertSelective`).
- `src/queryable.ts` — the `Queryable` abstraction and `combineClauses` (used by Prisma-compat paths).
- `src/cursor.ts` — `PgCursor`, cursor-based iteration over large result sets.
- `src/bin/` — the `gibbons-postgresql init` CLI (supports `--skip-schema`).

## Commands

Run from the repo root with the package filter:

```bash
pnpm --filter @icazemier/gibbons-postgresql test        # vitest + coverage
pnpm --filter @icazemier/gibbons-postgresql build       # dual ESM/CJS + docs
pnpm --filter @icazemier/gibbons-postgresql test -- --run src/gibbons-postgresql.spec.ts   # single spec
```

`NODE_ENV=test` is set by the script; the `vite.config.ts` `globalSetup` spins up a
real PostgreSQL instance via `embedded-postgres` (binary cached in
`node_modules/.cache`). No `.env` is needed — `.env.sample` is optional. First run
downloads the Postgres binary; the `allowBuilds` entries in `pnpm-workspace.yaml`
must not be removed or the setup fails.

Tests use `fileParallelism: false` (shared DB), `testTimeout: 30000`, and
`hookTimeout: 120000` (slow DB startup). Coverage excludes `src/bin`, `interfaces`,
and `src/index.ts`.

## Testing quirks

- Integration specs are named `*.spec.ts` next to the source in `src/` (e.g.
  `gibbons-postgresql.spec.ts`, `transactions.spec.ts`, `security.spec.ts`,
  `prisma-compat.spec.ts`, `cursor.spec.ts`) plus shared fixtures in `test/helper/`.
- Tests run against the embedded Postgres at a `pg.Pool` from `process.env.PG_URI`
  (set by globalSetup). Do not assume a plain connection string elsewhere.
- Keep new tests consistent with existing `*.spec.ts` files; assertions use the
  `vitest` expect style.

## API / model notes

- Every public method accepts an optional `client` (`PoolClient`); multi-step
  methods auto-wrap in a transaction when none is passed.
- `validateUserPermissionsFor*` / `validateUserGroupsFor*` are **synchronous** and
  never touch the DB.
- Users are looked up via a typed `UserFilter` (`id` + `metadata` JSONB
  comparators: eq/ne, in/nin, like/ilike, gt/gte/lt/lte, isNull).
- Slots = `byteLength * 8` (256 bytes → 2048). Allocating past capacity throws;
  growth/shrink is via `expandPermissions`/`expandGroups`/`shrink*`.
- `pg` is a **peer dependency** (`^8.11.0`) — consumers bring the driver.
- The seeder enables `pgcrypto` (for `gen_random_uuid()`) and installs one helper
  function `gibbons_bytea_any_bit` in the `public` schema.
- Prisma coexistence patterns and friction points are documented in the package
  README (`--skip-schema`, `schema.table` table names, two-pool/no-shared-txn).

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
