import assert from 'node:assert/strict';
import { test } from 'node:test';
import { resolveAcademyFirebaseSettings } from '../src/lib/firebaseConfig.ts';
const demoEnv = {
	PUBLIC_FIREBASE_MODE: 'emulator',
	PUBLIC_FIREBASE_API_KEY: 'demo-academy-key',
	PUBLIC_FIREBASE_AUTH_DOMAIN: 'localhost',
	PUBLIC_FIREBASE_PROJECT_ID: 'demo-academy',
	PUBLIC_FIREBASE_MESSAGING_SENDER_ID: '0',
	PUBLIC_FIREBASE_APP_ID: 'demo-academy',
	PUBLIC_FIREBASE_AUTH_EMULATOR_URL: 'http://127.0.0.1:9099',
	PUBLIC_FIREBASE_FIRESTORE_EMULATOR_URL: 'http://127.0.0.1:8080'
};

test('standalone runtime rejects complete live configuration before SDK creation', () => {
	const { PUBLIC_FIREBASE_AUTH_EMULATOR_URL, PUBLIC_FIREBASE_FIRESTORE_EMULATOR_URL, ...rest } =
		demoEnv;
	assert.ok(PUBLIC_FIREBASE_AUTH_EMULATOR_URL && PUBLIC_FIREBASE_FIRESTORE_EMULATOR_URL);
	assert.throws(
		() =>
			resolveAcademyFirebaseSettings({
				...rest,
				PUBLIC_FIREBASE_MODE: 'live',
				PUBLIC_FIREBASE_PROJECT_ID: 'owner-staging-placeholder',
				PUBLIC_FIREBASE_API_KEY: 'placeholder',
				PUBLIC_FIREBASE_AUTH_DOMAIN: 'staging.invalid',
				PUBLIC_FIREBASE_APP_ID: 'placeholder'
			}),
		/local emulators only/
	);
});
test('standalone missing configuration stays inert and synthetic emulator config works', () => {
	assert.equal(resolveAcademyFirebaseSettings({}).mode, 'disabled');
	assert.equal(resolveAcademyFirebaseSettings(demoEnv).mode, 'emulator');
});
