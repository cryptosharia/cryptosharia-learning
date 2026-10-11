import assert from 'node:assert/strict';
import { test } from 'node:test';
import { checkCompiledIdentity } from '../scripts/verify-test-build.mjs';
import { isolatedEnvironment } from './academy-fixtures.ts';
import { academyTestEnabled } from '../src/lib/academyAccess.ts';
import { resolveFirebaseSettings } from '../src/lib/firebaseConfig.ts';

const values = {
	PUBLIC_FIREBASE_MODE: 'emulator',
	PUBLIC_FIREBASE_PROJECT_ID: 'demo-academy-phase1c',
	PUBLIC_FIREBASE_AUTH_DOMAIN: 'localhost',
	PUBLIC_FIREBASE_API_KEY: 'demo-academy-phase1c-key',
	PUBLIC_FIREBASE_APP_ID: 'demo-academy-phase1c',
	PUBLIC_FIREBASE_AUTH_EMULATOR_URL: 'http://127.0.0.1:9099',
	PUBLIC_FIREBASE_FIRESTORE_EMULATOR_URL: 'http://127.0.0.1:8080',
	PUBLIC_ACADEMY_ENABLED: 'true'
};
const server = Object.entries(values)
	.map(([k, v]) => `var ${k} = ${JSON.stringify(v)};`)
	.join('\n');
const client =
	`const exports={${Object.keys(values)
		.map((k, i) => `${k}:()=>value${i}`)
		.join(',')}};` +
	Object.values(values)
		.map((v, i) => `const value${i}=${JSON.stringify(v)};`)
		.join('');
test('compiled identity rejects missing, mixed, wrong project and browser targets without exposing values', () => {
	assert.equal(checkCompiledIdentity(server, client).projectId, values.PUBLIC_FIREBASE_PROJECT_ID);
	assert.equal(checkCompiledIdentity(server, client.replaceAll('"', '`')).mode, 'emulator');
	assert.throws(() => checkCompiledIdentity('', client), /Missing compiled/);
	assert.throws(
		() =>
			checkCompiledIdentity(server.replace('demo-academy-phase1c', 'production-looking'), client),
		/Rejected compiled/
	);
	assert.throws(
		() => checkCompiledIdentity(server + '\nvar PUBLIC_FIREBASE_MODE = "live";', client),
		/Rejected compiled/
	);
	assert.throws(
		() =>
			checkCompiledIdentity(
				server,
				client.replace('http://127.0.0.1:8080', 'https://production.invalid')
			),
		/Rejected browser target/
	);
});
test('complete live config cannot activate Academy even with flag true', () => {
	assert.equal(
		academyTestEnabled(
			'true',
			resolveFirebaseSettings({
				PUBLIC_FIREBASE_MODE: 'live',
				PUBLIC_FIREBASE_PROJECT_ID: 'owner-staging-placeholder',
				PUBLIC_FIREBASE_AUTH_DOMAIN: 'staging.invalid',
				PUBLIC_FIREBASE_API_KEY: 'placeholder',
				PUBLIC_FIREBASE_MESSAGING_SENDER_ID: '0',
				PUBLIC_FIREBASE_APP_ID: 'placeholder'
			})
		),
		false
	);
});
for (const [name, value] of [
	['PUBLIC_FIREBASE_PROJECT_ID', 'production-looking'],
	['FIRESTORE_EMULATOR_HOST', 'production.invalid:8080']
])
	test(`fixture mutation rejects ${name} mismatch before network`, async () => {
		const previous = process.env[name];
		try {
			process.env[name] = value;
			await assert.rejects(isolatedEnvironment(), /Mismatched/);
		} finally {
			if (previous === undefined) delete process.env[name];
			else process.env[name] = previous;
		}
	});
