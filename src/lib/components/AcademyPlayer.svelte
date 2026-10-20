<script lang="ts">
	import { page } from '$app/state';
	import { resolve } from '$app/paths';
	import { goto } from '$app/navigation';
	import { onMount } from 'svelte';
	import { onAuthStateChanged } from 'firebase/auth';
	import { auth, db, lessonDb, ensureFirebaseReady } from '$lib/firebase';
	import * as publicEnv from '$env/static/public';
	import { isApiMode } from '$lib/academyConfig';
	import { readCatalog, readCurriculum, type CatalogLesson } from '$lib/academyData';
	import { freshProgress } from '$lib/academyProgress';
	import AcademyVideo from './AcademyVideo.svelte';
	import AcademyCompletion from './AcademyCompletion.svelte';
	import { createAcademyPlayer, type PlayerState } from '$lib/academyPlayer';
	import { parseYouTubeUrl } from '$lib/youtube';
	import { userAuth, onAuthChange } from '$lib/auth.svelte';
	import {
		createApiAcademyPlayer,
		fetchApiCatalog,
		fetchApiCurriculum,
		fetchApiProgress
	} from '$lib/academyApi';

	const apiMode = isApiMode(publicEnv);

	let lessons = $state<CatalogLesson[]>([]);
	let selected = $state<CatalogLesson | null>(null);
	let view = $state<PlayerState>({ status: 'loading', media: null });
	let controller = $state<
		| {
				open: (lesson: CatalogLesson | null) => void;
				suspend: () => void;
				resume: () => void;
				dispose: () => void;
		  }
		| undefined
	>();
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
		if (apiMode) {
			controller = createApiAcademyPlayer(
				(next) => {
					if (alive) view = next;
				},
				{ checkAuth: () => userAuth.isLoggedIn }
			);
			const stop = onAuthChange((user) => {
				uid = user?.uid ?? '';
				if (catalogReady) controller?.open(selected);
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
		}

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

		if (apiMode) {
			Promise.all([fetchApiCatalog(scope), fetchApiCurriculum()])
				.then(async ([items, tree]) => {
					if (cancelled) return;
					curriculum = tree;
					const actor = uid;
					let last: string | undefined;
					if (!requested && actor) {
						try {
							const history = await fetchApiProgress();
							last = history.find((p) => items.some((l) => l.id === p.lessonId))?.lessonId;
						} catch {
							/* History cannot authorize media. */
						}
					}
					if (cancelled || uid !== actorAtStart) return;
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
		}

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
<section class="mx-auto max-w-6xl px-5 py-10 sm:px-6 sm:py-14">
	<nav class="flex flex-wrap items-center gap-x-3 gap-y-2 text-sm" aria-label="Lokasi materi">
		<a class="academy-link inline-flex min-h-11 items-center" href={resolve('/e-learning')}
			>Kurikulum</a
		>
		<span class="text-muted" aria-hidden="true">/</span>
		<a class="academy-link inline-flex min-h-11 items-center" href={resolve('/profile')}
			>Pembelajaran Saya</a
		>
	</nav>

	<div class="mt-3 grid min-w-0 gap-6 lg:grid-cols-[minmax(0,1fr)_19rem] lg:items-start">
		<div class="min-w-0">
			<header class="mb-5">
				<p class="text-xs font-bold tracking-[0.16em] text-primary uppercase">Materi Academy</p>
				<h1 class="mt-2 text-2xl font-semibold tracking-tight text-white sm:text-3xl">
					{selected?.title || 'Materi pembelajaran'}
				</h1>
				{#if selected}
					<p class="mt-2 text-sm text-secondary">
						{curriculum.find((item) => item.id === selected?.subjectId)?.title ?? selected.subject}
						· Level {selected.level} · Bab {selected.chapterNumber}: {curriculum.find(
							(item) => item.id === selected?.parentId
						)?.title ?? selected.chapter}
					</p>
					{#if selected.description}<p class="mt-3 max-w-3xl leading-7 text-secondary">
							{selected.description}
						</p>{/if}
				{/if}
			</header>

			<div class="academy-card-raised overflow-hidden p-3 sm:p-4">
				{#if view.status === 'ready' && video && selected}
					{#key `${uid}_${selected.id}_${selected.version}_${video.videoId}`}
						<AcademyVideo lesson={selected} videoId={video.videoId} {uid} />
					{/key}
				{:else if view.status === 'loading'}
					<div
						class="aspect-video w-full animate-pulse rounded-xl bg-surface-raised"
						aria-hidden="true"
					></div>
				{/if}
				<p
					role="status"
					aria-live="polite"
					data-testid="access-status"
					data-status={view.status}
					class={`mt-3 rounded-lg border px-4 py-3 text-sm ${view.status === 'ready' ? 'border-success/30 bg-success/10 text-success' : view.status === 'loading' ? 'border-line bg-background text-secondary' : 'border-warning/30 bg-warning/10 text-secondary'}`}
				>
					{messages[view.status]}
				</p>
			</div>

			{#if view.status === 'ready' && selected && uid}
				<div class="mt-4">
					{#key `${uid}_${selected.id}_${selected.version}`}
						<AcademyCompletion lesson={selected} {uid} />
					{/key}
				</div>
			{/if}

			<nav class="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2" aria-label="Navigasi pelajaran">
				<button
					class="academy-button-secondary w-full"
					disabled={selectedIndex <= 0}
					onclick={() => {
						if (selectedIndex > 0) select(lessons[selectedIndex - 1]);
					}}>Pelajaran sebelumnya</button
				>
				<button
					class="academy-button-secondary w-full"
					disabled={selectedIndex < 0 || selectedIndex >= lessons.length - 1}
					onclick={() => {
						if (selectedIndex >= 0 && selectedIndex < lessons.length - 1)
							select(lessons[selectedIndex + 1]);
					}}>Pelajaran berikutnya</button
				>
			</nav>

			{#if view.status !== 'loading' && view.status !== 'ready'}
				<div
					class="mt-4 flex flex-col gap-3 rounded-xl border border-line bg-surface p-4 sm:flex-row sm:items-center sm:justify-between"
				>
					<p class="text-sm text-secondary">Akses diperiksa oleh server saat materi dibuka.</p>
					<button class="academy-link min-h-11 w-fit" onclick={() => controller?.resume()}
						>Periksa akses kembali</button
					>
				</div>
			{/if}
			<p class="mt-5 text-xs leading-5 text-muted">
				Tautan YouTube unlisted bukan DRM. Jangan bagikan referensi media di luar ruang belajar.
			</p>
		</div>

		<aside class="academy-card min-w-0 p-4 sm:p-5" aria-label="Daftar materi dalam lingkup ini">
			<div class="flex items-start justify-between gap-3">
				<div>
					<h2 class="font-semibold text-white">Daftar materi</h2>
					<p class="mt-1 text-xs text-muted">{lessons.length} lesson di lingkup ini</p>
				</div>
				<span class="rounded-full border border-line px-2.5 py-1 text-xs text-muted"
					>{selectedIndex >= 0 ? `${selectedIndex + 1}/${lessons.length}` : '—'}</span
				>
			</div>
			{#if lessons.length}
				<ul class="mt-4 space-y-2">
					{#each lessons as lesson (lesson.id)}
						<li>
							<button
								class={`min-h-11 w-full rounded-xl border p-3 text-left transition ${selected?.id === lesson.id ? 'border-primary/50 bg-primary/10 text-white' : 'border-line bg-background text-secondary hover:border-line hover:bg-surface-raised'}`}
								aria-pressed={selected?.id === lesson.id}
								onclick={() => select(lesson)}
							>
								<span class="block font-medium">{lesson.title}</span>
								<span class="mt-1 block text-xs text-muted"
									>Level {lesson.level} · Bab {lesson.chapterNumber} · {Math.max(
										1,
										Math.round(lesson.durationSeconds / 60)
									)} menit</span
								>
							</button>
						</li>
					{/each}
				</ul>
			{:else if catalogReady}
				<div class="mt-4 rounded-xl border border-line bg-background p-4 text-sm text-secondary">
					Belum ada lesson terbit untuk ditampilkan.
				</div>
			{:else}
				<p class="mt-4 text-sm text-muted">Memuat daftar materi…</p>
			{/if}
		</aside>
	</div>
</section>
