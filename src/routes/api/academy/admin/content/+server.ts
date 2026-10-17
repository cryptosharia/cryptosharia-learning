import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getAdminContent, createAdminContent } from '$lib/server/apiClient';

export const GET: RequestHandler = async ({ url, locals }) => {
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

	const status = url.searchParams.get('status') || undefined;
	const kind = url.searchParams.get('kind') || undefined;
	const subjectId = url.searchParams.get('subjectId') || undefined;
	const scopeId = url.searchParams.get('scopeId') || undefined;

	const res = await getAdminContent({ status, kind, subjectId, scopeId }, locals.accessToken);
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

	let body: {
		id: string;
		kind: string;
		parentId: string;
		subjectId: string;
		level: number;
		chapterNumber: number;
		order: number;
		scopeId?: string | null;
		title: string;
		description?: string;
		thumbnail?: string;
		durationSeconds?: number;
		instructor?: string;
		syariahRequired?: boolean;
	};
	try {
		body = await request.json();
	} catch {
		return json({ error: 'INVALID_JSON', message: 'Format JSON tidak valid' }, { status: 400 });
	}

	const res = await createAdminContent(body, locals.accessToken);
	if (!res.ok) {
		return json(
			{ error: res.error, message: res.message },
			{ status: res.status, headers: { 'cache-control': 'no-store' } }
		);
	}

	return json(res.data, { status: 201, headers: { 'cache-control': 'no-store' } });
};
