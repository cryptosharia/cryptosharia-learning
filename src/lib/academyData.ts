import {
	collection,
	doc,
	getDocFromServer,
	getDocsFromServer,
	query,
	where,
	runTransaction,
	serverTimestamp,
	Timestamp,
	writeBatch,
	type Firestore
} from 'firebase/firestore';
import type { User } from 'firebase/auth';

export type Metadata = {
	id: string;
	kind: 'subject' | 'level' | 'chapter' | 'lesson';
	parentId: string;
	subjectId: string;
	chapterNumber: number;
	scopeId: string;
	subject: string;
	level: number;
	chapter: string;
	title: string;
	description: string;
	thumbnail: string;
	durationSeconds: number;
	order: number;
	instructor: string;
};
export type CatalogLesson = Metadata & { status: 'published'; version: number };
export type Media = {
	videoId: string;
	readingRefs: string[];
	slideRefs: string[];
	subtitleRefs: string[];
	attachmentRefs: string[];
	internalNote: string;
};
export type Approval = {
	contentId: string;
	version: number;
	reviewer: string;
	syariahReviewer: string | null;
	rights: 'confirmed';
	decision: 'approved';
	at: Timestamp;
};
export type Editorial = {
	metadata: Metadata;
	media: Media | null;
	version: number;
	status: 'draft' | 'review' | 'approved' | 'published';
	approval: Approval | null;
	syariahRequired: boolean;
	auditId: string;
	updatedAt: LearningTimestamp;
	updatedBy: string;
};
export type LearningTimestamp = { toMillis(): number; toDate(): Date };
export type Grant = {
	uid: string;
	scopeId: string;
	state: 'active' | 'revoked';
	startsAt: LearningTimestamp;
	expiresAt: LearningTimestamp;
};

export async function readCatalog(db: Firestore, scopeId?: string): Promise<CatalogLesson[]> {
	const conditions = [where('status', '==', 'published'), where('kind', '==', 'lesson')];
	if (scopeId) conditions.push(where('scopeId', '==', scopeId));
	const snap = await getDocsFromServer(query(collection(db, 'academy_catalog'), ...conditions));
	return snap.docs.map((d) => d.data() as CatalogLesson).sort(lessonOrder);
}

export const lessonOrder = (a: CatalogLesson, b: CatalogLesson) =>
	a.level - b.level ||
	a.chapterNumber - b.chapterNumber ||
	a.order - b.order ||
	a.id.localeCompare(b.id);
export async function readCurriculum(db: Firestore): Promise<CatalogLesson[]> {
	const snap = await getDocsFromServer(
		query(collection(db, 'academy_catalog'), where('status', '==', 'published'))
	);
	return snap.docs.map((d) => d.data() as CatalogLesson).sort(lessonOrder);
}

export async function academyRoles(user: User | null) {
	if (!user) return { admin: false, reviewer: false, publisher: false, syariah: false };
	const { claims } = await user.getIdTokenResult(true);
	const verified = claims.email_verified === true;
	return {
		admin: verified && claims.academyAdmin === true,
		reviewer: verified && claims.academyReviewer === true,
		publisher: verified && claims.academyPublisher === true,
		syariah: verified && claims.academySyariah === true
	};
}

// Every sensitive operation uses the client SDK: candidate Rules remain the authority.
export async function saveEditorial(
	db: Firestore,
	uid: string,
	input: { metadata: Metadata; media: Media | null; syariahRequired: boolean },
	expectedVersion: number | null
) {
	const ref = doc(db, 'academy_editorial', input.metadata.id);
	const audit = doc(collection(db, 'academy_audit'));
	await runTransaction(db, async (tx) => {
		const old = await tx.get(ref);
		if ((old.exists() ? old.data().version : null) !== expectedVersion)
			throw new Error('Content version conflict. Reload before editing.');
		const version = (expectedVersion ?? 0) + 1;
		tx.set(ref, {
			...input,
			version,
			status: 'draft',
			approval: null,
			auditId: audit.id,
			updatedBy: uid,
			updatedAt: serverTimestamp()
		});
		if (input.metadata.kind === 'lesson') {
			tx.delete(doc(db, 'academy_catalog', input.metadata.id));
			if (old.exists() && old.data().status === 'published')
				tx.delete(
					doc(
						db,
						'academy_positions',
						`${old.data().metadata.parentId}_${old.data().metadata.order}`
					)
				);
		}
		tx.set(audit, {
			contentId: input.metadata.id,
			version,
			status: 'draft',
			actor: uid,
			at: serverTimestamp()
		});
	});
}

export async function transitionEditorial(
	db: Firestore,
	uid: string,
	id: string,
	expectedVersion: number,
	status: Editorial['status']
) {
	const ref = doc(db, 'academy_editorial', id);
	const audit = doc(collection(db, 'academy_audit'));
	await runTransaction(db, async (tx) => {
		const old = await tx.get(ref);
		if (!old.exists() || old.data().version !== expectedVersion)
			throw new Error('Content version conflict.');
		const current = old.data() as Editorial;
		const approval =
			status === 'approved'
				? {
						contentId: id,
						version: expectedVersion,
						reviewer: uid,
						syariahReviewer: current.syariahRequired ? uid : null,
						rights: 'confirmed',
						decision: 'approved',
						at: serverTimestamp()
					}
				: status === 'draft'
					? null
					: current.approval;
		tx.update(ref, {
			status,
			approval,
			auditId: audit.id,
			updatedBy: uid,
			updatedAt: serverTimestamp()
		});
		tx.set(audit, {
			contentId: id,
			version: expectedVersion,
			status,
			actor: uid,
			at: serverTimestamp()
		});
		if (status === 'published') {
			tx.set(
				doc(db, 'academy_positions', `${current.metadata.parentId}_${current.metadata.order}`),
				{ id }
			);
			tx.set(doc(db, 'academy_catalog', id), {
				...current.metadata,
				status,
				version: expectedVersion
			});
			if (current.metadata.kind === 'lesson')
				tx.set(doc(db, 'academy_lessons', id), {
					...current.media,
					id,
					scopeId: current.metadata.scopeId,
					version: expectedVersion
				});
		} else if (status === 'draft' && current.metadata.kind === 'lesson')
			tx.delete(doc(db, 'academy_catalog', id));
	});
}

export async function deleteDraft(db: Firestore, uid: string, id: string, expectedVersion: number) {
	await runTransaction(db, async (tx) => {
		const ref = doc(db, 'academy_editorial', id);
		const snap = await tx.get(ref);
		if (!snap.exists() || snap.data().version !== expectedVersion || snap.data().status !== 'draft')
			throw new Error('Only the current draft can be deleted.');
		tx.set(doc(db, 'academy_audit', `${uid}_${id}_delete`), {
			contentId: id,
			version: expectedVersion,
			status: 'deleted',
			actor: uid,
			at: serverTimestamp()
		});
		tx.delete(ref);
		tx.delete(doc(db, 'academy_catalog', id));
		tx.delete(doc(db, 'academy_lessons', id));
	});
}

export async function writeGrant(
	db: Firestore,
	actor: string,
	uid: string,
	scopeId: string,
	state: Grant['state'],
	startsAt: LearningTimestamp,
	expiresAt: LearningTimestamp
) {
	const audit = doc(collection(db, 'academy_audit'));
	const batch = writeBatch(db);
	batch.set(doc(db, 'academy_grants', uid, 'scopes', scopeId), {
		uid,
		scopeId,
		state,
		startsAt,
		expiresAt,
		source: 'synthetic-local',
		updatedBy: actor,
		updatedAt: serverTimestamp(),
		auditId: audit.id
	});
	batch.set(audit, { uid, scopeId, state, actor, at: serverTimestamp() });
	await batch.commit();
}

export async function saveProgress(
	db: Firestore,
	uid: string,
	lesson: CatalogLesson,
	positionSeconds: number
) {
	const batch = writeBatch(db);
	batch.set(doc(db, 'academy_progress', uid, 'lessons', lesson.id), {
		lessonId: lesson.id,
		version: lesson.version,
		positionSeconds,
		updatedAt: serverTimestamp()
	});
	await batch.commit();
}

export type Progress = {
	lessonId: string;
	version: number;
	positionSeconds: number;
	updatedAt: LearningTimestamp;
};

// UID is bound by the document path, not a client-supplied field.
export type Completion = {
	lessonId: string;
	version: number;
	completedAt: LearningTimestamp;
};

export async function completeLesson(db: Firestore, uid: string, lesson: CatalogLesson) {
	const ref = doc(db, 'academy_completion', uid, 'lessons', lesson.id);
	await runTransaction(db, async (tx) => {
		const current = await tx.get(ref);
		if (current.exists() && current.data().version === lesson.version) return;
		tx.set(ref, {
			lessonId: lesson.id,
			version: lesson.version,
			completedAt: serverTimestamp()
		});
	});
}

export const readEditorial = async (db: Firestore, id: string) => {
	const snap = await getDocFromServer(doc(db, 'academy_editorial', id));
	return snap.exists() ? (snap.data() as Editorial) : null;
};
