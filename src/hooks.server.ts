import type { Handle } from '@sveltejs/kit';
import * as publicEnv from '$env/static/public';
import { academyTestEnabled, isAcademyPath, isContainedPath } from '$lib/academyAccess';
import { resolveAcademyFirebaseSettings, requireFirebaseServices } from '$lib/firebaseConfig';

const environment: Record<string, string | undefined> = publicEnv;

export const handle: Handle = async ({ event, resolve }) => {
	if (isAcademyPath(event.url.pathname) || event.url.pathname.startsWith('/auth/')) {
		try {
			const settings = resolveAcademyFirebaseSettings(publicEnv);
			if (
				!academyTestEnabled(environment.PUBLIC_ACADEMY_ENABLED, settings) ||
				isContainedPath(event.url.pathname)
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
	}
	return resolve(event);
};
