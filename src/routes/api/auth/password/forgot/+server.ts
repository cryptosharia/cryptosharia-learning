import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { forgotPasswordApi } from '$lib/server/apiClient';

export const POST: RequestHandler = async (event) => {
	const noStore = { 'cache-control': 'no-store' };
	try {
		const body = await event.request.json();
		const email = typeof body?.email === 'string' ? body.email.trim() : '';
		if (!email || !email.includes('@') || email.length > 255) {
			return json(
				{ error: 'INVALID_EMAIL', message: 'Format email tidak valid.' },
				{ status: 400, headers: noStore }
			);
		}

		let ipAddress: string | undefined;
		try {
			ipAddress = event.getClientAddress();
		} catch {
			ipAddress = undefined;
		}
		const result = await forgotPasswordApi(email, ipAddress);
		if (!result.ok) {
			return json(
				{
					error: 'REQUEST_UNAVAILABLE',
					message: 'Permintaan belum dapat diproses. Coba lagi nanti.'
				},
				{ status: 503, headers: noStore }
			);
		}

		return json(
			{ success: true, message: 'Jika email tersebut terdaftar, tautan reset akan dikirim.' },
			{ status: 200, headers: noStore }
		);
	} catch {
		return json(
			{ error: 'BAD_REQUEST', message: 'Payload permintaan tidak valid.' },
			{ status: 400, headers: noStore }
		);
	}
};
