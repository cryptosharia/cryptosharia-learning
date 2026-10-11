<script lang="ts">
	import { resolve } from '$app/paths';
	import { goto } from '$app/navigation';
	import { userAuth } from '$lib/auth.svelte';

	let email = $state('');
	let password = $state('');
	let confirmPassword = $state('');
	let showPassword = $state(false);
	let showConfirmPassword = $state(false);
	let isLoading = $state(false);
	let errorMsg = $state('');

	const passwordsMatch = $derived(password === confirmPassword);
	const formValid = $derived(email && password && confirmPassword && passwordsMatch);

	async function handleGoogleRegister() {
		isLoading = true;
		errorMsg = '';
		try {
			await userAuth.loginWithGoogle();
			goto(resolve('/'));
		} catch {
			errorMsg = userAuth.error || 'Gagal daftar dengan Google';
		} finally {
			isLoading = false;
		}
	}

	async function handleEmailRegister(e: Event) {
		e.preventDefault();
		if (!passwordsMatch) return;
		isLoading = true;
		errorMsg = '';
		try {
			await userAuth.registerWithEmail(email, password);
			goto(resolve('/'));
		} catch {
			errorMsg = userAuth.error || 'Gagal mendaftar';
		} finally {
			isLoading = false;
		}
	}
</script>

<svelte:head>
	<title>Daftar | CryptoSharia Academy</title>
</svelte:head>

<div class="flex min-h-screen flex-col bg-gray-50 dark:bg-gray-950">
	<header class="px-4 py-6">
		<a href={resolve('/')} class="group mx-auto flex w-fit items-center gap-2.5 sm:mx-0 sm:ml-8">
			<img
				src="/logo.png"
				alt="CryptoSharia"
				class="h-9 w-9 rounded-full transition-transform group-hover:scale-105"
			/>
			<span class="font-sans text-lg font-extrabold text-gray-900 dark:text-white"
				>Crypto<span class="text-primary-600 dark:text-primary-400">Sharia</span></span
			>
		</a>
	</header>

	<div class="flex flex-1 items-center justify-center px-4 pb-16">
		<div class="w-full max-w-md">
			<div class="mb-8">
				<h1 class="text-2xl font-extrabold text-gray-900 dark:text-white">
					Daftar Akun CryptoSharia
				</h1>
				<p class="mt-2 text-sm text-gray-500 dark:text-gray-400">
					Sudah memiliki akun? <a
						href={resolve('/auth/login')}
						class="font-semibold text-primary-600 transition-colors hover:text-primary-700 dark:text-primary-400 dark:hover:text-primary-300"
						>Login</a
					>
				</p>
			</div>

			{#if errorMsg}
				<div
					class="mb-6 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-600 dark:border-red-800 dark:bg-red-900/20 dark:text-red-400"
				>
					{errorMsg}
				</div>
			{/if}

			<!-- Social register -->
			<div class="mb-6 space-y-3">
				<button
					onclick={handleGoogleRegister}
					disabled={isLoading}
					class="flex w-full items-center justify-center gap-3 rounded-xl border border-gray-200 bg-white px-4 py-3 text-sm font-semibold text-gray-700 transition-all hover:border-gray-300 hover:bg-gray-50 active:scale-[0.98] disabled:opacity-50 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-200 dark:hover:border-gray-600 dark:hover:bg-gray-700"
				>
					<svg class="h-5 w-5" viewBox="0 0 24 24">
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
					Daftar dengan Google
				</button>
			</div>

			<!-- Divider -->
			<div class="relative my-6">
				<div class="absolute inset-0 flex items-center">
					<div class="w-full border-t border-gray-200 dark:border-gray-700"></div>
				</div>
				<div class="relative flex justify-center text-sm">
					<span class="bg-gray-50 px-4 text-gray-400 dark:bg-gray-950 dark:text-gray-500">atau</span
					>
				</div>
			</div>

			<!-- Form -->
			<form onsubmit={handleEmailRegister} class="space-y-5">
				<div>
					<label for="email" class="mb-2 block text-sm font-semibold text-gray-900 dark:text-white"
						>Email</label
					>
					<input
						type="email"
						id="email"
						bind:value={email}
						placeholder="Masukkan email kamu..."
						required
						class="w-full rounded-xl border border-gray-200 bg-white px-4 py-3 text-sm text-gray-900 transition-all outline-none placeholder:text-gray-400 focus:border-primary-500 focus:ring-2 focus:ring-primary-500 dark:border-gray-700 dark:bg-gray-800 dark:text-white dark:placeholder:text-gray-500"
					/>
				</div>

				<div>
					<label
						for="password"
						class="mb-2 block text-sm font-semibold text-gray-900 dark:text-white">Password</label
					>
					<div class="relative">
						<input
							type={showPassword ? 'text' : 'password'}
							id="password"
							bind:value={password}
							placeholder="Masukkan password kamu..."
							required
							class="w-full rounded-xl border border-gray-200 bg-white px-4 py-3 pr-12 text-sm text-gray-900 transition-all outline-none placeholder:text-gray-400 focus:border-primary-500 focus:ring-2 focus:ring-primary-500 dark:border-gray-700 dark:bg-gray-800 dark:text-white dark:placeholder:text-gray-500"
						/>
						<button
							type="button"
							onclick={() => (showPassword = !showPassword)}
							class="absolute top-1/2 right-3 -translate-y-1/2 text-gray-400 transition-colors hover:text-gray-600 dark:hover:text-gray-300"
							aria-label="Toggle password"
						>
							{#if showPassword}
								<svg class="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"
									><path
										stroke-linecap="round"
										stroke-linejoin="round"
										stroke-width="2"
										d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21"
									/></svg
								>
							{:else}
								<svg class="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"
									><path
										stroke-linecap="round"
										stroke-linejoin="round"
										stroke-width="2"
										d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
									/><path
										stroke-linecap="round"
										stroke-linejoin="round"
										stroke-width="2"
										d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"
									/></svg
								>
							{/if}
						</button>
					</div>
				</div>

				<div>
					<label
						for="confirmPassword"
						class="mb-2 block text-sm font-semibold text-gray-900 dark:text-white"
						>Konfirmasi Password</label
					>
					<div class="relative">
						<input
							type={showConfirmPassword ? 'text' : 'password'}
							id="confirmPassword"
							bind:value={confirmPassword}
							placeholder="Masukkan kembali password kamu..."
							required
							class="w-full rounded-xl border {confirmPassword && !passwordsMatch
								? 'border-red-400 dark:border-red-500'
								: 'border-gray-200 dark:border-gray-700'} bg-white px-4 py-3 pr-12 text-sm text-gray-900 transition-all outline-none placeholder:text-gray-400 focus:border-primary-500 focus:ring-2 focus:ring-primary-500 dark:bg-gray-800 dark:text-white dark:placeholder:text-gray-500"
						/>
						<button
							type="button"
							onclick={() => (showConfirmPassword = !showConfirmPassword)}
							class="absolute top-1/2 right-3 -translate-y-1/2 text-gray-400 transition-colors hover:text-gray-600 dark:hover:text-gray-300"
							aria-label="Toggle confirm password"
						>
							{#if showConfirmPassword}
								<svg class="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"
									><path
										stroke-linecap="round"
										stroke-linejoin="round"
										stroke-width="2"
										d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21"
									/></svg
								>
							{:else}
								<svg class="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"
									><path
										stroke-linecap="round"
										stroke-linejoin="round"
										stroke-width="2"
										d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
									/><path
										stroke-linecap="round"
										stroke-linejoin="round"
										stroke-width="2"
										d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"
									/></svg
								>
							{/if}
						</button>
					</div>
					{#if confirmPassword && !passwordsMatch}
						<p class="mt-1.5 text-xs text-red-500">Password tidak cocok</p>
					{/if}
				</div>

				<button
					type="submit"
					disabled={isLoading || !formValid}
					class="orange-glow w-full rounded-xl bg-primary-600 px-4 py-3 text-sm font-bold text-white transition-all hover:bg-primary-700 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-40"
				>
					{#if isLoading}
						<span class="inline-flex items-center gap-2">
							<svg class="h-4 w-4 animate-spin" fill="none" viewBox="0 0 24 24"
								><circle
									class="opacity-25"
									cx="12"
									cy="12"
									r="10"
									stroke="currentColor"
									stroke-width="4"
								/><path
									class="opacity-75"
									fill="currentColor"
									d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
								/></svg
							>
							Memproses...
						</span>
					{:else}
						Daftar
					{/if}
				</button>
			</form>
		</div>
	</div>
</div>
