<script lang="ts">
	import { onMount } from 'svelte';
	import { resolve } from '$app/paths';
	import * as env from '$env/static/public';
	import { academyTestEnabled } from '$lib/academyAccess';
	import { isApiMode } from '$lib/academyConfig';
	import { resolveAcademyFirebaseSettings } from '$lib/firebaseConfig';
	import { readCurriculum, type CatalogLesson } from '$lib/academyData';
	import { ensureFirebaseReady, db } from '$lib/firebase';
	import { fetchApiCurriculum } from '$lib/academyApi';
	import { subjects } from '$lib/academyCurriculum';

	type CatalogState = 'loading' | 'available' | 'empty' | 'error' | 'disabled';
	const environment: Record<string, string | undefined> = env;
	const apiMode = isApiMode(environment);
	const enabled =
		apiMode ||
		academyTestEnabled(environment.PUBLIC_ACADEMY_ENABLED, resolveAcademyFirebaseSettings(env));
	const subjectDetails: Record<string, string> = {
		fundamental: 'Mengenali faktor fundamental yang membantu memahami nilai aset digital.',
		technical: 'Memahami pendekatan analisis teknikal untuk membaca pergerakan pasar.',
		muamalah: 'Mempelajari prinsip fikih muamalah dalam konteks aset digital.',
		web3: 'Mengenal blockchain, Web3, dan teknologi yang mendasarinya.'
	};
	let catalogState = $state<CatalogState>(enabled ? 'loading' : 'disabled');
	let lessonCount = $state(0);

	async function refreshCatalog() {
		if (!enabled) {
			catalogState = 'disabled';
			return;
		}
		catalogState = 'loading';
		try {
			let items: CatalogLesson[];
			if (apiMode) items = await fetchApiCurriculum();
			else {
				await ensureFirebaseReady();
				items = await readCurriculum(db);
			}
			lessonCount = items.filter((item) => item.kind === 'lesson').length;
			catalogState = lessonCount > 0 ? 'available' : 'empty';
		} catch {
			catalogState = 'error';
		}
	}

	onMount(() => {
		if (enabled) void refreshCatalog();
		const retry = () => void refreshCatalog();
		window.addEventListener('online', retry);
		return () => window.removeEventListener('online', retry);
	});

	const availabilityText = $derived(
		catalogState === 'available'
			? `${lessonCount} lesson telah diterbitkan`
			: catalogState === 'error'
				? 'Status katalog belum dapat diperiksa saat ini.'
				: 'Materi pembelajaran sedang dipersiapkan.'
	);
</script>

<svelte:head>
	<title>CryptoSharia Academy | Belajar Kripto Terstruktur</title>
	<meta
		name="description"
		content="Kenali blockchain, analisis aset digital, dan prinsip fikih muamalah melalui kurikulum mandiri CryptoSharia Academy."
	/>
</svelte:head>

<section
	class="mx-auto grid max-w-6xl gap-10 px-5 py-14 sm:px-6 sm:py-20 lg:grid-cols-[minmax(0,1.2fr)_minmax(18rem,0.8fr)] lg:items-center lg:gap-16"
>
	<div>
		<p
			class="mb-5 inline-flex items-center gap-2 text-xs font-bold tracking-[0.2em] text-primary uppercase"
		>
			<span class="h-2 w-2 rounded-full bg-primary" aria-hidden="true"></span>
			CryptoSharia Academy
		</p>
		<h1
			class="max-w-3xl text-4xl leading-tight font-semibold tracking-tight text-white sm:text-5xl lg:text-6xl"
		>
			Belajar kripto secara terstruktur <span class="text-primary">dengan perspektif syariah.</span>
		</h1>
		<p class="mt-6 max-w-2xl text-base leading-7 text-secondary sm:text-lg">
			Kenali teknologi blockchain, analisis aset digital, dan prinsip fikih muamalah melalui
			kurikulum pembelajaran mandiri CryptoSharia Academy.
		</p>
		<div class="mt-8 flex flex-col gap-3 sm:flex-row">
			<a href={resolve('/e-learning')} class="academy-button-primary no-underline">
				Jelajahi Kurikulum <span class="ml-2" aria-hidden="true">→</span>
			</a>
			<a
				href="https://www.cryptosharia.id/"
				target="_blank"
				rel="noreferrer"
				class="academy-button-secondary no-underline"
			>
				Kembali ke CryptoSharia <span class="ml-2" aria-hidden="true">↗</span>
			</a>
		</div>
		<p class="mt-5 flex items-center gap-2 text-sm text-muted" role="status" aria-live="polite">
			<span
				class={`h-2 w-2 rounded-full ${catalogState === 'available' ? 'bg-success' : catalogState === 'error' ? 'bg-warning' : 'bg-primary'}`}
				aria-hidden="true"
			></span>
			{availabilityText}
			{#if catalogState === 'error'}
				<button class="academy-link ml-1" onclick={() => void refreshCatalog()}>Coba lagi</button>
			{/if}
		</p>
	</div>

	<aside class="academy-card-raised p-6 sm:p-7" aria-label="Gambaran Academy">
		<div class="flex items-start justify-between gap-4">
			<div>
				<p class="text-xs font-semibold tracking-[0.16em] text-muted uppercase">Jalur belajar</p>
				<h2 class="mt-2 text-2xl font-semibold text-white">Mulai dari rasa ingin tahu.</h2>
			</div>
			<span
				class="rounded-xl border border-line bg-background px-3 py-2 text-sm font-semibold text-primary"
			>
				{subjects.length} bidang
			</span>
		</div>
		<div class="mt-6 space-y-3">
			{#each subjects as subject, index (subject.id)}
				<div class="flex items-center gap-4 rounded-xl border border-line bg-background/70 p-3">
					<span
						class="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-sm font-bold text-primary"
						aria-hidden="true"
					>
						{String(index + 1).padStart(2, '0')}
					</span>
					<div>
						<p class="font-semibold text-white">{subject.title}</p>
						<p class="mt-0.5 text-xs text-muted">Bidang pembelajaran Academy</p>
					</div>
				</div>
			{/each}
		</div>
	</aside>
</section>

<section class="border-y border-line bg-surface/70">
	<div class="mx-auto max-w-6xl px-5 py-14 sm:px-6 sm:py-16">
		<div class="max-w-2xl">
			<p class="text-xs font-bold tracking-[0.18em] text-primary uppercase">Bidang pembelajaran</p>
			<h2 class="mt-3 text-3xl font-semibold tracking-tight text-white">
				Kurikulum yang mudah dijelajahi
			</h2>
			<p class="mt-3 leading-7 text-secondary">
				Pilih bidang yang ingin Anda kenali. Materi terbit akan ditampilkan sesuai status
				publikasinya.
			</p>
		</div>
		<div class="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
			{#each subjects as subject, index (subject.id)}
				<article
					class="academy-card flex min-h-52 flex-col p-5 transition duration-200 hover:-translate-y-0.5 hover:border-primary/50"
				>
					<span class="text-xs font-bold tracking-[0.16em] text-primary" aria-hidden="true"
						>0{index + 1}</span
					>
					<h3 class="mt-5 text-lg font-semibold text-white">{subject.title}</h3>
					<p class="mt-2 flex-1 text-sm leading-6 text-secondary">{subjectDetails[subject.id]}</p>
					<a
						class="academy-link mt-5 inline-flex min-h-11 items-center gap-2"
						href={resolve('/e-learning')}
					>
						Jelajahi bidang <span aria-hidden="true">→</span>
					</a>
				</article>
			{/each}
		</div>
	</div>
</section>

<section class="mx-auto max-w-6xl px-5 py-14 sm:px-6 sm:py-16">
	<div class="max-w-2xl">
		<p class="text-xs font-bold tracking-[0.18em] text-primary uppercase">Cara belajar</p>
		<h2 class="mt-3 text-3xl font-semibold tracking-tight text-white">
			Belajar setahap demi setahap
		</h2>
	</div>
	<ol class="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
		<li class="academy-card p-5">
			<span class="text-sm font-bold text-primary">01</span>
			<h3 class="mt-4 font-semibold text-white">Jelajahi kurikulum</h3>
			<p class="mt-2 text-sm leading-6 text-secondary">
				Kenali empat bidang dan lihat materi yang sudah tersedia.
			</p>
		</li>
		<li class="academy-card p-5">
			<span class="text-sm font-bold text-primary">02</span>
			<h3 class="mt-4 font-semibold text-white">Masuk ke Academy</h3>
			<p class="mt-2 text-sm leading-6 text-secondary">
				Gunakan metode autentikasi yang tersedia untuk akun Anda.
			</p>
		</li>
		<li class="academy-card p-5">
			<span class="text-sm font-bold text-primary">03</span>
			<h3 class="mt-4 font-semibold text-white">Akses materi</h3>
			<p class="mt-2 text-sm leading-6 text-secondary">
				Materi terbuka sesuai status publikasi dan hak akses akun.
			</p>
		</li>
		<li class="academy-card p-5">
			<span class="text-sm font-bold text-primary">04</span>
			<h3 class="mt-4 font-semibold text-white">Lanjutkan belajar</h3>
			<p class="mt-2 text-sm leading-6 text-secondary">
				Lihat posisi belajar dan tandai materi selesai secara eksplisit.
			</p>
		</li>
	</ol>
</section>

<section class="mx-auto max-w-6xl px-5 pb-16 sm:px-6 sm:pb-20">
	<div
		class="academy-card-raised flex flex-col gap-6 p-6 sm:flex-row sm:items-center sm:justify-between sm:p-8"
	>
		<div class="max-w-2xl">
			<p class="text-xs font-bold tracking-[0.18em] text-primary uppercase">Lanjutkan eksplorasi</p>
			<h2 class="mt-3 text-2xl font-semibold text-white">Temukan kurikulum Academy</h2>
			<p class="mt-2 text-sm leading-6 text-secondary">{availabilityText}</p>
		</div>
		<a href={resolve('/e-learning')} class="academy-button-primary shrink-0 no-underline">
			Buka katalog <span class="ml-2" aria-hidden="true">→</span>
		</a>
	</div>
</section>
