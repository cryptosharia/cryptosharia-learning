import type { ContentDto } from '../src/lib/academyDtos.ts';
import type { Cookies } from '@sveltejs/kit';
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { resolveBackendMode, isApiMode, isEmulatorMode } from '../src/lib/academyConfig.ts';
import { wrapTimestamp, mapApiContentToCatalogLesson } from '../src/lib/academyApi.ts';
import {
	activeScope,
	isCompleted,
	completionSummary,
	resumePosition
} from '../src/lib/academyProgress.ts';
import type { CatalogLesson, Grant, Completion, Progress } from '../src/lib/academyData.ts';
import {
	ACCESS_TOKEN_COOKIE,
	REFRESH_TOKEN_COOKIE,
	ACCESS_TOKEN_MAX_AGE,
	REFRESH_TOKEN_MAX_AGE,
	setSessionCookies,
	clearSessionCookies
} from '../src/lib/server/session.ts';

test('backend mode resolution enforces explicit states and prevents illegal live Firebase mix', () => {
	// Disabled by default
	assert.equal(resolveBackendMode({}), 'disabled');
	assert.equal(resolveBackendMode({ PUBLIC_ACADEMY_ENABLED: 'false' }), 'disabled');

	// API mode
	assert.equal(
		resolveBackendMode({
			PUBLIC_ACADEMY_ENABLED: 'true',
			PUBLIC_ACADEMY_BACKEND: 'api'
		}),
		'api'
	);
	assert.equal(
		isApiMode({
			PUBLIC_ACADEMY_ENABLED: 'true',
			PUBLIC_ACADEMY_BACKEND: 'api'
		}),
		true
	);

	// Illegal mix: API mode with live Firebase must throw
	assert.throws(
		() =>
			resolveBackendMode({
				PUBLIC_ACADEMY_ENABLED: 'true',
				PUBLIC_ACADEMY_BACKEND: 'api',
				PUBLIC_FIREBASE_MODE: 'live'
			}),
		/Live Firebase and API mode cannot be mixed/
	);

	// Emulator mode
	assert.equal(
		resolveBackendMode({
			PUBLIC_ACADEMY_ENABLED: 'true',
			PUBLIC_ACADEMY_BACKEND: 'emulator'
		}),
		'emulator'
	);
	assert.equal(
		resolveBackendMode({
			PUBLIC_ACADEMY_ENABLED: 'true',
			PUBLIC_FIREBASE_MODE: 'emulator'
		}),
		'emulator'
	);
	assert.equal(
		isEmulatorMode({
			PUBLIC_ACADEMY_ENABLED: 'true',
			PUBLIC_ACADEMY_BACKEND: 'emulator'
		}),
		true
	);
});

test('session cookie configuration sets secure HttpOnly cookies with required lifetimes', () => {
	assert.equal(ACCESS_TOKEN_COOKIE, 'cs_at');
	assert.equal(REFRESH_TOKEN_COOKIE, 'cs_rt');
	assert.equal(ACCESS_TOKEN_MAX_AGE, 15 * 60); // 15 minutes
	assert.equal(REFRESH_TOKEN_MAX_AGE, 15 * 24 * 60 * 60); // 15 days

	const jar = new Map<string, { value: string; options: Parameters<Cookies['set']>[2] }>();
	const mockCookies = {
		set(name: string, value: string, options: Parameters<Cookies['set']>[2]) {
			jar.set(name, { value, options });
		},
		delete(name: string) {
			jar.delete(name);
		},
		get(name: string) {
			return jar.get(name)?.value;
		}
	};

	setSessionCookies(mockCookies, {
		accessToken: 'test-access-token-xyz',
		refreshToken: 'test-refresh-token-abc'
	});

	assert.equal(mockCookies.get(ACCESS_TOKEN_COOKIE), 'test-access-token-xyz');
	assert.equal(mockCookies.get(REFRESH_TOKEN_COOKIE), 'test-refresh-token-abc');

	const atOpts = jar.get(ACCESS_TOKEN_COOKIE)?.options;
	const rtOpts = jar.get(REFRESH_TOKEN_COOKIE)?.options;
	assert.ok(atOpts);
	assert.ok(rtOpts);

	assert.equal(atOpts.httpOnly, true);
	assert.equal(atOpts.path, '/');
	assert.equal(atOpts.sameSite, 'lax');
	assert.equal(atOpts.maxAge, 15 * 60);

	assert.equal(rtOpts.httpOnly, true);
	assert.equal(rtOpts.path, '/');
	assert.equal(rtOpts.sameSite, 'lax');
	assert.equal(rtOpts.maxAge, 15 * 24 * 60 * 60);

	// Clearing cookies on logout
	clearSessionCookies(mockCookies);
	assert.equal(mockCookies.get(ACCESS_TOKEN_COOKIE), undefined);
	assert.equal(mockCookies.get(REFRESH_TOKEN_COOKIE), undefined);
});

test('wrapTimestamp seamlessly bridges API ISO strings with domain timestamp operations', () => {
	const nowMs = 1700000000000;
	const isoStr = new Date(nowMs).toISOString();
	const wrapped = wrapTimestamp(isoStr);

	assert.equal(wrapped.toMillis(), nowMs);
	assert.equal(wrapped.toDate().getTime(), nowMs);

	const grant: Grant = {
		uid: 'user-1',
		scopeId: 'scope-fundamental-1',
		state: 'active',
		startsAt: wrapTimestamp(new Date(nowMs - 3600000).toISOString()),
		expiresAt: wrapTimestamp(new Date(nowMs + 3600000).toISOString())
	};

	// Active within window
	assert.equal(activeScope([grant], 'scope-fundamental-1', nowMs), true);
	// Expired
	assert.equal(activeScope([grant], 'scope-fundamental-1', nowMs + 7200000), false);
	// Wrong scope
	assert.equal(activeScope([grant], 'scope-other', nowMs), false);
	// Revoked
	const revokedGrant = { ...grant, state: 'revoked' as const };
	assert.equal(activeScope([revokedGrant], 'scope-fundamental-1', nowMs), false);
});

test('API DTO mapper produces valid CatalogLesson records preserving hierarchy and order', () => {
	const rawItems: ContentDto[] = [
		{
			id: 'fundamental',
			kind: 'subject',
			status: 'published',
			version: 1,
			parentId: 'root',
			subjectId: 'fundamental',
			title: 'Analisis Fundamental',
			level: 1,
			chapterNumber: 1,
			order: 0,
			scopeId: 'scope-fund'
		},
		{
			id: 'chap-1',
			kind: 'chapter',
			status: 'published',
			version: 1,
			parentId: 'level-1',
			subjectId: 'fundamental',
			title: 'Pengenalan Nilai',
			level: 1,
			chapterNumber: 1,
			order: 0,
			scopeId: 'scope-fund'
		},
		{
			id: 'lesson-1',
			kind: 'lesson',
			parentId: 'chap-1',
			subjectId: 'fundamental',
			title: 'Mengenal Valuasi',
			description: 'Dasar valuasi aset',
			thumbnail: 'https://example.com/thumb.jpg',
			durationSeconds: 300,
			instructor: 'Ustadz Ahli',
			status: 'published',
			version: 2,
			level: 1,
			chapterNumber: 1,
			order: 0,
			scopeId: 'scope-fund'
		}
	];

	const mappedLesson = mapApiContentToCatalogLesson(rawItems[2], rawItems);

	assert.equal(mappedLesson.id, 'lesson-1');
	assert.equal(mappedLesson.kind, 'lesson');
	assert.equal(mappedLesson.version, 2);
	assert.equal(mappedLesson.durationSeconds, 300);
	assert.equal(mappedLesson.subject, 'Analisis Fundamental');
	assert.equal(mappedLesson.chapter, 'Pengenalan Nilai');
	assert.equal(mappedLesson.instructor, 'Ustadz Ahli');
	assert.equal(mappedLesson.status, 'published');
});

test('aggregate progress calculation with API-wrapped models derives accurate summary', () => {
	const now = 1700000000000;
	const lesson1: CatalogLesson = {
		id: 'lesson-1',
		kind: 'lesson',
		parentId: 'chap-1',
		subjectId: 'fundamental',
		level: 1,
		chapterNumber: 1,
		order: 0,
		scopeId: 'scope-1',
		subject: 'Analisis Fundamental',
		chapter: 'Bab 1',
		title: 'Pelajaran 1',
		description: '',
		thumbnail: '',
		durationSeconds: 120,
		instructor: 'Pengajar A',
		status: 'published',
		version: 1
	};

	const lesson2: CatalogLesson = {
		...lesson1,
		id: 'lesson-2',
		order: 1,
		title: 'Pelajaran 2',
		version: 2
	};

	const grant: Grant = {
		uid: 'u1',
		scopeId: 'scope-1',
		state: 'active',
		startsAt: wrapTimestamp(now - 1000),
		expiresAt: wrapTimestamp(now + 100000)
	};

	const completion1: Completion = {
		lessonId: 'lesson-1',
		version: 1,
		completedAt: wrapTimestamp(now)
	};

	// Lesson 2 is completed for old version 1, but current published is version 2 -> stale!
	const completion2Stale: Completion = {
		lessonId: 'lesson-2',
		version: 1,
		completedAt: wrapTimestamp(now)
	};

	assert.equal(isCompleted(lesson1, [completion1]), true);
	assert.equal(isCompleted(lesson2, [completion2Stale]), false);

	const summary = completionSummary(
		[lesson1, lesson2],
		[completion1, completion2Stale],
		[grant],
		now
	);
	assert.equal(summary.total, 2);
	assert.equal(summary.completed, 1);
	assert.equal(summary.percentage, 50);

	// Resuming playback position
	const progress: Progress = {
		lessonId: 'lesson-1',
		version: 1,
		positionSeconds: 65,
		updatedAt: wrapTimestamp(now)
	};
	assert.equal(resumePosition(lesson1, progress), 65);

	// Progress with version mismatch starts from 0
	const staleProgress: Progress = {
		lessonId: 'lesson-2',
		version: 1,
		positionSeconds: 80,
		updatedAt: wrapTimestamp(now)
	};
	assert.equal(resumePosition(lesson2, staleProgress), 0);
});

test('API and Firebase emulator modes cannot be enabled together', () => {
	assert.throws(() =>
		resolveBackendMode({
			PUBLIC_ACADEMY_ENABLED: 'true',
			PUBLIC_ACADEMY_BACKEND: 'api',
			PUBLIC_FIREBASE_MODE: 'emulator'
		})
	);
});
