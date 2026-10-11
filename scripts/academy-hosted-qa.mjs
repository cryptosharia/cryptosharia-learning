import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { createInterface } from 'node:readline/promises';

// Operator-assisted REAL provider QA; never invoked by CI or the local fake-video suite.
// The private authorization record is evidence to review, not authority supplied by a web page.
const steps = [
	'Guest/no-grant: verify denied private lesson, no iframe; log in with approved synthetic scoped participant through UI.',
	'Play approved final video manually. Verify visible picture and audible sound, then pause after >20 seconds.',
	'Seek forward and backward; pause; inspect actual staging own progress/version/server timestamp without exporting tokens.',
	'Reload: compare seek/resume against staging record. Repeat in independent browser/account, verify no cross-user history.',
	'Enable available captions; verify language/accuracy and record missing captions as BLOCKED. Test fullscreen and real mobile inline/orientation.',
	'Play to ended; verify last position but no completion/certificate. Test autoplay-blocked with browser policy.',
	'Owner revokes synthetic grant in a separate authorized session: iframe closes and direct SDK read/write deny. Log out/switch account/offline/reconnect.',
	'Use separately approved negative assets/domain/referrer controls for errors 100/101/150/153; verify safe message and stopped progress sampling.',
	'Inspect CSP/Permissions-Policy/referrer, no live payments/notification/Drive/production requests; sign out and clear synthetic sessions.'
];
if (process.argv[2] !== '--run') {
	console.log(
		JSON.stringify({ status: 'PLAN ONLY — REAL YOUTUBE PLAYBACK — NOT VERIFIED', steps }, null, 2)
	);
} else {
	const record = JSON.parse(readFileSync(process.argv[3], 'utf8'));
	assert.equal(record.ownerAuthorized, true);
	assert.equal(record.protectionVerified, true);
	assert.equal(record.backendIsolationVerified, true);
	assert.equal(record.embeddingRightsApproved, true);
	assert.match(record.reviewedSha, /^[a-f0-9]{40}$/);
	assert.ok(Number.isInteger(record.contentVersion) && record.contentVersion > 0);
	const target = new URL(record.lessonUrl);
	assert.equal(target.protocol, 'https:');
	assert.equal(target.origin, record.approvedOrigin);
	assert.ok(!target.username && !target.password && !target.hash);
	assert.match(target.pathname, /^\/e-learning\/[a-zA-Z0-9_-]+$/);
	assert.ok(process.env.ACADEMY_PLAYWRIGHT_MODULE, 'Use a reviewed installed Playwright module');
	const { chromium } = await import(pathToFileURL(process.env.ACADEMY_PLAYWRIGHT_MODULE).href);
	const browser = await chromium.launch({
		headless: false,
		executablePath: process.env.ACADEMY_CHROME_EXECUTABLE
	});
	const input = createInterface({ input: process.stdin, output: process.stdout });
	try {
		const page = await browser.newPage();
		await page.addInitScript(() => {
			// Observe actual API events/calls; no fake YT implementation, no media interception.
			window.__academyRealQA = [];
			let ready;
			Object.defineProperty(window, 'onYouTubeIframeAPIReady', {
				configurable: true,
				get: () => () => {
					const original = window.YT.Player;
					window.YT.Player = new Proxy(original, {
						construct(Constructor, args) {
							for (const name of ['onReady', 'onStateChange', 'onError', 'onAutoplayBlocked']) {
								const callback = args[1].events[name];
								args[1].events[name] = (event) => {
									window.__academyRealQA.push({
										event: name,
										code: typeof event?.data === 'number' ? event.data : null
									});
									callback?.(event);
								};
							}
							const player = Reflect.construct(Constructor, args);
							for (const name of ['seekTo', 'getCurrentTime', 'destroy']) {
								const method = player[name].bind(player);
								player[name] = (...params) => {
									const result = method(...params);
									window.__academyRealQA.push({
										call: name,
										value: name === 'getCurrentTime' ? result : name === 'seekTo' ? params[0] : null
									});
									return result;
								};
							}
							return player;
						}
					});
					ready?.();
				},
				set: (callback) => {
					ready = callback;
				}
			});
		});
		await page.goto(target.href);
		for (const step of steps) {
			const result = await input.question(
				`${step}\nRecord PASS, FAIL or BLOCKED (no secrets/PII): `
			);
			assert.match(result, /^(PASS|FAIL|BLOCKED)$/);
			console.log(result);
		}
		const observed = await page.evaluate(() => window.__academyRealQA);
		console.log(
			JSON.stringify({ status: 'OBSERVATIONS ONLY — OWNER QA REVIEW REQUIRED', observed })
		);
	} finally {
		input.close();
		await browser.close();
	}
}
