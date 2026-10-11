import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve, relative } from 'node:path';
import { createHash } from 'node:crypto';
import { initializeTestEnvironment } from '@firebase/rules-unit-testing';
import { collectionGroup, getDocs, getDoc, doc, setDoc, Timestamp } from 'firebase/firestore';
import { seed, rulesDb, projectId } from './academy-fixtures.ts';
import { saveProgress } from '../src/lib/academyData.ts';

function encode(value: unknown): unknown {
	if (value instanceof Timestamp) return { __timestamp: [value.seconds, value.nanoseconds] };
	if (Array.isArray(value)) return value.map(encode);
	if (value && typeof value === 'object')
		return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, encode(v)]));
	return value;
}
function decode(value: unknown): unknown {
	if (Array.isArray(value)) return value.map(decode);
	if (value && typeof value === 'object') {
		const entries = Object.entries(value);
		const marker = entries.find(([k]) => k === '__timestamp');
		if (entries.length === 1 && marker && Array.isArray(marker[1]))
			return new Timestamp(marker[1][0], marker[1][1]);
		return Object.fromEntries(entries.map(([k, v]) => [k, decode(v)]));
	}
	return value;
}
const groups = [
	'academy_editorial',
	'academy_catalog',
	'academy_positions',
	'academy_lessons',
	'academy_audit',
	'users',
	'scopes',
	'lessons'
];
async function snapshot(environment: Awaited<ReturnType<typeof initializeTestEnvironment>>) {
	const rows: Array<{ path: string; data: unknown }> = [];
	await environment.withSecurityRulesDisabled(async (context) => {
		for (const group of groups)
			for (const item of (await getDocs(collectionGroup(context.firestore(), group))).docs) {
				assert.match(
					item.ref.path,
					/^(academy_(editorial|catalog|positions|lessons|audit)\/[^/]+|users\/[^/]+|academy_grants\/[^/]+\/scopes\/[^/]+|academy_progress\/[^/]+\/lessons\/[^/]+)$/
				);
				rows.push({ path: item.ref.path, data: encode(item.data()) });
			}
	});
	return rows.sort((a, b) => a.path.localeCompare(b.path));
}
test('synthetic content/schema/Rules restore into a different demo target retains boundaries and fresh progress', async () => {
	const output = resolve(process.env.ACADEMY_RECOVERY_EVIDENCE_DIR || '');
	assert.ok(
		process.env.ACADEMY_RECOVERY_EVIDENCE_DIR && relative(process.cwd(), output).startsWith('..'),
		'Evidence must be outside the repository'
	);
	const started = Date.now();
	const source = await seed(); // existing guarded demo-only setup, never a production export
	let target: Awaited<ReturnType<typeof initializeTestEnvironment>> | undefined;
	try {
		const active = source.users.active.uid;
		await source.environment.withSecurityRulesDisabled(async (c) =>
			setDoc(doc(c.firestore(), 'academy_progress', active, 'lessons', 'lesson-a1'), {
				lessonId: 'lesson-a1',
				version: 1,
				positionSeconds: 57,
				updatedAt: Timestamp.now()
			})
		);
		const rules = readFileSync(new URL('../firebase/academy-v1.rules', import.meta.url), 'utf8');
		const rows = await snapshot(source.environment);
		const serialized = JSON.stringify({
			schema: 'synthetic-academy-v1',
			project: projectId,
			rules,
			rows
		});
		writeFileSync(resolve(output, 'synthetic-recovery.json'), serialized);
		const backup = JSON.parse(readFileSync(resolve(output, 'synthetic-recovery.json'), 'utf8'));
		assert.equal(backup.project, projectId);
		target = await initializeTestEnvironment({
			projectId: 'demo-academy-phase1d-recovery',
			firestore: { host: '127.0.0.1', port: 8080, rules: backup.rules }
		});
		await target.clearFirestore();
		await target.withSecurityRulesDisabled(async (c) => {
			for (const row of backup.rows)
				await setDoc(doc(c.firestore(), row.path), decode(row.data) as Record<string, unknown>);
		});
		assert.deepEqual(await snapshot(target), rows);
		const participant = rulesDb(target.authenticatedContext(active));
		assert.equal(
			(await getDoc(doc(participant, 'academy_progress', active, 'lessons', 'lesson-a1'))).data()
				?.positionSeconds,
			57
		);
		assert.ok((await getDoc(doc(participant, 'academy_lessons', 'lesson-a1'))).exists());
		for (const db of [
			rulesDb(target.unauthenticatedContext()),
			rulesDb(target.authenticatedContext('synthetic-no-grant'))
		])
			await assert.rejects(getDoc(doc(db, 'academy_lessons', 'lesson-a1')), {
				code: 'permission-denied'
			});
		await assert.rejects(getDoc(doc(participant, 'academy_lessons', 'lesson-b1')), {
			code: 'permission-denied'
		});
		await assert.rejects(getDocs(collectionGroup(participant, 'lessons')), {
			code: 'permission-denied'
		});
		const lesson = (await getDoc(doc(participant, 'academy_catalog', 'lesson-a1'))).data();
		assert.ok(lesson);
		await saveProgress(participant, active, lesson as Parameters<typeof saveProgress>[2], 58);
		assert.equal(
			(await getDoc(doc(participant, 'academy_progress', active, 'lessons', 'lesson-a1'))).data()
				?.positionSeconds,
			58
		);
		console.log(
			JSON.stringify({
				purpose: 'SYNTHETIC FIRESTORE ONLY',
				documents: rows.length,
				snapshotSha256: createHash('sha256').update(serialized).digest('hex'),
				elapsedMs: Date.now() - started,
				authRestore: 'NOT VERIFIED',
				hostedRollback: 'NOT VERIFIED'
			})
		);
	} finally {
		await target?.cleanup();
		await source.environment.cleanup();
	}
});
