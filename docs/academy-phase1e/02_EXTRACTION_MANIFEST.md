# Extraction manifest

`extraction-manifest.json` contains one row for every one of the 233 tracked source
files at the exact Phase 1D-A SHA. A target SHA-256 is present for each retained
file. Categories/actions distinguish adapted shared source, unchanged required
source, historical evidence exclusions and Masterclass-only exclusions.
`new-files-manifest.json` enumerates newly authored files. The tracked initial
commit is the complete final file inventory (`git ls-tree -r --name-only HEAD`).

All source was read from the exact commit's Git blobs; .git was never copied.
No remote/tracking branch/project linkage, real env, credential, auth state,
node_modules, build, old logs or prior audit bodies were imported. Runtime/test
imports were resolved before selection. All retained dependency versions remain
unchanged; package name, engines and four unused direct dependencies change.

The 54-unit/90-Rules/33-browser baseline suite remains. HTTP baseline's 22 cases
were moved from an external PowerShell helper to a self-contained Node script,
with every original path/status assertion retained and no-store/separation cases
added. Browser screenshot output now uses an outside path or temp directory. No
negative assertion was weakened or removed. Recovery assertions remain unchanged.

MIT copyright/terms are copied exactly. Common logo/favicon are byte-identical;
promotional assets and unrelated third-party media are excluded. Confirm public
branding rights before publication; this phase uses only local artifacts.
