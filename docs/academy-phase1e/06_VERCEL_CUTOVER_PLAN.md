# Vercel cutover plan — NOT EXECUTED

Phase 1E-A is NO PUSH / NO REMOTE CREATION / NO VERCEL CHANGES / NO DEPLOYMENT.
Every mutation below requires separate explicit owner authorization. This document
is not an executable workflow, permission grant or cloud resource configuration.

| Product           | Existing Git / project / domain                                                                    | Evidence                                                                                                                           |
| ----------------- | -------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| Masterclass       | cryptosharia/cryptosharia-academy / cryptosharia-academy- / masterclass.cryptosharia.id / old main | Owner-supplied inventory; local main verified; live platform not visible                                                           |
| Academy candidate | same existing Git / cryptosharia-academy / cryptosharia-academy.vercel.app / main                  | Owner screenshot description; All Deployments protection reported, no successful production screenshot; not independently verified |
| Future Academy    | cryptosharia/cryptosharia-learning / existing cryptosharia-academy / academy.cryptosharia.id       | Plan only; separate staging Firebase required                                                                                      |

Read-only Vercel connector search returned no projects. This is an access/visibility
limitation, not proof of resource absence or safety to create a duplicate project.

## Owner/operator checklist for a later authorized phase

1. Capture current team/project IDs privately. Distinguish names including the
   trailing hyphen. Verify current deployment triggers: Git pushes/merges, webhooks,
   deploy hooks, CLI/CI workflows, Vercel Agent and repository integration permissions.
2. Audit each project's connected repo, root directory, framework/install/build
   settings, production and active preview branches, current source SHA, queued builds
   and domains/aliases. Preserve screenshots/settings fingerprints privately.
3. Inventory every domain including production aliases and protected unique URLs.
   Verify the reported All Deployments coverage and signed-out denial on each target.
   Do not disable protection or generate bypass tokens for convenience.
4. Prepare an approved no-auto-deploy state for Academy before publication/reconnect.
   Document how automatic deployments and queued jobs will be prevented, then verify
   it. Do not edit or disconnect Masterclass. Repository creation/publication and
   provider connection are separate gates because pushes can trigger deployments.
5. When authorized, disconnect/reconnect **only the existing Academy project** from
   the old repo to the new PRIVATE repo. Verify exact team/project ID before mutation.
   Never rename the old repo or use project creation/import as an unreviewed shortcut.
   Keep the old Masterclass repo/project/main/domain/env/Firebase unchanged.
6. Verify afterward that new-repo branch activity can target Academy only, while old
   main still targets Masterclass. Use integration/settings evidence first. Any test
   push/build requires separately approved triggers and deployment authorization;
   read-only inspection cannot demonstrate actual trigger behavior by itself.
7. Provision owner-approved separate staging Auth/Firestore/IAM and isolated synthetic
   roles/data. Review actual queries/indexes, allowlist/denylist, server/browser compiled
   identities, issuer/audience, no inherited secrets, storage/payment/notification OFF.
   Current emulator build is NOT DEPLOYABLE; staged-runtime support needs reviewed code
   and new security regressions, not just changing env or enabled flag.
8. Approve exact release tuple: new repo SHA, lock/build digest, staging environment,
   Rules/index/schema/content versions, role/access roster, protection and recovery.
   Reverify deployment's Git provider/repo/ref/source SHA after authorized build; build
   logs/URL alone do not bind identity. Compare effective server/client backend targets.
9. Run hosted signed-out protection, real synthetic login/six-role direct SDK tests,
   account-switch/revoke/expiry/offline/progress/resume, actual approved YouTube QA,
   public/private exposure, monitoring and isolated recovery. Record BLOCKED honestly.
10. Only after hosted/security/content/release approvals, prepare a separate DNS/domain
    cutover authorization for academy.cryptosharia.id, with existing-record inventory,
    change set, TTL/ownership, signed-out protection, rollback and verifier. No DNS
    record, domain attachment or production branch change is made in Phase 1E-A.

Official [Git deployment behavior](https://vercel.com/docs/git) documents automatic
push/merge deployments. [Git connect/disconnect](https://vercel.com/docs/cli/git)
applies to the linked project. [Deployment Protection](https://vercel.com/docs/deployment-protection)
must be verified for the intended deployment/domain scope. These references guide
the plan; they do not verify the user's live project configuration.
