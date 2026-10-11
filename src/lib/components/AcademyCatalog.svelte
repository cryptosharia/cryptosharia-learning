<script lang="ts">
	import { resolve } from '$app/paths';
	import { onMount } from 'svelte';
	import { readCurriculum, type CatalogLesson } from '$lib/academyData';
	import { curriculumTree } from '$lib/academyCurriculum';
	import { db, ensureFirebaseReady } from '$lib/firebase';
	let items = $state<CatalogLesson[]>([]),
		loading = $state(true),
		error = $state('');
	let tree = $state<ReturnType<typeof curriculumTree>>([]);
	onMount(() => {
		let alive = true;
		async function load() {
			loading = true;
			error = '';
			try {
				await ensureFirebaseReady();
				const data = await readCurriculum(db);
				const parsed = curriculumTree(data);
				if (alive) {
					items = data;
					tree = parsed;
				}
			} catch {
				if (alive)
					error = navigator.onLine
						? 'Katalog belum dapat dimuat. Coba kembali.'
						: 'Anda offline. Katalog belum dapat dimuat.';
			} finally {
				if (alive) loading = false;
			}
		}
		void load();
		const offline = () => {
			error = 'Anda offline. Muat ulang setelah koneksi tersedia.';
		};
		window.addEventListener('offline', offline);
		window.addEventListener('online', load);
		return () => {
			alive = false;
			window.removeEventListener('offline', offline);
			window.removeEventListener('online', load);
		};
	});
</script>

<svelte:head
	><title>Kurikulum | CryptoSharia Academy</title><meta
		name="description"
		content="Kurikulum pembelajaran mandiri CryptoSharia Academy."
	/></svelte:head
>
<section class="mx-auto max-w-6xl px-5 py-24">
	<h1 class="text-3xl font-bold">Kurikulum Academy</h1>
	<p class="my-4">
		Empat bidang, rencana enam level dan tujuh bab per level. 168 bab adalah rencana kurikulum.
		Jumlah lesson di bawah berasal dari materi yang sudah diterbitkan.
	</p>
	<a class="underline" href={resolve('/profile')}>Dashboard pembelajaran</a>
	{#if loading}<p role="status">Memuat katalog…</p>{:else if error}<p role="alert">{error}</p>
		<button class="my-4 rounded border p-3" onclick={() => location.reload()}
			>Muat ulang katalog</button
		>
	{:else}
		<p class="my-4" data-testid="catalog-count">
			{items.filter((i) => i.kind === 'lesson').length} lesson tersedia
		</p>
		<div class="grid gap-6 lg:grid-cols-2">
			{#each tree as subject (subject.id)}<article class="rounded-2xl border p-5">
					<h2 class="text-xl font-bold">{subject.record?.title ?? subject.title}</h2>
					<p>
						{subject.levels.some((l) => l.chapters.some((c) => c.lessons.length > 0))
							? 'Tersedia'
							: 'Belum tersedia'}
					</p>
					<p>{subject.record?.description ?? 'Materi bidang ini belum tersedia.'}</p>
					{#each subject.levels as level (level.number)}<details
							class="mt-4 rounded border p-3"
							open={level.chapters.length > 0}
						>
							<summary class="cursor-pointer font-semibold"
								>Level {level.number} · {level.record?.title ?? 'Belum tersedia'}</summary
							>
							{#if level.chapters.length === 0}<p class="mt-3">
									Belum ada bab tersedia pada level ini.
								</p>{/if}
							{#each level.chapters as chapter (chapter.record.id)}<div class="mt-4">
									<h3 class="font-semibold">
										Bab {chapter.record.chapterNumber} · {chapter.record.title}
									</h3>
									<p>{chapter.record.description}</p>
									<p>
										{chapter.lessons.length} lesson · {chapter.lessons.reduce(
											(sum, l) => sum + l.durationSeconds,
											0
										)} detik
									</p>
									{#if !chapter.lessons.length}<p>Belum ada lesson tersedia.</p>{/if}
									<ul class="mt-3 space-y-3">
										{#each chapter.lessons as lesson (lesson.id)}<li class="rounded border p-3">
												<a
													class="font-semibold underline"
													href={resolve(
														`/e-learning/${lesson.scopeId}?lesson=${encodeURIComponent(lesson.id)}`
													)}>{lesson.title}</a
												>
												<p>{lesson.description}</p>
												<p>
													{lesson.durationSeconds} detik{lesson.instructor
														? ` · ${lesson.instructor}`
														: ''}
												</p>
											</li>{/each}
									</ul>
								</div>{/each}
						</details>{/each}
				</article>{/each}
		</div>
	{/if}
</section>
