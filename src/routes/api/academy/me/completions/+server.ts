import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getMyCompletions } from '$lib/server/apiClient';

export const GET: RequestHandler = async ({ url, locals }) => {
	if (!locals.accessToken) {
		return json(
			{ error: 'UNAUTHORIZED', message: 'Akses ditolak. Silakan login terlebih dahulu.' },
			{ status: 401, headers: { 'cache-control': 'no-store' } }
		);
	}

	const scopeId = url.searchParams.get('scopeId') ?? undefined;
	const res = await getMyCompletions(locals.accessToken, scopeId);
	if (!res.ok) {
		return json(
			{ error: res.error, message: res.message },
			{ status: res.status, headers: { 'cache-control': 'no-store' } }
		);
	}

	return json(res.data, { status: 200, headers: { 'cache-control': 'no-store' } });
};
