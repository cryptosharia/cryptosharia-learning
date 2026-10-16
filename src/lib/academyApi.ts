import type { ContentDto, GrantDto, ProgressDto, CompletionDto } from './academyDtos.ts';
import type { CatalogLesson, Completion, Grant, Media, Progress } from './academyData.ts';
import { parseYouTubeUrl } from './youtube.ts';
import type { PlayerState } from './academyPlayer.ts';

async function apiRequest(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
	const response = await fetch(input, { ...init, cache: 'no-store' });
	if (response.status === 401 && typeof window !== 'undefined')
		window.dispatchEvent(new Event('academy-session-expired'));
	return response;
}

/**
 * Wraps an ISO date string or Date into a Firestore Timestamp-compatible object
 * with `.toMillis()` and `.toDate()`.
 */
export function wrapTimestamp(isoStringOrDate: string | Date | number) {
	const d = new Date(isoStringOrDate);
	return {
		toMillis: () => d.getTime(),
		toDate: () => d,
		seconds: Math.floor(d.getTime() / 1000),
		nanoseconds: (d.getTime() % 1000) * 1000000
	};
}

/**
 * Maps API v2 Content DTO to the frontend CatalogLesson format.
 */
export function mapApiContentToCatalogLesson(
	item: ContentDto,
	allItems: ContentDto[] = []
): CatalogLesson {
	if (item.status !== 'published' || !Number.isInteger(item.version) || item.version < 1)
		throw new Error('Invalid published lesson version.');
	const subjectItem = allItems.find((i) => i.id === item.subjectId);
	const chapterItem = allItems.find((i) => i.id === item.parentId);

	return {
		id: item.id,
		kind: item.kind,
		parentId: item.parentId,
		subjectId: item.subjectId,
		level: item.level,
		chapterNumber: item.chapterNumber,
		order: item.order,
		scopeId: item.scopeId ?? '',
		subject: subjectItem?.title || item.subjectId || '',
		chapter: chapterItem?.title || '',
		title: item.title,
		description: item.description ?? '',
		thumbnail: item.thumbnail ?? '',
		durationSeconds: item.durationSeconds ?? 0,
		instructor: item.instructor ?? '',
		status: 'published',
		version: item.version
	};
}

/**
 * Fetches published catalog lessons from SvelteKit BFF.
 */
export async function fetchApiCatalog(scopeId?: string): Promise<CatalogLesson[]> {
	const query = scopeId ? `?scopeId=${encodeURIComponent(scopeId)}` : '';
	const res = await apiRequest(`/api/academy/catalog${query}`);
	if (!res.ok) {
		const err = await res.json().catch(() => ({}));
		throw new Error(err.message || 'Gagal memuat katalog dari API');
	}
	const data = await res.json();
	const catalog = data.catalog ?? [];
	return catalog.map((item: ContentDto) => mapApiContentToCatalogLesson(item, catalog));
}

/**
 * Fetches published curriculum tree items from SvelteKit BFF.
 */
export async function fetchApiCurriculum(): Promise<CatalogLesson[]> {
	const res = await apiRequest('/api/academy/curriculum');
	if (!res.ok) {
		const err = await res.json().catch(() => ({}));
		throw new Error(err.message || 'Gagal memuat kurikulum dari API');
	}
	const data = await res.json();
	const items = data.items ?? [];
	return items.map((item: ContentDto) => mapApiContentToCatalogLesson(item, items));
}

/**
 * Fetches authorized lesson details including YouTube video ID.
 */
export async function fetchApiLesson(
	lessonId: string
): Promise<{ lesson: CatalogLesson; media: Media }> {
	const res = await apiRequest(`/api/academy/lessons/${encodeURIComponent(lessonId)}`);
	if (!res.ok) {
		const err = await res.json().catch(() => ({}));
		const error = Object.assign(new Error(err.message || 'Akses materi ditolak'), {
			status: res.status,
			code: err.error
		});
		throw error;
	}
	const data = await res.json();
	return {
		lesson: mapApiContentToCatalogLesson(data.lesson),
		media: {
			videoId: data.media.videoId,
			readingRefs: data.media.readingRefs ?? [],
			slideRefs: data.media.slideRefs ?? [],
			subtitleRefs: data.media.subtitleRefs ?? [],
			attachmentRefs: data.media.attachmentRefs ?? [],
			internalNote: ''
		}
	};
}

/**
 * Fetches participant's entitlement grants.
 */
export async function fetchApiGrants(): Promise<Grant[]> {
	const res = await apiRequest('/api/academy/me/grants');
	if (!res.ok) {
		const err = await res.json().catch(() => ({}));
		throw new Error(err.message || 'Gagal memuat hak akses dari API');
	}
	const data = await res.json();
	return (data.grants ?? []).map((g: GrantDto) => ({
		uid: g.userId,
		scopeId: g.scopeId,
		state: g.state,
		startsAt: wrapTimestamp(g.startsAt),
		expiresAt: wrapTimestamp(g.expiresAt)
	}));
}

/**
 * Fetches participant's video playback resume positions.
 */
export async function fetchApiProgress(): Promise<Progress[]> {
	const res = await apiRequest('/api/academy/me/progress');
	if (!res.ok) {
		const err = await res.json().catch(() => ({}));
		throw new Error(err.message || 'Gagal memuat riwayat progres dari API');
	}
	const data = await res.json();
	return (data.progress ?? [])
		.map((p: ProgressDto) => ({
			lessonId: p.lessonId,
			version: p.version,
			positionSeconds: p.positionSeconds,
			updatedAt: wrapTimestamp(p.updatedAt)
		}))
		.sort((a: Progress, b: Progress) => b.updatedAt.toMillis() - a.updatedAt.toMillis());
}

/**
 * Updates participant's playback position.
 */
export async function saveApiProgress(
	lessonId: string,
	version: number,
	positionSeconds: number
): Promise<void> {
	const res = await apiRequest(`/api/academy/me/progress/${encodeURIComponent(lessonId)}`, {
		method: 'PUT',
		headers: { 'content-type': 'application/json' },
		body: JSON.stringify({ version, positionSeconds })
	});
	if (!res.ok) {
		const err = await res.json().catch(() => ({}));
		throw new Error(err.message || 'Gagal menyimpan posisi video ke API');
	}
}

/**
 * Fetches participant's completions and aggregate summary.
 */
export async function fetchApiCompletions(scopeId?: string): Promise<{
	completions: Completion[];
	summary: { completed: number; total: number; percentage: number };
}> {
	const query = scopeId ? `?scopeId=${encodeURIComponent(scopeId)}` : '';
	const res = await apiRequest(`/api/academy/me/completions${query}`);
	if (!res.ok) {
		const err = await res.json().catch(() => ({}));
		throw new Error(err.message || 'Gagal memuat status penyelesaian dari API');
	}
	const data = await res.json();
	const completions: Completion[] = (data.completions ?? []).map((c: CompletionDto) => ({
		lessonId: c.lessonId,
		version: c.version,
		completedAt: wrapTimestamp(c.completedAt)
	}));
	return {
		completions,
		summary: data.summary ?? { completed: 0, total: 0, percentage: 0 }
	};
}

/**
 * Explicitly marks an authoritative published lesson version complete.
 */
export async function markApiCompletion(lessonId: string, version: number): Promise<void> {
	const res = await apiRequest(`/api/academy/me/completions/${encodeURIComponent(lessonId)}`, {
		method: 'POST',
		headers: { 'content-type': 'application/json' },
		body: JSON.stringify({ version })
	});
	if (!res.ok) {
		const err = await res.json().catch(() => ({}));
		throw new Error(err.message || 'Gagal menandai penyelesaian materi di API');
	}
}

/**
 * Creates an Academy Player controller backed by SvelteKit BFF and CryptoSharia API v2.
 */
export function createApiAcademyPlayer(
	emit: (state: PlayerState) => void,
	options: { checkAuth?: () => boolean } = {}
) {
	let generation = 0;
	let current: CatalogLesson | null = null;
	let disposed = false;
	let pollTimer: ReturnType<typeof setInterval> | undefined;

	const isAuthed = () => (options.checkAuth ? options.checkAuth() : true);
	const clear = (status: PlayerState['status']) => emit({ status, media: null });

	async function load(g: number, lesson: CatalogLesson) {
		if (disposed || g !== generation) return;

		if (!isAuthed()) {
			clear('unauthorized');
			return;
		}

		try {
			const res = await apiRequest(`/api/academy/lessons/${encodeURIComponent(lesson.id)}`, {
				headers: { accept: 'application/json' }
			});

			if (disposed || g !== generation) return;

			if (!res.ok) {
				const body = await res.json().catch(() => null);
				const code = body?.error;

				if (res.status === 401) {
					clear('unauthorized');
				} else if (code === 'GRANT_EXPIRED') {
					clear('expired');
				} else if (code === 'GRANT_REVOKED') {
					clear('revoked');
				} else if (
					code === 'UNAUTHORIZED_SCOPE' ||
					code === 'GRANT_NOT_FOUND' ||
					code === 'GRANT_NOT_STARTED' ||
					code === 'GRANT_INACTIVE'
				) {
					clear('unauthorized');
				} else if (code === 'CONTENT_NOT_FOUND' || code === 'MEDIA_NOT_FOUND') {
					clear('not-found');
				} else if (code === 'LESSON_NOT_PUBLISHED') {
					clear('unpublished');
				} else {
					clear('backend-unavailable');
				}
				return;
			}

			const data = await res.json();
			const media = data?.media;

			if (!media || !media.videoId) {
				clear('unpublished');
				return;
			}

			if (data.lesson?.version !== lesson.version || media.version !== lesson.version) {
				clear('unpublished');
				return;
			}

			if (!parseYouTubeUrl(`https://youtu.be/${media.videoId}`)) {
				clear('unpublished');
				return;
			}

			emit({
				status: 'ready',
				media: {
					videoId: media.videoId,
					readingRefs: media.readingRefs ?? [],
					slideRefs: media.slideRefs ?? [],
					subtitleRefs: media.subtitleRefs ?? [],
					attachmentRefs: media.attachmentRefs ?? [],
					internalNote: ''
				}
			});
		} catch {
			if (!disposed && g === generation) {
				clear('backend-unavailable');
			}
		}
	}

	function open(lesson: CatalogLesson | null) {
		generation++;
		current = lesson;
		clearInterval(pollTimer);

		if (!lesson) {
			clear('not-found');
			return;
		}

		if (!isAuthed()) {
			clear('unauthorized');
			return;
		}

		const g = generation;
		clear('loading');
		void load(g, lesson);

		pollTimer = setInterval(() => {
			if (!disposed && g === generation && current) {
				void load(g, current);
			}
		}, 3000);
	}

	return {
		open,
		suspend() {
			generation++;
			clearInterval(pollTimer);
			clear('backend-unavailable');
		},
		resume() {
			open(current);
		},
		dispose() {
			disposed = true;
			generation++;
			clearInterval(pollTimer);
			current = null;
			clear('unauthorized');
		}
	};
}
