import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getAdminScopes, createAdminScope } from '$lib/server/apiClient';

export const GET: RequestHandler = async ({ locals }) => {
	if (!locals.accessToken || !locals.user) {
		return json(
			{ error: 'UNAUTHORIZED', message: 'Akses ditolak. Silakan login terlebih dahulu.' },
			{ status: 401, headers: { 'cache-control': 'no-store' } }
		);
	}
	if (locals.user.role !== 'super_admin' && locals.user.role !== 'admin') {
		return json(
			{ error: 'FORBIDDEN', message: 'Akses administrator diperlukan.' },
			{ status: 403, headers: { 'cache-control': 'no-store' } }
		);
	}

	const res = await getAdminScopes(locals.accessToken);
	if (!res.ok) {
		return json(
			{ error: res.error, message: res.message },
			{ status: res.status, headers: { 'cache-control': 'no-store' } }
		);
	}

	return json(res.data, { status: 200, headers: { 'cache-control': 'no-store' } });
};

export const POST: RequestHandler = async ({ request, locals }) => {
	if (!locals.accessToken || !locals.user) {
		return json(
			{ error: 'UNAUTHORIZED', message: 'Akses ditolak. Silakan login terlebih dahulu.' },
			{ status: 401, headers: { 'cache-control': 'no-store' } }
		);
	}
	if (locals.user.role !== 'super_admin' && locals.user.role !== 'admin') {
		return json(
			{ error: 'FORBIDDEN', message: 'Akses administrator diperlukan.' },
			{ status: 403, headers: { 'cache-control': 'no-store' } }
		);
	}

	let body: { id: string; name: string; description?: string; isActive?: boolean };
	try {
		body = await request.json();
	} catch {
		return json({ error: 'INVALID_JSON', message: 'Format JSON tidak valid' }, { status: 400 });
	}

	const res = await createAdminScope(body, locals.accessToken);
	if (!res.ok) {
		return json(
			{ error: res.error, message: res.message },
			{ status: res.status, headers: { 'cache-control': 'no-store' } }
		);
	}

	return json(res.data, { status: 201, headers: { 'cache-control': 'no-store' } });
};
