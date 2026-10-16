import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ locals }) => {
	if (!locals.user) {
		return json(
			{ error: 'UNAUTHORIZED', message: 'Sesi tidak aktif atau telah kedaluwarsa.' },
			{ status: 401, headers: { 'cache-control': 'no-store' } }
		);
	}

	const { id, name, email, role } = locals.user;
	return json(
		{ user: { id, name, email, role } },
		{ status: 200, headers: { 'cache-control': 'no-store' } }
	);
};
