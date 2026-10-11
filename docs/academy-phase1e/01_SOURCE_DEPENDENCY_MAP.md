# Source dependency map

Reviewed source SHA: `5457e6b80b5560bb96b48a76f1f1e26d32807488`. Both source and
Masterclass worktrees were clean before extraction. Its 139 Phase 1D-A build-input
hashes match the private original manifest. Phase 0 through 1D-A reports, source
manifest, development instructions, routes and import/runtime paths were reviewed.
No fallback to main or Phase 1C was used.

## Actual entry and transitive graph

| Entry/boundary                                | Direct/transitive dependencies                                                                                       | Decision                                                                                                |
| --------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| Catalog `/e-learning`, neutral aliases        | AcademyCatalog → academyData/readCurriculum → Firebase full SDK; academyCurriculum                                   | Required, unchanged                                                                                     |
| Player `/e-learning/[id]`, subscription alias | AcademyPlayer → academyPlayer + academyData + academyProgress + youtube + AcademyVideo → full/Lite Firestore + Auth  | Required, unchanged security lifecycle                                                                  |
| Dashboard/profile                             | AcademyDashboard → academyProgress/freshProgress + academyData/roles/grants + academyCurriculum + Auth/full/Lite SDK | Required, unchanged                                                                                     |
| CMS `/admin/courses`                          | academyData transactions/audit/positions + academyCurriculum + youtube + Firebase/Auth                               | Required, no Blob/upload import                                                                         |
| Auth pages                                    | auth.svelte → Firebase Auth + users own profile; Firebase factory/resolver; common logo                              | Shared, preserve auth and replace duplicate layout initialization                                       |
| Root shell                                    | old Navbar/Footer → marketing + landingContent/admin email/Blob etc.; global app.css → Lenis + hosted fonts          | Shared, replace root/nav/footer with Academy shell; keep brand tokens/theme; remove Lenis/font requests |
| Firebase/init                                 | firebase.ts → firebaseConfig + firebaseClient → Auth/full/Lite SDK, explicit synthetic loopback                      | Shared, strengthen standalone live rejection before SDK creation                                        |
| HTTP containment                              | hooks.server → academyAccess + firebaseConfig → health checks                                                        | Required, preserve transaction deny; extend Auth containment                                            |
| Curriculum/publishing                         | subject → level → chapter → lesson; stable parent/scope IDs, versions; academy_positions                             | Required; no speculative full curriculum import                                                         |
| Storage/attachments                           | private opaque reading/slide/subtitle/attachment refs; no renderer/provider upload                                   | Keep model; exclude unused legacy Blob endpoint/helper/server email authorization                       |
| Rules/indexes                                 | academy-v1.rules; emulator config; actual queries in academyData/academyProgress                                     | Candidate Rules unchanged; hosted indexes absent in baseline, staging gate                              |
| Assets                                        | favicon.png/logo.png only (same SHA-256)                                                                             | Shared, no instructor/testimonial/package/event photos                                                  |
| Build                                         | svelte.config adapter-vercel, Vite/Tailwind/SvelteKit, TS config, lock                                               | Required; adapter-auto unused, removed                                                                  |
| Unit/Rules/browser                            | tests → actual app modules/factory/Rules/fixtures; Playwright supplied externally                                    | Preserve every baseline assertion; change screenshot destination only                                   |
| Recovery/build identity                       | recovery → fixtures + app progress + Rules; verify-test-build → compiled server/client env                           | Required; private output remains outside Git                                                            |
| Hosted QA helper                              | plan-only by default, separately authorized operator-assisted run                                                    | Retained; run mode not executed                                                                         |

`academy-dependency-graph.json` records the Academy import edges and external SDK
modules. The full pre-extraction graph and prior report hashes stay outside Git.
Runtime paths and static references were considered alongside imports. The units
unavailable component is retained because its alias uses it. The unused legacy
flat-course adapter is excluded after confirming no runtime/test caller.

## Selection categories

- ACADEMY REQUIRED: reachable routes/components/services, tests, Rules, config,
  tooling, license and new developer documentation. Historical reports are review
  input only and excluded from fresh history.
- SHARED DEPENDENCY: Firebase/Auth/theme/URL parser, app shell/CSS/config and common
  branding. Copy required implementations; simplify only the shell/global side
  effects; exclude unused editor metadata and legacy helpers.
- MASTERCLASS ONLY: bootcamp/root sales content, landing CMS/marketing components,
  pricing/checkout/order/voucher implementation and unrelated media/business notes.
  Excluded from the new codebase, never deleted from the source.

No source file was removed or moved. The exact source-to-target manifest records
each retained/adapted/excluded path and its reason, original Git blob and SHA-256.
