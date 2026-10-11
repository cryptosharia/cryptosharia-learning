# Independent repository structure

```text
cryptosharia-learning/
  .env.example, .gitignore, .gitattributes, .node-version, .npmrc
  AGENTS.md, LICENSE, README.md
  package.json, package-lock.json, svelte/vite/ts/eslint/prettier config
  firebase.emulator.json
  firebase/academy-v1.rules
  src/app.{css,d.ts,html}, hooks.server.ts
  src/lib/academy{Access,Curriculum,Data,Player,Progress}.ts
  src/lib/firebase{,Client,Config}.ts, auth.svelte.ts, theme.svelte.ts, youtube.ts
  src/lib/components/Academy{Catalog,Dashboard,Player,Unavailable,Video}.svelte
  src/routes/ (root, auth, e-learning, profile, CMS, neutral aliases)
  static/ (common logo/favicon only)
  scripts/ (local launcher, emulators, build identity, separation, secret scan, QA plan)
  tests/ (unit, Rules, browser, HTTP, fixtures, synthetic recovery)
  docs/academy-phase1e/ (reports and nonsecret provenance manifests)
```

The repository uses independent local Git history on main, with no remotes or
upstream and no copied objects/alternates. main here is a new repository's branch;
the old Masterclass main is never changed. .vercel is ignored build output, not
project linkage; project.json is absent. No active GitHub Actions/deploy hooks or
Vercel/DNS mutation is introduced.

No imports or symlinks refer to another repository. README supplies every local
prerequisite and command. The only direct runtime dependency is Firebase; Vercel
adapter is a build dependency. New contributors can use independent demo emulators.
