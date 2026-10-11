import { spawnSync } from 'node:child_process';
import { resolveFirebaseSettings, requireFirebaseServices } from '../src/lib/firebaseConfig.ts';

const environment = {
	...process.env,
	PUBLIC_FIREBASE_MODE: 'emulator',
	PUBLIC_FIREBASE_API_KEY: 'demo-academy-phase1c-key',
	PUBLIC_FIREBASE_AUTH_DOMAIN: 'localhost',
	PUBLIC_FIREBASE_PROJECT_ID: 'demo-academy-phase1c',
	PUBLIC_FIREBASE_MESSAGING_SENDER_ID: '0',
	PUBLIC_FIREBASE_APP_ID: 'demo-academy-phase1c',
	PUBLIC_FIREBASE_AUTH_EMULATOR_URL: 'http://127.0.0.1:9099',
	PUBLIC_FIREBASE_FIRESTORE_EMULATOR_URL: 'http://127.0.0.1:8080',
	PUBLIC_ACADEMY_ENABLED: 'true',
	FIREBASE_AUTH_EMULATOR_HOST: '127.0.0.1:9099',
	FIRESTORE_EMULATOR_HOST: '127.0.0.1:8080',
	GCLOUD_PROJECT: 'demo-academy-phase1c'
};
for (const key of [
	'BLOB_READ_WRITE_TOKEN',
	'CS_API_KEY',
	'DATABASE_URL',
	'GOOGLE_APPLICATION_CREDENTIALS',
	'FIREBASE_TOKEN',
	'VERCEL_TOKEN',
	'GOOGLE_CLOUD_PROJECT'
])
	delete environment[key];
const action = process.argv[2];
if (!['check', 'build', 'dev', 'test:rules', 'test:browser'].includes(action))
	throw new Error('Choose check, build, dev, or test:rules.');
const settings = resolveFirebaseSettings(environment);
if (action === 'dev' || ['test:rules', 'test:browser'].includes(action))
	await requireFirebaseServices(settings);
console.log(`LOCAL TEST ONLY: ${action}, demo project, Auth and Firestore loopback.`);
const result = spawnSync(process.platform === 'win32' ? 'npm.cmd' : 'npm', ['run', action], {
	env: environment,
	stdio: 'inherit',
	shell: process.platform === 'win32'
});
if (result.error) throw result.error;
process.exit(result.status ?? 1);
