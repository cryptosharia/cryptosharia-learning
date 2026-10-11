<script lang="ts">
	import { onMount } from 'svelte';
	import { auth, lessonDb } from '$lib/firebase';
	import type { CatalogLesson } from '$lib/academyData';
	import {
		attachVideo,
		freshProgress,
		resumePosition,
		progressRecorder,
		writePosition
	} from '$lib/academyProgress';
	let { lesson, videoId, uid }: { lesson: CatalogLesson; videoId: string; uid: string } = $props();
	let iframe = $state<HTMLIFrameElement>();
	let message = $state('Memuat posisi belajar…');
	let position = $state(0);
	let source = $state('');
	onMount(() => {
		let alive = true;
		let close: (() => void) | undefined;
		const valid = () =>
			alive && auth.currentUser?.uid === uid && navigator.onLine && !document.hidden;
		const recorder = progressRecorder({
			lesson,
			allowed: valid,
			write: (p) => writePosition(lessonDb, uid, lesson, p),
			emit: (m) => {
				if (valid()) message = m;
			}
		});
		const initialize = async () => {
			const history = await freshProgress(lessonDb, uid);
			if (!valid()) return;
			position = resumePosition(
				lesson,
				history.find((p) => p.lessonId === lesson.id)
			);
			message =
				position > 0
					? `Melanjutkan dari ${position} detik.`
					: 'Belum ada posisi belajar tersimpan.';
			source = `https://www.youtube-nocookie.com/embed/${videoId}?enablejsapi=1&origin=${encodeURIComponent(location.origin)}`;
			await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
			if (!valid()) return;
			if (!iframe) return;
			close = await attachVideo(
				iframe,
				position,
				(p, flush) => {
					position = p;
					void recorder.sample(p, flush);
				},
				(m) => {
					if (valid()) message = m;
				},
				valid
			);
			if (!valid()) close();
		};
		void initialize().catch(() => {
			if (valid())
				message = 'Video atau posisi belajar belum tersedia. Muat ulang untuk mencoba kembali.';
		});
		return () => {
			alive = false;
			recorder.stop();
			close?.();
		};
	});
</script>

{#if source}<iframe
		bind:this={iframe}
		class="my-4 aspect-video min-h-[200px] w-full"
		src={source}
		title={lesson.title}
		referrerpolicy="strict-origin-when-cross-origin"
		allow="encrypted-media; picture-in-picture"
		allowfullscreen
	></iframe>{/if}
<p role="status" data-testid="progress-status">{message}</p>
<p data-testid="position">Posisi: {Number.isFinite(position) ? Math.floor(position) : 0} detik</p>
