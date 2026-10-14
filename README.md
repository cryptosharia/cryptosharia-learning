# CryptoSharia Learning

Public brand: **CryptoSharia Academy**. Technical repository: `cryptosharia-learning`.
Academy is modular, self-paced learning in Analisis Fundamental, Analisis Teknikal,
Fikih Muamalah, and Web3 & Blockchain. The six levels and seven chapters per level
are curriculum planning slots; they are not an inventory of approved videos.

Masterclass is a separate four-meeting bootcamp. Its existing repository
`cryptosharia/cryptosharia-academy`, Vercel project `cryptosharia-academy-`, and
`masterclass.cryptosharia.id` remain independent and unchanged.
Future Academy domain: `academy.cryptosharia.id`; future existing Vercel target:
`cryptosharia-academy` (no trailing hyphen). No cloud connection is configured here.

## Stack and prerequisites

Svelte 5 / SvelteKit 2, TypeScript 6, Vite 8, Tailwind 4, Firebase client Auth and
Firestore (full and Lite SDKs), adapter-vercel. The lockfile fixes actual versions.
Node's built-in test runner handles unit/Rules tests; Playwright drives the browser
suite. There is no Vitest, SQL database, quiz or certificate engine.

- Node **24.21.0** (`.node-version`) and npm compatible with Node 24.
- Java **21** in PATH for Firestore Emulator; Firebase CLI **15.33.0** is pinned in
  the local emulator launcher and obtained through npx on first use.
- Browser suite: separately installed reviewed Playwright module and two local
  Chromium browser binaries (this handover uses Chrome and Edge).
- Linux or Docker for adapter-vercel packaging. Windows may require symlink
  privileges; the tested Linux route avoids changing OS permissions.

No Masterclass checkout, credentials, hosted database, Vercel CLI authentication,
or symlink to another repository is required.

## Local setup

```sh
npm ci
npm run emulators
```

Keep the emulator terminal open; in a second terminal:

```sh
npm run dev:test
```

The app listens at `http://localhost:5173`. The safe launcher sets synthetic
`demo-academy-phase1c`, Auth `127.0.0.1:9099`, Firestore `127.0.0.1:8080` and an
explicit local Academy flag. CLI state/logs go to a temporary directory outside
Git. Stop if the ports belong to a different session. Do not expose/tunnel them.

`.env.example` contains synthetic values and defaults `PUBLIC_ACADEMY_ENABLED`
to false. Copying it to an ignored `.env` is optional; the test launcher does not
need that copy. Missing configuration creates inert loopback handles. The
standalone runtime rejects live Firebase before SDK creation; a true Academy flag
does not enable hosted operation. Never copy Masterclass's environment or tokens.

## Commands

```sh
npm run check:test
npm run lint
npm test
node scripts/run-local.mjs test:rules
node scripts/run-local.mjs test:browser
npm run test:http -- enabled
npm run build:test
npm run verify:build
node scripts/verify-separation.mjs
npm audit --json
```

Rules and browser suites reseed the same synthetic demo project: run them
**sequentially**, with the emulators ready and the local server running for
browser/HTTP tests. They never provision real users. The baseline Rules suite
uses `firebase/academy-v1.rules`; the older `tests/rules.emulator.ts` and synthetic
Rules file are retained auxiliary Phase 1A regressions, not part of the 90-test count.

Set `ACADEMY_PLAYWRIGHT_MODULE` to an absolute Playwright `index.mjs` module path,
`ACADEMY_CHROME_EXECUTABLE` to Chrome and
`ACADEMY_SECOND_BROWSER_EXECUTABLE` to Edge (or an approved second binary).
`ACADEMY_BROWSER_EVIDENCE_DIR` must be outside the repository; omission uses a
temporary directory. Screenshots, profiles, traces, auth state and logs stay private.
Provider media is intercepted; this suite tests actual app/SDK/Rules flows and
synthetic player events, not real YouTube playback.

For synthetic recovery, set `ACADEMY_RECOVERY_EVIDENCE_DIR` to an existing outside
directory and run `npm run test:recovery`. It restores Firestore into a second
demo target; it does not restore Auth, IAM, hosted indexes or assets.

HTTP script modes are `enabled`, `default-off`, and `offline`. For default-OFF,
run a second loopback dev server with synthetic env and flag false on port 5174;
set `ACADEMY_HTTP_ORIGIN=http://127.0.0.1:5174`. For offline, stop your emulators
while the enabled server stays up. All contained 503 responses require no-store.

Linux production packaging uses `npm run build:test` with **TEST CONFIG ONLY**.
Disconnect a prepared Docker container's network after `npm ci` and run the build
and compiled identity verifier. Never upload the emulator artifact to Vercel.
`.vercel/output` is generated build output, ignored and never a project linkage.
Dependency audit currently has residual low findings; audit exit 1 is not PASS.

## Routes and data boundaries

`/` and `/e-learning` are Academy catalog entries. `/e-learning/[id]` takes a
scope ID, with `?lesson=` selecting a stable lesson ID. `/profile` is the participant
dashboard and bounded own profile. `/admin/courses` is the editorial CMS.
`/auth/login` and `/auth/register` use Firebase Auth. `/subscription` and `/units`
retain neutral catalog compatibility aliases; subscription detail aliases use the
same player. `/units/[id]` remains unavailable. Transactions, orders, vouchers and
the retired mock-course URL stay contained with 503. Bootcamp/landing admin/Blob
upload routes are absent. Payments and notifications have no active integration.

Published metadata lives in `academy_catalog`; private video IDs and opaque refs
live in `academy_lessons`. Draft/review/approval lives in `academy_editorial`.
`academy_positions` atomically reserves sibling order; `academy_audit` is append-only.
`academy_grants/{uid}/scopes/{scope}` owns explicit bounded access.
`academy_progress/{uid}/lessons/{lesson}` owns versioned resume position.
`academy_completion/{uid}/lessons/{lesson}` owns explicit completion for the latest
completed published version, with a server completion timestamp. Completion uses
a transaction and never modifies the separate resume document. Repeating the
same version preserves its timestamp; a newly published version requires another
explicit **Tandai Selesai** action. Video playback/end events never complete lessons.
`users/{uid}` permits own allowlisted profile fields, never roles or grants.
Default-deny candidate Rules enforce direct SDK access, not hidden UI controls.
Private listing is always denied; public queries constrain published status.

Verified role claims are `academyAdmin`, `academyReviewer`, `academyPublisher`,
and `academySyariah`, with verified email. Editor presently shares the Admin
capability, including grants; hosted separation of duties remains an owner gate.
Reviewer approval binds the exact version/rights; publisher can publish only that
approved version. Editing increments version and invalidates approval. A revised
parent retains its last approved public snapshot; its structural identity is fixed.
Privileged claims are never assignable from participant profiles or client UI.

The player clears media and cancels pending work on UID/lesson/scope changes,
logout, expiry, revoke and offline. Fresh Lite reads establish private access;
listeners/timers invalidate stale state. Progress saves bounded observed position
with version/server time and resumes after reload or a second browser. It is
self-reported history, not completion, graduation or an entitlement. No offline
write queue or persistent private-media cache is used. YouTube IDs are not DRM.

Dashboard completion is derived from distinct published lessons in scopes with
currently active grants (also shown per scope), never from planned curriculum
slots. Expired/revoked/future grants and unpublished lessons leave the denominator;
zero eligible lessons displays 0 of 0, 0%. Historical records remain readable by
their owner, but catalog completion badges require current access. Completion does
not grant access or certify learning. The UI clears participant state on account
changes and unavailable data; Rules enforce identity, grants, published versions
and server timestamps independently of browser checks.

## Release prerequisites and limitations

Candidate Rules are **LOCAL VERIFIED ONLY**. Hosted staging must first have an
owner-approved separate Firebase project/Auth/Firestore, reviewed staging-only
runtime contract (the current app cannot run live), indexes, trusted role policy,
synthetic roster, protection, recovery and content/media approvals. The baseline
contains no hosted index export or index file; final queries need staging review.

No GitHub remote is connected. PRIVATE is recommended for future publication;
publication, Vercel reconnection, deployment and DNS require separate explicit
authorization. The migration and rollback plans are documentation only. Existing
Vercel settings from the owner are not independently verified by this handover.

Known limits: no real provider playback/Google OAuth certification, captions/mobile
provider QA, attachment renderer/storage authorization, parent cascade/archive,
strict Editor/Admin separation, two-person syariah workflow, real role provisioning,
hosted recovery or production assurance. The inherited password-reset link is a
placeholder; no reset email is sent. Three low cookie-related dependency entries
remain; no forced major migration was performed. See the Phase 1E reports for
current evidence and owner gates.

## Provenance and license

Extracted from exact `5457e6b80b5560bb96b48a76f1f1e26d32807488` on
`chore/academy-phase1d-hosted-readiness`. Immediate parent is
`6d663a46d52e696ebde72c496a198cd354b2e206`; Phase 1C
`12bbd8f7a288b880ef32ab90685ae5acc90ad2dc` is its grandparent.
Fresh Git history carries selected files, not the source repository's history,
reports, credentials or debug logs. Exact per-file decisions/hashes are in
`docs/academy-phase1e/extraction-manifest.json`; security logs remain outside Git.
Source MIT copyright/terms are preserved in LICENSE. Only the existing common
CryptoSharia logo/favicon are retained; no promotional media is reused. Confirm
branding/trademark permissions separately before future publication.
