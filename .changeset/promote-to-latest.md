---
"@icazemier/gibbons-mongodb": patch
"@icazemier/gibbons-postgresql": patch
---

Promote the security and correctness fixes to `latest`. This changeset rides along in the `development → main` promotion merge and is consumed by `main`'s release job, which exits prerelease mode and bumps `3.1.2-beta.4 → 3.1.2` / `3.0.4-beta.4 → 3.0.4` to ship the stable versions to `latest`.

Fixes shipped: conditional `types` subpaths for correct ESM/CJS type resolution, and the widened `verify-published` retry window (~120s) so freshly published versions are not mistaken for missing ones during JSR verification.
