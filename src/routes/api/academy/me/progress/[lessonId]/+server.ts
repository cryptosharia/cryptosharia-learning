import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { updateMyProgress } from '$lib/server/apiClient';

export const PUT: RequestHandler = async ({ params, request, locals }) => {
	if (!locals.accessToken) {
		return json(
			{ error: 'UNAUTHORIZED', message: 'Akses ditolak. Silakan login terlebih dahulu.' },
			{ status: 401, headers: { 'cache-control': 'no-store' } }
		);
	}

	let body: { version?: number; positionSeconds?: number };
	try {
		body = await request.json();
	} catch {
		return json(
			{ error: 'BAD_REQUEST', message: 'Payload tidak valid.' },
			{ status: 400, headers: { 'cache-control': 'no-store' } }
		);
	}

	const version = body?.version;
	const positionSeconds = body?.positionSeconds;

	if (
		typeof version !== 'number' ||
		!Number.isInteger(version) ||
		version < 1 ||
		typeof positionSeconds !== 'number' ||
		!Number.isInteger(positionSeconds) ||
		positionSeconds < 0
	) {
		return json(
			{ error: 'INVALID_PAYLOAD', message: 'Parameter versi atau posisi video tidak valid.' },
			{ status: 400, headers: { 'cache-control': 'no-store' } }
		);
	}

	const res = await updateMyProgress(
		params.lessonId,
		{ version, positionSeconds },
		locals.accessToken
	);

	if (!res.ok) {
		return json(
			{ error: res.error, message: res.message },
			{ status: res.status, headers: { 'cache-control': 'no-store' } }
		);
	}

	return json(res.data, { status: 200, headers: { 'cache-control': 'no-store' } });
};
