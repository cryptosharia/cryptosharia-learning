import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { pathToFileURL } from 'node:url';

const expected = {
	PUBLIC_FIREBASE_MODE: 'emulator',
	PUBLIC_FIREBASE_PROJECT_ID: 'demo-academy-phase1c',
	PUBLIC_FIREBASE_AUTH_DOMAIN: 'localhost',
	PUBLIC_FIREBASE_API_KEY: 'demo-academy-phase1c-key',
	PUBLIC_FIREBASE_APP_ID: 'demo-academy-phase1c',
	PUBLIC_FIREBASE_AUTH_EMULATOR_URL: 'http://127.0.0.1:9099',
	PUBLIC_FIREBASE_FIRESTORE_EMULATOR_URL: 'http://127.0.0.1:8080',
	PUBLIC_ACADEMY_ENABLED: 'true'
};

/** @param {string} server @param {string} client */
export function checkCompiledIdentity(server, client) {
	for (const [name, value] of Object.entries(expected)) {
		const matches = [
			...server.matchAll(new RegExp(`(?:var|const|let) ${name} = ("[^"\\n]*");`, 'g'))
		];
		assert.ok(matches.length > 0, `Missing compiled ${name}`);
		assert.ok(
			matches.every((m) => JSON.parse(m[1]) === value),
			`Rejected compiled ${name}`
		);
		if (name !== 'PUBLIC_ACADEMY_ENABLED') {
			const binding = client.match(new RegExp(`${name}:\\(\\)=>\\s*([A-Za-z_$][\\w$]*)`));
			assert.ok(binding, `Missing browser binding ${name}`);
			const identifier = binding[1].replaceAll('$', '\\$');
			const literals = [
				...client.matchAll(new RegExp(`\\b${identifier}\\s*=\\s*(["'\x60])([^"'\x60\\n]*)\\1`, 'g'))
			];
			assert.ok(
				literals.length > 0 && literals.every((m) => m[2] === value),
				`Rejected browser target ${name}`
			);
		}
	}
	// ponytail: compiler-specific test artifact audit; compiler changes fail closed.
	// This never authorizes a hosted build or verifies every possible network request.
	return {
		purpose: 'TEST CONFIG ONLY — NOT DEPLOYABLE',
		mode: 'emulator',
		projectId: expected.PUBLIC_FIREBASE_PROJECT_ID,
		authDomain: 'localhost',
		authEndpoint: expected.PUBLIC_FIREBASE_AUTH_EMULATOR_URL,
		firestoreEndpoint: expected.PUBLIC_FIREBASE_FIRESTORE_EMULATOR_URL,
		serverSha256: createHash('sha256').update(server).digest('hex'),
		clientSha256: createHash('sha256').update(client).digest('hex')
	};
}

/** @param {string} directory @returns {string} */
function javascript(directory) {
	return readdirSync(directory, { withFileTypes: true })
		.sort((a, b) => a.name.localeCompare(b.name))
		.flatMap((entry) => {
			const file = join(directory, entry.name);
			return entry.isDirectory()
				? javascript(file)
				: entry.name.endsWith('.js')
					? [readFileSync(file, 'utf8')]
					: [];
		})
		.join('\n');
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
	const output = resolve(process.argv[2] || '.svelte-kit/output');
	console.log(
		JSON.stringify(
			checkCompiledIdentity(javascript(join(output, 'server')), javascript(join(output, 'client'))),
			null,
			2
		)
	);
}
