---
'@icazemier/gibbons-mongodb': patch
---

Run one operation at a time on a shared session. `subscribePermissionsToGroups`
validated permissions and groups concurrently on the caller's `ClientSession`,
so both stamped `startTransaction` on the same transaction number and the server
rejected one of them.
