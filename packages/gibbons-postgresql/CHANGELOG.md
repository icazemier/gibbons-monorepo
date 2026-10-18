# @icazemier/gibbons-postgresql

## 4.0.0

### Major Changes

- 051930e: Bump the runtime `yargs` dependency from `^17.7.2` to `^18.2.0`. This is a major-version upgrade of the CLI-parsing dependency; consumers that rely on the previous `yargs@17` option/validation surface should review the `yargs@18` breaking changes.

### Patch Changes

- 3fcdd87: Improve ESM type resolution by adding conditional `types` subpaths to the `exports` map, so TypeScript resolves the correct declaration file for both `import` and `require` entry points. Also document the dynamic-import TypeScript limitation in the READMEs.
- 42b7094: Promote the security and correctness fixes to `latest`. Consumed by `main`'s release job on the `development → main` promotion merge, which exits prerelease mode and bumps `3.1.2-beta.4 → 3.1.2` / `3.0.4-beta.4 → 3.0.4` to ship the stable versions to `latest`.

  Fixes shipped:
  - Conditional `types` subpaths in the `exports` map for correct ESM/CJS type resolution (with the documented dynamic-import TypeScript limitation).
  - Widened `verify-published` retry window (~120s) so freshly published versions are not mistaken for missing ones during JSR verification — npm CDN propagation for `gibbons-mongodb` measured at over a minute.

- 473314d: Promote the security and correctness fixes to `latest`: conditional `types` subpaths for ESM/CJS type resolution, and the widened `verify-published` retry window so freshly published versions are not mistaken for missing ones during JSR verification.
- e3475ca: Widen the retry window in `verify-published` so a freshly published version that npm's registry has not propagated yet is not mistaken for a missing one. The previous window (~20s) was shorter than npm's worst-case CDN propagation lag (~60s), which caused a flaky `Publish to JSR` failure when the slowest package in a sequential publish had not settled by the time both registries were verified.
- 065acfb: Widen the `verify-published` retry window again. The 3.1.2-beta.2 release measured npm's worst-case CDN propagation at over a minute: the first package checked (gibbons-mongodb) was still not served on npm after ~57s of retries, which failed the release even though the version published fine moments later. The retry budget is now ~120s (24 attempts × 5s), so a slow-but-healthy npm publish is not mistaken for a missing one.

## 4.0.0-beta.5

### Major Changes

- 051930e: Bump the runtime `yargs` dependency from `^17.7.2` to `^18.2.0`. This is a major-version upgrade of the CLI-parsing dependency; consumers that rely on the previous `yargs@17` option/validation surface should review the `yargs@18` breaking changes.

### Patch Changes

- Improve ESM type resolution by adding conditional `types` subpaths to the `exports` map, so TypeScript resolves the correct declaration file for both `import` and `require` entry points. Also document the dynamic-import TypeScript limitation in the READMEs.
- Promote the security and correctness fixes to `latest`. Consumed by `main`'s release job on the `development → main` promotion merge, which exits prerelease mode and bumps `3.1.2-beta.4 → 3.1.2` / `3.0.4-beta.4 → 3.0.4` to ship the stable versions to `latest`.

  Fixes shipped:
  - Conditional `types` subpaths in the `exports` map for correct ESM/CJS type resolution (with the documented dynamic-import TypeScript limitation).
  - Widened `verify-published` retry window (~120s) so freshly published versions are not mistaken for missing ones during JSR verification — npm CDN propagation for `gibbons-mongodb` measured at over a minute.

- Promote the security and correctness fixes to `latest`: conditional `types` subpaths for ESM/CJS type resolution, and the widened `verify-published` retry window so freshly published versions are not mistaken for missing ones during JSR verification.
- Widen the retry window in `verify-published` so a freshly published version that npm's registry has not propagated yet is not mistaken for a missing one. The previous window (~20s) was shorter than npm's worst-case CDN propagation lag (~60s), which caused a flaky `Publish to JSR` failure when the slowest package in a sequential publish had not settled by the time both registries were verified.
- Widen the `verify-published` retry window again. The 3.1.2-beta.2 release measured npm's worst-case CDN propagation at over a minute: the first package checked (gibbons-mongodb) was still not served on npm after ~57s of retries, which failed the release even though the version published fine moments later. The retry budget is now ~120s (24 attempts × 5s), so a slow-but-healthy npm publish is not mistaken for a missing one.

## 3.0.4-beta.4

### Patch Changes

- 42b7094: Promote the security and correctness fixes to `latest`. Since `development` publishes the `-beta.N` channel, this changeset is consumed by the `development → main` promotion merge: `main` exits prerelease mode, bumps `3.1.2-beta.3 → 3.1.2` / `3.0.4-beta.3 → 3.0.4`, and ships the stable versions to `latest`.

  Shipped fixes:
  - Conditional `types` subpaths in the `exports` map for correct ESM/CJS type resolution (with documented dynamic-import TypeScript limitation).
  - Widened `verify-published` retry window (~120s) so freshly published versions are not mistaken for missing ones during JSR verification — npm CDN propagation for `gibbons-mongodb` measured at over a minute.

## 3.0.4-beta.3

### Patch Changes

- 065acfb: Widen the `verify-published` retry window again. The 3.1.2-beta.2 release measured npm's worst-case CDN propagation at over a minute: the first package checked (gibbons-mongodb) was still not served on npm after ~57s of retries, which failed the release even though the version published fine moments later. The retry budget is now ~120s (24 attempts × 5s), so a slow-but-healthy npm publish is not mistaken for a missing one.

## 3.0.4-beta.2

### Patch Changes

- 473314d: Promote the security and correctness fixes to `latest`: conditional `types` subpaths for ESM/CJS type resolution, and the widened `verify-published` retry window so freshly published versions are not mistaken for missing ones during JSR verification.

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
