import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getMyProgress } from '$lib/server/apiClient';

export const GET: RequestHandler = async ({ locals }) => {
	if (!locals.accessToken) {
		return json(
			{ error: 'UNAUTHORIZED', message: 'Akses ditolak. Silakan login terlebih dahulu.' },
			{ status: 401, headers: { 'cache-control': 'no-store' } }
		);
	}

	const res = await getMyProgress(locals.accessToken);
	if (!res.ok) {
		return json(
			{ error: res.error, message: res.message },
			{ status: res.status, headers: { 'cache-control': 'no-store' } }
		);
	}

	return json(
		{ progress: res.data ?? [] },
		{ status: 200, headers: { 'cache-control': 'no-store' } }
	);
};
