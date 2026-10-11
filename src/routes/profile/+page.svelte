<script lang="ts">
	import { onMount } from 'svelte';
	import { onAuthStateChanged } from 'firebase/auth';
	import { doc, getDocFromServer, setDoc, serverTimestamp } from 'firebase/firestore';
	import { resolve } from '$app/paths';
	import { auth, db, ensureFirebaseReady } from '$lib/firebase';
	import { userAuth } from '$lib/auth.svelte';
	import AcademyDashboard from '$lib/components/AcademyDashboard.svelte';
	let name = $state(''),
		status = $state('Memuat akun…'),
		signed = $state(false);
	let generation = 0;
	onMount(() => {
		const stop = onAuthStateChanged(auth, (user) => {
			const g = ++generation;
			name = '';
			signed = !!user;
			status = user ? 'Memuat profil…' : 'Masuk untuk melihat profil.';
			if (!user) return;
			void ensureFirebaseReady()
				.then(() => getDocFromServer(doc(db, 'users', user.uid)))
				.then((snap) => {
					if (g === generation && auth.currentUser?.uid === user.uid) {
						name = snap.data()?.displayName ?? '';
						status = 'Profil siap.';
					}
				})
				.catch(() => {
					if (g === generation) status = 'Backend profil tidak tersedia.';
				});
		});
		return () => {
			generation++;
			stop();
		};
	});
	async function save() {
		const uid = auth.currentUser?.uid,
			g = generation;
		if (!uid) return;
		status = 'Menyimpan…';
		try {
			await setDoc(
				doc(db, 'users', uid),
				{ displayName: name, updatedAt: serverTimestamp() },
				{ merge: true }
			);
			if (g === generation && auth.currentUser?.uid === uid) status = 'Profil tersimpan.';
		} catch {
			if (g === generation) status = 'Penyimpanan ditolak atau backend tidak tersedia.';
		}
	}
</script>

<svelte:head><title>Profil | CryptoSharia Academy</title></svelte:head>
<section class="mx-auto max-w-3xl px-6 py-24">
	<h1 class="text-2xl font-bold">Profil Academy</h1>
	<AcademyDashboard />
	<p role="status">{status}</p>
	{#if signed}<form
			onsubmit={(e) => {
				e.preventDefault();
				void save();
			}}
		>
			<label
				>Nama tampilan<input
					class="my-4 block rounded border p-2"
					maxlength="200"
					bind:value={name}
				/></label
			><button class="rounded border p-2">Simpan profil</button>
		</form>
		<button class="my-4 rounded border p-2" onclick={() => userAuth.logout()}>Keluar</button>{/if}<a
		class="block"
		href={resolve('/e-learning')}>Katalog Academy</a
	>
</section>
