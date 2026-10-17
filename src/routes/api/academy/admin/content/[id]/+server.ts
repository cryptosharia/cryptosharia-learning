import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getAdminContentById, updateAdminContent, deleteAdminContentDraft } from '$lib/server/apiClient';

export const GET: RequestHandler = async ({ params, locals }) => {
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

	const res = await getAdminContentById(params.id, locals.accessToken);
	if (!res.ok) {
		return json(
			{ error: res.error, message: res.message },
			{ status: res.status, headers: { 'cache-control': 'no-store' } }
		);
	}

	return json(res.data, { status: 200, headers: { 'cache-control': 'no-store' } });
};

export const PUT: RequestHandler = async ({ params, request, locals }) => {
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

	let body: {
		title?: string;
		description?: string;
		thumbnail?: string;
		durationSeconds?: number;
		instructor?: string;
		order?: number;
		scopeId?: string | null;
		syariahRequired?: boolean;
	};
	try {
		body = await request.json();
	} catch {
		return json({ error: 'INVALID_JSON', message: 'Format JSON tidak valid' }, { status: 400 });
	}

	const res = await updateAdminContent(params.id, body, locals.accessToken);
	if (!res.ok) {
		return json(
			{ error: res.error, message: res.message },
			{ status: res.status, headers: { 'cache-control': 'no-store' } }
		);
	}

	return json(res.data, { status: 200, headers: { 'cache-control': 'no-store' } });
};

export const DELETE: RequestHandler = async ({ params, locals }) => {
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

	const res = await deleteAdminContentDraft(params.id, locals.accessToken);
	if (!res.ok) {
		return json(
			{ error: res.error, message: res.message },
			{ status: res.status, headers: { 'cache-control': 'no-store' } }
		);
	}

	return new Response(null, { status: 204, headers: { 'cache-control': 'no-store' } });
};
