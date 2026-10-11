import { doc, onSnapshot, type Firestore } from 'firebase/firestore';
import type { Auth } from 'firebase/auth';
import type { CatalogLesson, Grant, Media } from './academyData.ts';
import { parseYouTubeUrl } from './youtube.ts';
import {
	doc as liteDoc,
	getDoc as getFreshDoc,
	type Firestore as LiteFirestore
} from 'firebase/firestore/lite';

export type PlayerState = {
	status:
		| 'loading'
		| 'ready'
		| 'unauthorized'
		| 'expired'
		| 'revoked'
		| 'unpublished'
		| 'not-found'
		| 'backend-unavailable';
	media: Media | null;
};

// No persistent media cache. A generation identifies BOTH actor and selected lesson.
export function createAcademyPlayer(
	db: Firestore,
	lessonDb: LiteFirestore,
	auth: Auth,
	emit: (state: PlayerState) => void
) {
	let generation = 0;
	let request = 0;
	let stopGrant: (() => void) | undefined;
	let poll: ReturnType<typeof setInterval> | undefined;
	let expiry: ReturnType<typeof setTimeout> | undefined;
	let current: CatalogLesson | null = null;
	let actor: string | null = null;
	let disposed = false;
	const clear = (status: PlayerState['status']) => emit({ status, media: null });
	const cancel = () => {
		stopGrant?.();
		stopGrant = undefined;
		clearInterval(poll);
		clearTimeout(expiry);
	};
	const valid = (g: number, uid: string) =>
		!disposed && g === generation && auth.currentUser?.uid === uid;
	const bounded = async <T>(operation: Promise<T>): Promise<T> => {
		let timeout: ReturnType<typeof setTimeout> | undefined;
		try {
			return await Promise.race([
				operation,
				new Promise<never>((_, reject) => {
					timeout = setTimeout(() => reject(new Error('Backend timeout')), 3000);
				})
			]);
		} finally {
			clearTimeout(timeout);
		}
	};
	async function read(g: number, uid: string, lesson: CatalogLesson) {
		const r = ++request;
		try {
			const grant = await bounded(
				getFreshDoc(liteDoc(lessonDb, 'academy_grants', uid, 'scopes', lesson.scopeId))
			);
			if (!valid(g, uid) || r !== request) return;
			if (!grant.exists()) {
				clear('unauthorized');
				return;
			}
			const rights = grant.data() as Grant;
			if (rights.state !== 'active') {
				clear('revoked');
				return;
			}
			if (rights.expiresAt.toMillis() <= Date.now()) {
				clear('expired');
				return;
			}
			if (rights.startsAt.toMillis() > Date.now()) {
				clear('unauthorized');
				return;
			}
			clearTimeout(expiry);
			expiry = setTimeout(
				() => {
					if (valid(g, uid)) {
						generation++;
						cancel();
						clear('expired');
					}
				},
				Math.min(2147483647, rights.expiresAt.toMillis() - Date.now())
			);
			// Lite performs a new server RPC per read, without persistent targets or offline cache.
			const snap = await bounded(getFreshDoc(liteDoc(lessonDb, 'academy_lessons', lesson.id)));
			if (!valid(g, uid) || r !== request) return;
			if (!snap.exists()) {
				clear('not-found');
				return;
			}
			if (snap.data().version !== lesson.version) {
				clear('unpublished');
				return;
			}
			if (!parseYouTubeUrl(`https://youtu.be/${snap.data().videoId}`)) {
				clear('unpublished');
				return;
			}
			emit({ status: 'ready', media: snap.data() as Media });
		} catch (error) {
			if (valid(g, uid) && r === request)
				clear(
					error instanceof Error && 'code' in error && error.code === 'permission-denied'
						? 'unpublished'
						: 'backend-unavailable'
				);
		}
	}
	function open(lesson: CatalogLesson | null) {
		generation++;
		cancel();
		current = lesson;
		actor = auth.currentUser?.uid ?? null;
		clear('loading');
		if (!lesson) {
			clear('not-found');
			return;
		}
		if (!actor) {
			clear('unauthorized');
			return;
		}
		const g = generation,
			uid = actor;
		stopGrant = onSnapshot(
			doc(db, 'academy_grants', uid, 'scopes', lesson.scopeId),
			{ includeMetadataChanges: true },
			(snapshot) => {
				if (!valid(g, uid)) return;
				// Invalidate pending private reads on revocation/cache events, not just visible state.
				if (snapshot.metadata.fromCache) {
					request++;
					clear('backend-unavailable');
					return;
				}
				const grant = snapshot.data() as Grant | undefined;
				if (!grant || grant.state !== 'active' || grant.expiresAt.toMillis() <= Date.now()) {
					generation++;
					cancel();
					clear(!grant ? 'unauthorized' : grant.state !== 'active' ? 'revoked' : 'expired');
					return;
				}
				void read(g, uid, lesson);
			},
			() => {
				if (valid(g, uid)) {
					generation++;
					cancel();
					clear('backend-unavailable');
				}
			}
		);
		void read(g, uid, lesson);
		poll = setInterval(() => {
			if (valid(g, uid)) void read(g, uid, lesson);
			else if (!disposed && g === generation) {
				generation++;
				cancel();
				clear('unauthorized');
			}
		}, 2000);
	}
	return {
		open,
		suspend() {
			generation++;
			cancel();
			clear('backend-unavailable');
		},
		resume() {
			open(current);
		},
		dispose() {
			disposed = true;
			generation++;
			cancel();
			current = null;
			actor = null;
			clear('unauthorized');
		}
	};
}
