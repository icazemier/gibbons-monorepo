---
'@icazemier/gibbons-mongodb': minor
---

Deprecate `mongoDbMutationConcurrency` and make it optional. It has been a
required field on `Config` since the first commit in 2021 and no code has ever
read it, so it was documentation for behaviour that does not exist. Configs can
now drop it; it is removed in the next major.
