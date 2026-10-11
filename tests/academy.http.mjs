import assert from 'node:assert/strict';

const mode = process.argv[2] || 'enabled';
const origin = process.env.ACADEMY_HTTP_ORIGIN || 'http://localhost:5173';
const target = new URL(origin);
assert.ok(target.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(target.hostname));
assert.ok(!target.username && !target.password && target.pathname === '/' && !target.search);
const baseline = {
	enabled: [
		['/', 200],
		['/e-learning', 200],
		['/e-learning/scope-a', 200],
		['/profile', 200],
		['/admin/courses', 200],
		['/subscription', 200],
		['/units', 200],
		['/payment/subscription/fixture', 503],
		['/admin/orders', 503],
		['/admin/vouchers', 503],
		['/e-learning/course/fixture', 503]
	],
	'default-off': [
		['/', 200],
		['/e-learning', 503],
		['/e-learning/scope-a', 503],
		['/profile', 503],
		['/admin/courses', 503],
		['/payment/subscription/fixture', 503]
	],
	offline: [
		['/', 200],
		['/e-learning', 503],
		['/e-learning/scope-a', 503],
		['/profile', 503],
		['/admin/courses', 503]
	]
};
assert.ok(mode in baseline, 'Choose enabled, default-off or offline');
const separation =
	mode === 'enabled'
		? [
				['/bootcamp', 404],
				['/admin/landing', 404],
				['/api/blob/upload', 404],
				['/auth/login', 200]
			]
		: [
				['/auth/login', 503],
				['/auth/register', 503]
			];
for (const [path, status] of [...baseline[mode], ...separation]) {
	const response = await fetch(origin + path, {
		redirect: 'error',
		signal: AbortSignal.timeout(20000)
	});
	assert.equal(response.status, status, `${mode}: ${path}`);
	if (status === 503) assert.equal(response.headers.get('cache-control'), 'no-store');
	const body = await response.text();
	assert.ok(!body.includes('masterclass.cryptosharia.id'), 'No Masterclass runtime domain');
	console.log(`PASS ${mode} ${path} ${status}`);
}
console.log(
	JSON.stringify({
		mode,
		baselineAssertions: baseline[mode].length,
		addedAssertions: separation.length,
		fail: 0
	})
);
