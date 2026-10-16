import assert from 'node:assert/strict';
import test from 'node:test';
import {
	parseManifestText,
	parseYouTubeVideoId,
	validateManifest
} from '../scripts/academy-content-preview.mjs';

const curriculum = [
	{
		id: 'fundamental',
		kind: 'subject',
		parentId: 'root',
		subjectId: 'fundamental',
		level: 0,
		chapterNumber: 0,
		order: 0,
		scopeId: null
	},
	{
		id: 'fundamental-level-1',
		kind: 'level',
		parentId: 'fundamental',
		subjectId: 'fundamental',
		level: 1,
		chapterNumber: 0,
		order: 1,
		scopeId: 'scope-a'
	},
	{
		id: 'fundamental-level-1-chapter-1',
		kind: 'chapter',
		parentId: 'fundamental-level-1',
		subjectId: 'fundamental',
		level: 1,
		chapterNumber: 1,
		order: 1,
		scopeId: 'scope-a'
	},
	{
		id: 'existing-lesson',
		kind: 'lesson',
		parentId: 'fundamental-level-1-chapter-1',
		subjectId: 'fundamental',
		level: 1,
		chapterNumber: 1,
		order: 0,
		scopeId: 'scope-a'
	}
];

function candidate(overrides = {}) {
	return {
		lesson_id: 'lesson-candidate-1',
		subject: 'fundamental',
		level: 1,
		chapter: 1,
		lesson_order: 1,
		parent_id: 'fundamental-level-1-chapter-1',
		title: 'Synthetic test row',
		description: 'Test-only content; not official.',
		youtube_url_or_id: 'abcdefghijk',
		duration_seconds: 600,
		visibility: 'private',
		publication_status: 'draft',
		version: 1,
		scope: 'scope-a',
		...overrides
	};
}

test('CSV parser accepts quoted commas, line breaks, and CRLF', () => {
	const csv = [
		'lesson_id,subject,level,chapter,lesson_order,parent_id,title,description,youtube_url_or_id,duration_seconds,visibility,publication_status,version,scope',
		'lesson-candidate-1,fundamental,1,1,1,fundamental-level-1-chapter-1,"Title, part two","First line\nsecond line",abcdefghijk,600,private,draft,1,scope-a'
	].join('\r\n');
	const rows = parseManifestText(csv, 'csv');
	assert.equal(rows.length, 1);
	assert.equal(rows[0].title, 'Title, part two');
	assert.equal(rows[0].description, 'First line\nsecond line');
	assert.equal(rows[0]._sourceRow, 3);
});

test('local preview reconciles a draft lesson without writes or publishing', () => {
	const result = validateManifest([candidate()], { curriculumItems: curriculum });
	assert.equal(result.valid, true);
	assert.equal(result.reconciled, true);
	assert.equal(result.readyForOwnerReview, true);
	assert.equal(result.databaseWrites, false);
	assert.equal(result.videoFetched, false);
	assert.equal(result.published, false);
	assert.equal(result.candidates[0].content.status, 'draft');
	assert.equal(result.candidates[0].mediaPreview.videoId, 'abcdefghijk');
	assert.equal(result.candidates[0].workflow.claimsVerified, false);
});

test('editorial, approval, rights, and syariah states remain preview metadata', () => {
	const result = validateManifest(
		[
			candidate({
				editorial_status: 'in_review',
				approval_status: 'pending',
				rights_status: 'pending',
				syariah_review_status: 'in_review'
			})
		],
		{ curriculumItems: curriculum }
	);
	assert.equal(result.valid, true);
	assert.equal(result.candidates[0].content.status, 'draft');
	assert.deepEqual(result.candidates[0].workflow, {
		editorialStatus: 'in_review',
		approvalStatus: 'pending',
		rightsStatus: 'pending',
		syariahReviewStatus: 'in_review',
		claimsVerified: false
	});
});

test('duplicate lesson IDs, duplicate orders, and existing order conflicts fail clearly', () => {
	const duplicateId = candidate({ lesson_order: 2 });
	const duplicateOrder = candidate({ lesson_id: 'lesson-candidate-2' });
	const result = validateManifest([candidate(), duplicateId, duplicateOrder], {
		curriculumItems: curriculum
	});
	assert.ok(
		result.errors.some(
			(error) => error.field === 'lesson_id' && /Duplicate lesson ID/.test(error.message)
		)
	);
	assert.ok(
		result.errors.some(
			(error) => error.field === 'lesson_order' && /another manifest row/.test(error.message)
		)
	);
	const existingOrder = validateManifest([candidate({ lesson_order: 0 })], {
		curriculumItems: curriculum
	});
	assert.ok(
		existingOrder.errors.some((error) => /existing lesson "existing-lesson"/.test(error.message))
	);
});

test('unknown hierarchy, wrong parent, wrong scope, and unsafe publication are rejected', () => {
	const unknownSubject = validateManifest([candidate({ subject: 'invented-subject' })], {
		curriculumItems: curriculum
	});
	assert.ok(unknownSubject.errors.some((error) => error.field === 'subject'));
	const result = validateManifest(
		[
			candidate({
				parent_id: 'wrong-parent',
				scope: 'scope-b',
				visibility: 'public',
				publication_status: 'published'
			})
		],
		{ curriculumItems: curriculum }
	);
	for (const field of ['parent_id', 'scope', 'visibility', 'publication_status']) {
		assert.ok(
			result.errors.some((error) => error.field === field),
			`expected ${field} error`
		);
	}
});

test('YouTube input accepts recognized HTTPS forms and rejects lookalike hosts', () => {
	assert.equal(parseYouTubeVideoId('https://youtu.be/abcdefghijk?t=8'), 'abcdefghijk');
	assert.equal(parseYouTubeVideoId('https://www.youtube.com/watch?v=abcdefghijk'), 'abcdefghijk');
	assert.equal(parseYouTubeVideoId('https://youtube.com/shorts/abcdefghijk'), 'abcdefghijk');
	assert.equal(parseYouTubeVideoId('https://youtube.example/watch?v=abcdefghijk'), null);
	assert.equal(parseYouTubeVideoId('http://youtu.be/abcdefghijk'), null);
});

test('without a local reference, structural validation does not claim reconciliation', () => {
	const result = validateManifest([candidate()]);
	assert.equal(result.valid, true);
	assert.equal(result.reconciled, false);
	assert.equal(result.readyForOwnerReview, false);
	assert.ok(result.warnings.some((warning) => /No local curriculum reference/.test(warning)));
});

test('JSON manifest accepts the documented lessons array', () => {
	const rows = parseManifestText(`\uFEFF${JSON.stringify({ lessons: [candidate()] })}`, 'json');
	assert.equal(rows[0].lesson_id, 'lesson-candidate-1');
});
