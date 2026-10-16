import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { requestOtp } from '$lib/server/apiClient';

export const POST: RequestHandler = async ({ request }) => {
	try {
		const body = await request.json();
		const email = typeof body?.email === 'string' ? body.email.trim() : '';

		if (!email || !email.includes('@')) {
			return json(
				{ error: 'INVALID_EMAIL', message: 'Format email tidak valid.' },
				{ status: 400, headers: { 'cache-control': 'no-store' } }
			);
		}

		const res = await requestOtp(email);
		if (!res.ok) {
			return json(
				{ error: res.error, message: res.message },
				{
					status: res.status,
					headers: {
						'cache-control': 'no-store',
						...(res.retryAfter ? { 'retry-after': res.retryAfter } : {})
					}
				}
			);
		}

		return json({ success: true }, { status: 200, headers: { 'cache-control': 'no-store' } });
	} catch {
		return json(
			{ error: 'BAD_REQUEST', message: 'Payload permintaan tidak valid.' },
			{ status: 400, headers: { 'cache-control': 'no-store' } }
		);
	}
};
