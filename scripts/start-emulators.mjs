import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

if (Number(process.versions.node.split('.')[0]) !== 24)
	throw new Error('Use the Node 24 version in .node-version for Firebase CLI.');
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const directory = mkdtempSync(join(tmpdir(), 'academy-demo-emulators-'));
const config = JSON.parse(readFileSync(join(root, 'firebase.emulator.json'), 'utf8'));
config.firestore.rules = join(root, config.firestore.rules);
writeFileSync(join(directory, 'firebase.emulator.json'), JSON.stringify(config));
const environment = {
	...process.env,
	CI: 'true',
	NO_UPDATE_NOTIFIER: '1',
	XDG_CONFIG_HOME: join(directory, 'cli-config')
};
for (const key of [
	'FIREBASE_TOKEN',
	'GOOGLE_APPLICATION_CREDENTIALS',
	'GCLOUD_PROJECT',
	'GOOGLE_CLOUD_PROJECT',
	'DEBUG'
])
	delete environment[key];
console.log('LOCAL DEMO ONLY. Both services use loopback; CLI state and logs stay outside Git.');
console.log(`Local emulator log directory: ${directory}`);
const result = spawnSync(
	process.platform === 'win32' ? 'npx.cmd' : 'npx',
	[
		'--yes',
		'firebase-tools@15.33.0',
		'emulators:start',
		'--config',
		'firebase.emulator.json',
		'--project',
		'demo-academy-phase1c',
		'--only',
		'auth,firestore'
	],
	{ cwd: directory, env: environment, stdio: 'inherit', shell: process.platform === 'win32' }
);
if (result.error) throw result.error;
process.exit(result.status ?? 1);
