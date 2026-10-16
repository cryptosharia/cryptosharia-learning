import type { Handle } from '@sveltejs/kit';
import * as publicEnv from '$env/static/public';
import { academyTestEnabled, isAcademyPath, isContainedPath } from '$lib/academyAccess';
import { resolveAcademyMode } from '$lib/academyConfig';
import { resolveAcademyFirebaseSettings, requireFirebaseServices } from '$lib/firebaseConfig';
import { getApiConfig } from '$lib/server/apiConfig';
import { getSession } from '$lib/server/session';

const environment: Record<string, string | undefined> = publicEnv;

export const handle: Handle = async ({ event, resolve }) => {
	const pathname = event.url.pathname;
	const isGuardedRoute =
		isAcademyPath(pathname) || pathname.startsWith('/auth/') || pathname.startsWith('/api/');

	if (isGuardedRoute) {
		const mode = resolveAcademyMode(environment);

		if (mode === 'disabled') {
			return new Response(
				'Pembelajaran modul sedang disiapkan. Pendaftaran dan pembayaran belum tersedia.',
				{
					status: 503,
					headers: { 'cache-control': 'no-store', 'content-type': 'text/plain; charset=utf-8' }
				}
			);
		}

		if (mode === 'emulator') {
			if (pathname.startsWith('/api/'))
				return new Response('BFF API tidak tersedia dalam mode emulator.', {
					status: 503,
					headers: { 'cache-control': 'no-store' }
				});
			try {
				const settings = resolveAcademyFirebaseSettings(publicEnv);
				if (
					!academyTestEnabled(environment.PUBLIC_ACADEMY_ENABLED, settings) ||
					isContainedPath(pathname)
				) {
					return new Response(
						'Pembelajaran modul sedang disiapkan. Pendaftaran dan pembayaran belum tersedia.',
						{
							status: 503,
							headers: { 'cache-control': 'no-store', 'content-type': 'text/plain; charset=utf-8' }
						}
					);
				}
				await requireFirebaseServices(settings);
			} catch {
				return new Response('Pembelajaran modul belum tersedia. Silakan coba kembali nanti.', {
					status: 503,
					headers: { 'cache-control': 'no-store', 'content-type': 'text/plain; charset=utf-8' }
				});
			}
		} else if (mode === 'api') {
			if (isContainedPath(pathname)) {
				return new Response(
					'Pembelajaran modul sedang disiapkan. Pendaftaran dan pembayaran belum tersedia.',
					{
						status: 503,
						headers: { 'cache-control': 'no-store', 'content-type': 'text/plain; charset=utf-8' }
					}
				);
			}

			const { apiKey, baseUrl } = getApiConfig();
			if (!apiKey || !baseUrl) {
				return new Response('Layanan API belum dikonfigurasi dengan benar.', {
					status: 503,
					headers: { 'cache-control': 'no-store', 'content-type': 'text/plain; charset=utf-8' }
				});
			}

			// CSRF Protection for state-changing endpoints
			if (['POST', 'PUT', 'DELETE', 'PATCH'].includes(event.request.method)) {
				const origin = event.request.headers.get('origin');
				if (!origin) {
					return new Response('Permintaan ditolak: origin wajib diisi.', {
						status: 403,
						headers: { 'cache-control': 'no-store' }
					});
				}
				if (origin) {
					try {
						if (new URL(origin).origin !== event.url.origin) {
							return new Response(
								JSON.stringify({
									error: 'CSRF_REJECTED',
									message: 'Permintaan ditolak: asal permintaan tidak valid.'
								}),
								{
									status: 403,
									headers: {
										'cache-control': 'no-store',
										'content-type': 'application/json'
									}
								}
							);
						}
					} catch {
						return new Response(
							JSON.stringify({
								error: 'CSRF_REJECTED',
								message: 'Permintaan ditolak: header origin tidak valid.'
							}),
							{
								status: 403,
								headers: {
									'cache-control': 'no-store',
									'content-type': 'application/json'
								}
							}
						);
					}
				}
			}

			// Resolve authenticated session from HttpOnly cookies
			const session = await getSession(event.cookies);
			event.locals.user = session?.user ?? null;
			event.locals.accessToken = session?.accessToken ?? null;
		}
	}

	const response = await resolve(event);
	if (isGuardedRoute) response.headers.set('cache-control', 'no-store');
	return response;
};
