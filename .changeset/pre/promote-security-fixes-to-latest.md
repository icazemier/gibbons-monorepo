---
"@icazemier/gibbons-mongodb": patch
"@icazemier/gibbons-postgresql": patch
---

Promote the security and correctness fixes to `latest`. Consumed by `main`'s release job on the `development → main` promotion merge, which exits prerelease mode and bumps `3.1.2-beta.4 → 3.1.2` / `3.0.4-beta.4 → 3.0.4` to ship the stable versions to `latest`.

Fixes shipped:
- Conditional `types` subpaths in the `exports` map for correct ESM/CJS type resolution (with the documented dynamic-import TypeScript limitation).
- Widened `verify-published` retry window (~120s) so freshly published versions are not mistaken for missing ones during JSR verification — npm CDN propagation for `gibbons-mongodb` measured at over a minute.
