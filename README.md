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
pnpm test                 # test every package
pnpm lint                 # lint the whole workspace
```

Target a single package with pnpm filters:

```bash
pnpm --filter @icazemier/gibbons-postgresql test
```

## Releases

Each package releases independently via
[`semantic-release-monorepo`](https://github.com/pmowrer/semantic-release-monorepo),
driven by [conventional commits](https://www.conventionalcommits.org/).
Commits are scoped to the package they touch; tags are package-prefixed
(e.g. `@icazemier/gibbons-mongodb-v1.2.3`).

## License

MIT
