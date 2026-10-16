# Package 4A local content preparation

`scripts/academy-content-preview.mjs` validates a CSV or JSON lesson manifest and prints a local dry-run preview. It reads only the two named files. It does not load environment variables, call an API, connect to a database, download a video, write files, create content, or publish anything.

Run it from the frontend repository:

```powershell
node scripts/academy-content-preview.mjs .\docs\academy-content-manifest-template.csv --curriculum-reference .\academy-curriculum-local.json
node scripts/academy-content-preview.mjs .\academy-manifest.json --curriculum-reference .\academy-curriculum-local.json --json
```

The reference is a locally saved JSON response from the Package 2 `GET /academy/curriculum` contract: either an array of curriculum items or an object with an `items` array. Obtain it only from the approved local API/test environment. It must contain the existing subject, level, and chapter IDs; the preview checks the parent chain, scope, candidate lesson ID, and order collisions against those records. Without a reference, structural checks still run, but the command exits `2` and marks the preview as needing reconciliation. Do not use a production endpoint or production data.

CSV uses the columns in `academy-content-manifest-template.csv`. JSON accepts the same snake_case names or the API-style camelCase aliases, as an array or `{ "lessons": [...] }`. Subject IDs and planned slots follow the existing Academy contract: `fundamental`, `technical`, `muamalah`, or `web3`; levels 1–6; chapters 1–7; lesson order 0 or greater. The referenced chapter must exist and its ID must match `parent_id`. Existing lesson IDs and sibling order collisions are errors. A reference snapshot only includes currently published curriculum, so creating new subjects, levels, or chapters remains outside this local validator.

The YouTube field accepts an 11-character ID or a recognized HTTPS YouTube watch, short, or embed URL. Validation is syntactic only; it never requests YouTube. `visibility` must be `private` and `publication_status` must be `draft`. `version`, `scope`, and draft/review metadata are included in the preview. The API currently has no approved content-write/import contract for visibility, rights evidence, or syariah review, so these workflow fields remain preview metadata. Their values are not verified approvals. The preview always sets the API-shaped candidate status to `draft`, marks workflow claims unverified, and reports no database writes, video fetches, or publication.

Review, owner approval, rights confirmation, and syariah review remain required before any future publishing path. This tool cannot mark content official. Its test fixture uses synthetic IDs and a synthetic curriculum tree; it is test data only. No real video or course material is included.

Run local validator tests without a database:

```powershell
node --test tests/academy-content-preview.test.mjs
```
