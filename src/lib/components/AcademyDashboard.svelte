<script lang="ts">
	import { onMount } from 'svelte';
	import { resolve } from '$app/paths';
	import { onAuthStateChanged } from 'firebase/auth';
	import { collection, onSnapshot, query, where } from 'firebase/firestore';
	import { collection as liteCollection, getDocs } from 'firebase/firestore/lite';
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
	import { subjects } from '$lib/academyCurriculum';
	let history = $state<Progress[]>([]),
		completions = $state<Completion[]>([]),
		lessons = $state<CatalogLesson[]>([]),
		grants = $state<Grant[]>([]);
	let status = $state('Memuat pembelajaran…'),
		now = $state(Date.now()),
		ready = $state(false);
	const summary = $derived(completionSummary(lessons, completions, grants, now));
	const scopes = $derived([...new Set(grants.map((g) => g.scopeId))]);
	const studied = $derived([
		...new Set(
			history
				.map(
					(p) =>
						subjects.find((s) => s.id === lessons.find((l) => l.id === p.lessonId)?.subjectId)
							?.title
				)
				.filter(Boolean)
		)
	]);
	const access = (scope: string) => {
		const grant = grants.find((g) => g.scopeId === scope);
		return !grant
			? 'Akses tidak tersedia'
			: grant.state === 'revoked'
				? 'Akses dicabut'
				: grant.expiresAt.toMillis() <= now
					? 'Akses kedaluwarsa'
					: grant.startsAt.toMillis() > now
						? 'Akses belum dimulai'
						: 'Akses tersedia';
	};
	onMount(() => {
		let generation = 0,
			request = 0;
		let listeners: (() => void)[] = [];
		const clear = () => {
			history = [];
			completions = [];
			lessons = [];
			grants = [];
			ready = false;
		};
		const stop = onAuthStateChanged(auth, (user) => {
			const g = ++generation;
			listeners.forEach((stop) => stop());
			listeners = [];
			clear();
			status = user ? 'Memuat pembelajaran…' : 'Masuk untuk melihat pembelajaran.';
			if (!user) return;
			const uid = user.uid;
			const load = async () => {
				const r = ++request;
				try {
					await ensureFirebaseReady();
					const [positions, catalog, rights, completed] = await Promise.all([
						freshProgress(lessonDb, uid),
						readCurriculum(db),
						getDocs(liteCollection(lessonDb, 'academy_grants', uid, 'scopes')),
						freshCompletions(lessonDb, uid)
					]);
					if (g !== generation || r !== request || auth.currentUser?.uid !== uid) return;
					history = positions;
					completions = completed;
					lessons = catalog.filter((l) => l.kind === 'lesson');
					grants = rights.docs.map((d) => d.data() as Grant);
					ready = true;
					status = 'Pembelajaran siap.';
				} catch {
					if (g === generation && r === request) {
						clear();
						status = 'Pembelajaran tidak dapat dimuat. Periksa koneksi.';
					}
				}
			};
			for (const path of [
				'academy_progress',
				'academy_grants',
				'academy_completion',
				'academy_catalog'
			])
				listeners.push(
					onSnapshot(
						path === 'academy_catalog'
							? query(collection(db, path), where('status', '==', 'published'))
							: collection(db, path, uid, path === 'academy_grants' ? 'scopes' : 'lessons'),
						{ includeMetadataChanges: true },
						(snap) => {
							if (g !== generation) return;
							if (snap.metadata.fromCache || snap.metadata.hasPendingWrites) {
								request++;
								clear();
								status = 'Menunggu data server pembelajaran…';
							} else void load();
						},
						() => {
							if (g === generation) {
								request++;
								clear();
								status = 'Backend pembelajaran tidak tersedia.';
							}
						}
					)
				);
			void load();
		});
		const timer = setInterval(() => {
			now = Date.now();
		}, 1000);
		const offline = () => {
			request++;
			clear();
			status = 'Anda offline. Data pembelajaran ditutup.';
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
</script>

<section class="my-8 rounded-2xl border p-5" data-testid="learning-dashboard">
	<h2 class="text-xl font-bold">Dashboard pembelajaran</h2>
	<p role="status">{status}</p>
	{#if ready}
		<h3 class="mt-4 font-semibold">Progres penyelesaian</h3>
		<p>Hanya lesson terbit dengan akses aktif yang dihitung. Posisi video tersimpan terpisah.</p>
		<p data-testid="completion-summary">
			{summary.completed} dari {summary.total} lesson selesai ({summary.percentage}%)
		</p>
		<progress
			class="my-3 w-full"
			aria-label="Progres penyelesaian"
			max="100"
			value={summary.percentage}
		></progress>
		{#if !summary.total}<p>Belum ada lesson terbit dengan akses aktif.</p>{/if}
		{#each scopes as scope (scope)}
			{@const scoped = completionSummary(lessons, completions, grants, now, scope)}
			<div class="my-3 rounded border p-3">
				<p>
					{lessons.find((l) => l.scopeId === scope)?.subject ?? 'Materi belum tersedia'} · {access(
						scope
					)}
				</p>
				{#if access(scope) === 'Akses tersedia'}<p>
						{scoped.completed} dari {scoped.total} lesson selesai ({scoped.percentage}%)
					</p>
				{:else}<p>Materi ini tidak dihitung dalam progres aktif.</p>{/if}
			</div>
		{/each}
		{#if !history.length}<p>Belum ada aktivitas belajar. Mulai dari katalog Academy.</p>{:else}
			<h3 class="mt-4 font-semibold">Lanjutkan belajar</h3>
			{#each history as progress, index (progress.lessonId)}{@const lesson = lessons.find(
					(l) => l.id === progress.lessonId
				)}
				<div class="mt-3 rounded border p-3">
					<p>
						{index === 0 ? 'Pelajaran terakhir: ' : ''}{lesson?.title ?? 'Materi tidak tersedia'}
					</p>
					<p>Posisi belajar terakhir: {progress.positionSeconds} detik</p>
					{#if lesson}<p>{access(lesson.scopeId)}</p>
						<p>
							{progress.version !== lesson.version
								? 'Materi telah diperbarui; resume dimulai dari awal.'
								: `${resumePosition(lesson, progress)} dari ${lesson.durationSeconds} detik (posisi tersimpan)`}
						</p>
						{#if access(lesson.scopeId) === 'Akses tersedia'}<a
								class="underline"
								href={resolve(
									`/e-learning/${lesson.scopeId}?lesson=${encodeURIComponent(lesson.id)}`
								)}>Lanjutkan {lesson.title}</a
							>{/if}{/if}
				</div>
			{/each}
			<p class="mt-4">
				Bidang yang pernah dipelajari: {studied.join(', ') || 'Metadata belum tersedia'}
			</p>
		{/if}
		<h3 class="mt-6 font-semibold">Materi yang dapat diakses</h3>
		<ul>
			{#each lessons.filter((l) => access(l.scopeId) === 'Akses tersedia') as lesson (lesson.id)}<li
				>
					<a
						class="underline"
						href={resolve(`/e-learning/${lesson.scopeId}?lesson=${encodeURIComponent(lesson.id)}`)}
						>{lesson.title}</a
					>
					{#if isCompleted(lesson, completions)}<span class="ml-2">Selesai</span>{/if}
				</li>{:else}<li>Belum ada materi dengan akses aktif.</li>{/each}
		</ul>
	{/if}
</section>
