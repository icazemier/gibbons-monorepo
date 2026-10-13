---
"@icazemier/gibbons-mongodb": patch
"@icazemier/gibbons-postgresql": patch
---

Promote the security and correctness fixes to `latest`. Since `development` publishes the `-beta.N` channel, this changeset is consumed by the `development → main` promotion merge: `main` exits prerelease mode, bumps `3.1.2-beta.3 → 3.1.2` / `3.0.4-beta.3 → 3.0.4`, and ships the stable versions to `latest`.

Shipped fixes:
- Conditional `types` subpaths in the `exports` map for correct ESM/CJS type resolution (with documented dynamic-import TypeScript limitation).
- Widened `verify-published` retry window (~120s) so freshly published versions are not mistaken for missing ones during JSR verification — npm CDN propagation for `gibbons-mongodb` measured at over a minute.
