<script lang="ts">
	import { onMount } from 'svelte';
	import { resolve } from '$app/paths';
	import { onAuthStateChanged } from 'firebase/auth';
	import { doc, getDocFromServer, setDoc, serverTimestamp } from 'firebase/firestore';
	import { auth, db, ensureFirebaseReady } from '$lib/firebase';
	import { userAuth, onAuthChange } from '$lib/auth.svelte';
	import * as publicEnv from '$env/static/public';
	import { isApiMode } from '$lib/academyConfig';
	import AcademyDashboard from '$lib/components/AcademyDashboard.svelte';

	const apiMode = isApiMode(publicEnv);
	let name = $state('');
	let status = $state('Memuat akun…');
	let signed = $state(false);
	let generation = 0;

	onMount(() => {
		if (apiMode) {
			return onAuthChange((user) => {
				if (userAuth.loading) return;
				generation++;
				signed = !!user;
				name = user?.displayName ?? '';
				status = user ? 'Profil siap.' : 'Masuk untuk melihat profil akun.';
			});
		}

		const stop = onAuthStateChanged(auth, (user) => {
			const currentGeneration = ++generation;
			name = '';
			signed = !!user;
			status = user ? 'Memuat profil…' : 'Masuk untuk melihat profil akun.';
			if (!user) return;
			void ensureFirebaseReady()
				.then(() => getDocFromServer(doc(db, 'users', user.uid)))
				.then((snapshot) => {
					if (currentGeneration === generation && auth.currentUser?.uid === user.uid) {
						name = snapshot.data()?.displayName ?? '';
						status = 'Profil siap.';
					}
				})
				.catch(() => {
					if (currentGeneration === generation)
						status = 'Profil belum dapat dimuat. Periksa koneksi lalu coba lagi.';
				});
		});
		return () => {
			generation++;
			stop();
		};
	});

	async function save(event: SubmitEvent) {
		event.preventDefault();
		const uid = auth.currentUser?.uid;
		const currentGeneration = generation;
		if (!uid) return;
		status = 'Menyimpan perubahan…';
		try {
			await setDoc(
				doc(db, 'users', uid),
				{ displayName: name.trim(), updatedAt: serverTimestamp() },
				{ merge: true }
			);
			if (currentGeneration === generation && auth.currentUser?.uid === uid)
				status = 'Profil tersimpan.';
		} catch {
			if (currentGeneration === generation) status = 'Perubahan belum tersimpan. Coba lagi.';
		}
	}
</script>

<svelte:head>
	<title>Pembelajaran Saya | CryptoSharia Academy</title>
	<meta name="description" content="Lihat pembelajaran dan profil akun CryptoSharia Academy." />
</svelte:head>

<section class="mx-auto max-w-6xl space-y-10 px-5 py-12 sm:px-6 sm:py-16">
	<header class="max-w-2xl">
		<p class="text-xs font-bold tracking-[0.18em] text-primary uppercase">Ruang belajar</p>
		<h1 class="mt-3 text-3xl font-semibold tracking-tight text-white sm:text-4xl">
			Pembelajaran Saya
		</h1>
		<p class="mt-3 leading-7 text-secondary">
			Lanjutkan materi, lihat progres, dan kelola informasi akun Anda.
		</p>
	</header>

	<AcademyDashboard />

	{#if signed}
		<section id="profil-akun" class="academy-card p-5 sm:p-7" aria-labelledby="account-title">
			<div class="max-w-2xl">
				<p class="text-xs font-bold tracking-[0.16em] text-primary uppercase">Informasi akun</p>
				<h2 id="account-title" class="mt-2 text-xl font-semibold text-white">Profil Akun</h2>
				<p class="mt-2 text-sm leading-6 text-secondary">
					Informasi akun terpisah dari aktivitas pembelajaran.
				</p>
			</div>
			<p role="status" class="mt-5 text-sm text-muted">{status}</p>

			{#if apiMode}
				<dl class="mt-5 grid gap-4 sm:grid-cols-2">
					<div class="rounded-xl border border-line bg-background p-4">
						<dt class="text-xs font-medium text-muted">Nama</dt>
						<dd class="mt-1 font-medium text-white">
							{userAuth.user?.displayName || 'Belum diatur'}
						</dd>
					</div>
					<div class="rounded-xl border border-line bg-background p-4">
						<dt class="text-xs font-medium text-muted">Email akun</dt>
						<dd class="mt-1 font-medium break-all text-white">
							{userAuth.user?.email || 'Tidak tersedia'}
						</dd>
					</div>
				</dl>
			{:else}
				<form class="mt-5 max-w-xl" onsubmit={save}>
					<label for="display-name" class="academy-form-label">Nama tampilan</label>
					<input id="display-name" class="academy-input" maxlength="200" bind:value={name} />
					<p class="mt-2 text-xs text-muted">Nama ini hanya digunakan sebagai label akun.</p>
					<button class="academy-button-primary mt-5" type="submit">Simpan profil</button>
				</form>
			{/if}
		</section>
	{/if}

	<a class="academy-link inline-flex min-h-11 items-center" href={resolve('/e-learning')}
		>Kembali ke katalog</a
	>
</section>
