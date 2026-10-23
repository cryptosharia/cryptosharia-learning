import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getMe, verifyOtp, signOutApi } from '$lib/server/apiClient';
import { setSessionCookies } from '$lib/server/session';

export const POST: RequestHandler = async ({ request, cookies }) => {
	try {
		const body = await request.json();
		const email = typeof body?.email === 'string' ? body.email.trim() : '';
		const code = typeof body?.code === 'string' ? body.code.trim() : '';

		if (!email || !/^\d{6}$/.test(code)) {
			return json(
				{ error: 'INVALID_PAYLOAD', message: 'Email dan 6-digit kode OTP harus diisi.' },
				{ status: 400, headers: { 'cache-control': 'no-store' } }
			);
		}

		const verifyRes = await verifyOtp(email, code);
		if (!verifyRes.ok || !verifyRes.data) {
			return json(
				{ error: verifyRes.error, message: verifyRes.message },
				{
					status: verifyRes.status,
					headers: {
						'cache-control': 'no-store',
						...(verifyRes.retryAfter ? { 'retry-after': verifyRes.retryAfter } : {})
					}
				}
			);
		}

		// Retrieve user profile using verified accessToken
		const meRes = await getMe(verifyRes.data.accessToken);
		if (!meRes.ok || !meRes.data) {
			await signOutApi(verifyRes.data.refreshToken);
			return json(
				{ error: 'PROFILE_FETCH_FAILED', message: 'Gagal memuat profil pengguna.' },
				{ status: 500, headers: { 'cache-control': 'no-store' } }
			);
		}

		// Establish a browser session only after the profile has been validated.
		setSessionCookies(cookies, verifyRes.data);
		const user = meRes.data;
		return json(
			{
				success: true,
				user: {
					id: user.id,
					email: user.email,
					name: user.name,
					role: user.role,
					hasPassword: user.hasPassword
				}
			},
			{ status: 200, headers: { 'cache-control': 'no-store' } }
		);
	} catch {
		return json(
			{ error: 'BAD_REQUEST', message: 'Payload verifikasi OTP tidak valid.' },
			{ status: 400, headers: { 'cache-control': 'no-store' } }
		);
	}
};
