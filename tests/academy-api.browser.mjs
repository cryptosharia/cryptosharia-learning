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
	const login = async (email) => {
		await page.goto(base + '/auth/login');
		await page.locator('#email').fill(email);
		await page.locator('form button[type="submit"]').click();
		await page.locator('#otpCode').fill(mock.state.mail.at(-1).code);
		await page.locator('form button[type="submit"]').click();
		await page.waitForURL(base + '/e-learning');
		await page.getByRole('button', { name: 'Keluar', exact: true }).first().waitFor();
	};
	await check('anonymous catalog and curriculum exclude private media', async () => {
		const res = await request.get(base + '/api/academy/catalog');
		assert.equal(res.status(), 200);
		assert.ok(!JSON.stringify(await res.json()).includes('synthetic01'));
		await page.goto(base + '/e-learning');
		await page.getByText('Pelajaran sintetis Package 3', { exact: true }).waitFor();
		assert.equal((await request.get(base + '/api/academy/me/grants')).status(), 401);
	});
	await check('API-mode root renders the public curriculum without CMS navigation', async () => {
		await page.goto(base + '/');
		await page.getByRole('heading', { name: 'Kurikulum Academy', exact: true }).waitFor();
		await page.getByText('Pelajaran sintetis Package 3', { exact: true }).waitFor();
		assert.equal(await page.getByRole('link', { name: 'CMS', exact: true }).count(), 0);
		await page.screenshot({ path: join(evidence, 'academy-root-api-mock.png'), fullPage: true });
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
	await check('authorized player loads and simulated playback saves position', async () => {
		await openLesson();
		await playerStatus('ready');
		await page.waitForFunction(() => window.__fakePlayers?.length > 0);
		await page.evaluate(() => window.__fakePlayers.at(-1).event(45, 2));
		await page.waitForFunction(
			async () =>
				(await fetch('/api/academy/me/progress').then((r) => r.json())).progress[0]
					?.positionSeconds === 45
		);
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
		await page
			.locator('[data-testid="completion-summary"]')
			.filter({ hasText: '1 dari 1 lesson selesai (100%)' })
			.waitFor();
		assert.equal(await page.getByRole('button', { name: 'Simpan profil' }).count(), 0);
		await page.screenshot({ path: join(evidence, 'dashboard-mock.png'), fullPage: true });
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
		await page.getByRole('button', { name: 'Keluar', exact: true }).first().click();
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
		await writeFile(join(evidence, 'failure.txt'), await page.locator('body').innerText());
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
