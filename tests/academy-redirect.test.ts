import assert from 'node:assert/strict';
import test from 'node:test';
import { safePostLoginDestination } from '../src/lib/authRedirect.ts';

test('login returns a valid internal lesson route with its lesson query', () => {
	assert.equal(
		safePostLoginDestination('/e-learning/scope-synthetic?lesson=lesson-synthetic'),
		'/e-learning/scope-synthetic?lesson=lesson-synthetic'
	);
});

test('login returns an authorized administrator to the requested CMS route', () => {
	assert.equal(safePostLoginDestination('/admin/courses', 'admin'), '/admin/courses');
	assert.equal(safePostLoginDestination('/admin/courses', 'super_admin'), '/admin/courses');
	assert.equal(safePostLoginDestination('/admin/courses', 'member'), '/e-learning');
});

test('login rejects external, protocol-relative, encoded and unknown destinations', () => {
	for (const value of [
		'https://evil.example/',
		'//evil.example/',
		'/\\evil.example',
		'/%2f%2fevil.example',
		'/admin/users',
		'/e-learning/scope?lesson=../../private',
		'/profile?next=https://evil.example'
	]) {
		assert.equal(safePostLoginDestination(value), '/e-learning', value);
	}
});

test('login supports only the account anchor on the profile route', () => {
	assert.equal(safePostLoginDestination('/profile#profil-akun'), '/profile#profil-akun');
	assert.equal(safePostLoginDestination('/profile#other'), '/e-learning');
});
