import { spawnSync } from 'node:child_process';
import { getSession } from '../src/lib/server/session.ts';
import { apiFetch } from '../src/lib/server/apiClient.ts';
import type { PlayerState } from '../src/lib/academyPlayer.ts';
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createApiAcademyPlayer } from '../src/lib/academyApi.ts';
import {
	refreshSessionToken,
	destroySession,
	ACCESS_TOKEN_COOKIE,
	REFRESH_TOKEN_COOKIE
} from '../src/lib/server/session.ts';
import { resolveApiConfig } from '../src/lib/server/apiConfig.ts';
import type { CatalogLesson } from '../src/lib/academyData.ts';

const sampleLesson: CatalogLesson = {
	id: 'lesson-crypto-1',
	kind: 'lesson',
	parentId: 'chap-1',
	subjectId: 'fundamental',
	level: 1,
	chapterNumber: 1,
	order: 0,
	scopeId: 'scope-1',
	subject: 'Analisis Fundamental',
	chapter: 'Bab 1',
	title: 'Valuasi Aset Kripto',
	description: 'Memahami nilai intrinsik',
	thumbnail: 'https://example.com/thumb.jpg',
	durationSeconds: 600,
	instructor: 'Ustadz Ahli',
	status: 'published',
	version: 1
};

process.env.API_KEY = 'mock-test-api-key';
process.env.API_BASE_URL = 'http://127.0.0.1:3000';

test('refreshSessionToken deduplicates concurrent refresh calls into a single operation', async () => {
	const originalFetch = globalThis.fetch;
	let backendRefreshCalls = 0;

	// Mock backend responding with refreshed token after a small delay
	globalThis.fetch = async (url) => {
		if (String(url).endsWith('/auth/refresh')) {
			backendRefreshCalls++;
			await new Promise((r) => setTimeout(r, 20));
			return new Response(JSON.stringify({ accessToken: 'new-shared-access-token-999' }), {
				status: 200,
				headers: { 'content-type': 'application/json' }
			});
		}
		return new Response('{}', { status: 200 });
	};

	try {
		// Launch 5 concurrent refresh requests with the same refresh token
		const results = await Promise.all([
			refreshSessionToken('refresh-token-concurrent-test'),
			refreshSessionToken('refresh-token-concurrent-test'),
			refreshSessionToken('refresh-token-concurrent-test'),
			refreshSessionToken('refresh-token-concurrent-test'),
			refreshSessionToken('refresh-token-concurrent-test')
		]);

		// All 5 callers should receive the exact same new token
		assert.equal(results.length, 5);
		results.forEach((res) => {
			assert.equal(res?.accessToken, 'new-shared-access-token-999');
		});

		// Crucial: Only exactly 1 backend refresh call was made!
		assert.equal(backendRefreshCalls, 1);
	} finally {
		globalThis.fetch = originalFetch;
	}
});

test('destroySession revokes token on backend and clears session cookies', async () => {
	const originalFetch = globalThis.fetch;
	let signOutCalled = false;

	globalThis.fetch = async (url) => {
		if (String(url).endsWith('/auth/signout')) {
			signOutCalled = true;
			return new Response(JSON.stringify({ success: true }), { status: 200 });
		}
		return new Response('{}', { status: 200 });
	};

	const jar = new Map<string, string>([
		[ACCESS_TOKEN_COOKIE, 'token-to-delete'],
		[REFRESH_TOKEN_COOKIE, 'rt-to-revoke']
	]);

	const mockCookies = {
		get(name: string) {
			return jar.get(name);
		},
		delete(name: string) {
			jar.delete(name);
		}
	};

	try {
		await destroySession(mockCookies);

		assert.equal(signOutCalled, true);
		assert.equal(jar.has(ACCESS_TOKEN_COOKIE), false);
		assert.equal(jar.has(REFRESH_TOKEN_COOKIE), false);
	} finally {
		globalThis.fetch = originalFetch;
	}
});

test('createApiAcademyPlayer accurately maps API authorization states to domain PlayerState', async () => {
	const originalFetch = globalThis.fetch;

	try {
		// 1. Authorized response delivers videoId
		globalThis.fetch = async () =>
			new Response(
				JSON.stringify({
					lesson: { version: 1 },
					media: { videoId: 'dQw4w9WgXcQ', version: 1 }
				}),
				{ status: 200 }
			);

		let stateEmitted: PlayerState = { status: 'loading', media: null };
		const player = createApiAcademyPlayer(
			(state) => {
				stateEmitted = state;
			},
			{ checkAuth: () => true }
		);

		player.open(sampleLesson);
		await new Promise((r) => setTimeout(r, 10));
		assert.equal(stateEmitted?.status, 'ready');
		assert.equal(stateEmitted?.media?.videoId, 'dQw4w9WgXcQ');

		// 2. 401 Unauthorized
		globalThis.fetch = async () =>
			new Response(JSON.stringify({ error: 'UNAUTHORIZED' }), { status: 401 });
		player.open(sampleLesson);
		await new Promise((r) => setTimeout(r, 10));
		assert.equal(stateEmitted?.status, 'unauthorized');
		assert.equal(stateEmitted?.media, null);

		// 3. 403 GRANT_EXPIRED
		globalThis.fetch = async () =>
			new Response(JSON.stringify({ error: 'GRANT_EXPIRED' }), { status: 403 });
		player.open(sampleLesson);
		await new Promise((r) => setTimeout(r, 10));
		assert.equal(stateEmitted?.status, 'expired');
		assert.equal(stateEmitted?.media, null);

		// 4. 403 GRANT_REVOKED
		globalThis.fetch = async () =>
			new Response(JSON.stringify({ error: 'GRANT_REVOKED' }), { status: 403 });
		player.open(sampleLesson);
		await new Promise((r) => setTimeout(r, 10));
		assert.equal(stateEmitted?.status, 'revoked');
		assert.equal(stateEmitted?.media, null);

		// 5. 404 CONTENT_NOT_FOUND
		globalThis.fetch = async () =>
			new Response(JSON.stringify({ error: 'CONTENT_NOT_FOUND' }), { status: 404 });
		player.open(sampleLesson);
		await new Promise((r) => setTimeout(r, 10));
		assert.equal(stateEmitted?.status, 'not-found');
		assert.equal(stateEmitted?.media, null);

		// 6. 404 LESSON_NOT_PUBLISHED
		globalThis.fetch = async () =>
			new Response(JSON.stringify({ error: 'LESSON_NOT_PUBLISHED' }), { status: 404 });
		player.open(sampleLesson);
		await new Promise((r) => setTimeout(r, 10));
		assert.equal(stateEmitted?.status, 'unpublished');
		assert.equal(stateEmitted?.media, null);

		// 7. Version mismatch (API returned version 2 but requested lesson was version 1)
		globalThis.fetch = async () =>
			new Response(
				JSON.stringify({
					lesson: { version: 2 },
					media: { videoId: 'dQw4w9WgXcQ', version: 2 }
				}),
				{ status: 200 }
			);
		player.open(sampleLesson); // version is 1
		await new Promise((r) => setTimeout(r, 10));
		assert.equal(stateEmitted?.status, 'unpublished');
		assert.equal(stateEmitted?.media, null);

		// 8. Backend offline / 503
		globalThis.fetch = async () => {
			throw new Error('Network offline');
		};
		player.open(sampleLesson);
		await new Promise((r) => setTimeout(r, 10));
		assert.equal(stateEmitted?.status, 'backend-unavailable');
		assert.equal(stateEmitted?.media, null);

		// 9. Clean disposal
		player.dispose();
		assert.equal(stateEmitted?.status, 'unauthorized');
	} finally {
		globalThis.fetch = originalFetch;
	}
});

test('API key and backend secret absence verification', () => {
	// Secret environment is loaded exclusively on server
	const serverConfig = resolveApiConfig({
		API_BASE_URL: 'http://127.0.0.1:3000',
		API_KEY: 'top-secret-internal-key-123'
	});

	assert.equal(serverConfig.apiKey, 'top-secret-internal-key-123');
	assert.equal(serverConfig.baseUrl, 'http://127.0.0.1:3000');

	// Browser / public config must never contain API_KEY
	const browserEnv = {
		PUBLIC_ACADEMY_ENABLED: 'true',
		PUBLIC_ACADEMY_BACKEND: 'api'
	};
	assert.equal('API_KEY' in browserEnv ? browserEnv.API_KEY : undefined, undefined);
	assert.equal('PUBLIC_API_KEY' in browserEnv ? browserEnv.PUBLIC_API_KEY : undefined, undefined);
});

test('production API configuration accepts only the approved HTTPS origin', () => {
	const config = resolveApiConfig({
		API_BASE_URL: 'https://api.cryptosharia.id',
		API_KEY: 'synthetic-server-only-key',
		VERCEL_ENV: 'production'
	});

	assert.equal(config.baseUrl, 'https://api.cryptosharia.id');
	assert.equal(config.apiKey, 'synthetic-server-only-key');

	for (const API_BASE_URL of [
		'https://api.cryptosharia.id.evil.example',
		'https://api.cryptosharia.id/path',
		'https://api.cryptosharia.id?target=other',
		'http://api.cryptosharia.id',
		'https://example.com'
	]) {
		assert.equal(
			resolveApiConfig({ API_BASE_URL, API_KEY: 'synthetic-key', VERCEL_ENV: 'production' })
				.baseUrl,
			''
		);
	}
	assert.equal(
		resolveApiConfig({ API_BASE_URL: 'https://api.cryptosharia.id', API_KEY: 'synthetic-key' })
			.baseUrl,
		''
	);
	assert.equal(
		resolveApiConfig({
			API_BASE_URL: 'https://api.cryptosharia.id',
			API_KEY: 'synthetic-key',
			VERCEL_ENV: 'preview'
		}).baseUrl,
		''
	);
});

test('production session cookies are Secure and HttpOnly with a shared root path', () => {
	const child = spawnSync(
		process.execPath,
		[
			'--input-type=module',
			'-e',
			`
  const { setSessionCookies } = await import('./src/lib/server/session.ts');
  const options = []; setSessionCookies({set: (name,value,opts)=>options.push(opts)}, {accessToken:'synthetic-at',refreshToken:'synthetic-rt'});
  if (options.length !== 2 || options.some(o=>!o.secure || !o.httpOnly || o.path!=='/' || o.sameSite!=='lax')) process.exit(1);
 `
		],
		{ cwd: process.cwd(), env: { ...process.env, NODE_ENV: 'production' }, encoding: 'utf8' }
	);
	assert.equal(child.status, 0, child.stderr);
});

test('missing or unapproved API configuration fails closed before dispatch', async () => {
	const originalFetch = globalThis.fetch;
	const originalBase = process.env.API_BASE_URL;
	let requests = 0;
	globalThis.fetch = async () => {
		requests++;
		throw new Error('Dispatch must not occur');
	};
	try {
		for (const base of [
			'',
			'http://example.com',
			'https://example.com',
			'https://api.cryptosharia.id.evil.example',
			'http://user:pass@localhost:3000'
		]) {
			process.env.API_BASE_URL = base;
			const response = await apiFetch('/academy/catalog');
			assert.equal(response.status, 503);
		}
		assert.equal(requests, 0);
	} finally {
		globalThis.fetch = originalFetch;
		process.env.API_BASE_URL = originalBase;
	}
});

test('access-only and rejected sessions are cleared without exposing tokens', async () => {
	const originalFetch = globalThis.fetch;
	const jar = new Map([[ACCESS_TOKEN_COOKIE, 'synthetic-at']]);
	const cookies = {
		get: (name: string) => jar.get(name),
		set: (name: string, value: string) => {
			jar.set(name, value);
		},
		delete: (name: string) => {
			jar.delete(name);
		},
		getAll: () => [],
		serialize: () => ''
	};
	globalThis.fetch = async () =>
		new Response(JSON.stringify({ error: 'UNAUTHORIZED' }), { status: 401 });
	try {
		assert.equal(await getSession(cookies), null);
		assert.equal(jar.size, 0);
		jar.set(ACCESS_TOKEN_COOKIE, 'invalid-at');
		jar.set(REFRESH_TOKEN_COOKIE, 'invalid-rt');
		assert.equal(await getSession(cookies), null);
		assert.equal(jar.size, 0);
	} finally {
		globalThis.fetch = originalFetch;
	}
});
