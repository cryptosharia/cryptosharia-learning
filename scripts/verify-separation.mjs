import assert from 'node:assert/strict';
import { readFileSync, readdirSync, lstatSync, existsSync } from 'node:fs';
import { resolve, relative, dirname, isAbsolute } from 'node:path';
import { execFileSync } from 'node:child_process';

const root = resolve(import.meta.dirname, '..');
const packageJson = JSON.parse(readFileSync(resolve(root, 'package.json'), 'utf8'));
assert.equal(packageJson.name, 'cryptosharia-learning');
for (const name of ['@vercel/blob', 'gsap', 'lenis', '@sveltejs/adapter-auto'])
	assert.ok(!packageJson.dependencies?.[name] && !packageJson.devDependencies?.[name]);
const skipped = new Set(['.git', 'node_modules', '.svelte-kit', '.vercel', 'build']);
function walk(directory) {
	return readdirSync(directory).flatMap((name) => {
		if (skipped.has(name)) return [];
		const file = resolve(directory, name);
		assert.ok(!lstatSync(file).isSymbolicLink(), `No symlink: ${relative(root, file)}`);
		return lstatSync(file).isDirectory() ? walk(file) : [file];
	});
}
let imports = 0;
for (const file of walk(resolve(root, 'src'))) {
	if (!/\.(ts|js|svelte|css)$/.test(file)) continue;
	const source = readFileSync(file, 'utf8');
	assert.ok(!/masterclass\.cryptosharia\.id|@vercel\/blob|from ['"](?:gsap|lenis)/.test(source));
	for (const [, specifier] of source.matchAll(
		/(?:from\s*|import\s*\(\s*|import\s*|@import\s*)['"]([^'"]+)['"]/g
	)) {
		if (!specifier.startsWith('.') && !specifier.startsWith('$lib/')) continue;
		const target = specifier.startsWith('$lib/')
			? resolve(root, 'src/lib', specifier.slice(5))
			: resolve(dirname(file), specifier);
		const path = relative(root, target);
		assert.ok(
			path !== '..' && !path.startsWith('../') && !path.startsWith('..\\') && !isAbsolute(path)
		);
		assert.ok(
			[
				target,
				target + '.ts',
				target + '.js',
				target + '.svelte',
				resolve(target, 'index.ts')
			].some(existsSync),
			`Unresolved import in ${relative(root, file)}`
		);
		imports++;
	}
}
for (const path of [
	'src/routes/bootcamp',
	'src/routes/admin/landing',
	'src/routes/payment',
	'src/routes/api'
])
	assert.ok(!existsSync(resolve(root, path)), `Excluded runtime path ${path}`);
assert.ok(!existsSync(resolve(root, '.vercel/project.json')));
if (existsSync(resolve(root, '.git'))) {
	assert.equal(execFileSync('git', ['remote'], { cwd: root, encoding: 'utf8' }).trim(), '');
	assert.equal(
		execFileSync('git', ['for-each-ref', '--format=%(upstream)'], {
			cwd: root,
			encoding: 'utf8'
		}).trim(),
		''
	);
}
console.log(
	JSON.stringify({
		status: 'PASS',
		resolvedLocalImports: imports,
		masterclassRuntimeDependencies: 0,
		cloudLinkage: false
	})
);
