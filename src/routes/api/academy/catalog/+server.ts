import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getCatalog } from '$lib/server/apiClient';

export const GET: RequestHandler = async ({ url }) => {
	const scopeId = url.searchParams.get('scopeId') ?? undefined;
	const res = await getCatalog(scopeId);
	if (!res.ok) {
		return json(
			{ error: res.error, message: res.message },
			{ status: res.status, headers: { 'cache-control': 'no-store' } }
		);
	}

	return json(
		{ catalog: res.data ?? [] },
		{ status: 200, headers: { 'cache-control': 'no-store' } }
	);
};
