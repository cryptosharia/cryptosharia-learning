import type { CatalogLesson } from './academyData.ts';
export const subjects = [
	{ id: 'fundamental', title: 'Analisis Fundamental' },
	{ id: 'technical', title: 'Analisis Teknikal' },
	{ id: 'muamalah', title: 'Fikih Muamalah' },
	{ id: 'web3', title: 'Web3 & Blockchain' }
] as const;

// Public metadata only. Planned slots never become invented Firestore records.
export function curriculumTree(
	items: CatalogLesson[],
	options: { allowGlobalSubjectScope?: boolean } = {}
) {
	const byId = new Map(items.map((item) => [item.id, item]));
	const positions = new Set<string>();
	for (const item of items) {
		if (
			!subjects.some((s) => s.id === item.subjectId) ||
			!Number.isInteger(item.level) ||
			item.level < 1 ||
			item.level > 6 ||
			!Number.isInteger(item.chapterNumber) ||
			item.chapterNumber < 1 ||
			item.chapterNumber > 7 ||
			!Number.isInteger(item.order) ||
			item.order < 0
		)
			throw new Error('Invalid curriculum numbers or subject.');
		const position = `${item.parentId}_${item.order}`;
		if (positions.has(position)) throw new Error('Duplicate curriculum order.');
		positions.add(position);
		if (item.kind === 'subject') {
			if (item.id !== item.subjectId || item.parentId !== 'root')
				throw new Error('Invalid subject parent.');
		} else {
			const parent = byId.get(item.parentId);
			const expected = { level: 'subject', chapter: 'level', lesson: 'chapter' }[item.kind];
			if (
				!parent ||
				parent.status !== 'published' ||
				parent.kind !== expected ||
				(parent.scopeId !== item.scopeId &&
					!(options.allowGlobalSubjectScope && parent.kind === 'subject' && !parent.scopeId)) ||
				parent.subjectId !== item.subjectId ||
				(item.kind !== 'level' && parent.level !== item.level) ||
				(item.kind === 'lesson' && parent.chapterNumber !== item.chapterNumber)
			)
				throw new Error('Invalid, unpublished or orphan parent.');
		}
	}
	const children = (id: string) =>
		items.filter((item) => item.parentId === id).sort((a, b) => a.order - b.order);
	return subjects.map((subject) => ({
		...subject,
		record: byId.get(subject.id),
		levels: Array.from({ length: 6 }, (_, index) => {
			const number = index + 1;
			const record = children(subject.id).find(
				(item) => item.kind === 'level' && item.level === number
			);
			return {
				number,
				record,
				chapters: record
					? children(record.id)
							.filter((item) => item.kind === 'chapter')
							.map((chapter) => ({
								record: chapter,
								lessons: children(chapter.id).filter((item) => item.kind === 'lesson')
							}))
					: []
			};
		})
	}));
}
