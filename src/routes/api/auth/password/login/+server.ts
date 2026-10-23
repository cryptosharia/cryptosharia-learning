import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getMe, loginWithPasswordApi, signOutApi } from '$lib/server/apiClient';
import { setSessionCookies } from '$lib/server/session';

function clientIp(event: Parameters<RequestHandler>[0]): string | undefined {
	try {
		return event.getClientAddress();
	} catch {
		return undefined;
	}
}

export const POST: RequestHandler = async (event) => {
	const noStore = { 'cache-control': 'no-store' };
	try {
		const body = await event.request.json();
		const email = typeof body?.email === 'string' ? body.email.trim() : '';
		const password = typeof body?.password === 'string' ? body.password : '';
		if (
			!email ||
			!email.includes('@') ||
			email.length > 255 ||
			!password ||
			password.length > 128
		) {
			return json(
				{ error: 'INVALID_PAYLOAD', message: 'Email dan kata sandi harus diisi.' },
				{ status: 400, headers: noStore }
			);
		}

		const login = await loginWithPasswordApi(email, password, clientIp(event));
		if (!login.ok || !login.data) {
			const status = login.status === 429 ? 429 : login.status === 401 ? 401 : 503;
			return json(
				{
					error: status === 401 ? 'INVALID_CREDENTIALS' : login.error,
					message:
						status === 401
							? 'Email atau kata sandi tidak valid.'
							: status === 429
								? 'Terlalu banyak percobaan. Coba lagi nanti.'
								: 'Layanan login belum dapat dihubungi.'
				},
				{
					status,
					headers: { ...noStore, ...(login.retryAfter ? { 'retry-after': login.retryAfter } : {}) }
				}
			);
		}

		const profile = await getMe(login.data.accessToken);
		if (!profile.ok || !profile.data) {
			await signOutApi(login.data.refreshToken);
			return json(
				{ error: 'PROFILE_FETCH_FAILED', message: 'Profil akun tidak dapat dimuat.' },
				{ status: 502, headers: noStore }
			);
		}

		setSessionCookies(event.cookies, login.data);
		return json(
			{
				success: true,
				user: {
					id: profile.data.id,
					email: profile.data.email,
					name: profile.data.name,
					role: profile.data.role,
					hasPassword: profile.data.hasPassword
				}
			},
			{ status: 200, headers: noStore }
		);
	} catch {
		return json(
			{ error: 'BAD_REQUEST', message: 'Payload permintaan tidak valid.' },
			{ status: 400, headers: noStore }
		);
	}
};
