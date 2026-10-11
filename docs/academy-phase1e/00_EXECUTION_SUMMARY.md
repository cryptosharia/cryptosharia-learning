# Phase 1E-A — local extraction handover

11 October 2026, Asia/Jakarta. **LOCAL HANDOVER GO ONLY**.
NO PUSH — NO REMOTE REPOSITORY CREATION — NO VERCEL CHANGES — NO DEPLOYMENT.

## Identity and provenance

Workspace: `C:/Users/Naska Jaladewa/Documents/naufal/cs/cryptosharia-learning`.
Technical name CryptoSharia Learning; public brand CryptoSharia Academy.
Future repo cryptosharia/cryptosharia-learning, future domain academy.cryptosharia.id,
future existing Vercel target cryptosharia-academy (no trailing hyphen).
These are plans only, not created/connected/changed resources.

Exact source `5457e6b80b5560bb96b48a76f1f1e26d32807488` was present on the requested
Phase 1D-A branch and clean before work. Its immediate parent is
`6d663a46d52e696ebde72c496a198cd354b2e206`; the request's stated parent
`12bbd8f7a288b880ef32ab90685ae5acc90ad2dc` is actually the grandparent. Both Phase
1D-A commits are preserved as provenance references; no substitute checkout was used.
All 139 original build-input hashes matched the private Phase 1D-A manifest.

Fresh independent Git history contains selected source and new safe documentation,
with a synthetic local-review author, no remote/upstream/alternates/old Git objects.
The initial commit's exact SHA is supplied in the final owner handover outside Git;
`git rev-list --max-parents=0 HEAD` reproduces it. A commit cannot embed its own hash.

## Extraction decisions and counts

| Inventory                                            | Count |
| ---------------------------------------------------- | ----: |
| Tracked source files examined                        |   233 |
| Source/config/test files retained (including shared) |    68 |
| Retained byte-identically                            |    50 |
| Retained/adapted                                     |    18 |
| Masterclass-only files excluded                      |   119 |
| Historical audit/report/debug files excluded         |    39 |
| Unused shared/legacy/editor files excluded           |     7 |

The Academy runtime, Rules, CMS, curriculum, player and progress implementation are
reused. Root marketing/nav/footer are replaced with Academy-only catalog/navigation;
global CSS retains brand tokens while dropping Lenis and external fonts. Auth/theme
listener initialization is owned once by root with cleanup. Standalone Firebase
rejects live before SDK initialization; hooks also contain Auth while OFF/offline.
Metadata becomes neutral; common logo/favicon remain, promotional media does not.

Four unused direct dependencies removed: @vercel/blob, gsap, lenis, adapter-auto.
28 lockfile package entries removed, **zero retained package-version changes**.
No framework/backend migration or new package dependency is introduced.
Exact decisions/hashes, final graph, new-file inventory and test mapping accompany
the nine numbered reports. README and safe .env.example support a new contributor
without the Masterclass checkout. Source MIT copyright/terms are preserved.

## Masterclass protection evidence

Old Masterclass main remains `32424e5fc8b584172841f0cfc3afbc72294a9b83`.
All 189 tracked file SHA-256 values, branch, HEAD, remotes and empty working-tree
state match the captured before baseline. Phase 1A/1B/1C/1D worktrees also match
their entire tracked hashes/HEAD/branch/remotes and remain clean. No old tracked
file was written/moved/deleted; no old main/config/history operation occurred.
Private before/after evidence remains outside the new repository.

No Masterclass Vercel/env/domain/Firebase/customer/payment/data mutation was called.
This is evidence of scoped local protection, not a full live Masterclass business
or visual production regression test.

## Verification outcome

| Check                                           | Result                                                                                        |
| ----------------------------------------------- | --------------------------------------------------------------------------------------------- |
| Windows fresh npm ci                            | PASS; 297 added / 298 audited                                                                 |
| Windows type check                              | PASS; 0 errors, 1 inherited reset-link warning                                                |
| Windows final formatting + ESLint               | PASS, rules not weakened                                                                      |
| Unit                                            | 56 PASS (54 baseline + 2 standalone guard tests), 0 failures/skips                            |
| Candidate Rules                                 | 90 PASS, baseline assertions/source byte-identical                                            |
| Actual browser                                  | 33 PASS in Chrome/Edge, all baseline assertions retained                                      |
| HTTP                                            | 22 baseline + 8 new = 30 PASS, no-store on contained 503s                                     |
| Synthetic recovery                              | 1 PASS, 81 Firestore documents restored into a second demo target                             |
| Offline launcher                                | Expected exit 1 before fixture setup; fail-closed PASS                                        |
| Clean local checkout                            | Fresh independent candidate clone, 72 hashed runtime/config/test inputs match final source    |
| Linux clean install/check/lint/unit             | PASS; Node24/npm11, 56 unit, type 0 errors/1 warning                                          |
| Linux production packaging                      | PASS with TEST CONFIG ONLY; adapter-vercel, network disconnected                              |
| Compiled server/client identity                 | PASS; fixed demo project, localhost, separate loopback endpoints                              |
| Runtime separation/import/symlink/remote checks | PASS; 49 resolved local runtime imports, no Masterclass runtime dependency or project linkage |
| Secret scans                                    | PASS for tracked source, staged diff, candidate tree/initial commit; zero pattern findings    |
| Dependency audit                                | Exit 1 / residual advisory remains: 3 low, 0 moderate/high/critical                           |

Provider playback is NOT VERIFIED: actual app/Auth/Firestore/Rules operate in the
browser suite, while YouTube API/frame traffic is intercepted with synthetic events.
All 54/90/33/22 baseline tests retain their security strength. No test is removed.
HTTP helper is ported to Node; browser adaptation concerns evidence path only.

The clean checkout is cloned from a fresh private validation snapshot, not from
the old repository. Only this checkout is mounted into Linux. Its source archive
is also installed/built in the container filesystem to avoid slow Windows bind I/O;
all 72 input hashes remain equal to final runtime/config/test source. Reports later
added to the final initial commit do not change those tested inputs. Docker's network
map is {} during tests/build; no Masterclass checkout or hosted credentials exist
inside it. Artifact identities and raw logs/screenshots remain outside Git.

## Residual limits and external gates

Three low entries propagate the [cookie advisory](https://github.com/advisories/GHSA-pxg6-pf52-xh8x)
through SvelteKit/adapter-vercel. adapter-auto removal removes its extra entry only;
there is no advisory remediation or production risk acceptance. No forced major
upgrade performed. One inherited reset-password placeholder and a >500 kB Firebase
client chunk warning remain; neither is suppressed. Install lifecycle-policy
warnings are recorded, not hidden or converted into a failed/approved script policy.

Firebase candidate Rules are LOCAL VERIFIED ONLY; no hosted staging is available.
Real IAM/claims/indexes/provider/content/rights/captions/mobile/role-duty separation
and hosted recovery/protection remain unverified. Payments/notifications stay OFF.
Connected GitHub search found no target match and Vercel search returned no projects;
those visibility limitations do not establish resource absence. Owner must verify
target collision and exact Academy project/trigger/domain map before future changes.

| Next release                        | Decision                                    |
| ----------------------------------- | ------------------------------------------- |
| Phase 1E-A local handover           | GO with the documented residuals            |
| Phase 1E-B GitHub publication       | PENDING OWNER APPROVAL; PRIVATE recommended |
| Phase 1E-C Vercel reconnection      | PENDING OWNER APPROVAL; plan only           |
| Protected hosted preview            | NO-GO                                       |
| Real participant pilot / production | NO-GO                                       |

Owned app/emulator/container services are stopped after verification. Generated
dependencies/build output, logs and raw security evidence are excluded from Git;
the handed-over target source workspace contains no copied dependency/build directory.
No push, remote creation, Vercel mutation, DNS change or deployment occurred.
