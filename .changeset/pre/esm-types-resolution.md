---
"@icazemier/gibbons-mongodb": patch
"@icazemier/gibbons-postgresql": patch
---

Improve ESM type resolution by adding conditional `types` subpaths to the `exports` map, so TypeScript resolves the correct declaration file for both `import` and `require` entry points. Also document the dynamic-import TypeScript limitation in the READMEs.
