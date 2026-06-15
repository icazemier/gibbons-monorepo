# gibbons-monorepo — migration plan

Merge `gibbons-mongodb` + `gibbons-postgresql` into one pnpm workspace to cut maintenance.

## Decisions

- **Package manager:** pnpm workspaces (single lockfile, hoisted shared deps).
- **Release:** `semantic-release-monorepo` — keep commit-driven semantic-release + npm trusted publish + JSR, scoped per package.
- **Git history:** preserved via `git filter-repo --to-subdirectory-filter`, merged with `--allow-unrelated-histories`.

## Target layout

```
gibbons-monorepo/
├── package.json              # root, private, workspace scripts
├── pnpm-workspace.yaml       # packages: ["packages/*"]
├── pnpm-lock.yaml            # single lockfile
├── tsconfig.base.json        # shared compiler opts
├── eslint.config.js          # hoisted (identical today)
├── commitlint.config.js      # hoisted (identical)
├── .prettierrc.json .editorconfig .nvmrc .gitignore .npmignore
├── .husky/                   # hoisted, runs at root
├── .github/workflows/        # ci.yml + release.yml (matrix over packages)
├── fixup.mjs                 # hoisted shared build helper
└── packages/
    ├── gibbons-mongodb/      # src/ test/ tsconfig*.json vite.config.ts
    │                         # .releaserc.json deno.json package.json
    └── gibbons-postgresql/   # same
```

Per-package keeps: `src/`, `test/`, build tsconfigs, `vite.config.ts`, `.releaserc.json`,
`deno.json`, `package.json`, `examples/`, `guides/`, `docs/` (generated), `compat/`, CLI bin.
Root keeps shared tooling — single source of truth.

## Steps

1. **Init monorepo skeleton (fresh git).** `git init`; root `package.json` (`private:true`,
   `packageManager: pnpm@x`), `pnpm-workspace.yaml`. Root scripts: `build`/`test`/`lint` →
   `pnpm -r run …`; `-F <pkg>` for single.
2. **Import each repo with history.** Per repo: clone → `git filter-repo
   --to-subdirectory-filter packages/<pkg>` → add as remote → merge `--allow-unrelated-histories`.
   Old repos untouched as archive until cutover verified.
3. **Hoist shared tooling, delete per-package copies.** Move identical files up
   (`eslint.config.js`, `commitlint.config.js`, `fixup.mjs`, `.editorconfig`, `.nvmrc`,
   `.npmignore`, `.prettierrc.json`, `.husky/`). `tsconfig.base.json` at root; pkg tsconfigs
   shrink to `extends`. Reconcile cosmetic vite/releaserc diffs. Hoist duplicated devDeps to
   root; keep DB-specific + peer deps local.
4. **Lockfile + install.** Delete old `package-lock.json` (both) + `bun.lock` (pg). One
   `pnpm install`. Verify `pnpm -r build && pnpm -r test`.
5. **Release: semantic-release-monorepo.** Root devDep; each `.releaserc.json` extends it so
   tags/changelogs scope per package (`gibbons-mongodb-v1.2.3`). Keep npm trusted-publish + JSR.
   Independent versions preserved (mongo 0.0.0, pg 1.0.0).
6. **CI consolidation.** `ci.yml`: matrix `[gibbons-mongodb, gibbons-postgresql]` × node
   `[20,22,24,26]` + bun + deno; `pnpm -F <pkg>` build/test/lint. Optional `paths-filter` so a
   pkg only builds when its files change. `release.yml`: matrix per package runs
   semantic-release in `packages/<pkg>`; JSR step per package.
7. **Husky/commit hooks.** Root `.husky/` runs commitlint + lint-staged across workspace.
8. **Cutover + verify.** Full `pnpm -r build/test/lint` green, `semantic-release --dry-run`
   per pkg sane, then point remotes / archive old repos.

## Deferred (YAGNI)

- Shared internal `@icazemier/gibbons-core` package — skip; source diverged, real shared logic
  already in published `@icazemier/gibbons`.
- Folding core `gibbons` repo in — out of scope; layout leaves room.

## Risks

- `semantic-release-monorepo` tag scheme differs from current single-package tags — dry-run
  the first release so it doesn't re-publish/skip.
- pnpm strictness may expose missing direct deps npm hoisting hid → declare them.
- filter-repo merge is one-shot; run on throwaway clones, not live repos.
