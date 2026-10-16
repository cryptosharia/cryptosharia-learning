# CryptoSharia Academy Package 3 — Final Validation

Tanggal: 15 Oktober 2026 (Asia/Jakarta)  
**Gate: OWNER REVIEW REQUIRED.** Hasil lokal tercatat; belum ada klaim rilis atau playback YouTube nyata.

Tidak ada commit, push, PR, merge, deployment, migrasi production, production API, Redis/PostgreSQL production, real user data, atau OTP sungguhan. Semua akun dan konten integrasi bersifat sintetis.

## Hasil aktual

| Area                                       | Status                                            | Hasil                                                                                                                                                                                                                                                                                                                                                                                                                        |
| ------------------------------------------ | ------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Docker Engine                              | **PASS**                                          | Client/Server 29.1.3, Linux Engine; docker info: 12 containers, 11 running; Compose 2.40.3-desktop.1. Engine awalnya mati dan berhasil dihidupkan melalui Docker Desktop CLI.                                                                                                                                                                                                                                                |
| Isolasi database                           | **PASS**                                          | Port sebelum tes kosong; target container names tidak ada. docker-compose.test.yml sekarang bind hanya ke 127.0.0.1:5433 dan 127.0.0.1:6380. .env.test menunjuk database lokal. Compose hanya mendefinisikan PostgreSQL/Redis test tanpa bind mount; setiap suite menghapus container/network test-nya setelah selesai. Container lain tetap berjalan dan tidak disentuh.                                                    |
| API unit                                   | **PASS**                                          | 127 tes, 20 file.                                                                                                                                                                                                                                                                                                                                                                                                            |
| API + PostgreSQL/Redis E2E                 | **PASS**                                          | 137 tes. OTP memakai TestMailerService in-memory; cakupan mencakup auth/refresh/logout, katalog, entitlement, penyimpanan progress, completion, dan isolasi akun. Migrasi hanya pada database test lokal.                                                                                                                                                                                                                    |
| BFF/API/browser nyata lokal                | **PASS**                                          | 7 pemeriksaan lulus melalui browser, SvelteKit BFF, API Package 2, PostgreSQL dan Redis test: katalog publik, OTP dan /auth/me, cookie, entitlement/media privat, resume posisi 45 detik, explicit completion/dashboard 100%, refresh paralel dalam satu proses, dan logout/revokasi. OTP ditangkap mailer mock; konten/peserta sintetis. Bukti: academy-package3-evidence/real-api/results.json dan dashboard-real-api.png. |
| BFF browser dengan API mock                | **PASS**                                          | 15 skenario, 0 gagal. Termasuk CSRF, rate limit, offline mock, refresh, logout, pergantian akun, completion/resume, dan pemindaian kebocoran. Bukti: academy-package3-evidence/mock-final/results.json.                                                                                                                                                                                                                      |
| Frontend Svelte/TypeScript                 | **PASS**                                          | svelte-check: 0 error, 0 warning setelah perbaikan kontrak.                                                                                                                                                                                                                                                                                                                                                                  |
| Frontend lint                              | **PASS**                                          | Prettier dan ESLint pada build copy terisolasi lulus; harness browser tambahan juga lulus lint tersendiri.                                                                                                                                                                                                                                                                                                                   |
| Frontend unit                              | **PASS**                                          | 77/77.                                                                                                                                                                                                                                                                                                                                                                                                                       |
| Vercel adapter build                       | **PASS di WSL/Linux; FAIL pada Windows native**   | Build produksi lengkap di Ubuntu/WSL, termasuk @sveltejs/adapter-vercel, lulus dengan mode API dan Firebase disabled. Sentinel API key tidak ditemukan di client bundle. Build native Windows sebelumnya gagal di tahap adapter karena EPERM saat membuat symlink. Bundle memberi peringatan satu chunk sekitar 625 kB (ambang 500 kB).                                                                                      |
| API lint                                   | **PASS terhadap baseline; baseline debt tersisa** | ESLint tanpa --fix: commit baseline 61 error/0 warning; working tree 61 error/0 warning. File Academy baru bersih dan issue yang tersisa sudah ada pada baseline. `prettier --list-different .`: baseline 271/current 274; 8 tambahan adalah generated `.svelte-kit/`, tanpa file source Academy baru. Tidak ada auto-fix luas.                                                                                              |
| Rules Firebase emulator                    | **PASS sebelumnya**                               | 96/96 pada regresi emulator lokal sintetis yang sudah ada. Mode API diuji dengan Firebase disabled dan variabel Firebase production dibuang; tidak ada koneksi ke Firebase production.                                                                                                                                                                                                                                       |
| YouTube nyata                              | **NOT RUN**                                       | Tidak ada video uji dengan izin/approval yang diberikan. Seluruh E2E memblokir jaringan eksternal dan memakai IFrame API/frame sintetis; ini bukan bukti playback nyata.                                                                                                                                                                                                                                                     |
| Outage API nyata / refresh lintas-instance | **API outage PASS; lintas-instance NOT RUN**      | Harness menolak koneksi ke port loopback tertutup; 8/8 browser/API checks lulus, data lama tidak muncul, dan akun sintetis kedua tidak menerima completion/grant/progress akun pertama. Deduplikasi refresh hanya dalam satu proses; API tidak merotasi refresh token. Batas serta race refresh/logout lintas-instance belum diuji. Bukti baru berada di `academy-package3-evidence/outage-real-api-validation/`.            |

## Kontrak API dan perbaikan yang terbukti

Pemeriksaan source Package 2 dan integrasi database menemukan satu mismatch: subject API boleh tidak mempunyai scope, sementara level turunannya memiliki scope aktif. Validasi frontend sebelumnya menganggap semua parent/child harus memiliki scope yang sama sehingga katalog API gagal dimuat. curriculumTree kini mempunyai opsi yang hanya diaktifkan pada mode API untuk subject global tanpa scope; validasi scope untuk level, chapter, lesson, dan mode Firebase tetap ketat. Unit test baru dan browser/API nyata memverifikasi kasus ini.

Kontrak aktual yang diuji: /auth/verify menghasilkan pasangan token server-side; BFF memvalidasi lewat /auth/me, lalu hanya memberi profil kepada browser. /auth/refresh API mengembalikan access token saja. Cookie cs_at/cs_rt adalah HttpOnly, SameSite=Lax, Path=/; Secure aktif di production dan non-Secure hanya pada HTTP loopback test. Mutasi BFF menolak Origin yang hilang/tidak cocok. Browser body, storage, dan client bundle tidak memuat token/API key pada pemeriksaan yang dijalankan.

Logout menghapus cookie dan mencabut refresh session. JWT access yang sudah diterbitkan masih dapat berlaku sampai expiry (maksimal 15 menit); logout bukan pencabutan JWT seketika.

## Mode dan konten

Mode Academy tetap opt-in dan default OFF. Build/integrasi API memakai PUBLIC_FIREBASE_MODE=disabled, API URL loopback, dan API key privat di proses server. Mode emulator tetap memakai project demo/loopback dan sebelumnya lulus 96 rules tests. UI Academy yang ada dipertahankan; perubahan runtime UI hanya menangani error kontrak yang dibuktikan di atas.

Template CSV tanpa data video nyata tersedia di docs/academy-content-manifest-template.csv. Template tidak mengimpor atau memublikasikan konten. CMS tetap gated untuk Package 4.

## Working tree

Baseline HEAD frontend: 6bdc04a27b3ff22c122abaa02702b565218bcbc2. API: 374804ef2f96f4c60dbcfe3ced11348d2709ed30. Perubahan existing tetap dipertahankan: frontend sekarang 16 tracked modifications dan 25 untracked entries; API 7 tracked modifications dan 7 untracked entries. Tambahan validasi mencakup pengecualian scope API, unit test terkait, bind loopback Compose, dan dua harness lintas-repo yang lulus. Direktori .svelte-kit/ backend juga tampak untracked setelah percobaan awal runner dengan root yang keliru; dibiarkan utuh. git diff --check tidak menemukan whitespace error. Repository Masterclass tidak disentuh.

Bukti tambahan berada di direktori academy-package3-evidence di workspace induk. Tidak ada file .env lokal yang masuk ke source copy WSL.

## Reproduksi suite reguler

Frontend: npm run check, npm run lint, npm test, npm run test:api:mock.  
API: npm run test:unit, npm run test:e2e.  
E2E API menghidupkan hanya compose test loopback, menerapkan migrasi test, lalu melakukan cleanup pada container test tersebut.

Harness lintas-repo untuk validasi 7 langkah disimpan sebagai test/package3-real-bff.e2e-spec.ts di repo API dan tests/academy-api.real-browser.mjs di repo frontend. Harness hanya memakai .env.test, mailer mock, peserta sintetis, Chrome lokal, fixture video sintetis, dan API/database loopback. Ia memerlukan path ACADEMY_FRONTEND_COPY, ACADEMY_EMPTY_ENV, ACADEMY_BROWSER_RUNNER, ACADEMY_REAL_EVIDENCE, ACADEMY_PLAYWRIGHT_MODULE, dan ACADEMY_CHROME_EXECUTABLE seperti pada run lokal ini; tidak menjadi script production.

## Closure check dan Package 4A preparation (15 Oktober 2026)

Bagian ini memperbarui baris lint/outage di tabel hasil sebelumnya. Semua validasi tetap lokal; tidak ada deployment, API production, migrasi production, OTP nyata, atau data peserta nyata.

### Baseline lint API

Baseline yang dibandingkan adalah commit API `374804ef2f96f4c60dbcfe3ced11348d2709ed30`, yaitu HEAD sebelum perubahan lokal Package 3. Pemeriksaan ESLint tanpa `--fix` menghasilkan baseline **61 errors / 0 warnings** dan working tree **61 errors / 0 warnings**. Semua file yang masih memiliki error sama seperti baseline; file Academy baru dan test suite Academy sekarang lint bersih. Dua import yang menjadi unused setelah perubahan entitlement dihapus.

Dengan `prettier --list-different .`, baseline memiliki 271 file dan working tree 274. Delapan path tambahan semuanya file generated `.svelte-kit/` dari harness sementara. Tidak ada file source Academy baru yang menambah temuan Prettier. Tiga file Academy yang dimodifikasi (`academy.constants.ts`, `academy.module.ts`, `academy.service.ts`) tidak lagi muncul; dua path CryptoAssets juga tidak muncul di working tree tanpa perubahan isi lokal. Tidak ada auto-fix luas.

### API outage nyata terhadap BFF

**PASS 8/8** pada `academy-package3-evidence/outage-real-api-validation/results.json`. Harness membuka port loopback sementara, menutupnya, lalu mengonfirmasi koneksi ditolak (`ECONNREFUSED`) sebelum mengarahkan BFF ke port tersebut. Browser memakai API lokal, peserta sintetis, dan mailer in-memory.

Katalog BFF mengembalikan 503 tanpa API key atau data katalog lama. `/auth/me`, progress, dan completions menutup akses tanpa token/profil/posisi/completion tersimpan; cookie sesi dibersihkan. Dashboard tidak lagi menampilkan completion lama, dan player menampilkan “Backend tidak tersedia. Konten telah ditutup.” tanpa iframe. Setelah koneksi dipulihkan, peserta sintetis kedua menerima progress, completion, dan grant kosong serta tidak memperoleh video privat. Logout peserta kedua mencabut refresh session. Screenshot outage ada di `academy-package3-evidence/outage-real-api-validation/dashboard-api-outage.png`; kedua container test dan listener port 5433/6380 dibersihkan.

Temuan UI yang diperbaiki: event perubahan auth dapat menimpa error player menjadi state loading saat katalog gagal. Callback API Academy sekarang mempertahankan state error ketika katalog belum siap. Mode Firebase tidak berubah.

### Risiko sesi

Refresh paralel **lulus dalam satu proses** pada API/BFF browser test. Implementasi deduplikasi memakai `Map` dalam proses SvelteKit, sehingga tidak mengoordinasikan worker/instance yang berbeda. API Package 2 memperpanjang sesi Redis yang sama dengan `EXPIRE` dan mengembalikan access token baru; refresh token tidak dirotasi. Refresh lintas-instance tetap **belum diuji**. Ada race window pada source API: refresh membaca sesi, lalu memanggil `EXPIRE` tanpa memeriksa hasilnya sebelum menerbitkan JWT; bila signout menghapus sesi di antara langkah itu, refresh dapat tetap menerbitkan access JWT yang berlaku sampai maksimal 15 menit. Perilaku race ini belum diuji.

Outage terkontrol juga membuktikan BFF menghapus cookie sesi ketika validasi/refresh API gagal karena konektivitas. Peserta perlu login kembali setelah outage; perilaku auth global tidak diubah tanpa persetujuan owner.

### Audit harness dan build

Dua harness sementara (`cryptosharia-api/test/package3-real-bff.e2e-spec.ts` dan `cryptosharia-learning/tests/academy-api.real-browser.mjs`) telah diperiksa. Keduanya tidak memuat literal API key, JWT, atau private key; hanya membaca API key melalui environment server test. Keduanya tetap untracked dan tidak ada dalam arsip source/artefak Git. Direktori generated `.svelte-kit/` juga tidak memuat secret dan dibiarkan utuh.

Vercel adapter build WSL/Linux yang tercatat sebelumnya tetap hasil **PASS**; build production tidak diulang pada putaran ini. Perubahan player tidak mengubah adapter. Windows EPERM tidak diperbaiki dengan mengubah adapter production.

### Package 4A content preparation

Validator dan preview lokal tersedia melalui `scripts/academy-content-preview.mjs`, menggunakan `docs/academy-content-manifest-template.csv`. Validator mendukung CSV/JSON dan curriculum reference lokal; memeriksa subject, level, chapter, parent, scope, lesson ID, benturan urutan, versi, metadata workflow, serta bentuk YouTube URL/ID. Perintah tanpa reference ditandai belum direkonsiliasi. Status publikasi dibatasi ke draft.

Tes validator **8/8 PASS**. CLI dry-run juga lulus dengan fixture yang secara eksplisit bernama sintetis: `databaseWrites=false`, `videoFetched=false`, `published=false`. Tidak ada materi atau video nyata, endpoint write, maupun data fiktif yang ditandai resmi. Approval, rights confirmation, dan syariah review tetap metadata yang belum diverifikasi dan belum punya kontrak write API yang disetujui.

### OWNER REVIEW GATE

Package 3 **PASS untuk kelanjutan dan demonstrasi lokal** dengan batas risiko sesi di atas. Playback YouTube nyata tetap **NOT RUN** sampai owner menyediakan video uji yang disetujui pemiliknya. Ini bukan persetujuan deployment, production migration, atau kesiapan multi-instance.

Langkah minimum menuju pilot: owner menyediakan video berizin dan melengkapi rights/syariah review; lakukan playback nyata pada video tersebut; owner meninjau race refresh/logout dan kebutuhan refresh lintas-instance sebelum penskalaan. CMS/import write tetap tertutup sampai kontrak API dan otorisasi editorial disetujui owner.
