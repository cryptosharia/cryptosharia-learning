<script lang="ts">
	import { resolve } from '$app/paths';
	import { page } from '$app/state';
	import { goto } from '$app/navigation';
	import { userAuth } from '$lib/auth.svelte';
	import { safePostLoginDestination } from '$lib/authRedirect';
	import * as publicEnv from '$env/static/public';
	import { isApiMode } from '$lib/academyConfig';

	const apiMode = isApiMode(publicEnv);
	let email = $state('');
	let password = $state('');
	let otpCode = $state('');
	let otpSent = $state(false);
	let showPassword = $state(false);
	let isLoading = $state(false);
	let errorMsg = $state('');
	let successMsg = $state('');
	const isAdminRedirect = $derived(page.url.searchParams.get('redirect') === '/admin/courses');

	async function continueAfterLogin(role?: string) {
		const destination = safePostLoginDestination(page.url.searchParams.get('redirect'), role);
		const target = new URL(destination, page.url);
		if (target.pathname === '/admin/courses') {
			await goto(resolve('/admin/courses'));
		} else if (target.pathname === '/profile') {
			if (target.hash === '#profil-akun') await goto(resolve('/profile#profil-akun'));
			else await goto(resolve('/profile'));
		} else if (target.pathname === '/') {
			await goto(resolve('/'));
		} else if (target.pathname === '/e-learning') {
			await goto(resolve('/e-learning'));
		} else {
			const [, id] = target.pathname.match(/^\/e-learning\/([A-Za-z0-9_-]+)$/) ?? [];
			if (id) {
				const path = resolve('/e-learning/[id]', { id });
				// eslint-disable-next-line svelte/no-navigation-without-resolve -- route is allowlisted above; only its validated lesson query is appended.
				await goto(`${path}${target.search}`);
			} else {
				await goto(resolve('/e-learning'));
			}
		}
	}

	async function handleGoogleLogin() {
		isLoading = true;
		errorMsg = '';
		try {
			await userAuth.loginWithGoogle();
			await continueAfterLogin(userAuth.user?.role);
		} catch {
			errorMsg = userAuth.error || 'Gagal masuk dengan Google.';
		} finally {
			isLoading = false;
		}
	}

	async function handleEmailLogin(event: SubmitEvent) {
		event.preventDefault();
		isLoading = true;
		errorMsg = '';
		try {
			await userAuth.loginWithEmail(email, password);
			await continueAfterLogin(userAuth.user?.role);
		} catch {
			errorMsg = userAuth.error || 'Email atau kata sandi tidak cocok.';
		} finally {
			isLoading = false;
		}
	}

	async function handleRequestOtp(event: Event) {
		event.preventDefault();
		if (!email || !email.includes('@')) {
			errorMsg = 'Masukkan alamat email yang valid.';
			return;
		}
		isLoading = true;
		errorMsg = '';
		successMsg = '';
		try {
			await userAuth.requestOtp(email);
			otpSent = true;
			successMsg = `Kode verifikasi 6 digit dikirim ke ${email}.`;
		} catch (error) {
			errorMsg =
				(error instanceof Error ? error.message : '') || 'Kode belum dapat dikirim. Coba lagi.';
		} finally {
			isLoading = false;
		}
	}

	async function handleVerifyOtp(event: Event) {
		event.preventDefault();
		const code = otpCode.trim();
		if (!/^\d{6}$/.test(code)) {
			errorMsg = 'Kode verifikasi harus terdiri dari 6 digit.';
			return;
		}
		isLoading = true;
		errorMsg = '';
		try {
			const user = await userAuth.verifyOtp(email, code);
			await continueAfterLogin(user.role);
		} catch (error) {
			errorMsg =
				(error instanceof Error ? error.message : '') || 'Kode tidak valid atau telah kedaluwarsa.';
		} finally {
			isLoading = false;
		}
	}
</script>

<svelte:head>
	<title>Masuk | CryptoSharia Academy</title>
	<meta
		name="description"
		content="Masuk ke CryptoSharia Academy untuk melanjutkan pembelajaran."
	/>
</svelte:head>

<div class="mx-auto flex w-full max-w-6xl flex-1 flex-col px-5 sm:px-6">
	<header class="flex min-h-16 items-center justify-between border-b border-line">
		<a href={resolve('/')} class="inline-flex min-h-11 items-center gap-3 no-underline">
			<img src="/logo.png" alt="" width="36" height="36" class="h-9 w-9 rounded-full" />
			<span class="leading-tight">
				<span class="block font-bold text-white">CryptoSharia</span>
				<span class="block text-xs text-muted">Academy</span>
			</span>
		</a>
		<a href={resolve('/e-learning')} class="academy-link inline-flex min-h-11 items-center text-sm"
			>Kembali ke kurikulum</a
		>
	</header>

	<main
		class="flex min-h-[calc(100dvh-7rem)] flex-1 flex-col justify-center gap-8 py-8 sm:py-12 lg:grid lg:min-h-0 lg:grid-cols-[minmax(0,1fr)_minmax(24rem,0.9fr)] lg:items-center lg:gap-16 lg:py-16"
	>
		<section class="hidden max-w-xl lg:block">
			<p class="text-xs font-bold tracking-[0.18em] text-primary uppercase">
				Belajar bersama Academy
			</p>
			<h1 class="mt-4 text-4xl leading-tight font-semibold tracking-tight text-white">
				Masuk untuk melanjutkan pembelajaran
			</h1>
			<p class="mt-5 text-base leading-7 text-secondary">
				Akses materi yang tersedia, lanjutkan posisi belajar, dan pantau progres Anda melalui satu
				akun CryptoSharia Academy.
			</p>
			<div class="mt-8 grid gap-3 sm:grid-cols-2">
				<div class="academy-card p-4">
					<p class="font-semibold text-white">Kurikulum terstruktur</p>
					<p class="mt-1 text-sm leading-6 text-muted">Empat bidang pembelajaran modular.</p>
				</div>
				<div class="academy-card p-4">
					<p class="font-semibold text-white">Progres pribadi</p>
					<p class="mt-1 text-sm leading-6 text-muted">
						Posisi belajar dan status selesai tercatat terpisah.
					</p>
				</div>
			</div>
		</section>

		<section
			class="academy-card-raised mx-auto w-full max-w-lg p-5 sm:p-8"
			aria-labelledby="login-title"
		>
			<div class="mb-6">
				<p class="text-xs font-bold tracking-[0.16em] text-primary uppercase">Akun Academy</p>
				<h2 id="login-title" class="mt-2 text-2xl font-semibold text-white">
					Masuk ke CryptoSharia Academy
				</h2>
				<p class="mt-2 text-sm leading-6 text-secondary">
					{#if apiMode}
						Gunakan email untuk menerima kode verifikasi dan mengakses pembelajaran.
					{:else}
						Masuk untuk melihat katalog dan melanjutkan pembelajaran Anda.
					{/if}
				</p>
				{#if isAdminRedirect}
					<p
						class="mt-3 rounded-lg border border-primary/30 bg-primary/10 p-3 text-sm text-secondary"
					>
						Setelah masuk, akun dengan hak admin akan kembali ke Panel Admin.
					</p>
				{/if}
			</div>

			{#if errorMsg}
				<div
					role="alert"
					class="mb-5 rounded-xl border border-danger/30 bg-danger/10 px-4 py-3 text-sm text-danger"
				>
					{errorMsg}
				</div>
			{/if}
			{#if successMsg}
				<div
					role="status"
					class="mb-5 rounded-xl border border-success/30 bg-success/10 px-4 py-3 text-sm text-success"
				>
					{successMsg}
				</div>
			{/if}

			{#if apiMode}
				{#if !otpSent}
					<form onsubmit={handleRequestOtp} class="space-y-5" aria-busy={isLoading}>
						<div>
							<label for="email" class="academy-form-label">Email akun</label>
							<input
								type="email"
								id="email"
								bind:value={email}
								autocomplete="email"
								placeholder="nama@email.com"
								required
								class="academy-input"
							/>
						</div>
						<button
							type="submit"
							disabled={isLoading || !email}
							class="academy-button-primary w-full"
						>
							{isLoading ? 'Mengirim kode…' : 'Kirim kode OTP'}
						</button>
					</form>
				{:else}
					<form onsubmit={handleVerifyOtp} class="space-y-5" aria-busy={isLoading}>
						<div>
							<label for="otpCode" class="academy-form-label">Kode verifikasi</label>
							<p class="mb-3 text-sm text-muted">Masukkan 6 digit kode yang dikirim ke {email}.</p>
							<input
								type="text"
								id="otpCode"
								bind:value={otpCode}
								placeholder="000000"
								maxlength="6"
								pattern="[0-9][0-9][0-9][0-9][0-9][0-9]"
								inputmode="numeric"
								autocomplete="one-time-code"
								required
								class="academy-input text-center font-mono text-xl tracking-[0.35em]"
							/>
						</div>
						<button
							type="submit"
							disabled={isLoading || otpCode.trim().length !== 6}
							class="academy-button-primary w-full"
						>
							{isLoading ? 'Memverifikasi…' : 'Verifikasi dan masuk'}
						</button>
						<div class="flex flex-wrap items-center justify-between gap-2 pt-1 text-sm">
							<button
								type="button"
								class="academy-link inline-flex min-h-11 items-center"
								disabled={isLoading}
								onclick={() => {
									otpSent = false;
									otpCode = '';
									errorMsg = '';
									successMsg = '';
								}}>Ganti email</button
							>
							<button
								type="button"
								class="academy-link inline-flex min-h-11 items-center"
								disabled={isLoading}
								onclick={(event) => void handleRequestOtp(event)}
							>
								Kirim ulang kode
							</button>
						</div>
					</form>
				{/if}
			{:else}
				<div class="mb-6">
					<button
						type="button"
						onclick={handleGoogleLogin}
						disabled={isLoading}
						class="academy-button-secondary w-full gap-3"
					>
						<svg aria-hidden="true" class="h-5 w-5" viewBox="0 0 24 24">
							<path
								d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 01-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z"
								fill="#4285F4"
							/>
							<path
								d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
								fill="#34A853"
							/>
							<path
								d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
								fill="#FBBC05"
							/>
							<path
								d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
								fill="#EA4335"
							/>
						</svg>
						Masuk dengan Google
					</button>
					<div class="my-5 flex items-center gap-3 text-xs text-muted">
						<span class="h-px flex-1 bg-line"></span><span>atau email dan kata sandi</span><span
							class="h-px flex-1 bg-line"
						></span>
					</div>
					<form onsubmit={handleEmailLogin} class="space-y-4" aria-busy={isLoading}>
						<div>
							<label for="email" class="academy-form-label">Email</label>
							<input
								type="email"
								id="email"
								bind:value={email}
								autocomplete="email"
								placeholder="nama@email.com"
								required
								class="academy-input"
							/>
						</div>
						<div>
							<label for="password" class="academy-form-label">Kata sandi</label>
							<div class="relative">
								<input
									type={showPassword ? 'text' : 'password'}
									id="password"
									bind:value={password}
									autocomplete="current-password"
									placeholder="Kata sandi"
									required
									class="academy-input pr-14"
								/>
								<button
									type="button"
									class="absolute inset-y-0 right-2 my-1 min-h-10 rounded-lg px-3 text-xs font-semibold text-muted hover:text-white"
									aria-label={showPassword ? 'Sembunyikan kata sandi' : 'Tampilkan kata sandi'}
									onclick={() => (showPassword = !showPassword)}
								>
									{showPassword ? 'Sembunyikan' : 'Lihat'}
								</button>
							</div>
						</div>
						<button
							type="submit"
							disabled={isLoading || !email || !password}
							class="academy-button-primary w-full"
						>
							{isLoading ? 'Memproses…' : 'Masuk'}
						</button>
					</form>
				</div>
			{/if}

			{#if !apiMode}
				<p class="border-t border-line pt-5 text-sm text-secondary">
					Belum punya akun? <a href={resolve('/auth/register')} class="academy-link"
						>Daftar sekarang</a
					>
				</p>
			{/if}
		</section>
	</main>

	<footer class="border-t border-line py-5 text-center text-xs text-muted">
		Masuk dengan aman ke ruang belajar CryptoSharia Academy.
	</footer>
</div>
