<script lang="ts">
	import { onMount } from 'svelte';
	import { resolve } from '$app/paths';
	import { onAuthStateChanged } from 'firebase/auth';
	import { collection, onSnapshot, query, where } from 'firebase/firestore';
	import { collection as liteCollection, getDocs } from 'firebase/firestore/lite';
	import * as publicEnv from '$env/static/public';
	import { isApiMode } from '$lib/academyConfig';
	import { auth, db, lessonDb, ensureFirebaseReady } from '$lib/firebase';
	import {
		readCurriculum,
		type CatalogLesson,
		type Grant,
		type Progress,
		type Completion
	} from '$lib/academyData';
	import {
		freshProgress,
		resumePosition,
		freshCompletions,
		completionSummary,
		isCompleted
	} from '$lib/academyProgress';
	import { onAuthChange, userAuth } from '$lib/auth.svelte';
	import {
		fetchApiCompletions,
		fetchApiCurriculum,
		fetchApiGrants,
		fetchApiProgress
	} from '$lib/academyApi';

	const apiMode = isApiMode(publicEnv);
	let history = $state<Progress[]>([]);
	let completions = $state<Completion[]>([]);
	let lessons = $state<CatalogLesson[]>([]);
	let grants = $state<Grant[]>([]);
	let status = $state('Memuat akun…');
	let now = $state(Date.now());
	let ready = $state(false);
	let authReady = $state(false);
	let signed = $state(false);
	let loadError = $state(false);
	let retryLoad = $state<() => void>(() => {});

	const summary = $derived(completionSummary(lessons, completions, grants, now));
	const activeLessons = $derived(
		lessons.filter((lesson) => access(lesson.scopeId) === 'Akses tersedia')
	);
	const continueProgress = $derived(
		history.find((progress) => {
			const lesson = lessons.find((item) => item.id === progress.lessonId);
			return lesson && access(lesson.scopeId) === 'Akses tersedia';
		})
	);
	const continueLesson = $derived(
		continueProgress && lessons.find((lesson) => lesson.id === continueProgress.lessonId)
	);

	function access(scopeId: string) {
		const grant = grants.find((item) => item.scopeId === scopeId);
		if (!grant) return 'Akses belum tersedia';
		if (grant.state === 'revoked') return 'Akses dicabut';
		if (grant.expiresAt.toMillis() <= now) return 'Akses kedaluwarsa';
		if (grant.startsAt.toMillis() > now) return 'Akses belum dimulai';
		return 'Akses tersedia';
	}

	function clearData() {
		history = [];
		completions = [];
		lessons = [];
		grants = [];
		ready = false;
	}

	onMount(() => {
		let generation = 0;
		let request = 0;
		let listeners: (() => void)[] = [];
		let currentRetry = () => {};

		if (apiMode) {
			const stopAuth = onAuthChange((user) => {
				if (userAuth.loading) return;
				authReady = true;
				signed = !!user;
				loadError = false;
				const currentGeneration = ++generation;
				clearData();
				status = user ? 'Memuat pembelajaran…' : 'Masuk untuk melihat pembelajaran.';
				if (!user) {
					currentRetry = () => {};
					retryLoad = currentRetry;
					return;
				}

				const load = async () => {
					const currentRequest = ++request;
					try {
						const [positions, catalog, rights, completed] = await Promise.all([
							fetchApiProgress(),
							fetchApiCurriculum(),
							fetchApiGrants(),
							fetchApiCompletions()
						]);
						if (currentGeneration !== generation || currentRequest !== request) return;
						history = positions;
						completions = completed.completions;
						lessons = catalog.filter((lesson) => lesson.kind === 'lesson');
						grants = rights;
						ready = true;
						loadError = false;
						status = 'Pembelajaran siap.';
					} catch {
						if (currentGeneration === generation && currentRequest === request) {
							clearData();
							loadError = true;
							status = 'Data pembelajaran belum dapat dimuat. Periksa koneksi lalu coba lagi.';
						}
					}
				};
				currentRetry = () => void load();
				retryLoad = currentRetry;
				void load();
			});

			const timer = setInterval(() => (now = Date.now()), 1000);
			const offline = () => {
				request++;
				clearData();
				loadError = true;
				status = 'Anda offline. Data pribadi ditutup sampai koneksi tersedia.';
			};
			const online = () => currentRetry();
			window.addEventListener('offline', offline);
			window.addEventListener('online', online);
			return () => {
				generation++;
				stopAuth();
				clearInterval(timer);
				window.removeEventListener('offline', offline);
				window.removeEventListener('online', online);
			};
		}

		const stop = onAuthStateChanged(auth, (user) => {
			authReady = true;
			signed = !!user;
			loadError = false;
			const currentGeneration = ++generation;
			listeners.forEach((unsubscribe) => unsubscribe());
			listeners = [];
			clearData();
			status = user ? 'Memuat pembelajaran…' : 'Masuk untuk melihat pembelajaran.';
			if (!user) {
				currentRetry = () => {};
				retryLoad = currentRetry;
				return;
			}
			const uid = user.uid;
			const load = async () => {
				const currentRequest = ++request;
				try {
					await ensureFirebaseReady();
					const [positions, catalog, rights, completed] = await Promise.all([
						freshProgress(lessonDb, uid),
						readCurriculum(db),
						getDocs(liteCollection(lessonDb, 'academy_grants', uid, 'scopes')),
						freshCompletions(lessonDb, uid)
					]);
					if (
						currentGeneration !== generation ||
						currentRequest !== request ||
						auth.currentUser?.uid !== uid
					)
						return;
					history = positions;
					completions = completed;
					lessons = catalog.filter((lesson) => lesson.kind === 'lesson');
					grants = rights.docs.map((doc) => doc.data() as Grant);
					ready = true;
					loadError = false;
					status = 'Pembelajaran siap.';
				} catch {
					if (currentGeneration === generation && currentRequest === request) {
						clearData();
						loadError = true;
						status = 'Data pembelajaran belum dapat dimuat. Periksa koneksi lalu coba lagi.';
					}
				}
			};
			currentRetry = () => void load();
			retryLoad = currentRetry;
			for (const path of [
				'academy_progress',
				'academy_grants',
				'academy_completion',
				'academy_catalog'
			]) {
				listeners.push(
					onSnapshot(
						path === 'academy_catalog'
							? query(collection(db, path), where('status', '==', 'published'))
							: collection(db, path, uid, path === 'academy_grants' ? 'scopes' : 'lessons'),
						{ includeMetadataChanges: true },
						(snapshot) => {
							if (currentGeneration !== generation) return;
							if (snapshot.metadata.fromCache || snapshot.metadata.hasPendingWrites) {
								request++;
								clearData();
								status = 'Menunggu data terbaru dari server…';
							} else void load();
						},
						() => {
							if (currentGeneration === generation) {
								request++;
								clearData();
								loadError = true;
								status = 'Data pembelajaran belum dapat dimuat.';
							}
						}
					)
				);
			}
			void load();
		});

		const timer = setInterval(() => (now = Date.now()), 1000);
		const offline = () => {
			request++;
			clearData();
			loadError = true;
			status = 'Anda offline. Data pribadi ditutup sampai koneksi tersedia.';
		};
		const online = () => currentRetry();
		window.addEventListener('offline', offline);
		window.addEventListener('online', online);
		return () => {
			generation++;
			stop();
			listeners.forEach((unsubscribe) => unsubscribe());
			clearInterval(timer);
			window.removeEventListener('offline', offline);
			window.removeEventListener('online', online);
		};
	});
</script>

<section class="space-y-8" data-testid="learning-dashboard">
	{#if !authReady}
		<div
			class="academy-card-raised animate-pulse p-6"
			aria-busy="true"
			aria-label="Memuat dashboard"
		>
			<div class="h-7 w-56 rounded bg-surface-raised"></div>
			<div class="mt-5 h-4 w-80 max-w-full rounded bg-surface-raised"></div>
			<p role="status" class="sr-only">Memuat status akun…</p>
		</div>
	{:else if !signed}
		<article
			class="academy-card-raised flex flex-col gap-5 p-6 sm:flex-row sm:items-center sm:justify-between sm:p-8"
		>
			<div class="max-w-2xl">
				<p class="text-xs font-bold tracking-[0.16em] text-primary uppercase">Ruang belajar Anda</p>
				<h2 class="mt-2 text-2xl font-semibold text-white">Masuk untuk melanjutkan pembelajaran</h2>
				<p class="mt-2 text-sm leading-6 text-secondary">
					Akses materi yang tersedia, lanjutkan pembelajaran, dan pantau progres Anda.
				</p>
			</div>
			<a
				class="academy-button-primary w-fit shrink-0 no-underline"
				href={resolve('/auth/login?redirect=%2Fprofile')}
			>
				Masuk ke Academy <span class="ml-2" aria-hidden="true">→</span>
			</a>
		</article>
	{:else if loadError}
		<div
			class="academy-card-raised flex flex-col gap-4 p-6 sm:flex-row sm:items-center sm:justify-between"
		>
			<div>
				<h2 class="font-semibold text-white">Pembelajaran belum dapat dimuat</h2>
				<p role="alert" class="mt-1 text-sm text-secondary">{status}</p>
			</div>
			<button class="academy-button-primary w-fit" onclick={() => retryLoad()}>Coba lagi</button>
		</div>
	{:else if !ready}
		<div
			class="academy-card-raised animate-pulse p-6"
			aria-busy="true"
			aria-label="Memuat data pembelajaran"
		>
			<div class="h-7 w-64 rounded bg-surface-raised"></div>
			<div class="mt-5 h-4 w-96 max-w-full rounded bg-surface-raised"></div>
			<p role="status" class="sr-only">{status}</p>
		</div>
	{:else}
		<header>
			<p class="text-xs font-bold tracking-[0.16em] text-primary uppercase">Ruang belajar Anda</p>
			<h2 class="mt-2 text-3xl font-semibold tracking-tight text-white">
				{userAuth.user?.displayName
					? `Selamat datang, ${userAuth.user.displayName}`
					: 'Dashboard Pembelajaran'}
			</h2>
			<p class="mt-2 text-sm leading-6 text-secondary">
				Pantau materi yang dapat diakses dan lanjutkan dari posisi terakhir.
			</p>
		</header>

		<div class="grid gap-4 sm:grid-cols-3">
			<article class="academy-card p-5">
				<p class="text-sm text-muted">Lesson selesai</p>
				<p class="mt-2 text-3xl font-semibold text-white">{summary.completed}</p>
			</article>
			<article class="academy-card p-5">
				<p class="text-sm text-muted">Lesson dengan akses aktif</p>
				<p class="mt-2 text-3xl font-semibold text-white">{summary.total}</p>
			</article>
			<article class="academy-card p-5">
				<p class="text-sm text-muted">Progres penyelesaian</p>
				<p class="mt-2 text-3xl font-semibold text-white">{summary.percentage}%</p>
			</article>
		</div>

		<article class="academy-card-raised p-5 sm:p-6">
			<div class="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
				<div>
					<p class="text-xs font-bold tracking-[0.14em] text-primary uppercase">
						Lanjutkan belajar
					</p>
					<h3 class="mt-2 text-xl font-semibold text-white">
						{continueLesson?.title ??
							(continueProgress
								? 'Materi terakhir tidak lagi dapat diakses'
								: 'Belum ada aktivitas belajar')}
					</h3>
					{#if continueLesson && continueProgress}
						<p class="mt-1 text-sm text-secondary">
							Posisi tersimpan {resumePosition(continueLesson, continueProgress)} dari {continueLesson.durationSeconds}
							detik.
						</p>
					{:else}
						<p class="mt-1 text-sm text-secondary">
							Pilih materi yang tersedia dari katalog untuk mulai belajar.
						</p>
					{/if}
				</div>
				{#if continueLesson}
					<a
						class="academy-button-primary w-fit shrink-0 no-underline"
						href={resolve(
							`/e-learning/${continueLesson.scopeId}?lesson=${encodeURIComponent(continueLesson.id)}`
						)}>Lanjutkan belajar</a
					>
				{:else}
					<a
						class="academy-button-secondary w-fit shrink-0 no-underline"
						href={resolve('/e-learning')}>Buka katalog</a
					>
				{/if}
			</div>
		</article>

		<div class="grid gap-6 lg:grid-cols-[minmax(0,1.1fr)_minmax(17rem,0.9fr)]">
			<section class="academy-card p-5 sm:p-6" aria-labelledby="my-learning-title">
				<div class="flex items-start justify-between gap-4">
					<div>
						<h3 id="my-learning-title" class="text-lg font-semibold text-white">
							Pembelajaran Saya
						</h3>
						<p class="mt-1 text-sm text-muted">
							Hanya lesson terbit dengan akses akun yang ditampilkan.
						</p>
					</div>
					<a
						class="academy-link inline-flex min-h-11 items-center text-sm"
						href={resolve('/e-learning')}>Katalog</a
					>
				</div>
				{#if activeLessons.length}
					<ul class="mt-5 divide-y divide-line">
						{#each activeLessons as lesson (lesson.id)}
							<li class="flex flex-col gap-2 py-4 sm:flex-row sm:items-center sm:justify-between">
								<div class="min-w-0">
									<a
										class="academy-link font-semibold"
										href={resolve(
											`/e-learning/${lesson.scopeId}?lesson=${encodeURIComponent(lesson.id)}`
										)}>{lesson.title}</a
									>
									<p class="mt-1 text-sm text-muted">
										{lesson.subject} · Level {lesson.level} · Bab {lesson.chapterNumber}
									</p>
								</div>
								<span
									class="w-fit rounded-full bg-success/10 px-3 py-1 text-xs font-medium text-success"
								>
									{isCompleted(lesson, completions) ? 'Selesai' : 'Belum dimulai'}
								</span>
							</li>
						{/each}
					</ul>
				{:else}
					<div class="mt-5 rounded-xl border border-line bg-background p-4">
						<p class="font-medium text-white">Belum ada materi dengan akses aktif.</p>
						<p class="mt-1 text-sm leading-6 text-secondary">
							Hak akses ditentukan oleh grant yang berlaku untuk akun Anda.
						</p>
					</div>
				{/if}
			</section>

			<section class="academy-card p-5 sm:p-6" aria-labelledby="progress-title">
				<h3 id="progress-title" class="text-lg font-semibold text-white">Progres penyelesaian</h3>
				<p class="mt-1 text-sm leading-6 text-muted">
					Posisi video tersimpan terpisah dan tidak menandai lesson selesai.
				</p>
				<div class="mt-5 flex items-end justify-between gap-4">
					<p class="text-sm text-secondary">{summary.completed} dari {summary.total} lesson</p>
					<p class="text-lg font-semibold text-white">{summary.percentage}%</p>
				</div>
				<progress
					class="academy-progress mt-3 w-full"
					aria-label="Progres penyelesaian"
					max="100"
					value={summary.percentage}
				></progress>
				{#if !summary.total}<p class="mt-4 text-sm text-muted">
						Belum ada lesson terbit dengan akses aktif.
					</p>{/if}
			</section>
		</div>
	{/if}
</section>
