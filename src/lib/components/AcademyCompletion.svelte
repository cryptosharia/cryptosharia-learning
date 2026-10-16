<script lang="ts">
	import { onMount } from 'svelte';
	import { auth, db, lessonDb } from '$lib/firebase';
	import * as publicEnv from '$env/static/public';
	import { isApiMode } from '$lib/academyConfig';
	import { completeLesson, type CatalogLesson } from '$lib/academyData';
	import { freshCompletions, isCompleted } from '$lib/academyProgress';
	import { userAuth } from '$lib/auth.svelte';
	import { fetchApiCompletions, markApiCompletion } from '$lib/academyApi';

	const apiMode = isApiMode(publicEnv);

	let { lesson, uid }: { lesson: CatalogLesson; uid: string } = $props();
	let loading = $state(true),
		pending = $state(false),
		completed = $state(false);
	let message = $state('Memuat status penyelesaian…'),
		error = $state('');
	let alive = false;
	const valid = () =>
		alive &&
		(apiMode ? userAuth.user?.uid === uid : auth.currentUser?.uid === uid) &&
		navigator.onLine;
	async function load() {
		loading = true;
		error = '';
		try {
			const records = apiMode
				? (await fetchApiCompletions()).completions
				: await freshCompletions(lessonDb, uid);
			if (!valid()) return;
			completed = isCompleted(lesson, records);
			message = completed ? 'Selesai' : 'Belum ditandai selesai.';
		} catch {
			if (valid()) error = 'Status penyelesaian belum dapat dimuat. Coba kembali.';
		} finally {
			if (valid()) loading = false;
		}
	}
	onMount(() => {
		alive = true;
		void load();
		return () => {
			alive = false;
		};
	});
	async function complete() {
		if (!valid() || loading || pending || completed || error) return;
		pending = true;
		error = '';
		message = 'Menyimpan penyelesaian…';
		try {
			if (apiMode) {
				await markApiCompletion(lesson.id, lesson.version);
			} else {
				await completeLesson(db, uid, lesson);
			}
			if (!valid()) return;
			completed = true;
			message = 'Selesai';
		} catch {
			if (valid()) {
				message = 'Belum ditandai selesai.';
				error = 'Penyelesaian belum tersimpan. Periksa koneksi dan akses, lalu coba kembali.';
			}
		} finally {
			if (valid()) pending = false;
		}
	}
</script>

<div class="my-4 rounded border p-4" data-testid="lesson-completion">
	<p role="status" data-testid="completion-status">{message}</p>
	{#if error}<p role="alert">{error}</p>
		<button class="mt-3 rounded border p-2" disabled={loading || pending} onclick={load}
			>Periksa status kembali</button
		>
	{:else}
		<button
			class="mt-3 rounded border p-2"
			disabled={loading || pending || completed}
			onclick={complete}
		>
			{pending ? 'Menyimpan…' : completed ? 'Selesai' : 'Tandai Selesai'}
		</button>
	{/if}
</div>
