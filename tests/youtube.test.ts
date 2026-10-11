import assert from 'node:assert/strict';
import { test } from 'node:test';
import { parseYouTubeUrl } from '../src/lib/youtube.ts';

const id = 'ethrPMuAayU';
for (const input of [
	`https://youtu.be/${id}`,
	`https://youtu.be/${id}?si=example`,
	`https://www.youtube.com/watch?v=${id}`,
	`https://www.youtube.com/embed/${id}`,
	`https://youtube.com/shorts/${id}`,
	`https://www.youtube-nocookie.com/embed/${id}`
]) {
	test(`normalizes supported URL ${input}`, () =>
		assert.deepEqual(parseYouTubeUrl(input), {
			videoId: id,
			embedUrl: `https://www.youtube-nocookie.com/embed/${id}`
		}));
}
for (const input of [
	'',
	'javascript:alert(1)',
	`http://youtu.be/${id}`,
	`https://youtube.com.evil.example/watch?v=${id}`,
	`https://evil.example/youtube.com/watch?v=${id}`,
	`https://user@youtu.be/${id}`,
	`https://youtu.be:8443/${id}`,
	`https://youtu.be/${id}/extra`,
	'https://youtube.com/watch?v=bad',
	`https://youtube.com/watch?v=${id}extra`,
	`https://youtube.com/watch?v=${id}&v=${id}`,
	`https://youtu.be/${id}?v=${id}`,
	`https://youtube.com/watch?v=${id}&list=PLdemo`,
	`https://youtu.be/${id}?start=1&t=2`,
	`https://youtu.be/${id}#extra`,
	` https://youtu.be/${id}`,
	`https:\\youtu.be\\${id}`,
	`https://youtu.be/${id}?unknown=1`
]) {
	test(`rejects unsupported or ambiguous URL ${input}`, () =>
		assert.equal(parseYouTubeUrl(input), null));
}
