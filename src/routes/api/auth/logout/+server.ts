import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { destroySession } from '$lib/server/session';

export const POST: RequestHandler = async ({ cookies }) => {
	await destroySession(cookies);
	return json({ success: true }, { status: 200, headers: { 'cache-control': 'no-store' } });
};
