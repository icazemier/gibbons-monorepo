---
'@icazemier/gibbons-postgresql': patch
---

Publish to JSR without the test suite. Every release so far shipped the spec
files, the test helpers and the editor and build config alongside the source,
because `deno.json` excluded only `node_modules`, `build` and `docs`. The
exclude list has been explicit since 3.0.1, but it only takes effect on a
release, and this package has not had one since.
