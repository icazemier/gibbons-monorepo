# @icazemier/gibbons-postgresql

## 3.0.4-beta.1

### Patch Changes

- e3475ca: Widen the retry window in `verify-published` so a freshly published version that npm's registry has not propagated yet is not mistaken for a missing one. The previous window (~20s) was shorter than npm's worst-case CDN propagation lag (~60s), which caused a flaky `Publish to JSR` failure when the slowest package in a sequential publish had not settled by the time both registries were verified.

## 3.0.4-beta.0

### Patch Changes

- 3fcdd87: Improve ESM type resolution by adding conditional `types` subpaths to the `exports` map, so TypeScript resolves the correct declaration file for both `import` and `require` entry points. Also document the dynamic-import TypeScript limitation in the READMEs.

## 3.0.3

### Patch Changes

- ad148a0: The "could not load config" error now names the CLI directly instead of prefixing it with `npx`. The package ships a `bin`, so anyone hitting this error already has the executable installed and no longer gets pointed at a command that resolves from the registry.

## 3.0.3-beta.0

### Patch Changes

- ad148a0: The "could not load config" error now names the CLI directly instead of prefixing it with `npx`. The package ships a `bin`, so anyone hitting this error already has the executable installed and no longer gets pointed at a command that resolves from the registry.

## 3.0.2

### Patch Changes

- 4efa713: Publish to JSR without the test suite. Every release so far shipped the spec
  files, the test helpers and the editor and build config alongside the source,
  because `deno.json` excluded only `node_modules`, `build` and `docs`. The
  exclude list has been explicit since 3.0.1, but it only takes effect on a
  release, and this package has not had one since.

## 3.0.2-beta.0

### Patch Changes

- 4efa713: Publish to JSR without the test suite. Every release so far shipped the spec
  files, the test helpers and the editor and build config alongside the source,
  because `deno.json` excluded only `node_modules`, `build` and `docs`. The
  exclude list has been explicit since 3.0.1, but it only takes effect on a
  release, and this package has not had one since.
