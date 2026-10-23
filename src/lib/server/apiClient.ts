import type {
	ContentDto,
	GrantDto,
	ProgressDto,
	CompletionsDto,
	LessonDto,
	ScopeDto,
	AdminContentDto,
	AdminStatsDto,
	AdminGrantDto,
	MediaDto
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
	hasPassword?: boolean;
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
		clientIp?: string;
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
	if (options.clientIp && /^[0-9a-fA-F:.]+$/.test(options.clientIp)) {
		headers['forwarded'] = `for="${options.clientIp}"`;
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

export async function requestOtp(email: string, clientIp?: string) {
	return apiFetch<void>('/auth/otp/request', {
		method: 'POST',
		clientIp,
		body: { email }
	});
}

export async function verifyOtp(email: string, code: string, clientIp?: string) {
	return apiFetch<TokenPair>('/auth/otp/verify', {
		method: 'POST',
		clientIp,
		body: { email, code }
	});
}

export async function loginWithPasswordApi(email: string, password: string, clientIp?: string) {
	return apiFetch<TokenPair>('/auth/password/login', {
		method: 'POST',
		clientIp,
		body: { email, password }
	});
}

export async function forgotPasswordApi(email: string, clientIp?: string) {
	return apiFetch<void>('/auth/password/forgot', {
		method: 'POST',
		clientIp,
		body: { email, application: 'learning' }
	});
}

export async function resetPasswordApi(token: string, newPassword: string) {
	return apiFetch<void>('/auth/password/reset', {
		method: 'POST',
		body: { token, newPassword }
	});
}

export async function setPasswordApi(
	accessToken: string,
	otpCode: string,
	newPassword: string,
	clientIp?: string
) {
	return apiFetch<void>('/auth/password/set', {
		method: 'POST',
		accessToken,
		clientIp,
		body: { otpCode, newPassword }
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

// ==========================================
// Academy Admin CMS API methods (Package 4)
// ==========================================

export async function getAdminStats(accessToken: string) {
	return apiFetch<AdminStatsDto>('/academy/admin/stats', {
		accessToken
	});
}

export async function getAdminScopes(accessToken: string) {
	return apiFetch<ScopeDto[]>('/academy/admin/scopes', {
		accessToken
	});
}

export async function createAdminScope(
	payload: { id: string; name: string; description?: string; isActive?: boolean },
	accessToken: string
) {
	return apiFetch<ScopeDto>('/academy/admin/scopes', {
		method: 'POST',
		accessToken,
		body: payload
	});
}

export async function updateAdminScope(
	id: string,
	payload: { name?: string; description?: string; isActive?: boolean },
	accessToken: string
) {
	return apiFetch<ScopeDto>(`/academy/admin/scopes/${encodeURIComponent(id)}`, {
		method: 'PUT',
		accessToken,
		body: payload
	});
}

export async function getAdminContent(
	params: { status?: string; kind?: string; subjectId?: string; scopeId?: string },
	accessToken: string
) {
	const queryParts: string[] = [];
	if (params.status) queryParts.push(`status=${encodeURIComponent(params.status)}`);
	if (params.kind) queryParts.push(`kind=${encodeURIComponent(params.kind)}`);
	if (params.subjectId) queryParts.push(`subjectId=${encodeURIComponent(params.subjectId)}`);
	if (params.scopeId) queryParts.push(`scopeId=${encodeURIComponent(params.scopeId)}`);
	const query = queryParts.length > 0 ? `?${queryParts.join('&')}` : '';

	return apiFetch<AdminContentDto[]>(`/academy/admin/content${query}`, {
		accessToken
	});
}

export async function getAdminContentById(id: string, accessToken: string) {
	return apiFetch<AdminContentDto>(`/academy/admin/content/${encodeURIComponent(id)}`, {
		accessToken
	});
}

export async function createAdminContent(
	payload: {
		id: string;
		kind: string;
		parentId: string;
		subjectId: string;
		level: number;
		chapterNumber: number;
		order: number;
		scopeId?: string | null;
		title: string;
		description?: string;
		thumbnail?: string;
		durationSeconds?: number;
		instructor?: string;
		syariahRequired?: boolean;
	},
	accessToken: string
) {
	return apiFetch<AdminContentDto>('/academy/admin/content', {
		method: 'POST',
		accessToken,
		body: payload
	});
}

export async function updateAdminContent(
	id: string,
	payload: {
		title?: string;
		description?: string;
		thumbnail?: string;
		durationSeconds?: number;
		instructor?: string;
		order?: number;
		scopeId?: string | null;
		syariahRequired?: boolean;
	},
	accessToken: string
) {
	return apiFetch<AdminContentDto>(`/academy/admin/content/${encodeURIComponent(id)}`, {
		method: 'PUT',
		accessToken,
		body: payload
	});
}

export async function deleteAdminContentDraft(id: string, accessToken: string) {
	return apiFetch<void>(`/academy/admin/content/${encodeURIComponent(id)}`, {
		method: 'DELETE',
		accessToken
	});
}

export async function transitionAdminContent(
	id: string,
	payload: { targetStatus: string; rightsConfirmed?: boolean },
	accessToken: string
) {
	return apiFetch<AdminContentDto>(`/academy/admin/content/${encodeURIComponent(id)}/transition`, {
		method: 'POST',
		accessToken,
		body: payload
	});
}

export async function setAdminLessonMedia(
	id: string,
	payload: {
		videoId: string;
		readingRefs?: string[];
		slideRefs?: string[];
		subtitleRefs?: string[];
		attachmentRefs?: string[];
		internalNote?: string | null;
	},
	accessToken: string
) {
	return apiFetch<MediaDto>(`/academy/admin/content/${encodeURIComponent(id)}/media`, {
		method: 'PUT',
		accessToken,
		body: payload
	});
}

export async function getAdminGrants(
	params: { userId?: string; scopeId?: string },
	accessToken: string
) {
	const queryParts: string[] = [];
	if (params.userId) queryParts.push(`userId=${encodeURIComponent(params.userId)}`);
	if (params.scopeId) queryParts.push(`scopeId=${encodeURIComponent(params.scopeId)}`);
	const query = queryParts.length > 0 ? `?${queryParts.join('&')}` : '';

	return apiFetch<AdminGrantDto[]>(`/academy/admin/grants${query}`, {
		accessToken
	});
}

export async function createAdminGrant(
	payload: {
		userId: string;
		scopeId: string;
		state?: string;
		startsAt?: string;
		expiresAt?: string;
		source?: string;
		auditId?: string;
	},
	accessToken: string
) {
	return apiFetch<AdminGrantDto>('/academy/admin/grants', {
		method: 'POST',
		accessToken,
		body: payload
	});
}

export async function revokeAdminGrant(id: string, accessToken: string) {
	return apiFetch<AdminGrantDto>(`/academy/admin/grants/${encodeURIComponent(id)}/revoke`, {
		method: 'PUT',
		accessToken
	});
}
