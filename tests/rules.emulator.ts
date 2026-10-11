import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { after, before, test } from 'node:test';
import {
	initializeTestEnvironment,
	assertFails,
	assertSucceeds,
	type RulesTestEnvironment
} from '@firebase/rules-unit-testing';
import { deleteApp } from 'firebase/app';
import { createUserWithEmailAndPassword, signOut } from 'firebase/auth';
import {
	collection,
	doc,
	getDoc,
	getDocs,
	query,
	where,
	setDoc,
	Timestamp
} from 'firebase/firestore';
import { initializeFirebaseClient } from '../src/lib/firebaseClient.ts';
import { resolveFirebaseSettings, requireFirebaseServices } from '../src/lib/firebaseConfig.ts';

// Fixed demo project and loopback endpoints: never load production env or credentials.
const settings = resolveFirebaseSettings({
	PUBLIC_FIREBASE_MODE: 'emulator',
	PUBLIC_FIREBASE_API_KEY: 'demo-academy-key',
	PUBLIC_FIREBASE_AUTH_DOMAIN: 'localhost',
	PUBLIC_FIREBASE_PROJECT_ID: 'demo-academy',
	PUBLIC_FIREBASE_MESSAGING_SENDER_ID: '0',
	PUBLIC_FIREBASE_APP_ID: 'demo-academy',
	PUBLIC_FIREBASE_AUTH_EMULATOR_URL: 'http://127.0.0.1:9099',
	PUBLIC_FIREBASE_FIRESTORE_EMULATOR_URL: 'http://127.0.0.1:8080'
});
let environment: RulesTestEnvironment;
const roles = ['guest', 'no-grant', 'active', 'expired', 'revoked', 'verified-admin'] as const;
before(async () => {
	await requireFirebaseServices(settings);
	environment = await initializeTestEnvironment({
		projectId: settings.config.projectId,
		firestore: {
			host: '127.0.0.1',
			port: 8080,
			rules: readFileSync(new URL('./fixtures/firestore.synthetic.rules', import.meta.url), 'utf8')
		}
	});
	await environment.clearFirestore();
	await environment.withSecurityRulesDisabled(async (context) => {
		const db = context.firestore();
		for (const status of ['published', 'draft']) {
			await setDoc(doc(db, 'test_catalog', status), { title: 'Synthetic material', status });
			await setDoc(doc(db, 'test_lessons', status, 'items', 'one'), { title: 'Synthetic lesson' });
			await setDoc(doc(db, 'test_video_assets', status, 'items', 'one'), {
				videoId: 'ethrPMuAayU'
			});
		}
		for (const role of ['active', 'expired', 'revoked'])
			await setDoc(doc(db, 'test_entitlements', role, 'courses', 'published'), {
				state: role === 'revoked' ? 'revoked' : 'active',
				startsAt: Timestamp.fromMillis(Date.now() - 60000),
				expiresAt: Timestamp.fromMillis(Date.now() + (role === 'expired' ? -1000 : 3600000))
			});
	});
});
after(async () => {
	if (environment) await environment.cleanup();
});

for (const role of roles)
	test(`six-role synthetic policy: ${role}`, async () => {
		const context =
			role === 'guest'
				? environment.unauthenticatedContext()
				: environment.authenticatedContext(
						role,
						role === 'verified-admin' ? { admin: true, email_verified: true } : {}
					);
		const db = context.firestore();
		const privileged = role === 'active' || role === 'verified-admin';
		await assertSucceeds(getDoc(doc(db, 'test_catalog', 'published')));
		await (role === 'verified-admin' ? assertSucceeds : assertFails)(
			getDoc(doc(db, 'test_catalog', 'draft'))
		);
		for (const kind of ['test_lessons', 'test_video_assets']) {
			await (privileged ? assertSucceeds : assertFails)(
				getDoc(doc(db, kind, 'published', 'items', 'one'))
			);
			await (role === 'verified-admin' ? assertSucceeds : assertFails)(
				getDoc(doc(db, kind, 'draft', 'items', 'one'))
			);
		}
		await assertFails(setDoc(doc(db, 'test_catalog', 'published'), { status: 'published' }));
		await assertFails(
			setDoc(doc(db, 'test_entitlements', role, 'courses', 'published'), { state: 'active' })
		);
		await assertFails(
			setDoc(doc(db, 'test_progress', 'someone-else', 'lessons', 'one'), {
				courseId: 'published',
				positionSeconds: 20
			})
		);
		await (role === 'active' ? assertSucceeds : assertFails)(
			setDoc(doc(db, 'test_progress', role, 'lessons', 'one'), {
				courseId: 'published',
				positionSeconds: 20
			})
		);
		await assertFails(
			setDoc(doc(db, 'test_progress', role, 'lessons', 'one'), {
				courseId: 'published',
				positionSeconds: 20,
				admin: true
			})
		);
		await (role === 'verified-admin' ? assertSucceeds : assertFails)(
			getDoc(doc(db, 'test_entitlements', 'someone-else', 'courses', 'published'))
		);
	});

test('rules are not query filters; deny unbounded catalog query and unverified admin', async () => {
	const db = environment.unauthenticatedContext().firestore();
	await assertFails(getDocs(collection(db, 'test_catalog')));
	await assertSucceeds(
		getDocs(query(collection(db, 'test_catalog'), where('status', '==', 'published')))
	);
	const memberDb = environment.authenticatedContext('active').firestore();
	await assertFails(
		setDoc(doc(memberDb, 'test_progress', 'active', 'lessons', 'missing'), {
			courseId: 'published',
			positionSeconds: 20
		})
	);
	await assertFails(
		setDoc(doc(memberDb, 'test_progress', 'active', 'lessons', 'one'), {
			courseId: 'published',
			positionSeconds: 86401
		})
	);
	await assertFails(
		setDoc(doc(memberDb, 'test_progress', 'active', 'lessons', 'one'), {
			courseId: 'draft',
			positionSeconds: 20
		})
	);
	const unverified = environment
		.authenticatedContext('unverified-admin', { admin: true, email_verified: false })
		.firestore();
	await assertFails(getDoc(doc(unverified, 'test_lessons', 'published', 'items', 'one')));
	await assertFails(getDoc(doc(db, 'elearning_courses', 'synthetic')));
});

test('real application SDK uses BOTH Auth and Firestore emulators', async () => {
	const { app, auth, db } = initializeFirebaseClient(settings, `local-sdk-${Date.now()}`);
	try {
		assert.equal(auth.emulatorConfig?.host, '127.0.0.1');
		assert.equal(app.options.projectId, 'demo-academy');
		assert.equal(initializeFirebaseClient(settings, app.name).db, db);
		assert.throws(() =>
			initializeFirebaseClient(
				{ ...settings, firestoreEmulatorUrl: 'http://127.0.0.1:2' },
				app.name
			)
		);
		const credential = await createUserWithEmailAndPassword(
			auth,
			`synthetic-${Date.now()}@example.test`,
			'local-only-password-123'
		);
		const uid = credential.user.uid;
		await environment.withSecurityRulesDisabled(async (context) =>
			setDoc(doc(context.firestore(), 'test_entitlements', uid, 'courses', 'published'), {
				state: 'active',
				startsAt: Timestamp.fromMillis(Date.now() - 1000),
				expiresAt: Timestamp.fromMillis(Date.now() + 3600000)
			})
		);
		await assertSucceeds(getDoc(doc(db, 'test_lessons', 'published', 'items', 'one')));
		await assertSucceeds(
			setDoc(doc(db, 'test_progress', uid, 'lessons', 'one'), {
				courseId: 'published',
				positionSeconds: 42
			})
		);
		await environment.withSecurityRulesDisabled(async (context) => {
			const observed = await getDoc(
				doc(context.firestore(), 'test_progress', uid, 'lessons', 'one')
			);
			assert.equal(observed.data()?.positionSeconds, 42);
		});
		await signOut(auth);
		await assertFails(getDoc(doc(db, 'test_lessons', 'published', 'items', 'one')));
	} finally {
		await deleteApp(app);
	}
});

test('actual offline endpoints fail closed before SDK actions', async () => {
	await assert.rejects(
		requireFirebaseServices({
			...settings,
			authEmulatorUrl: 'http://127.0.0.1:1',
			firestoreEmulatorUrl: 'http://127.0.0.1:2'
		})
	);
});
