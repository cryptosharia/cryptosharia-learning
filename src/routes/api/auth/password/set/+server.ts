import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { setPasswordApi } from '$lib/server/apiClient';

export const POST: RequestHandler = async (event) => {
	const noStore = { 'cache-control': 'no-store' };
	if (!event.locals.accessToken) {
		return json(
			{ error: 'UNAUTHORIZED', message: 'Sesi tidak aktif.' },
			{ status: 401, headers: noStore }
		);
	}

	try {
		const body = await event.request.json();
		const otpCode = typeof body?.otpCode === 'string' ? body.otpCode.trim() : '';
		const newPassword = typeof body?.newPassword === 'string' ? body.newPassword : '';
		if (!/^\d{6}$/.test(otpCode) || newPassword.length < 12 || newPassword.length > 128) {
			return json(
				{ error: 'INVALID_PAYLOAD', message: 'Kode verifikasi atau kata sandi tidak valid.' },
				{ status: 400, headers: noStore }
			);
		}

		let ipAddress: string | undefined;
		try {
			ipAddress = event.getClientAddress();
		} catch {
			ipAddress = undefined;
		}
		const result = await setPasswordApi(event.locals.accessToken, otpCode, newPassword, ipAddress);
		if (!result.ok) {
			return json(
				{ error: result.error, message: result.message || 'Kata sandi belum dapat diatur.' },
				{ status: result.status, headers: noStore }
			);
		}
		return json({ success: true }, { status: 200, headers: noStore });
	} catch {
		return json(
			{ error: 'BAD_REQUEST', message: 'Payload kata sandi tidak valid.' },
			{ status: 400, headers: noStore }
		);
	}
};
