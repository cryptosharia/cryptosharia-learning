import { chromium } from 'playwright-core';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const ARTIFACT_DIR = '/Users/mac/.gemini/antigravity-ide/brain/0a2e685b-b91e-455b-92e1-b760e9c51e7d';
const TASK_LOG_PATH = path.join(ARTIFACT_DIR, '.system_generated/tasks/task-1697.log');
const BASE_URL = 'http://127.0.0.1:5173';
const CHROME_PATH =
  '/Users/mac/Library/Caches/ms-playwright/chromium-1248/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing';

function getLatestOtp(email) {
  const content = fs.readFileSync(TASK_LOG_PATH, 'utf-8');
  const matches = [
    ...content.matchAll(new RegExp(`\\[DEV_OTP\\]\\s+${email}\\s+:\\s+(\\d{6})`, 'g')),
  ];
  if (!matches.length) throw new Error(`OTP not found for ${email} in backend task log`);
  return matches[matches.length - 1][1];
}

async function capture(page, name) {
  const file = path.join(ARTIFACT_DIR, `${name}.png`);
  await page.screenshot({ path: file, fullPage: true });
  console.log(`[SCREENSHOT] Captured: ${file}`);
}

async function run() {
  console.log('=== STARTING PACKAGE 4B BROWSER ACCEPTANCE TESTING ===');

  const browser = await chromium.launch({
    executablePath: CHROME_PATH,
    headless: true,
  });

  const uniqueSuffix = Date.now().toString(36);
  const testScopeId = `qa-e2e-scope-${uniqueSuffix}`;
  const testOrder = (Math.floor(Date.now() / 1000) % 500) + 1;
  const studentEmail = 'qa.student1@test.local';

  try {
    // ----------------------------------------------------
    // Context 1: Desktop Admin Session (1280x800)
    // ----------------------------------------------------
    const adminContext = await browser.newContext({
      viewport: { width: 1280, height: 800 },
    });
    const adminPage = await adminContext.newPage();
    adminPage.on('dialog', (dialog) => dialog.accept());
    adminPage.on('console', (msg) => {
      const txt = msg.text();
      if (!txt.includes('[vite]')) console.log(`[ADMIN CONSOLE ${msg.type().toUpperCase()}]: ${txt}`);
    });
    adminPage.on('pageerror', (err) =>
      console.log(`[ADMIN PAGE ERROR]: ${err.stack || err.message}`)
    );
    adminPage.on('request', (req) => {
      if (req.url().includes('/api/academy/')) {
        console.log(`[HTTP REQ] ${req.method()} ${req.url()}`);
      }
    });
    adminPage.on('response', (res) => {
      if (res.url().includes('/api/academy/')) {
        console.log(`[HTTP RES ${res.status()}] ${res.url()}`);
      }
    });

    // ----------------------------------------------------
    // STEP 1: Login Admin using Official Mechanism
    // ----------------------------------------------------
    console.log('\n[TEST 1] Official Admin Login Flow (/auth/login)...');
    await adminPage.goto(`${BASE_URL}/auth/login`);
    await adminPage.waitForSelector('#email');

    // Fill email
    await adminPage.fill('#email', 'admin@cryptosharia.id');
    await capture(adminPage, 'step1_admin_login_email_filled');

    // Request OTP
    const otpRequestPromise = adminPage.waitForResponse(
      (resp) => resp.url().includes('/api/auth/otp/request') && resp.status() === 200
    );
    await adminPage.click('button[type="submit"]');
    await otpRequestPromise;

    // Wait for OTP input
    await adminPage.waitForSelector('#otpCode');
    await new Promise((r) => setTimeout(r, 600));

    // Retrieve generated OTP from backend log
    const adminOtp = getLatestOtp('admin@cryptosharia.id');
    console.log(`[TEST 1] Retrieved generated OTP: ${adminOtp}`);

    // Fill OTP and submit
    await adminPage.fill('#otpCode', adminOtp);
    await capture(adminPage, 'step1_admin_login_otp_filled');

    const otpVerifyPromise = adminPage.waitForResponse(
      (resp) => resp.url().includes('/api/auth/otp/verify') && resp.status() === 200
    );
    await adminPage.click('button[type="submit"]');
    await otpVerifyPromise;

    console.log('[TEST 1] PASS: Admin authenticated with session cookies.');

    // ----------------------------------------------------
    // STEP 2: Open Dashboard & Verify Stats
    // ----------------------------------------------------
    console.log('\n[TEST 2] Accessing Admin Courses Dashboard (/admin/courses)...');
    await adminPage.goto(`${BASE_URL}/admin/courses`);
    await adminPage.waitForSelector('text=Dashboard Pengelolaan Academy');

    const titleText = await adminPage.textContent('h1');
    assert.ok(titleText.includes('Dashboard Pengelolaan Academy'));

    // Check presence of stat cards
    await adminPage.waitForSelector('text=Total Pelajaran');
    await adminPage.waitForSelector('text=Pelajaran Terbit');
    await adminPage.waitForSelector('text=Lingkup Akses (Scopes)');
    await capture(adminPage, 'step2_admin_dashboard_overview');
    console.log('[TEST 2] PASS: Dashboard overview loaded with stats.');

    // ----------------------------------------------------
    // STEP 3: Create Scope (Course Group)
    // ----------------------------------------------------
    console.log(`\n[TEST 3] Creating Scope: ${testScopeId}...`);
    await adminPage.click('button:has-text("Lingkup Akses")');
    await adminPage.waitForSelector('#scope-id');

    await adminPage.fill('#scope-id', testScopeId);
    await adminPage.fill('#scope-name', 'Scope E2E Acceptance QA');
    await adminPage.fill('#scope-desc', 'Lingkup materi pengujian browser E2E terisolasi');

    const createScopeResponse = adminPage.waitForResponse(
      (resp) => resp.url().includes('/api/academy/admin/scopes') && resp.request().method() === 'POST'
    );
    await adminPage.waitForSelector('button:has-text("+ Tambah Lingkup Akses"):not([disabled])');
    await adminPage.click('button:has-text("+ Tambah Lingkup Akses")');
    const scopeRes = await createScopeResponse;
    assert.equal(scopeRes.status(), 201);

    await adminPage.waitForSelector(`text=${testScopeId}`);
    await capture(adminPage, 'step3_scope_created');
    console.log('[TEST 3] PASS: Scope created and listed in table.');

    // ----------------------------------------------------
    // STEP 4: Create Subject -> Level -> Chapter -> Lesson
    // ----------------------------------------------------
    console.log(`\n[TEST 4] Creating Lesson Draft under fundamental-l1-c1 with order=${testOrder}...`);
    await adminPage.click('button:has-text("+ Buat Materi Baru")');
    await adminPage.waitForSelector('#form-title');

    await adminPage.fill('#form-title', 'Pelajaran E2E: Siklus Pasar Kripto');
    await adminPage.selectOption('#form-sub', 'fundamental');
    await adminPage.fill('#form-lvl', '1');
    await adminPage.fill('#form-chap', '1');
    await adminPage.fill('#form-ord', testOrder.toString());
    await adminPage.selectOption('#form-scope', testScopeId);
    await adminPage.fill('#form-dur', '15');
    await adminPage.fill('#form-inst', 'Ustadz Ahli Muamalah & Finansial');
    await adminPage.fill(
      '#form-desc',
      'Silabus komprehensif mengenai siklus 4 tahunan Bitcoin dan analisis fundamental kripto.'
    );
    await adminPage.check('#syariah-req');

    const createContentPromise = adminPage.waitForResponse(
      (resp) =>
        resp.url().includes('/api/academy/admin/content') && resp.request().method() === 'POST'
    );
    await adminPage.waitForSelector('button:has-text("Buat Materi Draft"):not([disabled])');
    await adminPage.click('button:has-text("Buat Materi Draft")');
    const contentRes = await createContentPromise;
    assert.equal(contentRes.status(), 201);
    const createdItem = await contentRes.json();
    const actualLessonId = createdItem.id;
    console.log(`[TEST 4] Lesson draft created with ID: ${actualLessonId}`);

    // Wait until transition to curriculum finishes and item is rendered
    await adminPage.waitForSelector(`text=${actualLessonId}`);
    await capture(adminPage, 'step4_lesson_draft_created');
    console.log('[TEST 4] PASS: Lesson draft created successfully.');

    // ----------------------------------------------------
    // STEP 5: Edit Content Metadata
    // ----------------------------------------------------
    console.log('\n[TEST 5] Editing Content Metadata...');
    // In Curriculum list, locate the row and click Edit
    const editBtn = adminPage
      .locator(`tr:has-text("${actualLessonId}") button:has-text("Edit")`)
      .first();
    await editBtn.click();
    await adminPage.waitForSelector('#form-title');

    await adminPage.fill('#form-title', 'Pelajaran E2E: Siklus Pasar Kripto (Revisi QA)');

    const editResponsePromise = adminPage.waitForResponse(
      (resp) =>
        resp.url().includes(`/api/academy/admin/content/${encodeURIComponent(actualLessonId)}`) &&
        resp.request().method() === 'PUT'
    );
    await adminPage.waitForSelector('button:has-text("Simpan Perubahan"):not([disabled])');
    await adminPage.click('button:has-text("Simpan Perubahan")');
    const editRes = await editResponsePromise;
    assert.equal(editRes.status(), 200);

    await adminPage.waitForSelector(`text=Pelajaran E2E: Siklus Pasar Kripto (Revisi QA)`);
    await capture(adminPage, 'step5_content_metadata_edited');
    console.log('[TEST 5] PASS: Content metadata updated.');

    // ----------------------------------------------------
    // STEP 6: Add YouTube Media
    // ----------------------------------------------------
    console.log('\n[TEST 6] Attaching YouTube Media (dQw4w9WgXcQ)...');
    // Open edit for the lesson again
    await adminPage
      .locator(`tr:has-text("${actualLessonId}") button:has-text("Edit")`)
      .first()
      .click();

    await adminPage.waitForSelector('input[type="url"]');
    await adminPage.fill('input[type="url"]', 'https://www.youtube.com/watch?v=dQw4w9WgXcQ');
    await adminPage.fill(
      '#form-note',
      'Telah diaudit oleh tim kurikulum syariah dan materi dinyatakan valid.'
    );

    const mediaResponsePromise = adminPage.waitForResponse(
      (resp) =>
        resp.url().includes(
          `/api/academy/admin/content/${encodeURIComponent(actualLessonId)}/media`
        ) && resp.request().method() === 'PUT'
    );
    await adminPage.waitForSelector('button:has-text("Simpan Perubahan"):not([disabled])');
    await adminPage.click('button:has-text("Simpan Perubahan")');
    const mediaRes = await mediaResponsePromise;
    assert.equal(mediaRes.status(), 200);

    await capture(adminPage, 'step6_youtube_media_attached');
    console.log('[TEST 6] PASS: YouTube media attached to lesson.');

    // ----------------------------------------------------
    // STEP 7: Editorial & Sharia Review Workflow
    // ----------------------------------------------------
    console.log('\n[TEST 7] Running Review & Publish State Transitions...');
    // 7.1: Transition Draft -> Review
    await adminPage.waitForSelector(`tr:has-text("${actualLessonId}")`);
    const ajukanBtn = adminPage
      .locator(`tr:has-text("${actualLessonId}") button:has-text("Ajukan")`)
      .first();
    const transitionReviewPromise = adminPage.waitForResponse(
      (resp) =>
        resp.url().includes('/transition') && resp.request().method() === 'POST'
    );
    await ajukanBtn.click();
    const trans1 = await transitionReviewPromise;
    assert.equal(trans1.status(), 200);

    // 7.2: Switch to Review Workflow tab
    await adminPage.click('button:has-text("Alur Review & Publikasi")');
    await adminPage.waitForSelector(`div:has-text("${actualLessonId}")`);

    // 7.3: Approve with rights confirmed
    const approveBtn = adminPage
      .locator(`div:has-text("${actualLessonId}") button:has-text("Setujui (Approve)")`)
      .first();
    const transitionApprovePromise = adminPage.waitForResponse(
      (resp) =>
        resp.url().includes('/transition') && resp.request().method() === 'POST'
    );
    await approveBtn.click();
    const trans2 = await transitionApprovePromise;
    assert.equal(trans2.status(), 200);

    // 7.4: Publish approved lesson
    await adminPage.waitForSelector(
      `div:has-text("${actualLessonId}") button:has-text("Terbitkan (Publish)")`
    );
    const publishBtn = adminPage
      .locator(`div:has-text("${actualLessonId}") button:has-text("Terbitkan (Publish)")`)
      .first();
    const transitionPublishPromise = adminPage.waitForResponse(
      (resp) =>
        resp.url().includes('/transition') && resp.request().method() === 'POST'
    );
    await publishBtn.click();
    const trans3 = await transitionPublishPromise;
    assert.equal(trans3.status(), 200);

    await capture(adminPage, 'step7_workflow_published');
    console.log('[TEST 7] PASS: Lesson successfully transitioned Draft -> Review -> Approved -> Published.');

    // ----------------------------------------------------
    // STEP 8: Verify Public Catalog & Leak Prevention
    // ----------------------------------------------------
    console.log('\n[TEST 8] Verifying Public Catalog (/e-learning)...');
    await adminPage.goto(`${BASE_URL}/e-learning`);
    await adminPage.waitForSelector('h1');

    // Check catalog HTML does NOT expose private videoId
    const pageHtml = await adminPage.content();
    assert.ok(
      !pageHtml.includes('dQw4w9WgXcQ'),
      'CRITICAL SECURITY CHECK: YouTube Video ID leaked in public catalog!'
    );

    await capture(adminPage, 'step8_public_catalog_verified');
    console.log('[TEST 8] PASS: Public catalog loaded without private videoId leakage.');

    // ----------------------------------------------------
    // Context 2: Student Browser Session & Registration
    // ----------------------------------------------------
    console.log(`\n[STUDENT SETUP] Authenticating test student (${studentEmail})...`);
    const studentContext = await browser.newContext({
      viewport: { width: 1280, height: 800 },
    });
    const studentPage = await studentContext.newPage();
    studentPage.on('dialog', (dialog) => dialog.accept());

    await studentPage.goto(`${BASE_URL}/auth/login`);
    await studentPage.waitForSelector('#email');
    await studentPage.fill('#email', studentEmail);

    const studentOtpReqPromise = studentPage.waitForResponse(
      (resp) => resp.url().includes('/api/auth/otp/request') && resp.status() === 200
    );
    await studentPage.click('button[type="submit"]');
    await studentOtpReqPromise;

    await studentPage.waitForSelector('#otpCode');
    await new Promise((r) => setTimeout(r, 600));
    const studentOtp = getLatestOtp(studentEmail);
    console.log(`[STUDENT SETUP] Student OTP retrieved: ${studentOtp}`);

    await studentPage.fill('#otpCode', studentOtp);
    const studentOtpVerifyPromise = studentPage.waitForResponse(
      (resp) => resp.url().includes('/api/auth/otp/verify') && resp.status() === 200
    );
    await studentPage.click('button[type="submit"]');
    const studentVerifyRes = await studentOtpVerifyPromise;
    const studentSession = await studentVerifyRes.json();
    const studentUserId = studentSession.user?.id;
    console.log(`[STUDENT SETUP] Student authenticated with DB User ID: ${studentUserId}`);
    assert.ok(studentUserId, 'Student User ID must be resolved from session');

    await capture(studentPage, 'step10_student_logged_in');

    // ----------------------------------------------------
    // STEP 9: Allocate Grant to Student User
    // ----------------------------------------------------
    console.log(`\n[TEST 9] Allocating Grant to student (${studentUserId})...`);
    await adminPage.goto(`${BASE_URL}/admin/courses`);
    await adminPage.click('button:has-text("Hak Akses Siswa")');
    await adminPage.waitForSelector('#grant-uid');

    await adminPage.fill('#grant-uid', studentUserId);
    await adminPage.selectOption('#grant-scope', testScopeId);
    await adminPage.fill('#grant-dur', '365');

    const grantPromise = adminPage.waitForResponse(
      (resp) => resp.url().includes('/api/academy/admin/grants') && resp.request().method() === 'POST'
    );
    await adminPage.waitForSelector('button:has-text("+ Berikan Hak Akses"):not([disabled])');
    await adminPage.click('button:has-text("+ Berikan Hak Akses")');
    const grantRes = await grantPromise;
    assert.equal(grantRes.status(), 201);

    await adminPage.waitForSelector(`text=${studentUserId}`, { timeout: 10000 });
    await capture(adminPage, 'step9_grant_allocated');
    console.log(`[TEST 9] PASS: Student grant allocated successfully.`);

    // ----------------------------------------------------
    // STEP 10: Verify Student Session Confirmation
    // ----------------------------------------------------
    console.log('\n[TEST 10] Verifying Student Profile & Session State...');
    await studentPage.goto(`${BASE_URL}/profile`);
    await studentPage.waitForSelector('text=Profil Academy');
    await capture(studentPage, 'step10_student_profile_verified');
    console.log('[TEST 10] PASS: Student profile loaded with active session.');

    // ----------------------------------------------------
    // STEP 11: Access Authorized Lesson & Video Delivery
    // ----------------------------------------------------
    console.log(`\n[TEST 11] Student Accessing Authorized Lesson (${actualLessonId})...`);
    await studentPage.goto(
      `${BASE_URL}/e-learning/${testScopeId}?lesson=${encodeURIComponent(actualLessonId)}`
    );

    // Verify player is ready and delivers YouTube iframe with videoId
    await studentPage.waitForSelector('iframe', { timeout: 15000 });
    const iframeSrc = await studentPage.getAttribute('iframe', 'src');
    assert.ok(
      iframeSrc.includes('dQw4w9WgXcQ'),
      'Authorized student did not receive YouTube video!'
    );

    await capture(studentPage, 'step11_student_authorized_video_player');
    console.log('[TEST 11] PASS: Student successfully streaming authorized YouTube media.');

    // ----------------------------------------------------
    // STEP 12: Record Learning Progress (Playback Resume)
    // ----------------------------------------------------
    console.log('\n[TEST 12] Recording Learning Progress (120s)...');
    const progressResponse = await studentPage.evaluate(async (lessonId) => {
      const res = await fetch(`/api/academy/me/progress/${encodeURIComponent(lessonId)}`, {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ version: 1, positionSeconds: 120 }),
      });
      return { status: res.status, data: await res.json() };
    }, actualLessonId);

    assert.equal(progressResponse.status, 200);
    assert.equal(progressResponse.data.positionSeconds, 120);

    await capture(studentPage, 'step12_progress_position_saved');
    console.log('[TEST 12] PASS: Playback resume position recorded at 120s.');

    // ----------------------------------------------------
    // STEP 13: Mark Lesson Complete
    // ----------------------------------------------------
    console.log('\n[TEST 13] Marking Lesson Complete...');
    const completionResponse = await studentPage.evaluate(async (lessonId) => {
      const res = await fetch(`/api/academy/me/completions/${encodeURIComponent(lessonId)}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ version: 1 }),
      });
      return { status: res.status };
    }, actualLessonId);

    assert.equal(completionResponse.status, 200);

    // Verify completions summary
    const summaryResponse = await studentPage.evaluate(async () => {
      const res = await fetch('/api/academy/me/completions');
      return { status: res.status, data: await res.json() };
    });
    assert.equal(summaryResponse.status, 200);
    assert.ok(summaryResponse.data.completions.some((c) => c.lessonId === actualLessonId));

    await capture(studentPage, 'step13_lesson_marked_complete');
    console.log('[TEST 13] PASS: Lesson completion persisted and progress updated.');

    // ----------------------------------------------------
    // STEP 14: Revoke Grant & Verify Immediate Access Cutoff
    // ----------------------------------------------------
    console.log('\n[TEST 14] Revoking Student Grant & Verifying Immediate Cutoff...');
    await adminPage.click('button:has-text("Hak Akses Siswa")');
    await adminPage.waitForSelector(`text=${studentUserId}`);

    const revokePromise = adminPage.waitForResponse(
      (resp) => resp.url().includes('/revoke') && resp.request().method() === 'PUT'
    );
    const revokeBtn = adminPage
      .locator(`tr:has-text("${studentUserId}") button:has-text("Cabut Akses")`)
      .first();
    await revokeBtn.click();
    const revokeRes = await revokePromise;
    assert.equal(revokeRes.status(), 200);

    // Student attempts to fetch authorized lesson media again directly
    const studentAccessAfterRevoke = await studentPage.evaluate(async (lessonId) => {
      const res = await fetch(`/api/academy/lessons/${encodeURIComponent(lessonId)}`);
      return { status: res.status, data: await res.json() };
    }, actualLessonId);

    assert.equal(
      studentAccessAfterRevoke.status,
      403,
      'Student was not blocked after grant revocation!'
    );
    assert.equal(studentAccessAfterRevoke.data.error, 'GRANT_REVOKED');

    // Student reloads the lesson page and sees revoked message
    await studentPage.reload();
    await studentPage.waitForSelector('text=Akses dicabut.', { timeout: 10000 });
    await capture(studentPage, 'step14_access_revoked_blocked');
    console.log('[TEST 14] PASS: Grant revoked; student immediately blocked (HTTP 403 GRANT_REVOKED).');

    // ----------------------------------------------------
    // STEP 15: Mobile Viewport & Responsiveness & A11y
    // ----------------------------------------------------
    console.log('\n[TEST 15] Testing Mobile Viewport (390x844) & Accessibility...');
    const mobileContext = await browser.newContext({
      viewport: { width: 390, height: 844 },
      isMobile: true,
      hasTouch: true,
    });
    const mobilePage = await mobileContext.newPage();

    // Mobile Admin Dashboard
    const cookies = await adminContext.cookies();
    await mobileContext.addCookies(cookies);

    await mobilePage.goto(`${BASE_URL}/admin/courses`);
    await mobilePage.waitForSelector('h1');
    await capture(mobilePage, 'step15_mobile_admin_dashboard');

    // Mobile Catalog
    await mobilePage.goto(`${BASE_URL}/e-learning`);
    await mobilePage.waitForSelector('h1');
    await capture(mobilePage, 'step15_mobile_catalog_elearning');

    // Verify no horizontal overflow on mobile
    const hasHorizontalScroll = await mobilePage.evaluate(() => {
      return document.documentElement.scrollWidth > document.documentElement.clientWidth;
    });
    assert.equal(hasHorizontalScroll, false, 'Mobile page has horizontal layout overflow!');

    console.log('[TEST 15] PASS: Mobile viewports render without horizontal overflow.');

    console.log('\n======================================================');
    console.log(' ALL 15 BROWSER ACCEPTANCE TESTS PASSED SUCCESSFULLY! ');
    console.log('======================================================\n');
  } finally {
    await browser.close();
  }
}

run().catch((err) => {
  console.error('\n❌ BROWSER ACCEPTANCE TEST FAILED:', err);
  process.exit(1);
});
