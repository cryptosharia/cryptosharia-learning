import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Timestamp } from 'firebase/firestore';
import { curriculumTree } from '../src/lib/academyCurriculum.ts';
import { lessonOrder, type CatalogLesson } from '../src/lib/academyData.ts';
import { progressRecorder, resumePosition } from '../src/lib/academyProgress.ts';
import { metadata } from './academy-fixtures.ts';
const lesson = { ...metadata('lesson-a1'), version: 1, status: 'published' as const };
const subject: CatalogLesson = {
	...lesson,
	id: 'fundamental',
	kind: 'subject',
	parentId: 'root',
	order: 0
};
const level: CatalogLesson = { ...lesson, id: 'level-a', kind: 'level', parentId: 'fundamental' };
const chapter: CatalogLesson = { ...lesson, id: 'chapter-a', kind: 'chapter', parentId: 'level-a' };
const tree = [subject, level, chapter, lesson];
test('hierarchy has four official subjects, six planned levels and real lesson count', () => {
	const parsed = curriculumTree(tree);
	assert.equal(parsed.length, 4);
	assert.equal(parsed[0].levels.length, 6);
	assert.equal(parsed[0].levels[0].chapters[0].lessons.length, 1);
	assert.equal(parsed[1].levels[0].chapters.length, 0);
});
test('API curriculum allows an unscoped subject to group scoped levels', () => {
	const apiTree = [{ ...subject, scopeId: '' }, level, chapter, lesson];
	assert.throws(() => curriculumTree(apiTree));
	const parsed = curriculumTree(apiTree, { allowGlobalSubjectScope: true });
	assert.equal(parsed[0].levels[0].chapters[0].lessons[0].id, lesson.id);
});
for (const [name, change] of [
	['duplicate order', { id: 'duplicate' }],
	['invalid parent', { parentId: 'fundamental' }],
	['orphan', { parentId: 'missing' }],
	['level zero', { level: 0 }],
	['level seven', { level: 7 }],
	['chapter zero', { chapterNumber: 0 }],
	['chapter eight', { chapterNumber: 8 }],
	['scope mismatch', { scopeId: 'scope-b' }],
	['subject mismatch', { subjectId: 'technical' }]
] as const)
	test(`curriculum rejects ${name}`, () => {
		const changed = { ...lesson, ...change };
		assert.throws(() =>
			curriculumTree(
				name === 'duplicate order' ? [...tree, changed] : [subject, level, chapter, changed]
			)
		);
	});
test('curriculum rejects a draft parent and preserves IDs through title changes', () => {
	assert.throws(() =>
		curriculumTree([
			subject,
			level,
			{ ...chapter, status: 'draft' } as unknown as CatalogLesson,
			lesson
		])
	);
	assert.equal(
		curriculumTree([subject, level, { ...chapter, title: 'Renamed' }, lesson])[0].levels[0]
			.chapters[0].lessons[0].id,
		lesson.id
	);
});
test('lesson order is level then chapter then explicit position', () => {
	const items = [
		{ ...lesson, id: 'later-level', level: 2, order: 0 },
		{ ...lesson, id: 'later-chapter', chapterNumber: 2, order: 0 },
		{ ...lesson, id: 'second', order: 2 },
		lesson
	];
	assert.deepEqual(
		items.sort(lessonOrder).map((l) => l.id),
		[lesson.id, 'second', 'later-chapter', 'later-level']
	);
});
test('resume validates finite bounds and version, preserves nonzero position', () => {
	const progress = {
		lessonId: lesson.id,
		version: 1,
		positionSeconds: 42,
		updatedAt: Timestamp.now()
	};
	assert.equal(resumePosition(lesson, progress), 42);
	for (const positionSeconds of [-1, 121, NaN, Infinity])
		assert.equal(resumePosition(lesson, { ...progress, positionSeconds }), 0);
	assert.equal(resumePosition({ ...lesson, version: 2 }, progress), 0);
});
test('progress sampling throttles, bounds, stops at revoke and ignores stale write responses', async () => {
	let now = 0,
		allowed = true;
	const writes: number[] = [],
		messages: string[] = [];
	let resolveWrite: (() => void) | undefined;
	const recorder = progressRecorder({
		lesson,
		allowed: () => allowed,
		now: () => now,
		write: async (p) => {
			writes.push(p);
		},
		emit: (m) => messages.push(m)
	});
	await recorder.sample(30);
	await recorder.sample(31);
	now = 3000;
	await recorder.sample(31, true);
	now = 4000;
	await recorder.sample(32, true);
	now = 18000;
	await recorder.sample(42);
	assert.deepEqual(writes, [30, 31, 42]);
	for (const p of [-1, NaN, Infinity, 121]) {
		now += 15000;
		await recorder.sample(p);
	}
	assert.equal(writes.length, 3);
	allowed = false;
	now += 15000;
	await recorder.sample(60);
	assert.equal(writes.length, 3);
	allowed = true;
	const late = progressRecorder({
		lesson,
		allowed: () => allowed,
		write: () =>
			new Promise<void>((resolve) => {
				resolveWrite = resolve;
			}),
		emit: (m) => messages.push(m)
	});
	const pending = late.sample(70);
	late.stop();
	resolveWrite!();
	await pending;
	assert.equal(messages.length, 3);
});
