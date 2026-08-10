<img src="https://raw.githubusercontent.com/icazemier/gibbons/master/gibbons.png" width="200" />

# gibbons-monorepo

Manage user groups and permissions using bitwise operations with [Gibbons](https://github.com/icazemier/gibbons), across multiple data stores. Store and query thousands of permissions using minimal space.

This is a [pnpm](https://pnpm.io/) workspace housing the database-specific Gibbons adapters.

## Packages

| Package | Store | npm |
| --- | --- | --- |
| [`@icazemier/gibbons-mongodb`](packages/gibbons-mongodb) | MongoDB | `npm install @icazemier/gibbons-mongodb mongodb` |
| [`@icazemier/gibbons-postgresql`](packages/gibbons-postgresql) | PostgreSQL | `npm install @icazemier/gibbons-postgresql pg` |

Each package is published and versioned independently. See its README for usage.

## Development

Requires [pnpm](https://pnpm.io/) (the sole installer — shared dependency
versions are pinned via the workspace [catalog](pnpm-workspace.yaml)).

```bash
pnpm install              # install all workspaces
pnpm build                # build every package
pnpm test                 # repo tooling, then every package
pnpm lint                 # typecheck, import maps, eslint
pnpm lint:fix             # the same, applying every fix it can
```

Target a single package with pnpm filters:

```bash
pnpm --filter @icazemier/gibbons-postgresql test
```

### Dependency versions are declared once

Both packages publish to [JSR](https://jsr.io/@icazemier) as well as npm, and
JSR resolves a package's imports through the `imports` map in its `deno.json`
rather than through `package.json`. That map has to restate the dependency
ranges, because **JSR cannot read pnpm's `catalog:` protocol** — and it does not
fail when it meets one. It logs `Ignoring failed to resolve package.json
dependency` and publishes a package with those dependencies missing.

The map is therefore treated as a generated artifact, in the same way a
lockfile is:

- `package.json` is the only place a version is authored, resolving through the
  workspace [catalog](pnpm-workspace.yaml) where both packages share a
  dependency.
- `pnpm lint:fix` regenerates every `deno.json` import map from it.
- `pnpm lint` fails when a committed map has drifted, in either direction: a
  range that no longer matches, or a runtime dependency with no entry at all.

**Move a dependency range, then run `pnpm lint:fix` and commit both files.**

An import backed by neither `dependencies` nor `peerDependencies` is reported
but never rewritten — that is a manifest bug, and quietly deleting the entry
would hide it.

### Repo tooling

`tools/` holds the checks that operate on the workspace rather than on a single
package. It is TypeScript executed directly through Node's type stripping, so
nothing needs building ahead of `pnpm lint`.

```bash
pnpm typecheck            # tsc --noEmit over tools/
pnpm test:tools           # node --test tools/*.spec.ts
```

## Releases

Each package releases independently through
[changesets](https://github.com/changesets/changesets). A user-facing change
carries a changeset (`pnpm changeset`) describing its bump; `development`
publishes the `beta` channel and `main` publishes `latest`.

See [RELEASING.md](RELEASING.md) for the full flow.

## License

MIT
