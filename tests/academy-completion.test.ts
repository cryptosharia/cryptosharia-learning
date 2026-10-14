import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Timestamp } from 'firebase/firestore';
import type { CatalogLesson, Completion, Grant } from '../src/lib/academyData.ts';
import {
	activeScope,
	completionSummary,
	isCompleted,
	resumePosition
} from '../src/lib/academyProgress.ts';
import { metadata } from './academy-fixtures.ts';

const now = 10000;
const lesson: CatalogLesson = { ...metadata('lesson-a1'), version: 1, status: 'published' };
const lessons = Array.from({ length: 5 }, (_, i) => ({ ...lesson, id: `lesson-${i}` }));
const grant: Grant = {
	uid: 'synthetic',
	scopeId: 'scope-a',
	state: 'active',
	startsAt: Timestamp.fromMillis(0),
	expiresAt: Timestamp.fromMillis(20000)
};
const records = (items: CatalogLesson[]): Completion[] =>
	items.map((l) => ({
		lessonId: l.id,
		version: l.version,
		completedAt: Timestamp.fromMillis(now)
	}));

test('completion zero denominator is 0%, including no active access', () => {
	assert.deepEqual(completionSummary([], [], [grant], now), {
		completed: 0,
		total: 0,
		percentage: 0
	});
	assert.deepEqual(completionSummary(lessons, records(lessons), [], now), {
		completed: 0,
		total: 0,
		percentage: 0
	});
});
test('completion partial and all use actual published lessons', () => {
	assert.deepEqual(completionSummary(lessons, records(lessons.slice(0, 2)), [grant], now), {
		completed: 2,
		total: 5,
		percentage: 40
	});
	assert.deepEqual(completionSummary(lessons, records(lessons), [grant], now), {
		completed: 5,
		total: 5,
		percentage: 100
	});
});
test('duplicate completion and catalog entries do not double count', () => {
	const completed = records(lessons.slice(0, 2));
	assert.deepEqual(
		completionSummary([...lessons, lessons[0]], [...completed, ...completed], [grant], now),
		{ completed: 2, total: 5, percentage: 40 }
	);
});
test('old versions, unknown lessons and non-lesson records never count', () => {
	assert.equal(isCompleted({ ...lesson, version: 2 }, records([lesson])), false);
	assert.equal(isCompleted({ ...lesson, kind: 'chapter' }, records([lesson])), false);
	assert.equal(completionSummary(lessons, records([lesson]), [grant], now).completed, 0);
});
test('drafts, unpublished items and planned placeholders are excluded', () => {
	const draft = { ...lessons[0], status: 'draft' } as unknown as CatalogLesson;
	const chapter = { ...lessons[1], kind: 'chapter' as const };
	assert.deepEqual(
		completionSummary([draft, chapter, lessons[2]], records(lessons), [grant], now),
		{ completed: 1, total: 1, percentage: 100 }
	);
});
test('scope filtering and revoked, expired and future grants exclude requirements', () => {
	const other = { ...lesson, id: 'other', scopeId: 'scope-b' };
	assert.equal(completionSummary([lesson, other], records([lesson, other]), [grant], now).total, 1);
	assert.equal(completionSummary([lesson], records([lesson]), [grant], now, 'scope-b').total, 0);
	for (const changed of [
		{ ...grant, state: 'revoked' as const },
		{ ...grant, expiresAt: Timestamp.fromMillis(now) },
		{ ...grant, startsAt: Timestamp.fromMillis(now + 1) }
	]) {
		assert.equal(activeScope([changed], 'scope-a', now), false);
		assert.equal(completionSummary([lesson], records([lesson]), [changed], now).total, 0);
	}
});
test('completing new version never alters historical resume data', () => {
	const position = {
		lessonId: lesson.id,
		version: 1,
		positionSeconds: 57,
		updatedAt: Timestamp.fromMillis(now)
	};
	assert.equal(resumePosition(lesson, position), 57);
	assert.equal(isCompleted(lesson, []), false);
	assert.equal(isCompleted(lesson, records([lesson])), true);
	const revised = { ...lesson, version: 2 };
	assert.equal(isCompleted(revised, records([lesson])), false);
	assert.equal(isCompleted(revised, records([revised])), true);
	assert.equal(resumePosition(revised, position), 0);
	assert.equal(position.positionSeconds, 57);
});
