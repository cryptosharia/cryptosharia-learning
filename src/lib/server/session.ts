import type { Cookies } from '@sveltejs/kit';
import { getMe, refreshAccessToken, signOutApi, type UserProfile } from './apiClient.ts';

export const ACCESS_TOKEN_COOKIE = 'cs_at';
export const REFRESH_TOKEN_COOKIE = 'cs_rt';

// Access token lifetime: 15 minutes
export const ACCESS_TOKEN_MAX_AGE = 15 * 60;
// Refresh token lifetime: 15 days (API v2 specification)
export const REFRESH_TOKEN_MAX_AGE = 15 * 24 * 60 * 60;

const baseCookieOptions = {
	path: '/',
	httpOnly: true,
	sameSite: 'lax' as const,
	secure: process.env.NODE_ENV === 'production'
};

export interface SessionData {
	user: UserProfile;
	accessToken: string;
}

// In-flight refresh promise map keyed by refreshToken to prevent concurrent refresh races
const inFlightRefreshes = new Map<string, Promise<{ accessToken: string } | null>>();

/**
 * Deduplicated token refresh handler ensuring concurrent requests
 * share the same refresh operation without race conditions.
 */
export async function refreshSessionToken(
	refreshToken: string
): Promise<{ accessToken: string } | null> {
	if (!refreshToken) return null;

	const existing = inFlightRefreshes.get(refreshToken);
	if (existing) {
		return existing;
	}

	const refreshPromise = (async () => {
		try {
			const res = await refreshAccessToken(refreshToken);
			if (res.ok && res.data?.accessToken) {
				return { accessToken: res.data.accessToken };
			}
			return null;
		} catch {
			return null;
		} finally {
			inFlightRefreshes.delete(refreshToken);
		}
	})();

	inFlightRefreshes.set(refreshToken, refreshPromise);
	return refreshPromise;
}

/**
 * Persists session credentials in secure, HttpOnly cookies.
 */
export function setSessionCookies(
	cookies: Pick<Cookies, 'set'>,
	tokens: { accessToken: string; refreshToken: string }
): void {
	cookies.set(ACCESS_TOKEN_COOKIE, tokens.accessToken, {
		...baseCookieOptions,
		maxAge: ACCESS_TOKEN_MAX_AGE
	});

	cookies.set(REFRESH_TOKEN_COOKIE, tokens.refreshToken, {
		...baseCookieOptions,
		maxAge: REFRESH_TOKEN_MAX_AGE
	});
}

/**
 * Clears all session cookies on logout or invalidation.
 */
export function clearSessionCookies(cookies: Pick<Cookies, 'delete'>): void {
	cookies.delete(ACCESS_TOKEN_COOKIE, { path: '/' });
	cookies.delete(REFRESH_TOKEN_COOKIE, { path: '/' });
}

/**
 * Retrieves the active session from cookies.
 * Handles transparent token renewal when accessToken is expired but refreshToken is valid.
 */
export async function getSession(cookies: Cookies): Promise<SessionData | null> {
	const accessToken = cookies.get(ACCESS_TOKEN_COOKIE);
	const refreshToken = cookies.get(REFRESH_TOKEN_COOKIE);
	if (!refreshToken) {
		if (accessToken) clearSessionCookies(cookies);
		return null;
	}

	if (accessToken) {
		const meRes = await getMe(accessToken);
		if (meRes.ok && meRes.data) {
			return { user: meRes.data, accessToken };
		}
	}

	// Access token missing or rejected â€” attempt session renewal via refreshToken
	if (refreshToken) {
		const refreshed = await refreshSessionToken(refreshToken);
		if (refreshed?.accessToken) {
			cookies.set(ACCESS_TOKEN_COOKIE, refreshed.accessToken, {
				...baseCookieOptions,
				maxAge: ACCESS_TOKEN_MAX_AGE
			});

			const meRes = await getMe(refreshed.accessToken);
			if (meRes.ok && meRes.data) {
				return { user: meRes.data, accessToken: refreshed.accessToken };
			}
		}

		// Refresh failed or revoked by server â€” clear invalid session cookies
		clearSessionCookies(cookies);
	}

	return null;
}

/**
 * Terminates session both locally (cookies) and on backend (revoking refreshToken).
 */
export async function destroySession(cookies: Pick<Cookies, 'get' | 'delete'>): Promise<void> {
	const refreshToken = cookies.get(REFRESH_TOKEN_COOKIE);
	const accessToken = cookies.get(ACCESS_TOKEN_COOKIE);

	if (refreshToken) {
		await signOutApi(refreshToken, accessToken);
	}

	clearSessionCookies(cookies);
}
