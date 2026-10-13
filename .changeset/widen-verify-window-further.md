---
"@icazemier/gibbons-mongodb": patch
"@icazemier/gibbons-postgresql": patch
---

Widen the `verify-published` retry window again. The 3.1.2-beta.2 release measured npm's worst-case CDN propagation at over a minute: the first package checked (gibbons-mongodb) was still not served on npm after ~57s of retries, which failed the release even though the version published fine moments later. The retry budget is now ~120s (24 attempts × 5s), so a slow-but-healthy npm publish is not mistaken for a missing one.
