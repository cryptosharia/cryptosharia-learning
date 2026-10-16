import type {
	ContentDto,
	GrantDto,
	ProgressDto,
	CompletionsDto,
	LessonDto
} from '../academyDtos.ts';
import { getApiConfig } from './apiConfig.ts';

export interface ApiClientResponse<T> {
	status: number;
	ok: boolean;
	data: T | null;
	error?: string;
	message?: string;
	retryAfter?: string;
}

export interface UserProfile {
	id: string;
	name: string;
	email: string;
	role: string;
	status: string;
	permissions?: string[];
	createdAt?: string;
	updatedAt?: string;
}

export interface TokenPair {
	accessToken: string;
	refreshToken: string;
}

/**
 * Low-level dispatch to CryptoSharia API v2 backend.
 * Always injects the private `api-key` header and never leaks it to the client.
 */
export async function apiFetch<T = unknown>(
	path: string,
	options: {
		method?: string;
		accessToken?: string;
		body?: unknown;
		signal?: AbortSignal;
	} = {}
): Promise<ApiClientResponse<T>> {
	const { baseUrl, apiKey } = getApiConfig();

	if (!apiKey || !baseUrl) {
		return {
			status: 503,
			ok: false,
			data: null,
			error: 'API_KEY_MISSING',
			message: 'Kunci otorisasi API belum dikonfigurasi di server.'
		};
	}

	const headers: Record<string, string> = {
		'api-key': apiKey,
		accept: 'application/json'
	};

	if (options.accessToken) {
		headers['authorization'] = `Bearer ${options.accessToken}`;
	}

	if (options.body !== undefined) {
		headers['content-type'] = 'application/json';
	}

	try {
		const res = await fetch(`${baseUrl}${path}`, {
			method: options.method ?? 'GET',
			headers,
			body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
			signal: options.signal ?? AbortSignal.timeout(10000),
			redirect: 'error',
			cache: 'no-store'
		});

		let data: unknown = null;
		const text = await res.text();
		try {
			data = text ? JSON.parse(text) : null;
		} catch {
			data = text;
		}

		if (!res.ok) {
			const failure = data && typeof data === 'object' ? (data as Record<string, unknown>) : {};
			const error = typeof failure.error === 'string' ? failure.error : 'API_ERROR';
			const message = typeof failure.message === 'string' ? failure.message : res.statusText;
			return {
				status: res.status,
				ok: false,
				data: null,
				error,
				retryAfter: /^\d+$/.test(res.headers.get('retry-after') || '')
					? res.headers.get('retry-after')!
					: undefined,
				message
			};
		}

		return {
			status: res.status,
			ok: true,
			data: data as T
		};
	} catch {
		return {
			status: 503,
			ok: false,
			data: null,
			error: 'BACKEND_UNAVAILABLE',
			message: 'Layanan API tidak dapat dihubungi. Silakan coba kembali nanti.'
		};
	}
}

// ==========================================
// Auth API methods
// ==========================================

export async function requestOtp(email: string) {
	return apiFetch<void>('/auth/otp/request', {
		method: 'POST',
		body: { email }
	});
}

export async function verifyOtp(email: string, code: string) {
	return apiFetch<TokenPair>('/auth/otp/verify', {
		method: 'POST',
		body: { email, code }
	});
}

export async function refreshAccessToken(refreshToken: string) {
	return apiFetch<{ accessToken: string }>('/auth/refresh', {
		method: 'POST',
		body: { refreshToken }
	});
}

export async function signOutApi(refreshToken: string, accessToken?: string) {
	return apiFetch<void>('/auth/signout', {
		method: 'POST',
		accessToken,
		body: { refreshToken }
	});
}

export async function getMe(accessToken: string) {
	return apiFetch<UserProfile>('/auth/me', {
		accessToken
	});
}

// ==========================================
// Academy API methods
// ==========================================

export async function getCatalog(scopeId?: string) {
	const query = scopeId ? `?scopeId=${encodeURIComponent(scopeId)}` : '';
	return apiFetch<ContentDto[]>(`/academy/catalog${query}`);
}

export async function getCurriculum() {
	return apiFetch<ContentDto[]>('/academy/curriculum');
}

export async function getLesson(lessonId: string, accessToken: string) {
	return apiFetch<LessonDto>(`/academy/lessons/${encodeURIComponent(lessonId)}`, {
		accessToken
	});
}

export async function getMyGrants(accessToken: string) {
	return apiFetch<GrantDto[]>('/academy/me/grants', {
		accessToken
	});
}

export async function getMyProgress(accessToken: string) {
	return apiFetch<ProgressDto[]>('/academy/me/progress', {
		accessToken
	});
}

export async function updateMyProgress(
	lessonId: string,
	payload: { version: number; positionSeconds: number },
	accessToken: string
) {
	return apiFetch<{ success: boolean }>(`/academy/me/progress/${encodeURIComponent(lessonId)}`, {
		method: 'PUT',
		accessToken,
		body: payload
	});
}

export async function getMyCompletions(accessToken: string, scopeId?: string) {
	const query = scopeId ? `?scopeId=${encodeURIComponent(scopeId)}` : '';
	return apiFetch<CompletionsDto>(`/academy/me/completions${query}`, {
		accessToken
	});
}

export async function markLessonComplete(
	lessonId: string,
	payload: { version: number },
	accessToken: string
) {
	return apiFetch<{ success: boolean }>(`/academy/me/completions/${encodeURIComponent(lessonId)}`, {
		method: 'POST',
		accessToken,
		body: payload
	});
}
