import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve, relative, isAbsolute } from 'node:path';
import { mkdir } from 'node:fs/promises';
import { setTimeout as delay } from 'node:timers/promises';
if (!process.env.ACADEMY_PLAYWRIGHT_MODULE)
	throw new Error('Set ACADEMY_PLAYWRIGHT_MODULE to an installed Playwright module.');
const { chromium } = await import(pathToFileURL(process.env.ACADEMY_PLAYWRIGHT_MODULE).href);
import { seed, password, claims, rulesDb } from './academy-fixtures.ts';
import { writeGrant, saveEditorial, transitionEditorial } from '../src/lib/academyData.ts';
import { Timestamp, doc, getDocFromServer } from 'firebase/firestore';
const fixture = await seed();
const adminUid = fixture.users['verified-admin'].uid;
const adminDb = rulesDb(fixture.environment.authenticatedContext(adminUid, claims));
const browser = await chromium.launch({
	headless: true,
	executablePath: process.env.ACADEMY_CHROME_EXECUTABLE
});
const secondBrowser = await chromium.launch({
	headless: true,
	executablePath:
		process.env.ACADEMY_SECOND_BROWSER_EXECUTABLE || process.env.ACADEMY_CHROME_EXECUTABLE
});
const base = 'http://localhost:5173';
let pass = 0;
const contexts = [];
const evidence = process.env.ACADEMY_BROWSER_EVIDENCE_DIR
	? resolve(process.env.ACADEMY_BROWSER_EVIDENCE_DIR)
	: await mkdtemp(join(tmpdir(), 'academy-learning-browser-'));
const evidenceRelative = relative(process.cwd(), evidence);
assert.ok(
	evidenceRelative === '..' ||
		evidenceRelative.startsWith('../') ||
		evidenceRelative.startsWith('..\\') ||
		isAbsolute(evidenceRelative),
	'Browser evidence must stay outside the repository'
);
await mkdir(evidence, { recursive: true });
async function session(engine = browser) {
	const context = await engine.newContext();
	contexts.push(context);
	const denied = [];
	const payloads = [];
	await context.route('**/*', async (route) => {
		const u = new URL(route.request().url());
		if (u.protocol === 'http:' && ['127.0.0.1', 'localhost'].includes(u.hostname))
			return route.continue();
		if (u.hostname === 'www.youtube.com' && u.pathname === '/iframe_api')
			return route.fulfill({
				status: 200,
				contentType: 'text/javascript',
				body: `
window.__fakePlayers=[];
window.YT={Player:class {
 constructor(frame,options){this.position=0;this.seeked=0;this.events=options.events;this.dead=false;window.__fakePlayers.push(this);setTimeout(()=>this.events.onReady(),0);}
 seekTo(p){this.position=p;this.seeked=p;} getCurrentTime(){return this.position;}
 event(p,state){this.position=p;this.events.onStateChange({data:state});}
 destroy(){this.dead=true;window.__lastDestroyed=this;}
}};window.onYouTubeIframeAPIReady();`
			});
		if (u.hostname === 'www.youtube-nocookie.com')
			return route.fulfill({
				status: 200,
				contentType: 'text/html',
				body: '<p>Synthetic media frame; playback not tested.</p>'
			});
		denied.push(u.origin);
		await route.abort();
	});
	const page = await context.newPage();
	page.on('response', async (response) => {
		if (response.url().includes(':8080')) {
			try {
				payloads.push(await response.text());
			} catch {
				// Long-lived channels can close during navigation; completed catalog RPCs are asserted below.
			}
		}
	});
	return { context, page, denied, payloads };
}
async function status(page, value) {
	await page.bringToFront();
	await page.locator('[data-testid="access-status"]').filter({ hasText: '' }).waitFor();
	await page.waitForFunction(
		(expected) =>
			document.querySelector('[data-testid="access-status"]')?.getAttribute('data-status') ===
			expected,
		value,
		{ timeout: 15000 }
	);
	if (value === 'ready') await page.locator('iframe').waitFor({ timeout: 15000 });
	assert.equal(await page.locator('iframe').count(), value === 'ready' ? 1 : 0);
}
async function login(page, role) {
	await page.goto(base + '/auth/login');
	await page.waitForFunction(
		async () => !(await import('/src/lib/auth.svelte.ts')).userAuth.loading
	);
	await page.locator('#email').fill(fixture.users[role].email);
	await page.locator('#password').fill(password);
	await page.locator('form button[type="submit"]').click();
	await page.waitForURL(base + '/', { timeout: 15000 });
}
async function sdk(page, operation, args) {
	return page.evaluate(
		async ({ operation, args }) => {
			const client = await import('/src/lib/firebase.ts');
			const data = await import('/src/lib/academyData.ts');
			const source = await fetch('/src/lib/firebaseClient.ts').then((r) => r.text());
			const fs = await import(source.match(/from\s+["']([^"']+firebase_firestore[^"']+)["']/)[1]);
			const au = await import(source.match(/from\s+["']([^"']+firebase_auth[^"']+)["']/)[1]);
			if (operation === 'logout') return au.signOut(client.auth);
			if (operation === 'login')
				return au
					.signInWithEmailAndPassword(client.auth, args.email, args.password)
					.then(() => true);
			if (operation === 'private') {
				const lite = await import(
					source.match(/from\s+["']([^"']+firebase_firestore_lite[^"']+)["']/)[1]
				);
				try {
					await lite.getDoc(lite.doc(client.lessonDb, 'academy_lessons', args.id));
					return 'allowed';
				} catch (e) {
					return e.code;
				}
			}
			if (operation === 'forge') {
				try {
					await fs.setDoc(
						fs.doc(client.db, 'users', client.auth.currentUser.uid),
						{ role: 'admin', subscriptionStatus: 'active' },
						{ merge: true }
					);
					return 'allowed';
				} catch (e) {
					return e.code;
				}
			}
			if (operation === 'catalog') {
				const catalog = await data.readCatalog(client.db);
				const lite = await import(
					source.match(/from\s+["']([^"']+firebase_firestore_lite[^"']+)["']/)[1]
				);
				// Capture a completed RPC for the same catalog documents; streaming channels may remain open.
				const snap = await lite.getDocs(
					lite.query(
						lite.collection(client.lessonDb, 'academy_catalog'),
						lite.where('status', '==', 'published'),
						lite.where('kind', '==', 'lesson')
					)
				);
				if (snap.size !== catalog.length) throw new Error('Catalog transports disagree.');
				return catalog;
			}
			if (operation === 'progress') {
				const progress = await import('/src/lib/academyProgress.ts');
				return (
					await progress.freshProgress(client.lessonDb, args.uid ?? client.auth.currentUser.uid)
				).map((p) => ({
					lessonId: p.lessonId,
					positionSeconds: p.positionSeconds,
					version: p.version
				}));
			}
			if (operation === 'completions') {
				const progress = await import('/src/lib/academyProgress.ts');
				return (
					await progress.freshCompletions(client.lessonDb, args.uid ?? client.auth.currentUser.uid)
				).map((c) => ({
					lessonId: c.lessonId,
					version: c.version,
					completedAt: c.completedAt.toMillis()
				}));
			}
			if (operation === 'complete' || operation === 'writeCompletion') {
				try {
					const lesson = (await data.readCatalog(client.db)).find((l) => l.id === args.id);
					if (operation === 'complete')
						await data.completeLesson(client.db, args.uid ?? client.auth.currentUser.uid, lesson);
					else {
						const lite = await import(
							source.match(/from\s+["']([^"']+firebase_firestore_lite[^"']+)["']/)[1]
						);
						await lite.setDoc(
							lite.doc(
								client.lessonDb,
								'academy_completion',
								args.uid ?? client.auth.currentUser.uid,
								'lessons',
								args.id
							),
							{
								lessonId: args.id,
								version: lesson.version,
								completedAt: lite.serverTimestamp()
							}
						);
					}
					return 'allowed';
				} catch (e) {
					return e.code;
				}
			}
			if (operation === 'writeProgress') {
				try {
					await data.saveProgress(
						client.db,
						client.auth.currentUser.uid,
						(await data.readCatalog(client.db)).find((l) => l.id === args.id),
						args.position
					);
					return 'allowed';
				} catch (e) {
					return e.code;
				}
			}
			if (operation === 'offline') return fs.disableNetwork(client.db);
			if (operation === 'online') return fs.enableNetwork(client.db);
			if (operation === 'navigate') {
				const navigation =
					await import('/node_modules/@sveltejs/kit/src/runtime/app/navigation.js');
				await navigation.goto(args.path);
			}
		},
		{ operation, args }
	);
}
try {
	const guest = await session();
	await guest.page.goto(base + '/e-learning');
	await guest.page.getByRole('link', { name: 'Synthetic lesson-a1', exact: true }).waitFor();
	assert(!(await guest.page.getByText('Synthetic draft-only', { exact: true }).count()));
	const catalog = await sdk(guest.page, 'catalog', {});
	for (
		let i = 0;
		i < 100 && !guest.payloads.some((body) => body.includes('Synthetic lesson-a1'));
		i++
	)
		await delay(50);
	assert(
		guest.payloads.some((body) => body.includes('Synthetic lesson-a1')),
		'Must capture an actual catalog network response'
	);
	assert.equal(catalog.length, 3);
	assert(!JSON.stringify(catalog).includes('AAAAAAAAAAA'));
	await guest.page.goto(base + '/e-learning/scope-a');
	await status(guest.page, 'unauthorized');
	assert.equal(await sdk(guest.page, 'private', { id: 'lesson-a1' }), 'permission-denied');
	assert(!guest.payloads.join('').includes('AAAAAAAAAAA'));
	console.log('PASS guest: actual catalog/network/private direct read');
	pass++;
	for (const role of ['no-grant', 'expired', 'revoked']) {
		const s = await session();
		await login(s.page, role);
		await s.page.goto(base + '/e-learning/scope-a');
		await status(s.page, role === 'no-grant' ? 'unauthorized' : role);
		assert.equal(await sdk(s.page, 'private', { id: 'lesson-a1' }), 'permission-denied');
		assert.equal(await sdk(s.page, 'forge', {}), 'permission-denied');
		await s.page.reload();
		await status(s.page, role === 'no-grant' ? 'unauthorized' : role);
		await s.page.goto(base + '/admin/courses');
		await s.page.getByText('Akses pengelolaan ditolak.').waitFor();
		console.log('PASS ' + role + ': UI login/denial/reload/SDK forge/CMS');
		pass++;
	}
	const a = await session();
	await login(a.page, 'active');
	await a.page.goto(base + '/e-learning/scope-a');
	await status(a.page, 'ready');
	assert.equal(
		new URL(await a.page.locator('iframe').getAttribute('src')).pathname,
		'/embed/AAAAAAAAAAA'
	);
	await a.page.getByRole('button', { name: 'Synthetic lesson-a2', exact: true }).click();
	await status(a.page, 'ready');
	await a.page.waitForFunction(() => window.__fakePlayers?.some((p) => !p.dead));
	await a.page.evaluate(() => window.__fakePlayers.findLast((p) => !p.dead).event(42, 2));
	await a.page.getByText('Posisi belajar tersimpan.', { exact: true }).waitFor();
	assert.equal(
		(await sdk(a.page, 'progress', {})).find((p) => p.lessonId === 'lesson-a2').positionSeconds,
		42
	);
	assert.equal(await sdk(a.page, 'private', { id: 'lesson-b1' }), 'permission-denied');
	await a.page.goto(base + '/e-learning/scope-b');
	await status(a.page, 'unauthorized');
	await a.page.goto(base + '/e-learning/scope-a');
	await status(a.page, 'ready');
	console.log('PASS active: navigation/progress/out-of-scope');
	pass++;
	await sdk(a.page, 'navigate', { path: '/e-learning/scope-b' });
	await status(a.page, 'unauthorized');
	await sdk(a.page, 'navigate', { path: '/e-learning/scope-a' });
	await status(a.page, 'ready');
	console.log('PASS SPA route parameter changes clear prior scope and validate the new one');
	pass++;
	const tab2 = await a.context.newPage();
	await tab2.goto(base + '/e-learning/scope-a');
	await status(tab2, 'ready');
	await sdk(a.page, 'logout', {});
	await status(a.page, 'unauthorized');
	await status(tab2, 'unauthorized');
	await a.page.reload();
	await status(a.page, 'unauthorized');
	console.log('PASS logout across two tabs and reload');
	pass++;
	await sdk(a.page, 'login', { ...fixture.users.active, password });
	await status(a.page, 'ready');
	await sdk(a.page, 'login', { ...fixture.users['no-grant'], password });
	await status(a.page, 'unauthorized');
	await status(tab2, 'unauthorized');
	assert.equal(await sdk(a.page, 'private', { id: 'lesson-a1' }), 'permission-denied');
	console.log('PASS account switch across tabs and fresh backend read');
	pass++;
	await sdk(a.page, 'login', { ...fixture.users.active, password });
	await status(a.page, 'ready');
	const b = await session(secondBrowser);
	await login(b.page, 'active');
	await b.page.goto(base + '/e-learning/scope-a');
	await status(b.page, 'ready');
	await writeGrant(
		adminDb,
		adminUid,
		fixture.users.active.uid,
		'scope-a',
		'revoked',
		Timestamp.fromMillis(Date.now() - 1000),
		Timestamp.fromMillis(Date.now() + 300000)
	);
	await status(a.page, 'revoked');
	await status(b.page, 'revoked');
	assert.equal(await sdk(a.page, 'private', { id: 'lesson-a1' }), 'permission-denied');
	await a.page.reload();
	await status(a.page, 'revoked');
	console.log('PASS revoke while open in separate browser sessions; stale cache/reload denied');
	pass++;
	await writeGrant(
		adminDb,
		adminUid,
		fixture.users.active.uid,
		'scope-a',
		'active',
		Timestamp.fromMillis(Date.now() - 1000),
		Timestamp.fromMillis(Date.now() + 4500)
	);
	await a.page.getByRole('button', { name: 'Periksa akses kembali' }).click();
	await status(a.page, 'ready');
	await status(a.page, 'expired');
	assert.equal(await sdk(a.page, 'private', { id: 'lesson-a1' }), 'permission-denied');
	console.log('PASS session expiry and server-time denial');
	pass++;
	await writeGrant(
		adminDb,
		adminUid,
		fixture.users.active.uid,
		'scope-a',
		'active',
		Timestamp.fromMillis(Date.now() - 1000),
		Timestamp.fromMillis(Date.now() + 300000)
	);
	await a.page.getByRole('button', { name: 'Periksa akses kembali' }).click();
	await status(a.page, 'ready');
	await sdk(a.page, 'offline', {});
	await status(a.page, 'backend-unavailable');
	await sdk(a.page, 'online', {});
	await status(a.page, 'ready');
	console.log('PASS Firestore offline and reconnect');
	pass++;
	await a.context.setOffline(true);
	await status(a.page, 'backend-unavailable');
	await delay(2500);
	assert.equal(await a.page.locator('iframe').count(), 0);
	await a.context.setOffline(false);
	await status(a.page, 'ready');
	console.log('PASS sustained browser offline closes content; online performs fresh validation');
	pass++;
	const race = await session();
	await login(race.page, 'active');
	await race.page.goto(base + '/e-learning/scope-a');
	await status(race.page, 'ready');
	let release;
	let captured = false;
	let capturing = false;
	const pending = new Promise((resolve) => {
		release = resolve;
	});
	await race.page.route('**/*', async (route) => {
		if (!capturing && route.request().postData()?.includes('academy_lessons/lesson-a2')) {
			capturing = true;
			const response = await route.fetch();
			assert.equal(response.status(), 200);
			assert((await response.text()).includes('AAAAAAAAAAA'));
			captured = true;
			await pending;
			await route.fulfill({ response });
		} else await route.fallback();
	});
	await race.page.getByRole('button', { name: 'Synthetic lesson-a2', exact: true }).click();
	assert.equal(
		await race.page
			.getByRole('button', { name: 'Synthetic lesson-a2', exact: true })
			.getAttribute('aria-pressed'),
		'true'
	);
	for (let i = 0; i < 100 && !captured; i++) await delay(50);
	assert(captured, 'Must actually intercept a private SDK RPC');
	await sdk(race.page, 'login', { ...fixture.users['no-grant'], password });
	assert.equal(await race.page.locator('iframe').count(), 0);
	release();
	await status(race.page, 'unauthorized');
	await delay(500);
	assert.equal(await race.page.locator('iframe').count(), 0);
	await race.page.unroute('**/*');
	console.log('PASS delayed private response after UID switch cannot restore player');
	pass++;
	await writeGrant(
		adminDb,
		adminUid,
		fixture.users.expired.uid,
		'scope-a',
		'active',
		Timestamp.fromMillis(Date.now() - 172800000),
		Timestamp.fromMillis(Date.now() - 1000)
	);
	const forged = await session();
	await forged.context.addInitScript(() => {
		Date.now = () => new Date().getTime() - 86400000;
		localStorage.setItem(
			'academy-grant',
			JSON.stringify({ state: 'active', videoId: 'AAAAAAAAAAA' })
		);
	});
	await login(forged.page, 'expired');
	await forged.page.goto(base + '/e-learning/scope-a');
	await status(forged.page, 'unpublished');
	assert.equal(await sdk(forged.page, 'private', { id: 'lesson-a1' }), 'permission-denied');
	await forged.page.reload();
	await status(forged.page, 'unpublished');
	console.log('PASS forged browser clock and persisted grant cannot bypass backend');
	pass++;
	await guest.page.goto(base + '/e-learning/unknown-scope');
	await status(guest.page, 'not-found');
	console.log('PASS missing public scope has explicit not-found state');
	pass++;
	const management = await session();
	await login(management.page, 'verified-admin');
	await management.page.goto(base + '/admin/courses');
	await management.page.getByRole('heading', { name: 'Grant sintetis per scope' }).waitFor();
	assert(await management.page.getByText('Synthetic draft-only', { exact: true }).count());
	await management.page.getByLabel('Judul', { exact: true }).fill('Browser synthetic draft');
	await management.page.getByLabel('Scope ID', { exact: true }).first().fill('scope-b');
	await management.page.getByLabel('Parent kurikulum', { exact: true }).selectOption('chapter-b');
	await management.page.getByLabel('Urutan', { exact: true }).fill('3');
	await management.page.getByLabel('Bidang', { exact: true }).fill('Synthetic subject');
	await management.page.getByLabel('Bab', { exact: true }).fill('Synthetic chapter');
	await management.page
		.getByLabel('Pemateri disetujui', { exact: true })
		.fill('Synthetic approved instructor');
	await management.page
		.getByLabel('Tautan video', { exact: true })
		.fill('https://youtube.com.evil.example/watch?v=CCCCCCCCCCC');
	await management.page.getByRole('button', { name: 'Simpan draft', exact: true }).click();
	await management.page.getByText('Tautan YouTube tidak valid.', { exact: true }).waitFor();
	assert.equal(
		await management.page.getByText('Browser synthetic draft', { exact: true }).count(),
		0
	);
	console.log('PASS invalid media URL rejects before editorial mutation');
	pass++;
	await management.page
		.getByLabel('Tautan video', { exact: true })
		.fill('https://youtu.be/CCCCCCCCCCC');
	await management.page.getByRole('button', { name: 'Simpan draft', exact: true }).click();
	await management.page.getByText('Browser synthetic draft', { exact: true }).waitFor();
	const item = management.page.locator('li').filter({ hasText: 'Browser synthetic draft' });
	await item.getByRole('button', { name: 'Ajukan review' }).click();
	await item.getByRole('button', { name: 'Setujui rights dan review' }).click();
	await item.getByRole('button', { name: 'Terbitkan versi disetujui' }).click();
	await item.getByText('published · versi 1').waitFor();
	await management.page.getByLabel('UID peserta').fill(fixture.users['no-grant'].uid);
	await management.page.getByLabel('Scope ID', { exact: true }).last().fill('scope-b');
	await management.page.getByRole('button', { name: 'Berikan grant', exact: true }).click();
	await management.page.getByText('Perubahan tersimpan.').waitFor();
	const ng = await session();
	await login(ng.page, 'no-grant');
	await ng.page.goto(base + '/e-learning/scope-b');
	await status(ng.page, 'ready');
	await management.page.getByRole('button', { name: 'Cabut grant', exact: true }).click();
	await status(ng.page, 'revoked');
	console.log('PASS verified-admin: UI CMS review/publish/grant/revoke with real SDK');
	pass++;
	// Phase 1C: actual data persistence and adapter events, with no YouTube egress.
	await writeGrant(
		adminDb,
		adminUid,
		fixture.users.active.uid,
		'scope-a',
		'active',
		Timestamp.fromMillis(Date.now() - 1000),
		Timestamp.fromMillis(Date.now() + 300000)
	);
	const learner = await session();
	await login(learner.page, 'active');
	await learner.page.goto(base + '/e-learning');
	await learner.page.getByRole('heading', { name: 'Analisis Fundamental', exact: true }).waitFor();
	assert.equal(await learner.page.locator('article').count(), 4);
	assert.equal(await learner.page.locator('details').count(), 24);
	await learner.page.getByText('Bab 1 · Synthetic chapter', { exact: true }).first().waitFor();
	assert.equal(await learner.page.getByText('Synthetic draft-only', { exact: true }).count(), 0);
	console.log(
		'PASS hierarchy: four subjects, six planned levels, chapters and published lessons only'
	);
	pass++;
	await learner.page.getByRole('link', { name: 'Synthetic lesson-a1', exact: true }).click();
	await status(learner.page, 'ready');
	await learner.page.getByRole('button', { name: 'Pelajaran berikutnya', exact: true }).click();
	await status(learner.page, 'ready');
	assert.equal(new URL(learner.page.url()).searchParams.get('lesson'), 'lesson-a2');
	await learner.page.reload();
	await status(learner.page, 'ready');
	assert.equal(
		await learner.page
			.getByRole('button', { name: 'Synthetic lesson-a2', exact: true })
			.getAttribute('aria-pressed'),
		'true'
	);
	console.log('PASS selected lesson URL survives reload after next navigation');
	pass++;
	assert.equal(
		await learner.page
			.getByRole('button', { name: 'Synthetic lesson-a2', exact: true })
			.getAttribute('aria-pressed'),
		'true'
	);
	await learner.page.getByRole('button', { name: 'Pelajaran sebelumnya', exact: true }).click();
	await status(learner.page, 'ready');
	assert.equal(
		await learner.page
			.getByRole('button', { name: 'Synthetic lesson-a1', exact: true })
			.getAttribute('aria-pressed'),
		'true'
	);
	console.log('PASS ordered previous and next lesson navigation');
	pass++;
	await learner.page.waitForFunction(() => window.__fakePlayers?.some((p) => !p.dead));
	await learner.page.evaluate(() => window.__fakePlayers.findLast((p) => !p.dead).event(57, 2));
	await learner.page.getByText('Posisi belajar tersimpan.', { exact: true }).waitFor();
	assert.equal(
		(await sdk(learner.page, 'progress', {})).find((p) => p.lessonId === 'lesson-a1')
			.positionSeconds,
		57
	);
	console.log('PASS actual nonzero event persists through protected SDK');
	pass++;
	await learner.page
		.locator('[data-testid="completion-status"]')
		.getByText('Belum ditandai selesai.', { exact: true })
		.waitFor();
	await learner.page.evaluate(() => window.__fakePlayers.findLast((p) => !p.dead).event(57, 0));
	assert.equal((await sdk(learner.page, 'completions', {})).length, 0);
	await learner.page.getByRole('button', { name: 'Tandai Selesai', exact: true }).click();
	await learner.page
		.locator('[data-testid="completion-status"]')
		.getByText('Selesai', { exact: true })
		.waitFor();
	assert.equal(
		await learner.page.getByRole('button', { name: 'Selesai', exact: true }).isDisabled(),
		true
	);
	const firstCompletion = await sdk(learner.page, 'completions', {});
	assert.equal(firstCompletion.length, 1);
	assert.equal(await sdk(learner.page, 'complete', { id: 'lesson-a1' }), 'allowed');
	assert.deepEqual(await sdk(learner.page, 'completions', {}), firstCompletion);
	assert.equal(
		(await sdk(learner.page, 'progress', {})).find((p) => p.lessonId === 'lesson-a1')
			.positionSeconds,
		57
	);
	console.log(
		'PASS explicit completion persists once, preserves position and never follows video end automatically'
	);
	pass++;
	await learner.page.getByRole('button', { name: 'Pelajaran berikutnya', exact: true }).click();
	await status(learner.page, 'ready');
	await learner.page
		.locator('[data-testid="completion-status"]')
		.getByText('Belum ditandai selesai.', { exact: true })
		.waitFor();
	await learner.page.getByRole('button', { name: 'Pelajaran sebelumnya', exact: true }).click();
	await status(learner.page, 'ready');
	await learner.page
		.locator('[data-testid="completion-status"]')
		.getByText('Selesai', { exact: true })
		.waitFor();
	console.log('PASS lesson switches clear prior completion and restore the correct lesson status');
	pass++;
	await learner.page.reload();
	await status(learner.page, 'ready');
	await learner.page
		.locator('[data-testid="completion-status"]')
		.getByText('Selesai', { exact: true })
		.waitFor();
	await learner.page.waitForFunction(() =>
		window.__fakePlayers?.some((p) => !p.dead && p.seeked === 57)
	);
	console.log('PASS reload seeks to database position');
	pass++;
	await learner.page.screenshot({ path: evidence + '/player-desktop.png', fullPage: true });
	const resume = await session(secondBrowser);
	await login(resume.page, 'active');
	await resume.page.goto(base + '/e-learning/scope-a');
	await status(resume.page, 'ready');
	await resume.page.waitForFunction(() =>
		window.__fakePlayers?.some((p) => !p.dead && p.seeked === 57)
	);
	assert.equal(
		await resume.page
			.getByRole('button', { name: 'Synthetic lesson-a1', exact: true })
			.getAttribute('aria-pressed'),
		'true'
	);
	console.log('PASS second browser resumes last scoped lesson and stored position');
	pass++;
	await learner.page.goto(base + '/profile');
	await learner.page
		.locator('[data-testid="completion-summary"]')
		.getByText('1 dari 2 lesson selesai (50%)', { exact: true })
		.waitFor();
	await learner.page.reload();
	await learner.page
		.locator('[data-testid="completion-summary"]')
		.getByText('1 dari 2 lesson selesai (50%)', { exact: true })
		.waitFor();
	await learner.page.goto(base + '/e-learning');
	await learner.page
		.locator('[data-testid="catalog-completed"]')
		.getByText('Selesai', { exact: true })
		.waitFor();
	await learner.page.getByRole('link', { name: 'Synthetic lesson-a1', exact: true }).click();
	await status(learner.page, 'ready');
	await learner.page
		.locator('[data-testid="completion-status"]')
		.getByText('Selesai', { exact: true })
		.waitFor();
	await learner.page.waitForFunction(() =>
		window.__fakePlayers?.some((p) => !p.dead && p.seeked === 57)
	);
	console.log(
		'PASS completion survives dashboard reload and catalog return alongside video resume'
	);
	pass++;
	await learner.page.goto(base + '/profile');
	await learner.page
		.locator('[data-testid="learning-dashboard"]')
		.getByText('Posisi belajar terakhir: 57 detik', { exact: true })
		.waitFor();
	const dashboardTab = await learner.context.newPage();
	await dashboardTab.goto(base + '/profile');
	await dashboardTab
		.locator('[data-testid="learning-dashboard"]')
		.getByText('Posisi belajar terakhir: 57 detik', { exact: true })
		.waitFor();
	await dashboardTab.screenshot({ path: evidence + '/dashboard-desktop.png', fullPage: true });
	await sdk(learner.page, 'login', { ...fixture.users['no-grant'], password });
	for (const page of [learner.page, dashboardTab]) {
		await page
			.locator('[data-testid="completion-summary"]')
			.getByText('0 dari 0 lesson selesai (0%)', { exact: true })
			.waitFor();
		await page
			.locator('[data-testid="learning-dashboard"]')
			.getByText('Posisi belajar terakhir: 10 detik', { exact: true })
			.waitFor();
		assert.equal(
			await page.getByText('Posisi belajar terakhir: 57 detik', { exact: true }).count(),
			0
		);
	}
	console.log('PASS dashboard and second tab clear A progress on account switch');
	pass++;
	assert.equal(
		await sdk(learner.page, 'writeCompletion', { id: 'lesson-a2', uid: fixture.users.active.uid }),
		'permission-denied'
	);
	await learner.page.goto(base + '/e-learning');
	await learner.page.getByRole('link', { name: 'Synthetic lesson-a1', exact: true }).waitFor();
	assert.equal(await learner.page.locator('[data-testid="catalog-completed"]').count(), 0);
	console.log('PASS completion is isolated across accounts and cross-user writes deny');
	pass++;
	const stale = await session();
	await login(stale.page, 'active');
	let releaseHistory,
		heldHistory = false,
		holdingHistory = false;
	const held = new Promise((resolve) => {
		releaseHistory = resolve;
	});
	await stale.page.route('**/*', async (route) => {
		if (
			!holdingHistory &&
			route
				.request()
				.url()
				.includes('/academy_progress/' + fixture.users.active.uid) &&
			route.request().method() === 'POST'
		) {
			holdingHistory = true;
			const response = await route.fetch();
			assert.equal(response.status(), 200);
			const body = await response.text();
			assert(body.includes('positionSeconds') && body.includes('57'));
			heldHistory = true;
			await held;
			await route.fulfill({ response });
		} else await route.fallback();
	});
	await stale.page.goto(base + '/profile');
	for (let i = 0; i < 100 && !heldHistory; i++) await delay(50);
	assert(heldHistory, 'Must hold an actual authorized progress response');
	await sdk(stale.page, 'login', { ...fixture.users['no-grant'], password });
	await stale.page
		.locator('[data-testid="learning-dashboard"]')
		.getByText('Posisi belajar terakhir: 10 detik', { exact: true })
		.waitFor();
	releaseHistory();
	await delay(500);
	assert.equal(
		await stale.page.getByText('Posisi belajar terakhir: 57 detik', { exact: true }).count(),
		0
	);
	await stale.page.unroute('**/*');
	console.log('PASS delayed progress response from account A cannot repopulate B dashboard');
	pass++;
	await resume.page.bringToFront();
	await status(resume.page, 'ready');
	await resume.page.waitForFunction(() => window.__fakePlayers?.some((p) => !p.dead));
	await resume.page.evaluate(() => window.__fakePlayers.findLast((p) => !p.dead).event(75, 1));
	for (let i = 0; i < 100; i++) {
		if (
			(await sdk(resume.page, 'progress', {})).find((p) => p.lessonId === 'lesson-a1')
				?.positionSeconds === 75
		)
			break;
		await delay(50);
	}
	const before = await sdk(resume.page, 'progress', {});
	assert.equal(before.find((p) => p.lessonId === 'lesson-a1').positionSeconds, 75);
	console.log('PASS PLAYING timer persists actual nonzero position before revoke');
	pass++;
	await writeGrant(
		adminDb,
		adminUid,
		fixture.users.active.uid,
		'scope-a',
		'revoked',
		Timestamp.fromMillis(Date.now() - 1000),
		Timestamp.fromMillis(Date.now() + 300000)
	);
	await status(resume.page, 'revoked');
	assert.equal(await resume.page.locator('[data-testid="lesson-completion"]').count(), 0);
	assert.equal(await sdk(resume.page, 'writeCompletion', { id: 'lesson-a2' }), 'permission-denied');
	assert.deepEqual(await sdk(resume.page, 'completions', {}), firstCompletion);
	await resume.page.evaluate(() => window.__lastDestroyed.event(99, 2));
	await delay(3500);
	assert.deepEqual(await sdk(resume.page, 'progress', {}), before);
	assert.equal(
		await sdk(resume.page, 'writeProgress', { id: 'lesson-a1', position: 99 }),
		'permission-denied'
	);
	console.log('PASS revoke destroys adapter, cancels samples and backend denies new progress');
	pass++;
	await resume.page.goto(base + '/profile');
	await resume.page
		.locator('[data-testid="completion-summary"]')
		.getByText('0 dari 0 lesson selesai (0%)', { exact: true })
		.waitFor();
	console.log(
		'PASS revoked access removes completion action and active denominator without deleting history'
	);
	pass++;
	await management.page.bringToFront();
	await item.getByRole('button', { name: 'Edit', exact: true }).click();
	await management.page.getByLabel('Judul', { exact: true }).fill('Browser revised draft');
	await management.page.getByRole('button', { name: 'Simpan draft', exact: true }).click();
	const revised = management.page.locator('li').filter({ hasText: 'Browser revised draft' });
	await revised.getByText('draft · versi 2').waitFor();
	assert.equal(await revised.getByRole('button', { name: 'Terbitkan versi disetujui' }).count(), 0);
	await guest.page.goto(base + '/e-learning');
	await guest.page.getByRole('link', { name: 'Synthetic lesson-a1', exact: true }).waitFor();
	assert.equal(
		await guest.page.getByRole('link', { name: 'Browser synthetic draft', exact: true }).count(),
		0
	);
	assert.equal(await guest.page.getByText('Browser revised draft', { exact: true }).count(), 0);
	console.log('PASS edit withdraws published lesson and old approval cannot publish version two');
	pass++;
	await guest.page.setViewportSize({ width: 360, height: 800 });
	assert(
		await guest.page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)
	);
	await guest.page.getByRole('link', { name: 'Synthetic lesson-a1', exact: true }).focus();
	assert.equal(
		await guest.page
			.getByRole('link', { name: 'Synthetic lesson-a1', exact: true })
			.evaluate((el) => document.activeElement === el),
		true
	);
	console.log('PASS mobile catalog does not overflow and lesson links receive keyboard focus');
	pass++;
	await guest.page.screenshot({ path: evidence + '/catalog-360.png' });
	await learner.page.goto(base + '/e-learning/scope-a');
	await status(learner.page, 'unauthorized');
	assert.equal(await learner.page.locator('[data-testid="progress-status"]').count(), 0);
	console.log('PASS no-grant history cannot instantiate playback or progress adapter');
	pass++;
	for (const kind of ['subject', 'level', 'chapter']) {
		await management.page.getByRole('button', { name: 'Draft baru', exact: true }).click();
		await management.page.getByLabel('Jenis kurikulum', { exact: true }).selectOption(kind);
		if (kind === 'subject')
			await management.page
				.getByLabel('Identitas bidang', { exact: true })
				.selectOption('muamalah');
		else {
			const parent =
				kind === 'level'
					? 'muamalah'
					: await management.page
							.locator('#curriculum-parent option')
							.filter({ hasText: 'Synthetic CMS level' })
							.getAttribute('value');
			await management.page.getByLabel('Parent kurikulum', { exact: true }).selectOption(parent);
		}
		await management.page.getByLabel('Judul', { exact: true }).fill('Synthetic CMS ' + kind);
		await management.page
			.getByLabel('Scope ID', { exact: true })
			.first()
			.fill('synthetic-node-scope');
		await management.page.getByLabel('Bidang', { exact: true }).fill('Fikih Muamalah');
		await management.page.getByLabel('Bab', { exact: true }).fill('Synthetic CMS chapter');
		await management.page.getByLabel('Level', { exact: true }).fill('2');
		await management.page
			.getByLabel('Urutan', { exact: true })
			.fill(kind === 'chapter' ? '1' : '2');
		await management.page.getByRole('button', { name: 'Simpan draft', exact: true }).click();
		const node = management.page.locator('li').filter({ hasText: 'Synthetic CMS ' + kind });
		await node.getByRole('button', { name: 'Ajukan review' }).click();
		await node.getByRole('button', { name: 'Setujui rights dan review' }).click();
		await node.getByRole('button', { name: 'Terbitkan versi disetujui' }).click();
		await node.getByText('published · versi 1', { exact: true }).waitFor();
		console.log('PASS CMS ' + kind + ' uses protected reviewed publishing');
		pass++;
	}
	// A new published version invalidates old completion, independently of resume history.
	await writeGrant(
		adminDb,
		adminUid,
		fixture.users.active.uid,
		'scope-a',
		'active',
		Timestamp.fromMillis(Date.now() - 1000),
		Timestamp.fromMillis(Date.now() + 300000)
	);
	const oldLesson = (await getDocFromServer(doc(adminDb, 'academy_editorial', 'lesson-a1'))).data();
	await saveEditorial(
		adminDb,
		adminUid,
		{
			metadata: oldLesson.metadata,
			media: oldLesson.media,
			syariahRequired: oldLesson.syariahRequired
		},
		1
	);
	for (const state of ['review', 'approved', 'published'])
		await transitionEditorial(adminDb, adminUid, 'lesson-a1', 2, state);
	const revisedLearner = await session();
	await login(revisedLearner.page, 'active');
	await revisedLearner.page.goto(base + '/profile');
	await revisedLearner.page
		.locator('[data-testid="completion-summary"]')
		.getByText('0 dari 2 lesson selesai (0%)', { exact: true })
		.waitFor();
	assert.equal(
		(await sdk(revisedLearner.page, 'progress', {})).find((p) => p.lessonId === 'lesson-a1')
			.positionSeconds,
		75
	);
	await revisedLearner.page.goto(base + '/e-learning/scope-a?lesson=lesson-a1');
	await status(revisedLearner.page, 'ready');
	await revisedLearner.page
		.locator('[data-testid="completion-status"]')
		.getByText('Belum ditandai selesai.', { exact: true })
		.waitFor();
	await revisedLearner.page.waitForFunction(() =>
		window.__fakePlayers?.some((p) => !p.dead && p.seeked === 0)
	);
	console.log(
		'PASS republished version excludes stale completion and preserves historical resume document'
	);
	pass++;
	let deniedCompletion = false;
	const denyCompletion = async (route) => {
		if (
			route.request().postData()?.includes('academy_completion') &&
			/commit/i.test(route.request().url())
		) {
			deniedCompletion = true;
			await route.fulfill({
				status: 403,
				contentType: 'application/json',
				body: JSON.stringify({
					error: { code: 403, status: 'PERMISSION_DENIED', message: 'Synthetic completion denial' }
				})
			});
		} else await route.fallback();
	};
	await revisedLearner.page.route('**/*', denyCompletion);
	await revisedLearner.page.getByRole('button', { name: 'Tandai Selesai', exact: true }).click();
	await revisedLearner.page
		.getByRole('alert')
		.getByText('Penyelesaian belum tersimpan.', { exact: false })
		.waitFor();
	assert(deniedCompletion);
	assert.equal((await sdk(revisedLearner.page, 'completions', {}))[0].version, 1);
	await revisedLearner.page.unroute('**/*', denyCompletion);
	await revisedLearner.page
		.getByRole('button', { name: 'Periksa status kembali', exact: true })
		.click();
	await revisedLearner.page.getByRole('button', { name: 'Tandai Selesai', exact: true }).click();
	await revisedLearner.page
		.locator('[data-testid="completion-status"]')
		.getByText('Selesai', { exact: true })
		.waitFor();
	assert.equal((await sdk(revisedLearner.page, 'completions', {}))[0].version, 2);
	await revisedLearner.page.goto(base + '/profile');
	await revisedLearner.page
		.locator('[data-testid="completion-summary"]')
		.getByText('1 dari 2 lesson selesai (50%)', { exact: true })
		.waitFor();
	console.log(
		'PASS failed completion reports failure without optimistic success; retry completes current version'
	);
	pass++;
	await revisedLearner.page.goto(base + '/e-learning/scope-a?lesson=lesson-a2');
	await status(revisedLearner.page, 'ready');
	await revisedLearner.page.getByRole('button', { name: 'Tandai Selesai', exact: true }).click();
	await revisedLearner.page
		.locator('[data-testid="completion-status"]')
		.getByText('Selesai', { exact: true })
		.waitFor();
	await revisedLearner.page.goto(base + '/profile');
	await revisedLearner.page
		.locator('[data-testid="completion-summary"]')
		.getByText('2 dari 2 lesson selesai (100%)', { exact: true })
		.waitFor();
	console.log('PASS completion needs no playback event and all eligible lessons aggregate to 100%');
	pass++;
	console.log(
		JSON.stringify({
			pass,
			fail: 0,
			externalPlayback: 'NOT VERIFIED',
			browsers: [browser.version(), secondBrowser.version()],
			egress: 'Only loopback requests continued; YouTube frame intercepted with synthetic HTML'
		})
	);
} catch (error) {
	console.log('Last UI', await contexts.at(-1)?.pages().at(-1)?.locator('body').innerText());
	throw error;
} finally {
	for (const context of contexts) await context.close();
	await browser.close();
	await secondBrowser.close();
	await fixture.environment.cleanup();
}
