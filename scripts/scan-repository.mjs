import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const git = (...args) => execFileSync('git', args, { cwd: root, maxBuffer: 20 * 1024 * 1024 });
const rules = [
	['private-key', /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/],
	['cloud-key', /(?:AKIA|ASIA)[A-Z0-9]{16}|AIza[0-9A-Za-z_-]{35}/],
	['github-token', /gh[pousr]_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{50,}/],
	['slack-token', /xox[baprs]-[A-Za-z0-9-]{20,}/],
	['jwt', /eyJ[A-Za-z0-9_-]{15,}\.[A-Za-z0-9_-]{15,}\.[A-Za-z0-9_-]{15,}/],
	['service-account', /"type"\s*:\s*"service_account"|"private_key"\s*:/],
	[
		'private-drive-reference',
		/https?:\/\/(?:drive|docs)\.google\.com\/(?:file\/d\/|document\/d\/|spreadsheets\/d\/|presentation\/d\/|drive\/folders\/)[A-Za-z0-9_-]{10,}/
	],
	['authenticated-url', /https?:\/\/[^\s/:'"]+:[^\s/@'"]+@/],
	[
		'credential-assignment',
		/(?:BLOB_READ_WRITE_TOKEN|VERCEL_TOKEN|FIREBASE_TOKEN|CS_API_KEY)\s*=\s*[A-Za-z0-9_-]{12,}/
	]
];
const forbidden =
	/(^|\/)(?:node_modules|\.vercel|\.svelte-kit|browser-profiles|test-results|logs)(\/|$)|(?:^|\/)\.env(?:\.|$)(?!example$)|\.(?:log|pem|key|p12|har|tgz|zip)$/;
const findings = [];
const modes = [
	[
		'tracked',
		git('ls-files', '-z').toString().split('\0').filter(Boolean),
		(p) => readFileSync(resolve(root, p))
	],
	[
		'staged',
		git('diff', '--cached', '--name-only', '--diff-filter=ACM', '-z')
			.toString()
			.split('\0')
			.filter(Boolean),
		(p) => git('show', ':' + p)
	]
];
if (process.argv[2])
	modes.push([
		'candidate',
		git('ls-tree', '-rz', '--name-only', process.argv[2]).toString().split('\0').filter(Boolean),
		(p) => git('show', process.argv[2] + ':' + p)
	]);
for (const [mode, paths, load] of modes) {
	for (const path of paths) {
		if (forbidden.test(path)) findings.push({ mode, path, rule: 'forbidden-artifact' });
		const text = load(path).toString('utf8');
		for (const [name, pattern] of rules)
			if (pattern.test(text)) findings.push({ mode, path, rule: name });
	}
}
const stagedDiff = git('diff', '--cached', '--no-ext-diff', '--unified=0').toString();
for (const [name, pattern] of rules)
	if (pattern.test(stagedDiff)) findings.push({ mode: 'staged-diff', rule: name });
console.log(
	JSON.stringify(
		{
			scanner: 'repository-specific pattern scan; not an exhaustive credential certification',
			scopes: modes.map(([name, files]) => ({ name, files: files.length })),
			stagedDiff: true,
			findings
		},
		null,
		2
	)
);
assert.equal(
	findings.length,
	0,
	'Sensitive candidate content: review privately without printing values'
);
