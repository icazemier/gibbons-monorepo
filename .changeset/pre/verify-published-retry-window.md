---
"@icazemier/gibbons-mongodb": patch
"@icazemier/gibbons-postgresql": patch
---

Widen the retry window in `verify-published` so a freshly published version that npm's registry has not propagated yet is not mistaken for a missing one. The previous window (~20s) was shorter than npm's worst-case CDN propagation lag (~60s), which caused a flaky `Publish to JSR` failure when the slowest package in a sequential publish had not settled by the time both registries were verified.
