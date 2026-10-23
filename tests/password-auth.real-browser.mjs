import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';

const frontendUrl = new URL(process.env.ACADEMY_FRONTEND_URL || '');
const mailboxUrl = new URL(process.env.ACADEMY_TEST_MAILBOX_URL || '');
assert.ok(['127.0.0.1', 'localhost', '::1'].includes(frontendUrl.hostname));
assert.ok(['127.0.0.1', 'localhost', '::1'].includes(mailboxUrl.hostname));
assert.ok(process.env.ACADEMY_PLAYWRIGHT_MODULE, 'Playwright module is required');

const { chromium } = await import(pathToFileURL(process.env.ACADEMY_PLAYWRIGHT_MODULE).href);
const browser = await chromium.launch({
	headless: true,
	...(process.env.ACADEMY_CHROME_EXECUTABLE
		? { executablePath: process.env.ACADEMY_CHROME_EXECUTABLE }
		: {})
});
const context = await browser.newContext();
const page = await context.newPage();
page.setDefaultTimeout(12_000);
page.setDefaultNavigationTimeout(60_000);

const blockedOrigins = [];
const pageErrors = [];
const browserApiPaths = [];
const passwords = ['Synthetic browser password 2026!', 'Different reset password 2026!'];
const secrets = [...passwords];
const apiKey = process.env.API_KEY || '';
const forbiddenFields = ['accessToken', 'refreshToken', 'apiKey', 'authorization'];

function safePayload(text, label) {
	for (const secret of secrets) {
		assert.ok(!secret || !text.includes(secret), `${label} excludes credentials`);
	}
	assert.ok(!apiKey || !text.includes(apiKey), `${label} excludes the API key`);
	for (const field of forbiddenFields) {
		assert.ok(!text.includes(`"${field}"`), `${label} excludes ${field}`);
	}
}

async function check(name, callback) {
	console.log(`START ${name}`);
	await callback();
	console.log(`PASS ${name}`);
}

await context.route('**/*', async (route) => {
	const target = new URL(route.request().url());
	if (target.origin === frontendUrl.origin) return route.continue();
	blockedOrigins.push(target.origin);
	return route.abort();
});
page.on('pageerror', (error) => pageErrors.push(error.message));
page.on('request', (request) => {
	const url = new URL(request.url());
	if (url.origin === frontendUrl.origin && url.pathname.startsWith('/api/')) {
		browserApiPaths.push(url.pathname);
	}
});
async function mailboxJson(path, init) {
	const response = await fetch(new URL(path, mailboxUrl), init);
	assert.ok(response.ok, `The in-memory test mailbox accepts ${path}`);
	return response.status === 204 ? null : response.json();
}

async function latestOtp() {
	const result = await mailboxJson('/latest');
	assert.match(result?.code || '', /^\d{6}$/);
	return result.code;
}

async function openPath(path, selector) {
	await page.goto(new URL(path, frontendUrl).href, { waitUntil: 'commit' });
	await page.locator(selector).waitFor();
	await page.waitForTimeout(3_000);
}

async function verifyVisibilityToggle() {
	for (let attempt = 0; attempt < 5; attempt += 1) {
		const showButton = page.getByRole('button', { name: 'Tampilkan kata sandi' });
		if (await showButton.count()) {
			await showButton.click();
			try {
				await page.waitForFunction(
					() => document.querySelector('#password')?.getAttribute('type') === 'text',
					null,
					{ timeout: 2_000 }
				);
				await page.getByRole('button', { name: 'Sembunyikan kata sandi' }).click();
				await page.waitForFunction(
					() => document.querySelector('#password')?.getAttribute('type') === 'password'
				);
				return;
			} catch {
				// Vite's first dependency optimization can reload once before hydration.
			}
		}
		await page.waitForTimeout(1_000);
	}
	throw new Error('Password visibility toggle did not become interactive');
}

async function otpLogin(email, redirect = '') {
	const query = redirect ? `?redirect=${encodeURIComponent(redirect)}` : '';
	await openPath(`/auth/login${query}`, '#password');
	for (let attempt = 0; attempt < 5; attempt += 1) {
		await page.getByRole('button', { name: 'Dengan kode OTP' }).click();
		try {
			await page.getByRole('button', { name: 'Kirim kode OTP' }).waitFor({ timeout: 2_000 });
			break;
		} catch {
			if (attempt === 4) throw new Error('OTP method toggle did not become interactive');
			await page.waitForTimeout(1_000);
		}
	}
	await page.locator('#email').fill(email);
	await page.getByRole('button', { name: 'Kirim kode OTP' }).click();
	await page.locator('#otpCode').waitFor();
	await page.locator('#otpCode').fill(await latestOtp());
	const responsePromise = page.waitForResponse((response) =>
		response.url().endsWith('/api/auth/otp/verify')
	);
	await page.getByRole('button', { name: 'Verifikasi dan masuk' }).click();
	assert.equal((await responsePromise).status(), 200);
}

async function logout() {
	console.log('TRACE logout: click');
	await page.getByRole('button', { name: 'Keluar', exact: true }).first().click();
	console.log('TRACE logout: wait for login route');
	await page.waitForURL((url) => url.pathname === '/');
	console.log('TRACE logout: home route reached');
	const authCookies = (await context.cookies(frontendUrl.href)).filter((cookie) =>
		['cs_at', 'cs_rt'].includes(cookie.name)
	);
	console.log(`TRACE logout: remaining session cookies=${authCookies.length}`);
	assert.deepEqual(authCookies, [], 'Logout removes both local session cookies');
}

try {
	// 1. Password is the default method, visibility is controllable, and bad
	// credentials leave the browser anonymous.
	await check('Learning password UI, visibility toggle, and generic failure', async () => {
		await openPath('/auth/login', '#password');
		assert.equal(await page.locator('#password').getAttribute('type'), 'password');
		await verifyVisibilityToggle();
		await page.locator('#email-password').fill('qa-password@example.test');
		await page.locator('#password').fill('incorrect synthetic password');
		await page.getByRole('button', { name: 'Masuk', exact: true }).click();
		await page
			.getByRole('alert')
			.filter({ hasText: 'Email atau kata sandi tidak valid.' })
			.waitFor();
		assert.deepEqual(
			(await context.cookies(frontendUrl.href)).filter((cookie) =>
				['cs_at', 'cs_rt'].includes(cookie.name)
			),
			[]
		);
	});

	const email = 'qa-password@example.test';

	// 2. OTP creates the synthetic user and displays the first-password prompt.
	await check('Learning OTP creates a host-only HttpOnly session and prompts setup', async () => {
		await otpLogin(email);
		await page.getByRole('link', { name: 'Buat kata sandi di profil' }).waitFor();
		const cookies = await context.cookies(frontendUrl.href);
		for (const name of ['cs_at', 'cs_rt']) {
			const cookie = cookies.find((item) => item.name === name);
			assert.ok(cookie, `${name} is set after OTP verification`);
			assert.equal(cookie.httpOnly, true);
			assert.equal(cookie.domain, frontendUrl.hostname);
			assert.equal(cookie.path, '/');
		}
		safePayload(await page.evaluate(() => document.cookie), 'browser JavaScript cookies');
	});

	// 3. Creating the first password requires a fresh OTP while authenticated.
	await check('Learning first-password setup requires fresh email verification', async () => {
		await page.getByRole('link', { name: 'Buat kata sandi di profil' }).click();
		console.log('TRACE setup: profile link clicked');
		await page.waitForURL(new URL('/profile#profil-akun', frontendUrl).href);
		console.log('TRACE setup: profile route reached');
		await page.getByRole('button', { name: 'Kirim kode verifikasi' }).click();
		console.log('TRACE setup: request fresh OTP');
		await page.locator('#setup-otp').waitFor();
		console.log('TRACE setup: form rendered');
		await page.waitForTimeout(1_000);
		await page.locator('#setup-otp').fill(await latestOtp());
		await page.locator('#setup-password').fill(passwords[0]);
		await page.locator('#setup-confirm-password').fill(passwords[0]);
		const submit = page.getByRole('button', { name: 'Buat kata sandi' });
		assert.equal(await submit.isEnabled(), true, 'The complete setup form is enabled');
		const validity = await submit.evaluate((button) => {
			const form = button.closest('form');
			return [...(form?.elements ?? [])].map((element) => ({
				id: element.id,
				valid: element.validity.valid,
				valueLength: element.value.length,
				isSixAsciiDigits: /^\d{6}$/.test(element.value),
				patternMismatch: element.validity.patternMismatch,
				valueMissing: element.validity.valueMissing,
				pattern: element.getAttribute('pattern')
			}));
		});
		assert.ok(
			await submit.evaluate((button) => button.closest('form')?.checkValidity()),
			`Password setup form validity: ${JSON.stringify(validity)}`
		);
		const setResponse = page
			.waitForResponse(
				(response) => new URL(response.url()).pathname.endsWith('/api/auth/password/set'),
				{ timeout: 5_000 }
			)
			.catch(() => null);
		await submit.click();
		console.log('TRACE setup: submit clicked');
		const setResult = await setResponse;
		console.log('TRACE setup: API response received');
		const messages = await page.locator('#profil-akun [role="status"]').allTextContents();
		assert.ok(
			setResult,
			`Password setup did not submit; status=${JSON.stringify(messages)}, apiPaths=${JSON.stringify(browserApiPaths)}`
		);
		assert.equal(setResult.status(), 200, 'Password setup returns success');
		console.log('TRACE setup: successful HTTP status');
		await page.getByRole('status').filter({ hasText: 'Kata sandi berhasil dibuat.' }).waitFor();
		console.log('TRACE setup: success message rendered');
		await logout();
	});

	const lessonDestination = '/e-learning/scope-package3-real?lesson=lesson-package3-real';
	const lessonUrl = new URL(lessonDestination, frontendUrl);
	const grant = await fetch(new URL('/grant', mailboxUrl), {
		method: 'POST',
		headers: { 'content-type': 'application/json' },
		body: JSON.stringify({ email })
	});
	assert.equal(grant.status, 204);

	// 4. Password login goes through the BFF and returns to the intended lesson.
	let refreshValue = '';
	await check('Learning password session returns to the requested lesson safely', async () => {
		await openPath(`/auth/login?redirect=${encodeURIComponent(lessonDestination)}`, '#password');
		await page.locator('#email-password').fill(email);
		await page.locator('#password').fill(passwords[0]);
		await page.getByRole('button', { name: 'Masuk', exact: true }).click();
		await page.waitForURL(
			(url) =>
				url.pathname === lessonUrl.pathname &&
				url.searchParams.get('lesson') === 'lesson-package3-real'
		);
		await page
			.getByRole('heading', { name: 'Pelajaran sintetis API Package 3', exact: true })
			.waitFor();
		const cookies = await context.cookies(frontendUrl.href);
		const access = cookies.find((cookie) => cookie.name === 'cs_at');
		const refresh = cookies.find((cookie) => cookie.name === 'cs_rt');
		assert.ok(access && refresh);
		assert.equal(access.httpOnly, true);
		assert.equal(refresh.httpOnly, true);
		assert.equal(access.domain, frontendUrl.hostname);
		assert.equal(refresh.domain, frontendUrl.hostname);
		refreshValue = refresh.value;
		secrets.push(access.value, refresh.value);
		safePayload(await page.content(), 'password-session lesson HTML');
		safePayload(await page.evaluate(() => document.cookie), 'password-session browser cookies');
	});

	// 5. A rejected access token is renewed using only this app's refresh cookie.
	await check('Learning BFF transparently refreshes a rejected access cookie', async () => {
		await context.addCookies([
			{
				name: 'cs_at',
				value: 'synthetic-expired-access-token',
				url: frontendUrl.origin,
				httpOnly: true,
				sameSite: 'Lax'
			}
		]);
		await openPath('/profile', 'h1');
		await page.getByRole('heading', { name: 'Pembelajaran Saya', level: 1 }).waitFor();
		const cookies = await context.cookies(frontendUrl.href);
		const access = cookies.find((cookie) => cookie.name === 'cs_at');
		assert.ok(access && access.value !== 'synthetic-expired-access-token');
		assert.equal(access.httpOnly, true);
		assert.equal(cookies.find((cookie) => cookie.name === 'cs_rt')?.value, refreshValue);
	});

	// 6. OTP stays usable after a password is present on the account.
	await check('Learning OTP login remains available after password setup', async () => {
		await logout();
		await otpLogin(email, lessonDestination);
		await page.waitForURL(
			(url) =>
				url.pathname === lessonUrl.pathname &&
				url.searchParams.get('lesson') === 'lesson-package3-real'
		);
		await page
			.getByRole('heading', { name: 'Pelajaran sintetis API Package 3', exact: true })
			.waitFor();
		await logout();
	});

	// 7. Forgot/reset uses the fake mail transport and a single real API reset token.
	await check('Learning forgot and reset flow uses the in-memory email sink', async () => {
		await openPath('/auth/forgot-password', '#forgot-email');
		await page.locator('#forgot-email').fill(email);
		await page.getByRole('button', { name: 'Kirim tautan reset' }).click();
		await page.getByRole('heading', { name: 'Periksa email Anda' }).waitFor();
		const reset = await mailboxJson('/latest-reset');
		assert.match(reset?.token || '', /^[A-Za-z0-9_-]{43}$/);
		await openPath(`/auth/reset-password/${reset.token}`, '#reset-password');
		await page.locator('#reset-password').fill(passwords[1]);
		await page.locator('#reset-confirm').fill(passwords[1]);
		await page.getByRole('button', { name: 'Atur kata sandi' }).click();
		await page.getByRole('heading', { name: 'Kata sandi diperbarui' }).waitFor();
	});

	// 8. The reset password authenticates the same API identity; tokens stay
	// host-only and HttpOnly, and logout removes them again.
	await check(
		'Learning reset password reauthenticates the same account without browser leaks',
		async () => {
			const loginCallsBefore = browserApiPaths.filter(
				(path) => path === '/api/auth/password/login'
			).length;
			await page.getByRole('button', { name: 'Masuk' }).click();
			await page.locator('#email-password').fill(email);
			await page.locator('#password').fill(passwords[1]);
			await page.getByRole('button', { name: 'Masuk', exact: true }).click();
			await page.waitForURL((url) => url.pathname === '/e-learning');
			assert.equal(
				browserApiPaths.filter((path) => path === '/api/auth/password/login').length,
				loginCallsBefore + 1,
				'The reset password login uses the Learning BFF for the same supplied account'
			);
			const resetLoginCookies = await context.cookies(frontendUrl.href);
			for (const name of ['cs_at', 'cs_rt']) {
				const cookie = resetLoginCookies.find((item) => item.name === name);
				assert.ok(cookie, `${name} is set after reset-password login`);
				assert.equal(cookie.httpOnly, true);
				assert.equal(cookie.domain, frontendUrl.hostname);
				secrets.push(cookie.value);
			}
			safePayload(await page.content(), 'reset-password login HTML');
			await logout();
			assert.deepEqual(pageErrors, [], 'Browser has no unhandled page errors');
			assert.ok(blockedOrigins.every((origin) => origin !== frontendUrl.origin));
			assert.ok(!JSON.stringify(await context.cookies()).includes(apiKey));
		}
	);
} finally {
	await context.close();
	await browser.close();
}
