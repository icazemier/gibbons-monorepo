# @icazemier/gibbons-mongodb

## 3.1.2-beta.2

### Patch Changes

- 473314d: Promote the security and correctness fixes to `latest`: conditional `types` subpaths for ESM/CJS type resolution, and the widened `verify-published` retry window so freshly published versions are not mistaken for missing ones during JSR verification.

## 3.1.2-beta.1

### Patch Changes

- e3475ca: Widen the retry window in `verify-published` so a freshly published version that npm's registry has not propagated yet is not mistaken for a missing one. The previous window (~20s) was shorter than npm's worst-case CDN propagation lag (~60s), which caused a flaky `Publish to JSR` failure when the slowest package in a sequential publish had not settled by the time both registries were verified.

## 3.1.2-beta.0

### Patch Changes

- 3fcdd87: Improve ESM type resolution by adding conditional `types` subpaths to the `exports` map, so TypeScript resolves the correct declaration file for both `import` and `require` entry points. Also document the dynamic-import TypeScript limitation in the READMEs.

## 3.1.1

### Patch Changes

- ad148a0: The "could not load config" error now names the CLI directly instead of prefixing it with `npx`. The package ships a `bin`, so anyone hitting this error already has the executable installed and no longer gets pointed at a command that resolves from the registry.

## 3.1.1-beta.0

### Patch Changes

- ad148a0: The "could not load config" error now names the CLI directly instead of prefixing it with `npx`. The package ships a `bin`, so anyone hitting this error already has the executable installed and no longer gets pointed at a command that resolves from the registry.

## 3.1.0

### Minor Changes

- cfa106d: Deprecate `mongoDbMutationConcurrency` and make it optional. It has been a
  required field on `Config` since the first commit in 2021 and no code has ever
  read it, so it was documentation for behaviour that does not exist. Configs can
  now drop it; it is removed in the next major.
- 4044d5a: Support the MongoDB Node driver 7 alongside 6. The peer range widens to
  `^6.0.0 || ^7.0.0`, so driver-6 consumers are unaffected and driver-7 users can
  now install.

### Patch Changes

- 4044d5a: Run one operation at a time on a shared session. `subscribePermissionsToGroups`
  validated permissions and groups concurrently on the caller's `ClientSession`,
  so both stamped `startTransaction` on the same transaction number and the server
  rejected one of them.

## 3.1.0-beta.2

### Minor Changes

- cfa106d: Deprecate `mongoDbMutationConcurrency` and make it optional. It has been a
  required field on `Config` since the first commit in 2021 and no code has ever
  read it, so it was documentation for behaviour that does not exist. Configs can
  now drop it; it is removed in the next major.
- 4044d5a: Support the MongoDB Node driver 7 alongside 6. The peer range widens to
  `^6.0.0 || ^7.0.0`, so driver-6 consumers are unaffected and driver-7 users can
  now install.

### Patch Changes

- 4044d5a: Run one operation at a time on a shared session. `subscribePermissionsToGroups`
  validated permissions and groups concurrently on the caller's `ClientSession`,
  so both stamped `startTransaction` on the same transaction number and the server
  rejected one of them.
