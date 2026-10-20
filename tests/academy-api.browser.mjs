import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve, relative, isAbsolute } from 'node:path';
import { mockAcademyApi } from './academy-api.mock.mjs';

if (!process.env.ACADEMY_PLAYWRIGHT_MODULE)
	throw new Error('Set ACADEMY_PLAYWRIGHT_MODULE to an installed Playwright index.mjs.');
const evidence = process.env.ACADEMY_BROWSER_EVIDENCE_DIR
	? resolve(process.env.ACADEMY_BROWSER_EVIDENCE_DIR)
	: await mkdtemp(join(tmpdir(), 'academy-package3-'));
const rel = relative(process.cwd(), evidence);
assert.ok(rel.startsWith('..') || isAbsolute(rel), 'Evidence must stay outside the repository');
await mkdir(evidence, { recursive: true });
const mock = await mockAcademyApi();
// Override all runtime inputs: no .env production credentials are used.
for (const key of Object.keys(process.env))
	if (key.startsWith('PUBLIC_FIREBASE_')) delete process.env[key];
Object.assign(process.env, {
	PUBLIC_ACADEMY_ENABLED: 'true',
	PUBLIC_ACADEMY_BACKEND: 'api',
	PUBLIC_FIREBASE_MODE: 'disabled',
	API_BASE_URL: mock.url,
	API_KEY: mock.key
});
const { createServer } = await import('vite');
const vite = await createServer({ server: { host: '127.0.0.1', port: 0, strictPort: false } });
let browser;
let page;
const results = [];
const errors = [];
async function check(name, fn) {
	await fn();
	results.push({ name, status: 'PASS' });
	console.log(`PASS ${name}`);
}
try {
	await vite.listen();
	const base = `http://127.0.0.1:${vite.httpServer.address().port}`;
	const { chromium } = await import(pathToFileURL(process.env.ACADEMY_PLAYWRIGHT_MODULE).href);
	browser = await chromium.launch({
		headless: true,
		executablePath: process.env.ACADEMY_CHROME_EXECUTABLE
	});
	const context = await browser.newContext();
	const payloads = [];
	await context.route('**/*', async (route) => {
		const url = new URL(route.request().url());
		if (url.origin === base) return route.continue();
		if (url.href === 'https://www.youtube.com/iframe_api')
			return route.fulfill({
				contentType: 'text/javascript',
				body: `window.__fakePlayers=[];window.YT={Player:class {constructor(frame,options){this.position=0;this.seeked=0;this.events=options.events;window.__fakePlayers.push(this);setTimeout(()=>this.events.onReady(),0);} seekTo(p){this.position=p;this.seeked=p;}getCurrentTime(){return this.position;}event(p,state){this.position=p;this.events.onStateChange({data:state});}destroy(){this.dead=true;}}};window.onYouTubeIframeAPIReady();`
			});
		if (url.hostname === 'www.youtube-nocookie.com')
			return route.fulfill({
				contentType: 'text/html',
				body: '<p>Synthetic frame: actual YouTube playback NOT tested.</p>'
			});
		await route.abort();
	});
	page = await context.newPage();
	page.setDefaultTimeout(7000);
	page.on('pageerror', (e) => errors.push(e.message));
	page.on('response', async (res) => {
		if (res.url().startsWith(base) && /javascript|json/.test(res.headers()['content-type'] || '')) {
			try {
				payloads.push(await res.text());
			} catch {
				/* navigation closed a response */
			}
		}
	});
	const request = context.request;
	const post = (path, data) => request.post(base + path, { data, headers: { origin: base } });
	const openLesson = () => page.goto(base + '/e-learning/scope-synthetic?lesson=lesson-synthetic');
	const playerStatus = async (status) => {
		await page.waitForFunction(
			(s) => document.querySelector('[data-testid="access-status"]')?.dataset.status === s,
			status
		);
		if (status === 'ready') await page.locator('iframe').waitFor();
		assert.equal(await page.locator('iframe').count(), status === 'ready' ? 1 : 0);
	};
	const captureResponsive = async (name) => {
		for (const width of [360, 375, 390, 768, 1024, 1440, 1920]) {
			await page.setViewportSize({ width, height: width < 600 ? 844 : 1000 });
			assert.equal(
				await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
				true,
				`${name} layout should not overflow at ${width}px`
			);
			const menuButton = page.getByRole('button', { name: /navigasi/ }).first();
			if ((await menuButton.count()) > 0)
				assert.equal(
					await menuButton.isVisible(),
					width < 768,
					`${name} navigation breakpoint should match ${width}px`
				);
			if (width === 1440)
				await page.screenshot({
					path: join(evidence, `${name}-desktop.png`),
					clip: { x: 0, y: 0, width: 1440, height: 800 }
				});
			if (width === 390)
				await page.screenshot({
					path: join(evidence, `${name}-mobile-390.png`),
					fullPage: !name.startsWith('academy-cms')
				});
		}
		await page.setViewportSize({ width: 1280, height: 720 });
	};
	const login = async (email, redirect = '', expectedPath = '/e-learning') => {
		const query = redirect ? `?redirect=${encodeURIComponent(redirect)}` : '';
		await page.goto(base + '/auth/login' + query);
		await page.locator('#email').fill(email);
		await page.getByRole('button', { name: 'Kirim kode OTP' }).click();
		await page.locator('#otpCode').fill(mock.state.mail.at(-1).code);
		const otpState = await page.locator('#otpCode').evaluate((input) => ({
			value: input.value,
			pattern: input.pattern,
			maxLength: input.maxLength,
			validity: {
				valid: input.validity.valid,
				valueMissing: input.validity.valueMissing,
				patternMismatch: input.validity.patternMismatch,
				tooLong: input.validity.tooLong,
				badInput: input.validity.badInput
			}
		}));
		assert.equal(otpState.validity.valid, true, 'six-digit OTP must pass browser form validation');
		const verify = page.waitForResponse(
			(response) => response.url().endsWith('/api/auth/otp/verify'),
			{ timeout: 5000 }
		);
		await page.getByRole('button', { name: 'Verifikasi dan masuk' }).click();
		assert.equal((await verify).status(), 200);
		await page.waitForURL(base + expectedPath);
		await page.getByRole('button', { name: 'Keluar', exact: true }).first().waitFor();
	};
	const editSyntheticRecord = async ({
		id,
		parentId,
		title,
		nextTitle,
		nextDescription,
		checkDiscard
	}) => {
		const before = structuredClone(mock.state.adminContent.find((item) => item.id === id));
		assert.ok(before, `synthetic record ${id} must exist`);
		assert.equal(before.parentId, parentId);
		assert.equal(before.title, title);
		const row = page.getByRole('row').filter({ hasText: id }).first();
		await row.getByRole('button', { name: 'Edit' }).click();
		await page.locator('#form-title').fill(nextTitle);
		await page.locator('#form-desc').fill(nextDescription);
		await page
			.getByRole('status')
			.filter({ hasText: 'Ada perubahan yang belum disimpan.' })
			.waitFor({ timeout: 5000 });
		if (checkDiscard) {
			let discardMessage = '';
			page.once('dialog', async (dialog) => {
				discardMessage = dialog.message();
				await dialog.dismiss();
			});
			await page.getByRole('button', { name: 'Kurikulum & Konten' }).click();
			assert.match(discardMessage, /Perubahan belum disimpan/);
			await page.getByRole('heading', { name: `Edit Materi: ${nextTitle}` }).waitFor();
		}
		const responsePromise = page.waitForResponse(
			(response) =>
				response.url().includes(`/api/academy/admin/content/${id}`) &&
				response.request().method() === 'PUT'
		);
		await page.getByRole('button', { name: 'Simpan Perubahan' }).click();
		const response = await responsePromise;
		assert.equal(response.status(), 200);
		const update = mock.state.contentUpdates.at(-1);
		const after = mock.state.adminContent.find((item) => item.id === id);
		assert.equal(update.id, id);
		assert.equal(after.id, before.id);
		assert.equal(after.parentId, before.parentId);
		assert.equal(after.kind, before.kind);
		assert.equal(after.status, before.status);
		assert.equal(update.body.title, nextTitle);
		assert.equal(update.body.description, nextDescription);
		assert.equal('id' in update.body, false);
		assert.equal('parentId' in update.body, false);
		await page
			.getByRole('status')
			.filter({ hasText: `Konten "${nextTitle}" berhasil diperbarui.` })
			.waitFor();
		const updatedRow = page.getByRole('row').filter({ hasText: nextTitle }).first();
		await updatedRow.waitFor();
		await updatedRow.getByRole('button', { name: 'Edit' }).waitFor();
	};
	await check('anonymous catalog and curriculum exclude private media', async () => {
		const res = await request.get(base + '/api/academy/catalog');
		assert.equal(res.status(), 200);
		assert.ok(!JSON.stringify(await res.json()).includes('synthetic01'));
		await page.goto(base + '/e-learning');
		await page.locator('summary').filter({ hasText: 'Lihat materi terbit' }).click();
		await page.locator('summary').filter({ hasText: 'Level 1 · Level sintetis' }).click();
		await page.getByText('Pelajaran sintetis Package 3', { exact: true }).waitFor();
		await captureResponsive('academy-catalog-api-mock');
		assert.equal((await request.get(base + '/api/academy/me/grants')).status(), 401);
	});
	await check(
		'API-mode root renders the public Academy landing with live lesson status',
		async () => {
			await page.goto(base + '/');
			await page.getByRole('heading', { name: /Belajar kripto secara terstruktur/ }).waitFor();
			await page.getByRole('status').filter({ hasText: '1 lesson telah diterbitkan' }).waitFor();
			assert.equal(await page.getByRole('link', { name: 'CMS', exact: true }).count(), 0);
			await captureResponsive('academy-home-api-mock');
		}
	);
	await check(
		'mobile navigation opens, closes with Escape, and closes after selection',
		async () => {
			await page.setViewportSize({ width: 390, height: 844 });
			const toggle = page.locator('button[aria-controls="academy-mobile-menu"]');
			await toggle.click();
			assert.equal(await toggle.getAttribute('aria-expanded'), 'true');
			await page.getByRole('navigation', { name: 'Navigasi mobile' }).waitFor();
			await page.keyboard.press('Escape');
			assert.equal(await toggle.getAttribute('aria-expanded'), 'false');
			await toggle.click();
			await page
				.getByRole('navigation', { name: 'Navigasi mobile' })
				.getByRole('link', { name: 'Kurikulum' })
				.click();
			await page.waitForURL(`${base}/e-learning`);
			assert.equal(await page.getByRole('navigation', { name: 'Navigasi mobile' }).count(), 0);
			await page.setViewportSize({ width: 1280, height: 720 });
		}
	);
	await check('guest dashboard and login show responsive entry states', async () => {
		await page.goto(base + '/profile');
		await page.getByRole('link', { name: /Masuk ke Academy/ }).waitFor();
		await captureResponsive('academy-dashboard-guest-api-mock');
		await page.goto(base + '/auth/login');
		await page.getByRole('heading', { name: 'Masuk ke CryptoSharia Academy' }).waitFor();
		await captureResponsive('academy-login-api-mock');
	});
	await check('CSRF rejects missing, malformed and cross-origin headers', async () => {
		for (const origin of [undefined, 'null', 'https://evil.example']) {
			const res = await request.post(base + '/api/auth/otp/request', {
				data: { email: 'alice@example.test' },
				headers: origin ? { origin } : {}
			});
			assert.equal(res.status(), 403);
		}
		assert.equal(mock.state.mail.length, 0);
	});
	await check('OTP rate limit forwards Retry-After', async () => {
		mock.state.rateLimited = true;
		const res = await post('/api/auth/otp/request', { email: 'alice@example.test' });
		assert.equal(res.status(), 429);
		assert.equal(res.headers()['retry-after'], '60');
		mock.state.rateLimited = false;
	});
	await check('failed profile fetch never establishes a session', async () => {
		await post('/api/auth/otp/request', { email: 'alice@example.test' });
		mock.state.profileFailure = true;
		const res = await post('/api/auth/otp/verify', { email: 'alice@example.test', code: '123456' });
		assert.equal(res.status(), 500);
		assert.ok(!(await context.cookies()).some((c) => c.name === 'cs_rt'));
		mock.state.profileFailure = false;
	});
	await check('OTP login uses captured mock mail and /auth/me, tokens stay HttpOnly', async () => {
		await login('alice@example.test');
		const cookies = (await context.cookies()).filter((c) => c.name.startsWith('cs_'));
		assert.equal(cookies.length, 2);
		for (const c of cookies) {
			assert.equal(c.httpOnly, true);
			assert.equal(c.sameSite, 'Lax');
			assert.equal(c.path, '/');
		}
		assert.ok(!(await page.evaluate(() => document.cookie).then((c) => c.includes('cs_'))));
		const res = await request.get(base + '/api/auth/me');
		assert.equal((await res.json()).user.id, 'alice');
		assert.equal(res.headers()['cache-control'], 'no-store');
	});
	await check(
		'OTP honors internal redirects and rejects CMS or external redirects for a member',
		async () => {
			await login('alice@example.test', '/profile', '/profile');
			await login('bob@example.test', '/admin/courses', '/e-learning');
			await login('bob@example.test', 'https://evil.example/', '/e-learning');
		}
	);
	await check(
		'authorized synthetic admin sees editorial overview and CMS stays role-gated',
		async () => {
			await login('admin@example.test', '/admin/courses', '/admin/courses');
			await page.getByRole('heading', { name: 'Ringkasan Academy' }).waitFor();
			await page.getByText('Kesiapan publikasi', { exact: true }).waitFor();
			await page.setViewportSize({ width: 390, height: 844 });
			const finalAdminTab = await page
				.getByRole('button', { name: 'Hak Akses Siswa' })
				.boundingBox();
			assert.ok(
				finalAdminTab && finalAdminTab.x + finalAdminTab.width <= 390,
				'last CMS tab must fit inside the mobile viewport'
			);
			await page.setViewportSize({ width: 1280, height: 720 });
			await captureResponsive('academy-cms-admin-synthetic-api-mock');
			await page.getByRole('button', { name: 'Kurikulum & Konten' }).click();
			await page.getByRole('heading', { name: 'Kurikulum & Materi Pembelajaran' }).waitFor();
			await page.getByText('Pelajaran sintetis QA', { exact: true }).waitFor();
			await page
				.getByText(
					'Analisis Fundamental · data QA → Level QA sintetis → Bab QA sintetis → Pelajaran sintetis QA',
					{ exact: true }
				)
				.waitFor();
			await page.setViewportSize({ width: 390, height: 844 });
			const mobileTabBoxes = await page
				.getByRole('navigation', { name: 'Tabs' })
				.getByRole('button')
				.evaluateAll((buttons) =>
					buttons.map((button) => {
						const { x, y, width, height } = button.getBoundingClientRect();
						return { label: button.innerText, x, y, width, height };
					})
				);
			assert.equal(mobileTabBoxes.length, 6);
			assert.ok(
				mobileTabBoxes.every(
					(box) => box.x >= 0 && box.x + box.width <= 390 && box.y >= 0 && box.height > 0
				),
				'all CMS tabs must fit inside the mobile viewport in the curriculum view'
			);
			await captureResponsive('academy-cms-curriculum-synthetic-api-mock');
			await editSyntheticRecord({
				id: 'admin-level-synthetic',
				parentId: 'fundamental',
				title: 'Level QA sintetis',
				nextTitle: 'FOUNDATION: DASAR-DASAR CRYPTO & NILAI ASET',
				nextDescription: 'Tujuan belajar level sintetis untuk pengujian lokal.',
				checkDiscard: true
			});
			await editSyntheticRecord({
				id: 'fundamental',
				parentId: 'root',
				title: 'Analisis Fundamental · data QA',
				nextTitle: 'Analisis Fundamental · Subject QA diperbarui',
				nextDescription: 'Deskripsi subject untuk pengujian lokal.'
			});
			await editSyntheticRecord({
				id: 'admin-chapter-synthetic',
				parentId: 'admin-level-synthetic',
				title: 'Bab QA sintetis',
				nextTitle: 'Bab QA sintetis diperbarui',
				nextDescription: 'Deskripsi chapter untuk pengujian lokal.'
			});
			await editSyntheticRecord({
				id: 'admin-lesson-synthetic',
				parentId: 'admin-chapter-synthetic',
				title: 'Pelajaran sintetis QA',
				nextTitle: 'Pelajaran sintetis QA diperbarui',
				nextDescription: 'Metadata lesson untuk pengujian lokal.'
			});
			await captureResponsive('academy-cms-curriculum-metadata-updated-synthetic-api-mock');
		}
	);
	await check('authorized player loads and simulated playback saves position', async () => {
		await login('alice@example.test');
		await openLesson();
		await playerStatus('ready');
		await page.waitForFunction(() => window.__fakePlayers?.length > 0);
		await page.evaluate(() => window.__fakePlayers.at(-1).event(45, 2));
		await page.waitForFunction(
			async () =>
				(await fetch('/api/academy/me/progress').then((r) => r.json())).progress[0]
					?.positionSeconds === 45
		);
		await page
			.locator('[data-testid="progress-status"]')
			.filter({ hasText: 'Posisi belajar tersimpan.' })
			.waitFor();
		assert.equal(mock.state.completions.size, 0);
	});
	await check(
		'YouTube provider and autoplay errors appear without completing a lesson',
		async () => {
			await page.evaluate(() => window.__fakePlayers.at(-1).events.onError({ data: 100 }));
			await page
				.locator('[data-testid="progress-status"]')
				.filter({ hasText: 'Video tidak tersedia (kode 100).' })
				.waitFor();
			await page.evaluate(() => window.__fakePlayers.at(-1).events.onAutoplayBlocked());
			await page
				.locator('[data-testid="progress-status"]')
				.filter({ hasText: 'Tekan play untuk memulai video.' })
				.waitFor();
			assert.equal(mock.state.completions.size, 0);
		}
	);
	await check('reload resumes and explicit completion persists idempotently', async () => {
		await page.reload();
		await playerStatus('ready');
		await page.waitForFunction(() => window.__fakePlayers?.at(-1)?.seeked === 45);
		await page.getByRole('button', { name: 'Tandai Selesai', exact: true }).click();
		await page.getByRole('button', { name: 'Selesai', exact: true }).waitFor();
		const completedAt = mock.state.completions.get('alice').completedAt;
		assert.equal(
			(await post('/api/academy/me/completions/lesson-synthetic', { version: 1 })).status(),
			200
		);
		assert.equal(mock.state.completions.get('alice').completedAt, completedAt);
		await page.reload();
		await page.getByRole('button', { name: 'Selesai', exact: true }).waitFor();
		await page.goto(base + '/profile');
		const progressSummary = page.locator('section[aria-labelledby="progress-title"]');
		await progressSummary.getByText('1 dari 1 lesson', { exact: true }).waitFor();
		await progressSummary.getByText('100%', { exact: true }).waitFor();
		assert.equal(await page.getByRole('button', { name: 'Simpan profil' }).count(), 0);
		await captureResponsive('academy-dashboard-logged-in-api-mock');
	});
	await check('strict payload and stale version are rejected', async () => {
		assert.equal(
			(
				await request.put(base + '/api/academy/me/progress/lesson-synthetic', {
					headers: { origin: base },
					data: { version: '1', positionSeconds: null }
				})
			).status(),
			400
		);
		mock.state.version = 2;
		assert.equal(
			(await post('/api/academy/me/completions/lesson-synthetic', { version: 1 })).status(),
			400
		);
		await openLesson();
		await playerStatus('ready');
		await page.waitForFunction(() => window.__fakePlayers?.at(-1)?.seeked === 0);
		await page.getByRole('button', { name: 'Tandai Selesai', exact: true }).waitFor();
	});
	await check('expired and revoked grants clear private media', async () => {
		mock.state.grant = 'expired';
		await playerStatus('expired');
		mock.state.grant = 'active';
		await page.getByRole('button', { name: 'Periksa akses kembali' }).click();
		await playerStatus('ready');
		mock.state.grant = 'revoked';
		await playerStatus('revoked');
		mock.state.grant = 'active';
	});
	await check('concurrent expired access cookies refresh successfully', async () => {
		await context.clearCookies({ name: 'cs_at' });
		const before = mock.state.refreshes;
		const responses = await Promise.all(
			Array.from({ length: 5 }, () => request.get(base + '/api/auth/me'))
		);
		assert.ok(responses.every((r) => r.status() === 200));
		assert.ok(mock.state.refreshes > before);
	});
	await check('backend offline clears private player', async () => {
		await openLesson();
		await playerStatus('ready');
		mock.state.online = false;
		await playerStatus('backend-unavailable');
		mock.state.online = true;
	});
	await check('logout clears cookies and account switching isolates history', async () => {
		// Offline requests may invalidate a local session, so sign in before checking explicit logout.
		await login('alice@example.test');
		await openLesson();
		await playerStatus('ready');
		const logoutResponse = page.waitForResponse((response) =>
			response.url().endsWith('/api/auth/logout')
		);
		await page.getByRole('button', { name: 'Keluar', exact: true }).first().click();
		assert.equal((await logoutResponse).status(), 200);
		await page.waitForFunction(() => document.querySelectorAll('iframe').length === 0);
		await page.waitForFunction(async () => (await fetch('/api/auth/me')).status === 401);
		assert.ok(!(await context.cookies()).some((c) => c.name.startsWith('cs_')));
		await login('bob@example.test');
		await openLesson();
		await playerStatus('unauthorized');
		const positions = await request.get(base + '/api/academy/me/progress');
		assert.deepEqual((await positions.json()).progress, []);
		const completion = await request.get(base + '/api/academy/me/completions');
		assert.deepEqual((await completion.json()).completions, []);
	});
	await check('invalid session is cleared and CMS is gated', async () => {
		mock.state.invalidUsers.add('bob');
		await openLesson();
		await playerStatus('unauthorized');
		await page.goto(base + '/admin/courses');
		const currentUrl = new URL(page.url());
		assert.equal(currentUrl.pathname, '/auth/login');
		assert.equal(currentUrl.searchParams.get('redirect'), '/admin/courses');
		assert.equal(await page.getByRole('button', { name: 'Simpan draft' }).count(), 0);
		assert.equal(await page.getByRole('link', { name: 'CMS', exact: true }).count(), 0);
		assert.ok(!(await context.cookies()).some((cookie) => cookie.name.startsWith('cs_')));
	});
	await check('browser responses and modules contain no API credentials or tokens', async () => {
		assert.ok(payloads.length > 10);
		for (const text of payloads) {
			assert.ok(!text.includes(mock.key));
			assert.ok(!text.includes('mock-access-'));
			assert.ok(!text.includes(':mock-refresh'));
		}
		assert.deepEqual(errors, []);
	});
} catch (error) {
	if (page) {
		await page.screenshot({ path: join(evidence, 'failure.png'), fullPage: true }).catch(() => {});
		const body = await page
			.locator('body')
			.innerText()
			.catch(() => '<Page unavailable after failure>');
		await writeFile(join(evidence, 'failure.txt'), body);
	}
	results.push({ name: error.message, status: 'FAIL' });
	console.error(error);
	process.exitCode = 1;
} finally {
	if (browser) await browser.close();
	await vite.close();
	await mock.close();
	await writeFile(
		join(evidence, 'results.json'),
		JSON.stringify(
			{
				scope: 'Real SvelteKit BFF + HTTP mock backend; simulated YouTube only; no database',
				results,
				browserErrors: errors
			},
			null,
			2
		)
	);
	console.log(`Evidence: ${evidence}`);
	console.log(
		`${results.filter((r) => r.status === 'PASS').length} PASS, ${results.filter((r) => r.status === 'FAIL').length} FAIL`
	);
}
