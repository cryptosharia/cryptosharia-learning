import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { resetPasswordApi } from '$lib/server/apiClient';

export const POST: RequestHandler = async ({ request }) => {
	const noStore = { 'cache-control': 'no-store' };
	try {
		const body = await request.json();
		const token = typeof body?.token === 'string' ? body.token : '';
		const newPassword = typeof body?.newPassword === 'string' ? body.newPassword : '';
		if (!/^[A-Za-z0-9_-]{43}$/.test(token) || newPassword.length < 12 || newPassword.length > 128) {
			return json(
				{ error: 'INVALID_PAYLOAD', message: 'Token atau kata sandi tidak valid.' },
				{ status: 400, headers: noStore }
			);
		}

		const result = await resetPasswordApi(token, newPassword);
		if (!result.ok) {
			return json(
				{
					error: 'PASSWORD_RESET_INVALID',
					message: 'Tautan reset tidak valid atau telah kedaluwarsa.'
				},
				{ status: result.status === 503 ? 503 : 400, headers: noStore }
			);
		}
		return json({ success: true }, { status: 200, headers: noStore });
	} catch {
		return json(
			{ error: 'BAD_REQUEST', message: 'Payload reset tidak valid.' },
			{ status: 400, headers: noStore }
		);
	}
};
