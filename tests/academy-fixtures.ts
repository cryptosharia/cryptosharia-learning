import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { initializeTestEnvironment } from '@firebase/rules-unit-testing';
import { doc, setDoc, Timestamp, type Firestore } from 'firebase/firestore';
import type { RulesTestContext } from '@firebase/rules-unit-testing';
import { resolveFirebaseSettings, requireFirebaseServices } from '../src/lib/firebaseConfig.ts';
import {
	saveEditorial,
	transitionEditorial,
	type Metadata,
	type Media
} from '../src/lib/academyData.ts';

export const projectId = 'demo-academy-phase1c';
export const settings = resolveFirebaseSettings({
	PUBLIC_FIREBASE_MODE: 'emulator',
	PUBLIC_FIREBASE_API_KEY: `${projectId}-key`,
	PUBLIC_FIREBASE_AUTH_DOMAIN: 'localhost',
	PUBLIC_FIREBASE_PROJECT_ID: projectId,
	PUBLIC_FIREBASE_MESSAGING_SENDER_ID: '0',
	PUBLIC_FIREBASE_APP_ID: projectId,
	PUBLIC_FIREBASE_AUTH_EMULATOR_URL: 'http://127.0.0.1:9099',
	PUBLIC_FIREBASE_FIRESTORE_EMULATOR_URL: 'http://127.0.0.1:8080'
});
export const claims = {
	academyAdmin: true,
	academyReviewer: true,
	academyPublisher: true,
	academySyariah: true,
	email_verified: true
};
export const media: Media = {
	videoId: 'AAAAAAAAAAA',
	readingRefs: ['opaque-reading-fixture'],
	slideRefs: ['opaque-slide-fixture'],
	subtitleRefs: ['opaque-subtitle-fixture'],
	attachmentRefs: ['opaque-attachment-fixture'],
	internalNote: 'Synthetic private note'
};
export const metadata = (id: string, scopeId = 'scope-a'): Metadata => ({
	id,
	kind: 'lesson',
	parentId: scopeId === 'scope-b' ? 'chapter-b' : 'chapter-a',
	subjectId: scopeId === 'scope-b' ? 'technical' : 'fundamental',
	chapterNumber: 1,
	scopeId,
	subject: 'Synthetic subject',
	level: 1,
	chapter: 'Synthetic chapter',
	title: `Synthetic ${id}`,
	description: 'Isolated fixture; no approved Academy content.',
	thumbnail: '/favicon.png',
	durationSeconds: 120,
	order:
		id === 'lesson-a2'
			? 2
			: ['lesson-a1', 'lesson-b1'].includes(id)
				? 1
				: 10 + [...id].reduce((n, c) => (n * 31 + c.charCodeAt(0)) % 9000, 0),
	instructor: 'Synthetic approved instructor'
});
export const input = (id: string, scopeId = 'scope-a') => ({
	metadata: metadata(id, scopeId),
	media,
	syariahRequired: true
});
export const actors = ['no-grant', 'active', 'expired', 'revoked', 'verified-admin'] as const;
export const password = 'synthetic-test-only';
// rules-unit-testing exposes compat types; Firebase's modular APIs explicitly unwrap compat instances.
export const rulesDb = (context: RulesTestContext) => context.firestore() as unknown as Firestore;

export async function isolatedEnvironment() {
	for (const [name, expected] of Object.entries({
		GCLOUD_PROJECT: projectId,
		GOOGLE_CLOUD_PROJECT: projectId,
		PUBLIC_FIREBASE_PROJECT_ID: projectId,
		FIRESTORE_EMULATOR_HOST: '127.0.0.1:8080',
		FIREBASE_AUTH_EMULATOR_HOST: '127.0.0.1:9099'
	}))
		if (process.env[name])
			assert.equal(process.env[name], expected, `Mismatched ${name}; stop before mutation`);
	await requireFirebaseServices(settings);
	const hub = await fetch('http://127.0.0.1:4400/emulators', {
		signal: AbortSignal.timeout(3000),
		redirect: 'error'
	}).then((r) => r.json());
	assert.equal(hub.auth?.host, '127.0.0.1');
	assert.equal(hub.auth?.port, 9099);
	assert.equal(hub.firestore?.host, '127.0.0.1');
	assert.equal(hub.firestore?.port, 8080);
	return initializeTestEnvironment({
		projectId,
		firestore: {
			host: '127.0.0.1',
			port: 8080,
			rules: readFileSync(new URL('../firebase/academy-v1.rules', import.meta.url), 'utf8')
		}
	});
}

export async function seed() {
	const environment = await isolatedEnvironment();
	await environment.clearFirestore();
	const reset = await fetch(`http://127.0.0.1:9099/emulator/v1/projects/${projectId}/accounts`, {
		method: 'DELETE',
		signal: AbortSignal.timeout(3000),
		redirect: 'error'
	});
	assert.equal(reset.ok, true);
	const users: Record<string, { uid: string; email: string }> = {};
	for (const actor of actors) {
		const email = `${actor}@example.test`;
		const response = await fetch(
			`http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1/accounts:signUp?key=${projectId}-key`,
			{
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ email, password, returnSecureToken: true })
			}
		);
		assert.equal(response.ok, true);
		const account = await response.json();
		users[actor] = { uid: account.localId, email };
		// Emulator-only trusted fixture setup; never exported by the application.
		const update = await fetch(
			`http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1/accounts:update?key=${projectId}-key`,
			{
				method: 'POST',
				headers: { 'content-type': 'application/json', authorization: 'Bearer owner' },
				body: JSON.stringify({
					localId: account.localId,
					emailVerified: true,
					customAttributes: JSON.stringify(actor === 'verified-admin' ? claims : {})
				})
			}
		);
		assert.equal(update.ok, true);
	}
	await environment.withSecurityRulesDisabled(async (ctx) => {
		const db = rulesDb(ctx);
		for (const [actor, user] of Object.entries(users)) {
			await setDoc(doc(db, 'users', user.uid), {
				uid: user.uid,
				email: user.email,
				displayName: actor,
				photoURL: null,
				provider: 'email',
				createdAt: Timestamp.now(),
				lastLoginAt: Timestamp.now()
			});
			await setDoc(doc(db, 'academy_progress', user.uid, 'lessons', 'lesson-a1'), {
				lessonId: 'lesson-a1',
				version: 1,
				positionSeconds: 10,
				updatedAt: Timestamp.now()
			});
			if (['active', 'expired', 'revoked'].includes(actor))
				await setDoc(doc(db, 'academy_grants', user.uid, 'scopes', 'scope-a'), {
					uid: user.uid,
					scopeId: 'scope-a',
					state: actor === 'revoked' ? 'revoked' : 'active',
					startsAt: Timestamp.fromMillis(Date.now() - 60000),
					expiresAt: Timestamp.fromMillis(Date.now() + (actor === 'expired' ? -1000 : 3600000)),
					source: 'synthetic-local',
					updatedBy: 'fixture-setup',
					updatedAt: Timestamp.now(),
					auditId: 'fixture-setup'
				});
		}
	});
	// Fixture publishing itself walks the SAME protected application operations.
	const admin = rulesDb(environment.authenticatedContext(users['verified-admin'].uid, claims));
	for (const [scope, subject, suffix, title, order] of [
		['scope-a', 'fundamental', 'a', 'Analisis Fundamental', 0],
		['scope-b', 'technical', 'b', 'Analisis Teknikal', 1]
	] as const) {
		for (const [id, kind, parentId, nodeTitle] of [
			[subject, 'subject', 'root', title],
			[`level-${suffix}`, 'level', subject, 'Synthetic level 1'],
			[`chapter-${suffix}`, 'chapter', `level-${suffix}`, 'Synthetic chapter']
		] as const) {
			await saveEditorial(
				admin,
				users['verified-admin'].uid,
				{
					metadata: {
						...metadata(id, scope),
						kind,
						parentId,
						subjectId: subject,
						title: nodeTitle,
						order: kind === 'subject' ? order : 1,
						durationSeconds: 0,
						instructor: '',
						subject: title
					},
					media: null,
					syariahRequired: true
				},
				null
			);
			for (const state of ['review', 'approved', 'published'] as const)
				await transitionEditorial(admin, users['verified-admin'].uid, id, 1, state);
		}
	}
	for (const [id, scope] of [
		['lesson-a1', 'scope-a'],
		['lesson-a2', 'scope-a'],
		['lesson-b1', 'scope-b'],
		['draft-only', 'scope-a']
	]) {
		await saveEditorial(admin, users['verified-admin'].uid, input(id, scope), null);
		if (id === 'draft-only') continue;
		for (const status of ['review', 'approved', 'published'] as const)
			await transitionEditorial(admin, users['verified-admin'].uid, id, 1, status);
	}
	return { environment, users };
}
