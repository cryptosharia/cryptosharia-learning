<script lang="ts">
	import { page } from '$app/state';
	import { resolve } from '$app/paths';
	import { goto } from '$app/navigation';
	import { onMount } from 'svelte';
	import { onAuthStateChanged } from 'firebase/auth';
	import { auth, db, lessonDb, ensureFirebaseReady } from '$lib/firebase';
	import { readCatalog, readCurriculum, type CatalogLesson } from '$lib/academyData';
	import { freshProgress } from '$lib/academyProgress';
	import AcademyVideo from './AcademyVideo.svelte';
	import { createAcademyPlayer, type PlayerState } from '$lib/academyPlayer';
	import { parseYouTubeUrl } from '$lib/youtube';
	let lessons = $state<CatalogLesson[]>([]);
	let selected = $state<CatalogLesson | null>(null);
	let view = $state<PlayerState>({ status: 'loading', media: null });
	let controller = $state<ReturnType<typeof createAcademyPlayer> | undefined>();
	let catalogReady = $state(false);
	let uid = $state('');
	let curriculum = $state<CatalogLesson[]>([]);
	const selectedIndex = $derived(lessons.findIndex((lesson) => lesson.id === selected?.id));
	const messages: Record<PlayerState['status'], string> = {
		loading: 'Memuat akses…',
		ready: 'Akses tersedia',
		unauthorized: 'Akses ditolak. Masuk dan gunakan grant yang sesuai.',
		expired: 'Akses kedaluwarsa.',
		revoked: 'Akses dicabut.',
		unpublished: 'Materi belum diterbitkan atau tidak tersedia untuk akses ini.',
		'not-found': 'Materi tidak ditemukan.',
		'backend-unavailable': 'Backend tidak tersedia. Konten telah ditutup.'
	};
	const video = $derived(
		view.media ? parseYouTubeUrl(`https://youtu.be/${view.media.videoId}`) : null
	);
	function select(lesson: CatalogLesson) {
		if (page.url.searchParams.get('lesson') === lesson.id) {
			selected = lesson;
			controller?.open(lesson);
			return;
		}
		controller?.suspend();
		view = { status: 'loading', media: null };
		void goto(resolve(`/e-learning/${lesson.scopeId}?lesson=${encodeURIComponent(lesson.id)}`), {
			replaceState: true,
			noScroll: true,
			keepFocus: true
		}).catch(() => {
			view = { status: 'backend-unavailable', media: null };
		});
	}
	onMount(() => {
		let alive = true;
		controller = createAcademyPlayer(db, lessonDb, auth, (next) => {
			if (alive) view = next;
		});
		const stop = onAuthStateChanged(auth, () => {
			uid = auth.currentUser?.uid ?? '';
			if (catalogReady) controller?.open(selected);
			else view = { status: 'loading', media: null };
		});
		const offline = () => controller?.suspend();
		const online = () => controller?.resume();
		const visibility = () => (document.hidden ? offline() : online());
		window.addEventListener('offline', offline);
		window.addEventListener('online', online);
		document.addEventListener('visibilitychange', visibility);
		return () => {
			alive = false;
			stop();
			controller?.dispose();
			window.removeEventListener('offline', offline);
			window.removeEventListener('online', online);
			document.removeEventListener('visibilitychange', visibility);
		};
	});
	$effect(() => {
		const scope = page.params.id,
			requested = page.url.searchParams.get('lesson'),
			actorAtStart = uid,
			player = controller;
		if (!player) return;
		let cancelled = false;
		catalogReady = false;
		lessons = [];
		selected = null;
		player.suspend();
		view = { status: 'loading', media: null };
		void ensureFirebaseReady()
			.then(() => Promise.all([readCatalog(db, scope), readCurriculum(db)]))
			.then(async ([items, tree]) => {
				if (cancelled) return;
				curriculum = tree;
				const actor = auth.currentUser?.uid;
				let last: string | undefined;
				if (!requested && actor) {
					try {
						last = (await freshProgress(lessonDb, actor)).find((p) =>
							items.some((l) => l.id === p.lessonId)
						)?.lessonId;
					} catch {
						/* History cannot authorize media. */
					}
				}
				if (
					cancelled ||
					(auth.currentUser?.uid ?? '') !== actorAtStart ||
					auth.currentUser?.uid !== actor
				)
					return;
				lessons = items;
				selected =
					items.find((l) => l.id === (requested ?? last)) ??
					(requested ? null : (items[0] ?? null));
				catalogReady = true;
				player.open(selected);
			})
			.catch(() => {
				if (!cancelled) view = { status: 'backend-unavailable', media: null };
			});
		return () => {
			cancelled = true;
			player.suspend();
		};
	});
</script>

<svelte:head><title>Materi | CryptoSharia Academy</title></svelte:head>
<section class="mx-auto max-w-5xl px-6 py-24">
	<a href={resolve('/e-learning')}>Kembali ke katalog</a>
	<a class="ml-4 underline" href={resolve('/profile')}>Dashboard pembelajaran</a>
	<div class="mt-5 grid gap-6 lg:grid-cols-[minmax(0,1fr)_280px]">
		<div class="min-w-0">
			<h1 class="my-4 text-2xl font-bold">{selected?.title || 'Materi Academy'}</h1>
			{#if selected}<p>
					{curriculum.find((n) => n.id === selected?.subjectId)?.title ?? selected.subject} · Level {selected.level}
					· Bab {selected.chapterNumber}: {curriculum.find((n) => n.id === selected?.parentId)
						?.title ?? selected.chapter}
				</p>
				<p class="my-3">{selected.description}</p>{/if}
			<p role="status" data-testid="access-status" data-status={view.status}>
				{messages[view.status]}
			</p>
			{#if view.status === 'ready' && video && selected}
				{#key `${uid}_${selected.id}_${selected.version}_${video.videoId}`}<AcademyVideo
						lesson={selected}
						videoId={video.videoId}
						{uid}
					/>{/key}
			{/if}
			<nav class="my-5 flex gap-3" aria-label="Navigasi pelajaran">
				<button
					class="rounded border p-3"
					disabled={selectedIndex <= 0}
					onclick={() => {
						if (selectedIndex > 0) select(lessons[selectedIndex - 1]);
					}}>Pelajaran sebelumnya</button
				>
				<button
					class="rounded border p-3"
					disabled={selectedIndex < 0 || selectedIndex >= lessons.length - 1}
					onclick={() => {
						if (selectedIndex >= 0 && selectedIndex < lessons.length - 1)
							select(lessons[selectedIndex + 1]);
					}}>Pelajaran berikutnya</button
				>
			</nav>
		</div>
		<aside class="min-w-0 rounded-xl border p-4" aria-label="Struktur pelajaran">
			<h2 class="font-bold">Urutan pelajaran</h2>
			<ul class="my-6 space-y-3">
				{#each lessons as lesson (lesson.id)}<li>
						<button
							class="rounded border p-3"
							aria-pressed={selected?.id === lesson.id}
							class:font-bold={selected?.id === lesson.id}
							class:border-orange-500={selected?.id === lesson.id}
							onclick={() => select(lesson)}>{lesson.title}</button
						>
						<p class="text-sm">
							Level {lesson.level} · Bab {lesson.chapterNumber} · {lesson.durationSeconds} detik
						</p>
					</li>{/each}
			</ul>
		</aside>
	</div>
	{#if view.status !== 'loading' && view.status !== 'ready'}<button
			class="rounded border p-2"
			onclick={() => controller?.resume()}>Periksa akses kembali</button
		>{/if}
	<p class="mt-6 text-sm">
		Referensi YouTube yang sudah diketahui tidak dapat dicabut oleh situs ini. YouTube Unlisted
		bukan DRM.
	</p>
</section>
