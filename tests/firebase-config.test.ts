import assert from 'node:assert/strict';
import { test } from 'node:test';
import { resolveFirebaseSettings, requireFirebaseServices } from '../src/lib/firebaseConfig.ts';
import { academyTestEnabled, isAcademyPath, isContainedPath } from '../src/lib/academyAccess.ts';

export const demoEnv = {
	PUBLIC_FIREBASE_MODE: 'emulator',
	PUBLIC_FIREBASE_API_KEY: 'demo-academy-key',
	PUBLIC_FIREBASE_AUTH_DOMAIN: 'localhost',
	PUBLIC_FIREBASE_PROJECT_ID: 'demo-academy',
	PUBLIC_FIREBASE_MESSAGING_SENDER_ID: '0',
	PUBLIC_FIREBASE_APP_ID: 'demo-academy',
	PUBLIC_FIREBASE_AUTH_EMULATOR_URL: 'http://127.0.0.1:9099',
	PUBLIC_FIREBASE_FIRESTORE_EMULATOR_URL: 'http://127.0.0.1:8080'
};
test('no config is disabled with both SDK targets inert on loopback', () => {
	const settings = resolveFirebaseSettings({});
	assert.equal(settings.mode, 'disabled');
	assert.equal(academyTestEnabled('true', settings), false);
});
test('complete synthetic configuration accepts both local endpoints', () =>
	assert.equal(resolveFirebaseSettings(demoEnv).config.projectId, 'demo-academy'));
for (const [key, value] of [
	['PUBLIC_FIREBASE_PROJECT_ID', 'real-project'],
	['PUBLIC_FIREBASE_API_KEY', 'real-key'],
	['PUBLIC_FIREBASE_AUTH_EMULATOR_URL', ''],
	['PUBLIC_FIREBASE_FIRESTORE_EMULATOR_URL', ''],
	['PUBLIC_FIREBASE_AUTH_EMULATOR_URL', 'https://example.com:9099'],
	['PUBLIC_FIREBASE_FIRESTORE_EMULATOR_URL', 'http://example.com:8080'],
	['PUBLIC_FIREBASE_MODE', 'unknown']
]) {
	test(`rejects incomplete/mixed configuration ${key}:${value}`, () =>
		assert.throws(() => resolveFirebaseSettings({ ...demoEnv, [key]: value })));
}
test('unavailable emulator fails without requesting any production destination', async () => {
	const seen: string[] = [];
	const fetcher: typeof fetch = async (input) => {
		seen.push(String(input));
		throw new Error('offline');
	};
	await assert.rejects(requireFirebaseServices(resolveFirebaseSettings(demoEnv), fetcher));
	assert.equal(seen.length, 2);
	assert.ok(seen.every((url) => url.startsWith('http://127.0.0.1:')));
});
test('default OFF and containment do not affect Masterclass paths', () => {
	const settings = resolveFirebaseSettings(demoEnv);
	assert.equal(academyTestEnabled(undefined, settings), false);
	assert.equal(academyTestEnabled('true', settings), true);
	for (const path of ['/', '/bootcamp', '/admin/landing']) assert.equal(isAcademyPath(path), false);
	for (const path of [
		'/payment/subscription/x',
		'/admin/vouchers',
		'/admin/orders',
		'/e-learning/course/demo'
	])
		assert.equal(isContainedPath(path), true);
});
