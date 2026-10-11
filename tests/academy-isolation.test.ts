import assert from 'node:assert/strict';
import { test } from 'node:test';
import { isolatedEnvironment } from './academy-fixtures.ts';

test('project mismatch fails before fixture setup or emulator mutation', async () => {
	const previous = process.env.GCLOUD_PROJECT;
	try {
		process.env.GCLOUD_PROJECT = 'unexpected-project';
		await assert.rejects(isolatedEnvironment(), /Mismatched GCLOUD_PROJECT; stop before mutation/);
	} finally {
		if (previous === undefined) delete process.env.GCLOUD_PROJECT;
		else process.env.GCLOUD_PROJECT = previous;
	}
});
