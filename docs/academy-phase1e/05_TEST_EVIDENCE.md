# Test evidence and preservation mapping

Date: 11 October 2026, Asia/Jakarta. Local synthetic tests only. Raw logs, screenshots,
fixture snapshots and compiled artifact remain in a private outside-Git directory.
Source/hash/role/provider limits are explicit; nothing here certifies hosted production.

## Commands and final counts

| Command                                             |       Exit | Evidence                                                                                      |
| --------------------------------------------------- | ---------: | --------------------------------------------------------------------------------------------- |
| npm ci (Windows)                                    |          0 | Fresh 297 added / 298 audited; no copied node_modules                                         |
| npm run check:test                                  |          0 | 0 errors, 1 inherited auth reset-link warning                                                 |
| npm run lint                                        |          0 | Prettier and ESLint source + final reports                                                    |
| npm test                                            |          0 | 56 PASS, 0 FAIL/cancelled/skipped                                                             |
| node scripts/run-local.mjs test:rules               |          0 | 90 PASS, 0 FAIL/cancelled/skipped                                                             |
| node scripts/run-local.mjs test:browser             |          0 | 33 PASS, 0 FAIL; Chrome155.0.8059.39 + Edge155.0.4283.45                                      |
| node tests/academy.http.mjs enabled                 |          0 | 11 baseline + 4 new                                                                           |
| node tests/academy.http.mjs default-off (port5174)  |          0 | 6 baseline + 2 new                                                                            |
| node tests/academy.http.mjs offline                 |          0 | 5 baseline + 2 new                                                                            |
| npm run test:recovery with outside evidence dir     |          0 | 1 PASS, 81 documents, restore into second demo project                                        |
| Rules launcher with emulators stopped               | 1 expected | Connection refused before setup/clear; not an asserted permission denial                      |
| Linux npm ci from clean checkout                    |          0 | Fresh install; Node24.21.0/npm11.19.0                                                         |
| Linux npm run check:test / npm run lint / npm test  |     0 each | 0 type errors, 1 warning; formatting/ESLint; 56 unit PASS                                     |
| Linux npm run build:test                            |          0 | Production adapter packaging with TEST CONFIG ONLY; offline                                   |
| node scripts/verify-test-build.mjs on actual output |          0 | Actual compiled server/client identity checks, not only a mocked verifier test                |
| node scripts/verify-separation.mjs                  |          0 | 49 local runtime imports resolve inside target; no Masterclass imports/symlinks/cloud linkage |
| scan-repository.mjs staged/candidate/initial commit |          0 | Zero pattern findings; source/config/docs and staged diff included                            |
| npm audit --json                                    |          1 | 3 low / 0 moderate / 0 high / 0 critical; unresolved, never marked PASS                       |
| hosted QA helper plan + syntax                      |          0 | Default plan mode only; --run not executed                                                    |

Counts: 180 automated passes = 56 unit + 90 Rules nodes + 33 browser scenarios +
1 recovery; 30 HTTP cases separately. Repeated clean-checkout unit runs are not
added to this total. Rules nodes include six parent nodes; they are not SDK operation
counts. Every forbidden SDK operation still asserts permission-denied, while
network/offline preflight tests explicitly require fail-closed behavior.

## Baseline mapping

`test-mapping.json` binds each original test/fixture file and its SHA-256 to the
target. All unit files and the 90-node Rules suite/fixtures remain byte-identical.
All 33 browser scenarios and their assertions remain; module imports/evidence path
adapt only for an independent outside output directory. The prior 22 HTTP
paths/statuses are all retained in the new Node helper, plus 8 separation/Auth cases
and no-store checks. The older Phase1A Rules helper/fixture is preserved as an
auxiliary test, not silently counted in the main suite. No test/assertion is removed.

Two unit additions reject complete live settings at the actual standalone resolver
boundary and confirm missing/emulator settings remain inert/synthetic. The old
generic resolver tests, including live cannot enable Academy, remain unchanged.

## Security acceptance actually observed

Guest/private known ID denial and published-only metadata/network response; no-grant,
expired and revoked denial; active member scope A only; unauthorized direct SDK
writes and role/grant/profile escalation denial; private listing, draft/unapproved,
cross-user progress/profile and stale version/approval/rights/audit denials all pass.
Role-specific reviewer/publisher paths and invalid parent/order/scope traversal
remain covered. A verified admin's valid UI CMS/grant paths succeed through Rules.

Browser data flows use actual UI/Auth/Firestore SDKs and the same source modules.
Actual authorized private/history RPCs are held until an account switch and then
released, proving late responses cannot restore A's media/progress under B.
Logout/two-tab/cross-browser revoke/request-time expiry clear the player; offline
stops content and writes; reconnect validates afresh. PLAYING/pause events persist
nonzero 42/57/75 positions, reload/second browser seek to saved progress, revoke
destroys the adapter and direct progress write denies. URL lesson/previous/next,
dashboard clearing, version-two withdrawal, hierarchy CMS and mobile/focus pass.

All non-loopback requests are aborted except fulfilled synthetic YouTube API/frame
requests. Playwright1.56.1 was installed outside the repository for this run, with
the recorded Chrome/Edge versions. Real playback/audio/captions/provider/mobile
behavior remains NOT VERIFIED; no assertion is replaced by a pure authorization mock.
Mobile catalog and desktop player/dashboard screenshots were inspected privately.

## Clean checkout and artifact provenance

A new independent local validation repository is cloned with --no-local into a
temporary directory, then its local origin is removed. Candidate SHA and the 72
final runtime/config/test input hashes are recorded in provenance.json. Only that
clean clone is mounted into image node:24.21.0-bookworm-slim, digest
sha256:d6aa754f16b3197301076f047b5def2f02ea1dbbc2ca920407d46d7ec7f87b20.
Masterclass is not mounted. A fresh npm ci runs successfully before network detach.

Network map {} is captured before check/unit/build. Bind-mounted Linux check/lint/
unit/build also pass; Windows file I/O is unusually slow. The exact source archive
is extracted into /isolated inside the same disconnected container, freshly installed
from the complete npm cache with --offline, then check/lint/build repeat successfully.
No source change, copied build output, extra backend or secret is introduced.

Compiled server and browser JavaScript are checked for emulator mode, fixed
demo-academy-phase1c, localhost, synthetic key/appId and distinct Auth/Firestore
loopback endpoints. Digests and artifact stay outside Git. The actual candidate
Rules hash is unchanged. All final source inputs still match these tested copies.

Intermediate observations are not hidden: initial dependency graph encountered a
SvelteKit-generated $types import, correctly classified virtual; an unavailable
component referenced by an alias was included before validation. Linux bind I/O
was slow, so the same source was repeated internally; earlier build/lint had already
exited 0. No failed security assertion was dropped. Shell warning wrappers preserve
actual native exit codes; npm lifecycle warnings, reset-link and large Firebase chunk
warnings are recorded. Windows adapter packaging is not claimed; Linux is the
verified production-packaging path. No release artifact may be deployed.
