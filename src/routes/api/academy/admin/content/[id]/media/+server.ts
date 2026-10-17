import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { setAdminLessonMedia } from '$lib/server/apiClient';

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
		videoId: string;
		readingRefs?: string[];
		slideRefs?: string[];
		subtitleRefs?: string[];
		attachmentRefs?: string[];
		internalNote?: string | null;
	};
	try {
		body = await request.json();
	} catch {
		return json({ error: 'INVALID_JSON', message: 'Format JSON tidak valid' }, { status: 400 });
	}

	const res = await setAdminLessonMedia(params.id, body, locals.accessToken);
	if (!res.ok) {
		return json(
			{ error: res.error, message: res.message },
			{ status: res.status, headers: { 'cache-control': 'no-store' } }
		);
	}

	return json(res.data, { status: 200, headers: { 'cache-control': 'no-store' } });
};
