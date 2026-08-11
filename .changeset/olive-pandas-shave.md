---
'@icazemier/gibbons-mongodb': patch
'@icazemier/gibbons-postgresql': patch
---

The "could not load config" error now names the CLI directly instead of prefixing it with `npx`. The package ships a `bin`, so anyone hitting this error already has the executable installed and no longer gets pointed at a command that resolves from the registry.
