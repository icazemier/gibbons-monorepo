# @icazemier/gibbons-postgresql

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
