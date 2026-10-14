import assert from 'node:assert/strict';
import { before, after, test } from 'node:test';
import {
	collection,
	doc,
	getDocFromServer,
	getDocsFromServer,
	setDoc,
	updateDoc,
	deleteDoc,
	query,
	where,
	Timestamp,
	serverTimestamp,
	writeBatch
} from 'firebase/firestore';
import { seed, claims, input, metadata, media, rulesDb } from './academy-fixtures.ts';
import {
	saveEditorial,
	transitionEditorial,
	deleteDraft,
	writeGrant,
	readCatalog,
	saveProgress,
	completeLesson
} from '../src/lib/academyData.ts';
import { initializeFirebaseClient } from '../src/lib/firebaseClient.ts';
import { settings, password } from './academy-fixtures.ts';
import { deleteApp } from 'firebase/app';
import { signInWithEmailAndPassword, signOut } from 'firebase/auth';
import { doc as liteDoc, getDoc as freshGet } from 'firebase/firestore/lite';
let fixture: Awaited<ReturnType<typeof seed>>;
before(async () => {
	fixture = await seed();
});
after(async () => {
	await fixture?.environment.cleanup();
});
async function denied(operation: Promise<unknown>) {
	await assert.rejects(
		operation,
		(e: unknown) => e instanceof Error && 'code' in e && e.code === 'permission-denied'
	);
}
for (const role of ['guest', 'no-grant', 'active', 'expired', 'revoked', 'verified-admin']) {
	test(`candidate six-role: ${role}`, async (t) => {
		const { environment, users } = fixture;
		const uid = role === 'guest' ? 'guest' : users[role].uid;
		const db =
			role === 'guest'
				? rulesDb(environment.unauthenticatedContext())
				: rulesDb(
						environment.authenticatedContext(
							uid,
							role === 'verified-admin'
								? claims
								: { email: `${role}@example.test`, email_verified: true }
						)
					);
		const admin = role === 'verified-admin',
			member = role === 'active';
		await t.test('published query returns only safe metadata', async () => {
			const catalog = await readCatalog(db);
			assert.equal(catalog.length, 3);
			for (const lesson of catalog) {
				assert.deepEqual(
					Object.keys(lesson).sort(),
					[...Object.keys(metadata(lesson.id)), 'status', 'version'].sort()
				);
				assert(!JSON.stringify(lesson).includes(media.videoId));
			}
		});
		await t.test('known public ID succeeds; unconstrained query and draft ID denied', async () => {
			assert((await getDocFromServer(doc(db, 'academy_catalog', 'lesson-a1'))).exists());
			await denied(getDocsFromServer(collection(db, 'academy_catalog')));
			await denied(getDocFromServer(doc(db, 'academy_catalog', 'draft-only')));
		});
		await t.test('private direct known ID respects scope', async () => {
			const op = getDocFromServer(doc(db, 'academy_lessons', 'lesson-a1'));
			if (admin || member) assert.equal((await op).data()?.videoId, media.videoId);
			else await denied(op);
			const out = getDocFromServer(doc(db, 'academy_lessons', 'lesson-b1'));
			if (admin) assert((await out).exists());
			else await denied(out);
		});
		await t.test('private listing denied even with scope predicate', async () => {
			await denied(getDocsFromServer(collection(db, 'academy_lessons')));
			await denied(
				getDocsFromServer(
					query(collection(db, 'academy_lessons'), where('scopeId', '==', 'scope-a'))
				)
			);
		});
		await t.test('editorial and cross-user grant reads require trusted authority', async () => {
			const op = getDocFromServer(doc(db, 'academy_editorial', 'draft-only'));
			if (admin) assert((await op).exists());
			else await denied(op);
			const cross = getDocFromServer(
				doc(db, 'academy_grants', users.active.uid, 'scopes', 'scope-a')
			);
			if (admin || member) assert((await cross).exists());
			else await denied(cross);
		});
		await t.test(
			'own grant query and historical progress; cross-user progress denies',
			async () => {
				const history = getDocFromServer(doc(db, 'academy_progress', uid, 'lessons', 'lesson-a1'));
				const grants = getDocsFromServer(collection(db, 'academy_grants', uid, 'scopes'));
				if (role === 'guest') {
					await denied(history);
					await denied(grants);
				} else {
					assert((await history).exists());
					await grants;
				}
				const other = uid === users.active.uid ? users.revoked.uid : users.active.uid;
				await denied(getDocFromServer(doc(db, 'academy_progress', other, 'lessons', 'lesson-a1')));
				await denied(getDocsFromServer(collection(db, 'users')));
			}
		);
		await t.test(
			'cross-user profile/progress and profile role or email forgery denied',
			async () => {
				await denied(
					getDocFromServer(
						doc(
							db,
							'users',
							users['no-grant'].uid === uid ? users.active.uid : users['no-grant'].uid
						)
					)
				);
				await denied(
					setDoc(doc(db, 'academy_progress', 'other', 'lessons', 'lesson-a1'), {
						lessonId: 'lesson-a1',
						version: 1,
						positionSeconds: 1,
						updatedAt: serverTimestamp()
					})
				);
				for (const fields of [
					{ role: 'admin' },
					{ subscriptionStatus: 'active' },
					{ academyAdmin: true },
					{ entitlement: 'scope-a' },
					{ approval: true },
					{ email: 'forged-admin@example.test' }
				])
					await denied(setDoc(doc(db, 'users', uid), fields, { merge: true }));
			}
		);
		await t.test(
			'grant creation without audit, order approval, voucher mutation denied',
			async () => {
				await denied(
					setDoc(doc(db, 'academy_grants', uid, 'scopes', 'scope-b'), {
						uid,
						scopeId: 'scope-b',
						state: 'active'
					})
				);
				await denied(setDoc(doc(db, 'orders', 'dummy'), { status: 'approved', uid }));
				await denied(setDoc(doc(db, 'vouchers', 'dummy'), { enabled: true }));
			}
		);
		await t.test('fully shaped grant path and legacy collections remain protected', async () => {
			if (!admin)
				await denied(
					writeGrant(
						db,
						uid,
						uid,
						'scope-b',
						'active',
						Timestamp.fromMillis(Date.now() - 1000),
						Timestamp.fromMillis(Date.now() + 60000)
					)
				);
			for (const name of ['elearning_courses', 'orders', 'vouchers']) {
				await denied(getDocsFromServer(collection(db, name)));
				await denied(getDocFromServer(doc(db, name, 'known-id')));
			}
		});
		await t.test('own profile bounded update succeeds only logged in', async () => {
			const op = updateDoc(doc(db, 'users', uid), { displayName: 'Synthetic updated name' });
			if (role === 'guest') await denied(op);
			else await op;
		});
		await t.test('progress write requires current grant and valid lesson', async () => {
			const lesson = { ...metadata('lesson-a1'), status: 'published' as const, version: 1 };
			const op = saveProgress(db, uid, lesson, 10);
			if (member) await op;
			else await denied(op);
			await denied(saveProgress(db, uid, { ...lesson, id: 'lesson-b1', scopeId: 'scope-b' }, 10));
			await denied(saveProgress(db, uid, lesson, 121));
		});
		await t.test(
			'non-admin CMS create/update/delete denied and publish cannot skip approval',
			async () => {
				if (!admin) {
					await denied(saveEditorial(db, uid, input(`unauthorized-${role}`), null));
					await denied(
						updateDoc(doc(db, 'academy_editorial', 'draft-only'), { status: 'published' })
					);
					await denied(deleteDoc(doc(db, 'academy_editorial', 'draft-only')));
				} else await denied(transitionEditorial(db, uid, 'draft-only', 1, 'published'));
			}
		);
	});
}
test('trusted admin CRUD, approval, edit invalidation, audit and explicit grants', async () => {
	const { environment, users } = fixture,
		uid = users['verified-admin'].uid;
	const db = rulesDb(environment.authenticatedContext(uid, claims));
	await saveEditorial(db, uid, input('workflow'), null);
	await denied(transitionEditorial(db, uid, 'workflow', 1, 'published'));
	await transitionEditorial(db, uid, 'workflow', 1, 'review');
	await transitionEditorial(db, uid, 'workflow', 1, 'draft');
	await transitionEditorial(db, uid, 'workflow', 1, 'review');
	await transitionEditorial(db, uid, 'workflow', 1, 'approved');
	await denied(
		updateDoc(doc(db, 'academy_editorial', 'workflow'), {
			media: { ...media, videoId: 'BBBBBBBBBBB' },
			status: 'published'
		})
	);
	await transitionEditorial(db, uid, 'workflow', 1, 'published');
	await saveEditorial(
		db,
		uid,
		{ ...input('workflow'), media: { ...media, videoId: 'BBBBBBBBBBB' } },
		1
	);
	await denied(transitionEditorial(db, uid, 'workflow', 2, 'published'));
	await assert.rejects(saveEditorial(db, uid, input('workflow'), 1), /version conflict/);
	const guest = rulesDb(environment.unauthenticatedContext());
	await denied(getDocFromServer(doc(guest, 'academy_catalog', 'workflow')));
	await deleteDraft(db, uid, 'workflow', 2);
	assert.equal((await getDocFromServer(doc(db, 'academy_editorial', 'workflow'))).exists(), false);
	await writeGrant(
		db,
		uid,
		users['no-grant'].uid,
		'scope-b',
		'active',
		Timestamp.fromMillis(Date.now() - 1000),
		Timestamp.fromMillis(Date.now() + 60000)
	);
	const member = rulesDb(environment.authenticatedContext(users['no-grant'].uid));
	assert((await getDocFromServer(doc(member, 'academy_lessons', 'lesson-b1'))).exists());
	await writeGrant(
		db,
		uid,
		users['no-grant'].uid,
		'scope-b',
		'revoked',
		Timestamp.fromMillis(Date.now() - 1000),
		Timestamp.fromMillis(Date.now() + 60000)
	);
	await denied(getDocFromServer(doc(member, 'academy_lessons', 'lesson-b1')));
	const audit = await getDocsFromServer(collection(db, 'academy_audit'));
	assert(audit.size > 10);
	await denied(updateDoc(audit.docs[0].ref, { actor: 'forged' }));
});
test('claims must be verified and role-specific; profile email grants no privilege', async () => {
	const env = fixture.environment;
	for (const token of [
		{ ...claims, email_verified: false },
		{ email: 'verified-admin@example.test', email_verified: true },
		{ academyPublisher: true, email_verified: true }
	]) {
		const db = rulesDb(env.authenticatedContext('claim-probe', token));
		await denied(saveEditorial(db, 'claim-probe', input('claim-probe'), null));
		await denied(
			writeGrant(
				db,
				'claim-probe',
				'member',
				'scope-a',
				'active',
				Timestamp.now(),
				Timestamp.fromMillis(Date.now() + 60000)
			)
		);
	}
	const admin = rulesDb(
		env.authenticatedContext('editor-only', { academyAdmin: true, email_verified: true })
	);
	await saveEditorial(admin, 'editor-only', input('role-specific'), null);
	await transitionEditorial(admin, 'editor-only', 'role-specific', 1, 'review');
	await denied(transitionEditorial(admin, 'editor-only', 'role-specific', 1, 'approved'));
	const reviewer = rulesDb(
		env.authenticatedContext('review-only', { academyReviewer: true, email_verified: true })
	);
	await denied(transitionEditorial(reviewer, 'review-only', 'role-specific', 1, 'approved'));
	const syariah = rulesDb(
		env.authenticatedContext('review-syariah', {
			academyReviewer: true,
			academySyariah: true,
			email_verified: true
		})
	);
	await transitionEditorial(syariah, 'review-syariah', 'role-specific', 1, 'approved');
	await denied(transitionEditorial(syariah, 'review-syariah', 'role-specific', 1, 'published'));
	const publisher = rulesDb(
		env.authenticatedContext('publish-only', { academyPublisher: true, email_verified: true })
	);
	await transitionEditorial(publisher, 'publish-only', 'role-specific', 1, 'published');
});
test('published metadata cannot gain private fields; approval version/rights/audit are enforced', async () => {
	const uid = fixture.users['verified-admin'].uid,
		db = rulesDb(fixture.environment.authenticatedContext(uid, claims));
	await denied(updateDoc(doc(db, 'academy_catalog', 'lesson-a1'), { videoId: media.videoId }));
	await denied(updateDoc(doc(db, 'academy_lessons', 'lesson-a1'), { scopeId: 'scope-b' }));
	await denied(updateDoc(doc(db, 'academy_lessons', 'lesson-a1'), { videoId: 'invalid' }));
	await saveEditorial(db, uid, input('approval-probe'), null);
	await transitionEditorial(db, uid, 'approval-probe', 1, 'review');
	for (const invalid of [
		{ version: 2, rights: 'confirmed' },
		{ version: 1, rights: 'unconfirmed' }
	]) {
		const audit = doc(collection(db, 'academy_audit')),
			batch = writeBatch(db);
		batch.update(doc(db, 'academy_editorial', 'approval-probe'), {
			status: 'approved',
			approval: {
				contentId: 'approval-probe',
				version: invalid.version,
				reviewer: uid,
				syariahReviewer: uid,
				rights: invalid.rights,
				decision: 'approved',
				at: serverTimestamp()
			},
			updatedAt: serverTimestamp(),
			updatedBy: uid,
			auditId: audit.id
		});
		batch.set(audit, {
			contentId: 'approval-probe',
			version: 1,
			status: 'approved',
			actor: uid,
			at: serverTimestamp()
		});
		await denied(batch.commit());
	}
	await denied(
		updateDoc(doc(db, 'academy_editorial', 'approval-probe'), {
			status: 'approved',
			updatedBy: uid,
			updatedAt: serverTimestamp()
		})
	);
});
for (const role of ['no-grant', 'active', 'expired', 'revoked', 'verified-admin'])
	test(`real Auth + application factory + fresh SDK read: ${role}`, async () => {
		const client = initializeFirebaseClient(settings, `candidate-real-${role}`);
		try {
			const user = fixture.users[role];
			await signInWithEmailAndPassword(client.auth, user.email, password);
			assert.equal(client.auth.currentUser?.uid, user.uid);
			const token = await client.auth.currentUser!.getIdTokenResult();
			assert.equal(token.claims.academyAdmin === true, role === 'verified-admin');
			const op = freshGet(liteDoc(client.lessonDb, 'academy_lessons', 'lesson-a1'));
			if (role === 'active' || role === 'verified-admin')
				assert.equal((await op).data()?.videoId, media.videoId);
			else await denied(op);
			await signOut(client.auth);
			await denied(freshGet(liteDoc(client.lessonDb, 'academy_lessons', 'lesson-a1')));
		} finally {
			await deleteApp(client.app);
		}
	});

test('curriculum invalid parents, traversal, scope and number writes deny', async () => {
	const uid = fixture.users['verified-admin'].uid,
		db = rulesDb(fixture.environment.authenticatedContext(uid, claims));
	for (const change of [
		{ parentId: 'missing' },
		{ parentId: 'fundamental' },
		{ parentId: 'chapter-b' },
		{ level: 0 },
		{ level: 7 },
		{ chapterNumber: 0 },
		{ chapterNumber: 8 },
		{ kind: 'chapter', parentId: 'level-a', order: 2, chapterNumber: 1 },
		{ subjectId: 'technical' },
		{ scopeId: 'scope-b' }
	])
		await denied(
			saveEditorial(
				db,
				uid,
				{
					...input('invalid-parent'),
					metadata: { ...metadata('invalid-parent'), ...change } as ReturnType<typeof metadata>
				},
				null
			)
		);
	const member = rulesDb(fixture.environment.authenticatedContext(fixture.users.active.uid));
	await denied(getDocFromServer(doc(member, 'academy_positions', 'chapter-a_1')));
	await denied(getDocFromServer(doc(member, 'academy_editorial', 'chapter-a')));
	await denied(
		setDoc(doc(member, 'academy_catalog', 'forged-parent'), {
			...metadata('forged-parent'),
			status: 'published',
			version: 1
		})
	);
});

test('draft parent cannot publish child; duplicate sibling position is atomic', async () => {
	const uid = fixture.users['verified-admin'].uid,
		db = rulesDb(fixture.environment.authenticatedContext(uid, claims));
	const parent = {
		...input('draft-chapter'),
		metadata: {
			...metadata('draft-chapter'),
			kind: 'chapter' as const,
			durationSeconds: 0,
			parentId: 'level-a',
			chapterNumber: 2,
			order: 2
		},
		media: null
	};
	await saveEditorial(db, uid, parent, null);
	await saveEditorial(
		db,
		uid,
		{
			...input('draft-child'),
			metadata: { ...metadata('draft-child'), parentId: 'draft-chapter', chapterNumber: 2 }
		},
		null
	);
	for (const state of ['review', 'approved'] as const)
		await transitionEditorial(db, uid, 'draft-child', 1, state);
	await denied(deleteDraft(db, uid, 'draft-chapter', 1));
	await denied(transitionEditorial(db, uid, 'draft-child', 1, 'published'));
	const guest = rulesDb(fixture.environment.unauthenticatedContext());
	await denied(getDocFromServer(doc(guest, 'academy_catalog', 'draft-chapter')));
	await denied(getDocFromServer(doc(guest, 'academy_catalog', 'draft-child')));
	await saveEditorial(
		db,
		uid,
		{ ...input('duplicate-order'), metadata: { ...metadata('duplicate-order'), order: 1 } },
		null
	);
	for (const state of ['review', 'approved'] as const)
		await transitionEditorial(db, uid, 'duplicate-order', 1, state);
	await denied(transitionEditorial(db, uid, 'duplicate-order', 1, 'published'));
	assert.equal(
		(await getDocFromServer(doc(db, 'academy_positions', 'chapter-a_1'))).data()?.id,
		'lesson-a1'
	);
});

test('parent title revision keeps approved snapshot and immutable hierarchy, concurrent edit conflict', async () => {
	const uid = fixture.users['verified-admin'].uid,
		db = rulesDb(fixture.environment.authenticatedContext(uid, claims));
	const snap = await getDocFromServer(doc(db, 'academy_editorial', 'chapter-a'));
	const old = snap.data()!;
	const changed = {
		metadata: { ...old.metadata, title: 'Synthetic renamed chapter' },
		media: null,
		syariahRequired: true
	};
	const result = await Promise.allSettled([
		saveEditorial(db, uid, changed, 1),
		saveEditorial(
			db,
			uid,
			{ ...changed, metadata: { ...changed.metadata, title: 'Other concurrent edit' } },
			1
		)
	]);
	assert.equal(result.filter((r) => r.status === 'fulfilled').length, 1);
	const failed = result.find((r) => r.status === 'rejected');
	assert(
		failed?.status === 'rejected' &&
			(/version conflict/.test(failed.reason.message) || failed.reason.code === 'permission-denied')
	);
	assert.equal(
		(await getDocFromServer(doc(db, 'academy_editorial', 'chapter-a'))).data()?.version,
		2
	);
	await assert.rejects(saveEditorial(db, uid, changed, 1), /version conflict/);
	assert.equal(
		(await getDocFromServer(doc(db, 'academy_editorial', 'chapter-a'))).data()?.approval,
		null
	);
	assert.equal(
		(await getDocFromServer(doc(db, 'academy_catalog', 'chapter-a'))).data()?.title,
		'Synthetic chapter'
	);
	await denied(transitionEditorial(db, uid, 'chapter-a', 2, 'published'));
	await denied(
		saveEditorial(db, uid, { ...changed, metadata: { ...changed.metadata, scopeId: 'scope-b' } }, 2)
	);
	await denied(deleteDraft(db, uid, 'chapter-a', 2));
	for (const state of ['review', 'approved', 'published'] as const)
		await transitionEditorial(db, uid, 'chapter-a', 2, state);
	assert.equal(
		(await getDocFromServer(doc(db, 'academy_catalog', 'chapter-a'))).data()?.version,
		2
	);
	assert((await getDocFromServer(doc(db, 'academy_catalog', 'lesson-a1'))).exists());
});

test('progress nonzero history remains readable after revoke, but writes and cross-user reads deny', async () => {
	const uid = fixture.users.active.uid,
		adminUid = fixture.users['verified-admin'].uid;
	const db = rulesDb(fixture.environment.authenticatedContext(uid)),
		admin = rulesDb(fixture.environment.authenticatedContext(adminUid, claims));
	const lesson = { ...metadata('lesson-a2'), version: 1, status: 'published' as const };
	await saveProgress(db, uid, lesson, 42);
	assert.equal(
		(await getDocFromServer(doc(db, 'academy_progress', uid, 'lessons', lesson.id))).data()
			?.positionSeconds,
		42
	);
	for (const positionSeconds of [NaN, Infinity, -1, 121])
		await denied(saveProgress(db, uid, lesson, positionSeconds));
	await denied(saveProgress(db, uid, { ...lesson, version: 2 }, 42));
	await writeGrant(
		admin,
		adminUid,
		uid,
		'scope-a',
		'revoked',
		Timestamp.fromMillis(Date.now() - 1000),
		Timestamp.fromMillis(Date.now() + 60000)
	);
	assert.equal(
		(await getDocFromServer(doc(db, 'academy_progress', uid, 'lessons', lesson.id))).data()
			?.positionSeconds,
		42
	);
	await denied(saveProgress(db, uid, lesson, 43));
	const other = rulesDb(fixture.environment.authenticatedContext(fixture.users['no-grant'].uid));
	await denied(getDocsFromServer(collection(other, 'academy_progress', uid, 'lessons')));
});

test('explicit completion enforces actor, grant, publication, version and trusted timestamp without altering resume', async (t) => {
	const { environment, users } = fixture;
	const uid = users.active.uid,
		adminUid = users['verified-admin'].uid;
	const admin = rulesDb(environment.authenticatedContext(adminUid, claims));
	const member = rulesDb(environment.authenticatedContext(uid));
	const lesson = { ...metadata('completion-only'), version: 1, status: 'published' as const };
	await writeGrant(
		admin,
		adminUid,
		uid,
		'scope-a',
		'active',
		Timestamp.fromMillis(Date.now() - 1000),
		Timestamp.fromMillis(Date.now() + 300000)
	);
	await saveEditorial(admin, adminUid, input(lesson.id), null);
	for (const state of ['review', 'approved', 'published'] as const)
		await transitionEditorial(admin, adminUid, lesson.id, 1, state);
	const ref = doc(member, 'academy_completion', uid, 'lessons', lesson.id);
	const payload = () => ({ lessonId: lesson.id, version: 1, completedAt: serverTimestamp() });
	await t.test(
		'authorized transaction is idempotent, including concurrent clicks; position writes are independent',
		async () => {
			await saveProgress(member, uid, lesson, 57);
			await Promise.all([completeLesson(member, uid, lesson), completeLesson(member, uid, lesson)]);
			const first = (await getDocFromServer(ref)).data()!;
			await completeLesson(member, uid, lesson);
			assert.deepEqual((await getDocFromServer(ref)).data(), first);
			assert.equal(
				(await getDocFromServer(doc(member, 'academy_progress', uid, 'lessons', lesson.id))).data()
					?.positionSeconds,
				57
			);
			await saveProgress(member, uid, lesson, 75);
			assert.deepEqual((await getDocFromServer(ref)).data(), first);
		}
	);
	await t.test(
		'anonymous, cross-user, missing, expired, revoked and future grants deny writes',
		async () => {
			for (const actor of ['guest', 'no-grant', 'expired', 'revoked']) {
				const actorUid = actor === 'guest' ? 'guest' : users[actor].uid;
				const db = rulesDb(
					actor === 'guest'
						? environment.unauthenticatedContext()
						: environment.authenticatedContext(actorUid)
				);
				await denied(
					setDoc(doc(db, 'academy_completion', actorUid, 'lessons', lesson.id), payload())
				);
				await denied(setDoc(doc(db, 'academy_completion', uid, 'lessons', lesson.id), payload()));
				await denied(getDocsFromServer(collection(db, 'academy_completion', uid, 'lessons')));
			}
			await writeGrant(
				admin,
				adminUid,
				users['no-grant'].uid,
				'scope-a',
				'active',
				Timestamp.fromMillis(Date.now() + 60000),
				Timestamp.fromMillis(Date.now() + 120000)
			);
			const future = rulesDb(environment.authenticatedContext(users['no-grant'].uid));
			await denied(
				setDoc(
					doc(future, 'academy_completion', users['no-grant'].uid, 'lessons', lesson.id),
					payload()
				)
			);
		}
	);
	await t.test(
		'unpublished, structural and missing lessons, stale versions, forged timestamps and extra fields deny',
		async () => {
			for (const id of ['draft-only', 'chapter-a', 'missing'])
				await denied(
					setDoc(doc(member, 'academy_completion', uid, 'lessons', id), {
						...payload(),
						lessonId: id
					})
				);
			for (const changed of [
				{ version: 0 },
				{ version: 2 },
				{ lessonId: 'forged' },
				{ completedAt: Timestamp.fromMillis(0) },
				{ completedAt: null },
				{ positionSeconds: 0 },
				{ academyAdmin: true },
				{ uid: 'forged' },
				{ status: 'published' }
			])
				await denied(
					setDoc(doc(member, 'academy_completion', uid, 'lessons', 'lesson-a1'), {
						...payload(),
						lessonId: 'lesson-a1',
						...changed
					})
				);
			await denied(
				setDoc(doc(member, 'academy_completion', uid, 'lessons', 'lesson-a1'), {
					lessonId: 'lesson-a1',
					version: 1
				})
			);
			await denied(setDoc(ref, payload())); // Direct same-version timestamp rewrite is forbidden.
			await denied(deleteDoc(ref));
		}
	);
	await t.test(
		'withdrawal prevents writes; republished version requires explicit completion and preserves old position',
		async () => {
			await saveEditorial(admin, adminUid, input(lesson.id), 1);
			await denied(setDoc(ref, { ...payload(), version: 2 }));
			for (const state of ['review', 'approved', 'published'] as const)
				await transitionEditorial(admin, adminUid, lesson.id, 2, state);
			await denied(setDoc(ref, payload()));
			await completeLesson(member, uid, { ...lesson, version: 2 });
			assert.equal((await getDocFromServer(ref)).data()?.version, 2);
			assert.equal(
				(await getDocFromServer(doc(member, 'academy_progress', uid, 'lessons', lesson.id))).data()
					?.positionSeconds,
				75
			);
		}
	);
	await t.test(
		'revocation blocks new completion while own historical record remains readable',
		async () => {
			await writeGrant(
				admin,
				adminUid,
				uid,
				'scope-a',
				'revoked',
				Timestamp.fromMillis(Date.now() - 1000),
				Timestamp.fromMillis(Date.now() + 300000)
			);
			await denied(
				setDoc(doc(member, 'academy_completion', uid, 'lessons', 'lesson-a1'), {
					lessonId: 'lesson-a1',
					version: 1,
					completedAt: serverTimestamp()
				})
			);
			assert.equal((await getDocFromServer(ref)).data()?.version, 2);
		}
	);
});
