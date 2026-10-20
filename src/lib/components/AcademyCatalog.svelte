<script lang="ts">
	import { resolve } from '$app/paths';
	import { onMount } from 'svelte';
	import { onAuthStateChanged } from 'firebase/auth';
	import { collection, onSnapshot } from 'firebase/firestore';
	import { collection as liteCollection, getDocs } from 'firebase/firestore/lite';
	import * as publicEnv from '$env/static/public';
	import { isApiMode } from '$lib/academyConfig';
	import {
		readCurriculum,
		type CatalogLesson,
		type Completion,
		type Grant
	} from '$lib/academyData';
	import { activeScope, freshCompletions, isCompleted } from '$lib/academyProgress';
	import { curriculumTree } from '$lib/academyCurriculum';
	import { auth, db, lessonDb, ensureFirebaseReady } from '$lib/firebase';
	import { onAuthChange, userAuth } from '$lib/auth.svelte';
	import { fetchApiCurriculum, fetchApiGrants, fetchApiCompletions } from '$lib/academyApi';

	const apiMode = isApiMode(publicEnv);

	let completions = $state<Completion[]>([]),
		grants = $state<Grant[]>([]);
	let progressReady = $state(false),
		now = $state(Date.now());
	let items = $state<CatalogLesson[]>([]),
		loading = $state(true),
		error = $state('');
	let tree = $state<ReturnType<typeof curriculumTree>>([]);
	let catalogRequest = 0;
	const lessonCount = $derived(items.filter((item) => item.kind === 'lesson').length);

	async function loadCatalog() {
		const requestId = ++catalogRequest;
		loading = true;
		error = '';
		try {
			let data: CatalogLesson[];
			if (apiMode) data = await fetchApiCurriculum();
			else {
				await ensureFirebaseReady();
				data = await readCurriculum(db);
			}
			const parsed = curriculumTree(data, { allowGlobalSubjectScope: apiMode });
			if (requestId === catalogRequest) {
				items = data;
				tree = parsed;
			}
		} catch {
			if (requestId === catalogRequest)
				error = navigator.onLine
					? 'Katalog belum dapat dimuat saat ini. Coba lagi beberapa saat.'
					: 'Anda sedang offline. Periksa koneksi lalu coba lagi.';
		} finally {
			if (requestId === catalogRequest) loading = false;
		}
	}

	function accessLabel(scopeId: string) {
		if (!userAuth.isLoggedIn) return 'Masuk untuk memeriksa akses';
		if (!progressReady) return 'Memeriksa akses';
		const grant = grants.find((item) => item.scopeId === scopeId);
		if (!grant) return 'Akses belum tersedia';
		if (grant.state === 'revoked') return 'Akses dicabut';
		if (grant.expiresAt.toMillis() <= now) return 'Akses kedaluwarsa';
		if (grant.startsAt.toMillis() > now) return 'Akses belum dimulai';
		return 'Akses tersedia';
	}

	// Participant data loads independently; a denied read never blocks the public catalog.
	onMount(() => {
		let generation = 0,
			request = 0;
		let listeners: (() => void)[] = [];
		const clear = () => {
			completions = [];
			grants = [];
			progressReady = false;
		};

		if (apiMode) {
			const stopAuth = onAuthChange((user) => {
				const g = ++generation;
				clear();
				if (!user) return;

				const loadUserData = async () => {
					const r = ++request;
					try {
						const [rights, completionRes] = await Promise.all([
							fetchApiGrants(),
							fetchApiCompletions()
						]);
						if (g !== generation || r !== request || !navigator.onLine) return;
						grants = rights;
						completions = completionRes.completions;
						progressReady = true;
					} catch {
						if (g === generation && r === request) clear();
					}
				};

				void loadUserData();
			});

			const timer = setInterval(() => {
				now = Date.now();
			}, 1000);

			return () => {
				generation++;
				stopAuth();
				clearInterval(timer);
			};
		}

		const stop = onAuthStateChanged(auth, (user) => {
			const g = ++generation;
			listeners.forEach((stop) => stop());
			listeners = [];
			clear();
			if (!user) return;
			const uid = user.uid;
			const load = async () => {
				const r = ++request;
				try {
					await ensureFirebaseReady();
					const [records, rights] = await Promise.all([
						freshCompletions(lessonDb, uid),
						getDocs(liteCollection(lessonDb, 'academy_grants', uid, 'scopes'))
					]);
					if (
						g !== generation ||
						r !== request ||
						auth.currentUser?.uid !== uid ||
						!navigator.onLine
					)
						return;
					completions = records;
					grants = rights.docs.map((d) => d.data() as Grant);
					progressReady = true;
				} catch {
					if (g === generation && r === request) clear();
				}
			};
			for (const path of ['academy_completion', 'academy_grants']) {
				listeners.push(
					onSnapshot(
						collection(db, path, uid, path === 'academy_grants' ? 'scopes' : 'lessons'),
						{ includeMetadataChanges: true },
						(snap) => {
							if (g !== generation) return;
							if (snap.metadata.fromCache || snap.metadata.hasPendingWrites) {
								request++;
								clear();
							} else void load();
						},
						() => {
							if (g === generation) {
								request++;
								clear();
							}
						}
					)
				);
			}
			void load();
		});
		const timer = setInterval(() => {
			now = Date.now();
		}, 1000);
		const offline = () => {
			request++;
			clear();
		};
		window.addEventListener('offline', offline);
		return () => {
			generation++;
			stop();
			listeners.forEach((stop) => stop());
			clearInterval(timer);
			window.removeEventListener('offline', offline);
		};
	});

	onMount(() => {
		void loadCatalog();
		const offline = () => {
			catalogRequest++;
			loading = false;
			error = 'Anda sedang offline. Periksa koneksi lalu coba lagi.';
		};
		window.addEventListener('offline', offline);
		window.addEventListener('online', loadCatalog);
		return () => {
			catalogRequest++;
			window.removeEventListener('offline', offline);
			window.removeEventListener('online', loadCatalog);
		};
	});
</script>

<svelte:head
	><title>Kurikulum | CryptoSharia Academy</title><meta
		name="description"
		content="Jelajahi bidang pembelajaran dan materi terbit CryptoSharia Academy."
	/></svelte:head
>
<section class="mx-auto max-w-6xl px-5 py-12 sm:px-6 sm:py-16">
	<div
		class="flex flex-col gap-6 border-b border-line pb-8 sm:flex-row sm:items-end sm:justify-between"
	>
		<div class="max-w-2xl">
			<p class="text-xs font-bold tracking-[0.18em] text-primary uppercase">Kurikulum Academy</p>
			<h1 class="mt-3 text-3xl font-semibold tracking-tight text-white sm:text-4xl">
				Jelajahi bidang pembelajaran
			</h1>
			<p class="mt-3 leading-7 text-secondary">
				Temukan bidang dan materi yang sudah diterbitkan. Roadmap kurikulum ditampilkan terpisah
				dari pelajaran yang dapat diakses.
			</p>
		</div>
		<a href={resolve('/profile')} class="academy-button-secondary w-fit no-underline">
			Pembelajaran saya <span class="ml-2" aria-hidden="true">→</span>
		</a>
	</div>

	{#if loading}
		<div
			class="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4"
			aria-busy="true"
			aria-label="Memuat bidang kurikulum"
		>
			{#each [1, 2, 3, 4] as skeleton (skeleton)}
				<div class="academy-card animate-pulse p-5">
					<div class="h-3 w-16 rounded bg-surface-raised"></div>
					<div class="mt-5 h-6 w-3/4 rounded bg-surface-raised"></div>
					<div class="mt-4 h-4 w-full rounded bg-surface-raised"></div>
					<div class="mt-2 h-4 w-5/6 rounded bg-surface-raised"></div>
					<div class="mt-7 h-4 w-28 rounded bg-surface-raised"></div>
				</div>
			{/each}
		</div>
		<p role="status" class="sr-only">Memuat katalog kurikulum…</p>
	{:else if error}
		<div
			class="academy-card-raised mt-8 flex flex-col gap-4 p-6 sm:flex-row sm:items-center sm:justify-between"
		>
			<div>
				<p class="font-semibold text-white">Katalog belum dapat dimuat</p>
				<p role="alert" class="mt-1 text-sm text-secondary">{error}</p>
			</div>
			<button class="academy-button-primary w-fit" onclick={() => void loadCatalog()}
				>Coba lagi</button
			>
		</div>
	{:else}
		{#if lessonCount === 0}
			<div
				class="academy-card-raised mt-8 flex flex-col gap-5 p-6 sm:flex-row sm:items-center sm:justify-between sm:p-7"
			>
				<div class="max-w-2xl">
					<p class="text-xs font-bold tracking-[0.16em] text-primary uppercase">Materi terbit</p>
					<h2 class="mt-2 text-xl font-semibold text-white">
						Materi pembelajaran sedang dipersiapkan
					</h2>
					<p class="mt-2 text-sm leading-6 text-secondary">
						Kurikulum telah dirancang. Materi akan tampil setelah melalui proses review dan
						publikasi.
					</p>
				</div>
				<a href={resolve('/')} class="academy-button-secondary w-fit shrink-0 no-underline"
					>Kembali ke beranda</a
				>
			</div>
		{:else}
			<p class="mt-7 text-sm text-muted" data-testid="catalog-count">
				{lessonCount} lesson telah diterbitkan
			</p>
		{/if}

		<div class="mt-8 grid gap-4 sm:grid-cols-2">
			{#each tree as subject (subject.id)}
				{@const subjectLessons = subject.levels.flatMap((level) =>
					level.chapters.flatMap((chapter) => chapter.lessons)
				)}
				{@const availableLevels = subject.levels.filter((level) => level.record)}
				<article class="academy-card flex min-w-0 flex-col p-5 sm:p-6">
					<div class="flex items-start justify-between gap-4">
						<div>
							<p class="text-xs font-semibold tracking-[0.16em] text-muted uppercase">
								Bidang pembelajaran
							</p>
							<h2 class="mt-2 text-xl font-semibold text-white">
								{subject.record?.title ?? subject.title}
							</h2>
						</div>
						<span
							class={`shrink-0 rounded-full border px-3 py-1 text-xs font-medium ${subjectLessons.length ? 'border-success/30 bg-success/10 text-success' : 'border-line bg-surface-raised text-muted'}`}
						>
							{subjectLessons.length ? `${subjectLessons.length} lesson` : 'Belum tersedia'}
						</span>
					</div>
					{#if subject.record?.description}
						<p class="mt-3 text-sm leading-6 text-secondary">{subject.record.description}</p>
					{:else}
						<p class="mt-3 text-sm leading-6 text-secondary">
							Materi bidang ini akan ditampilkan setelah diterbitkan.
						</p>
					{/if}
					<p class="mt-4 text-xs text-muted">
						Roadmap kurikulum · {subject.levels.length} level direncanakan
					</p>

					{#if availableLevels.length}
						<details class="mt-5 border-t border-line pt-4">
							<summary
								class="flex min-h-11 cursor-pointer list-none items-center justify-between gap-4 font-semibold text-white"
							>
								Lihat materi terbit
								<span class="text-sm font-normal text-primary">{subjectLessons.length} lesson</span>
							</summary>
							<div class="mt-3 space-y-3">
								{#each availableLevels as level (level.number)}
									<details class="rounded-xl border border-line bg-background/60 p-4">
										<summary class="min-h-8 cursor-pointer font-medium text-white"
											>Level {level.number} · {level.record?.title ?? 'Level'}</summary
										>
										<div class="mt-4 space-y-4">
											{#each level.chapters as chapter (chapter.record.id)}
												<section class="border-t border-line pt-4">
													<h3 class="font-semibold text-white">
														Bab {chapter.record.chapterNumber} · {chapter.record.title}
													</h3>
													{#if chapter.record.description}<p class="mt-1 text-sm text-secondary">
															{chapter.record.description}
														</p>{/if}
													<ul class="mt-3 space-y-2">
														{#each chapter.lessons as lesson (lesson.id)}
															<li class="rounded-lg border border-line bg-surface p-4">
																<div class="flex flex-wrap items-start justify-between gap-3">
																	<a
																		class="academy-link font-semibold"
																		href={resolve(
																			`/e-learning/${lesson.scopeId}?lesson=${encodeURIComponent(lesson.id)}`
																		)}>{lesson.title}</a
																	>
																	<span class="text-xs text-muted"
																		>{Math.max(1, Math.round(lesson.durationSeconds / 60))} menit</span
																	>
																</div>
																{#if lesson.description}<p
																		class="mt-2 text-sm leading-6 text-secondary"
																	>
																		{lesson.description}
																	</p>{/if}
																<div class="mt-3 flex flex-wrap items-center gap-2 text-xs">
																	<span class="text-muted">{accessLabel(lesson.scopeId)}</span>
																	{#if progressReady && activeScope(grants, lesson.scopeId, now) && isCompleted(lesson, completions)}
																		<span
																			class="rounded-full bg-success/10 px-2.5 py-1 font-medium text-success"
																			data-testid="catalog-completed">Selesai</span
																		>
																	{/if}
																</div>
															</li>
														{/each}
													</ul>
												</section>
											{/each}
										</div>
									</details>
								{/each}
							</div>
						</details>
					{:else}
						<details class="mt-5 border-t border-line pt-4">
							<summary class="min-h-11 cursor-pointer font-semibold text-secondary"
								>Lihat roadmap</summary
							>
							<ol class="mt-3 grid gap-2 sm:grid-cols-2">
								{#each subject.levels as level (level.number)}
									<li
										class="rounded-lg border border-line bg-background/60 px-3 py-2 text-sm text-secondary"
									>
										Level {level.number} <span class="ml-1 text-xs text-muted">Rencana</span>
									</li>
								{/each}
							</ol>
						</details>
					{/if}
				</article>
			{/each}
		</div>
	{/if}
</section>
