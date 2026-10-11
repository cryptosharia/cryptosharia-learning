import {
	collection,
	getDocs,
	setDoc,
	doc,
	serverTimestamp,
	type Firestore
} from 'firebase/firestore/lite';
import type { CatalogLesson, Progress } from './academyData.ts';

export async function freshProgress(db: Firestore, uid: string): Promise<Progress[]> {
	const snap = await getDocs(collection(db, 'academy_progress', uid, 'lessons'));
	return snap.docs
		.map((d) => d.data() as Progress)
		.sort((a, b) => b.updatedAt.toMillis() - a.updatedAt.toMillis());
}
export function resumePosition(lesson: CatalogLesson, progress?: Progress): number {
	return progress?.version === lesson.version &&
		Number.isFinite(progress.positionSeconds) &&
		progress.positionSeconds >= 0 &&
		progress.positionSeconds <= lesson.durationSeconds
		? progress.positionSeconds
		: 0;
}

// Self-reported position is history, never completion, scoring or an entitlement.
export function progressRecorder(options: {
	lesson: CatalogLesson;
	allowed: () => boolean;
	write: (position: number) => Promise<void>;
	emit: (message: string) => void;
	now?: () => number;
}) {
	const now = options.now ?? Date.now;
	let stopped = false,
		pending = false,
		lastAt = -Infinity,
		lastPosition = -1,
		generation = 0;
	return {
		async sample(position: number, flush = false) {
			if (
				stopped ||
				pending ||
				!options.allowed() ||
				!Number.isFinite(position) ||
				position < 0 ||
				position > options.lesson.durationSeconds ||
				Math.floor(position) === lastPosition ||
				now() - lastAt < (flush ? 3000 : 15000)
			)
				return;
			const g = generation;
			pending = true;
			lastAt = now();
			try {
				await options.write(Math.floor(position));
				if (!stopped && g === generation && options.allowed()) {
					lastPosition = Math.floor(position);
					options.emit('Posisi belajar tersimpan.');
				}
			} catch {
				if (!stopped && g === generation && options.allowed())
					options.emit('Posisi belum tersimpan. Periksa koneksi dan akses.');
			} finally {
				pending = false;
			}
		},
		stop() {
			stopped = true;
			generation++;
		}
	};
}

export const writePosition = (
	db: Firestore,
	uid: string,
	lesson: CatalogLesson,
	positionSeconds: number
) =>
	setDoc(doc(db, 'academy_progress', uid, 'lessons', lesson.id), {
		lessonId: lesson.id,
		version: lesson.version,
		positionSeconds,
		updatedAt: serverTimestamp()
	});

type VideoPlayer = {
	getCurrentTime(): number;
	seekTo(seconds: number, allowSeekAhead: boolean): void;
	destroy(): void;
};
type YouTubeAPI = {
	Player: new (
		iframe: HTMLIFrameElement,
		options: {
			events: {
				onReady(): void;
				onStateChange(event: { data: number }): void;
				onError(event: { data: number }): void;
				onAutoplayBlocked(): void;
			};
		}
	) => VideoPlayer;
};
declare global {
	interface Window {
		YT?: YouTubeAPI;
		onYouTubeIframeAPIReady?: () => void;
	}
}
let api: Promise<YouTubeAPI> | undefined;
export function loadYouTubeApi(): Promise<YouTubeAPI> {
	if (window.YT?.Player) return Promise.resolve(window.YT);
	if (api) return api;
	api = new Promise<YouTubeAPI>((resolve, reject) => {
		const timeout = setTimeout(() => reject(new Error('Video API unavailable')), 10000);
		window.onYouTubeIframeAPIReady = () => {
			clearTimeout(timeout);
			if (window.YT) resolve(window.YT);
			else reject(new Error('Video API unavailable'));
		};
		const script = document.createElement('script');
		script.src = 'https://www.youtube.com/iframe_api';
		script.onerror = () => {
			clearTimeout(timeout);
			reject(new Error('Video API unavailable'));
		};
		document.head.appendChild(script);
	}).catch((error) => {
		api = undefined;
		throw error;
	});
	return api;
}

export async function attachVideo(
	iframe: HTMLIFrameElement,
	position: number,
	sample: (position: number, flush: boolean) => void,
	unavailable: (message: string) => void,
	valid: () => boolean
) {
	const yt = await loadYouTubeApi();
	if (!valid()) return () => {};
	let timer: ReturnType<typeof setInterval> | undefined;
	const player = new yt.Player(iframe, {
		events: {
			onReady: () => {
				if (valid()) player.seekTo(position, true);
			},
			onStateChange: ({ data }) => {
				clearInterval(timer);
				if (!valid()) return;
				if (data === 1)
					timer = setInterval(() => {
						if (valid()) sample(player.getCurrentTime(), false);
					}, 1000);
				else if (data === 2 || data === 0) sample(player.getCurrentTime(), true);
			},
			onError: ({ data }) => {
				clearInterval(timer);
				if (valid()) unavailable(`Video tidak tersedia (kode ${data}).`);
			},
			onAutoplayBlocked: () => {
				if (valid()) unavailable('Tekan play untuk memulai video.');
			}
		}
	});
	return () => {
		clearInterval(timer);
		player.destroy();
	};
}
