import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getCurriculum } from '$lib/server/apiClient';

export const GET: RequestHandler = async () => {
	const res = await getCurriculum();
	if (!res.ok) {
		return json(
			{ error: res.error, message: res.message },
			{ status: res.status, headers: { 'cache-control': 'no-store' } }
		);
	}

	return json({ items: res.data ?? [] }, { status: 200, headers: { 'cache-control': 'no-store' } });
};
