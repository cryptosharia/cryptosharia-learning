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
	let setPasswordOtpSent = $state(false);
	let setPasswordOtpCode = $state('');
	let newPassword = $state('');
	let confirmPassword = $state('');
	let settingPassword = $state(false);
	let showNewPassword = $state(false);
	let passwordMessage = $state('');

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

	async function requestPasswordSetupCode() {
		const email = userAuth.user?.email;
		if (!email) return;
		settingPassword = true;
		passwordMessage = '';
		try {
			await userAuth.requestOtp(email);
			setPasswordOtpSent = true;
			passwordMessage = 'Jika email dapat menerima kode, OTP telah dikirim.';
		} catch {
			passwordMessage = 'Kode belum dapat dikirim. Coba lagi nanti.';
		} finally {
			settingPassword = false;
		}
	}

	async function submitPasswordSetup(event: SubmitEvent) {
		event.preventDefault();
		if (newPassword.length < 12 || newPassword.length > 128) {
			passwordMessage = 'Kata sandi harus terdiri dari 12 sampai 128 karakter.';
			return;
		}
		if (newPassword !== confirmPassword) {
			passwordMessage = 'Konfirmasi kata sandi tidak cocok.';
			return;
		}
		settingPassword = true;
		passwordMessage = '';
		try {
			await userAuth.setPassword(setPasswordOtpCode.trim(), newPassword);
			passwordMessage =
				'Kata sandi berhasil dibuat. Anda dapat menggunakannya saat login berikutnya.';
			setPasswordOtpSent = false;
			setPasswordOtpCode = '';
			newPassword = '';
			confirmPassword = '';
		} catch {
			passwordMessage =
				userAuth.error || 'Kata sandi belum dapat diatur. Periksa kode OTP dan coba lagi.';
		} finally {
			settingPassword = false;
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
				<section class="mt-7 border-t border-line pt-6" aria-labelledby="password-title">
					<h3 id="password-title" class="font-semibold text-white">Kata sandi</h3>
					{#if userAuth.user?.hasPassword}
						<p class="mt-2 text-sm leading-6 text-secondary">
							Kata sandi sudah aktif untuk akun ini.
						</p>
						<a
							class="academy-link mt-2 inline-flex min-h-11 items-center"
							href={resolve('/auth/forgot-password')}>Atur ulang kata sandi</a
						>
					{:else if !setPasswordOtpSent}
						<p class="mt-2 text-sm leading-6 text-secondary">
							Akun OTP Anda belum memiliki kata sandi. Verifikasi email untuk membuatnya.
						</p>
						<button
							type="button"
							class="academy-button-secondary mt-4"
							disabled={settingPassword}
							onclick={requestPasswordSetupCode}
						>
							{settingPassword ? 'Mengirim kode…' : 'Kirim kode verifikasi'}
						</button>
					{:else}
						<form class="mt-4 max-w-xl space-y-4" onsubmit={submitPasswordSetup}>
							<div>
								<label for="setup-otp" class="academy-form-label">Kode verifikasi email</label>
								<input
									id="setup-otp"
									class="academy-input text-center font-mono tracking-[0.3em]"
									bind:value={setPasswordOtpCode}
									inputmode="numeric"
									autocomplete="one-time-code"
									maxlength="6"
									pattern="[0-9][0-9][0-9][0-9][0-9][0-9]"
									required
								/>
							</div>
							<div>
								<label for="setup-password" class="academy-form-label">Kata sandi baru</label>
								<div class="relative">
									<input
										id="setup-password"
										class="academy-input pr-20"
										type={showNewPassword ? 'text' : 'password'}
										bind:value={newPassword}
										autocomplete="new-password"
										minlength="12"
										maxlength="128"
										required
									/>
									<button
										type="button"
										class="absolute inset-y-0 right-2 px-3 text-xs text-muted hover:text-white"
										aria-label={showNewPassword ? 'Sembunyikan kata sandi' : 'Tampilkan kata sandi'}
										onclick={() => (showNewPassword = !showNewPassword)}
										>{showNewPassword ? 'Sembunyikan' : 'Lihat'}</button
									>
								</div>
							</div>
							<div>
								<label for="setup-confirm-password" class="academy-form-label"
									>Konfirmasi kata sandi</label
								>
								<input
									id="setup-confirm-password"
									class="academy-input"
									type="password"
									bind:value={confirmPassword}
									autocomplete="new-password"
									minlength="12"
									maxlength="128"
									required
								/>
							</div>
							<button
								type="submit"
								class="academy-button-primary"
								disabled={settingPassword || setPasswordOtpCode.trim().length !== 6}
							>
								{settingPassword ? 'Menyimpan…' : 'Buat kata sandi'}
							</button>
						</form>
					{/if}
					{#if passwordMessage}
						<p role="status" class="mt-3 text-sm text-secondary">{passwordMessage}</p>
					{/if}
				</section>
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
