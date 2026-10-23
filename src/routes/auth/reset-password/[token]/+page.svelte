<script lang="ts">
	import { resolve } from '$app/paths';
	import { page } from '$app/state';
	import { goto } from '$app/navigation';
	import { userAuth } from '$lib/auth.svelte';

	let password = $state('');
	let confirmPassword = $state('');
	let loading = $state(false);
	let completed = $state(false);
	let showPassword = $state(false);
	let message = $state('');

	async function submit(event: SubmitEvent) {
		event.preventDefault();
		message = '';
		const token = page.params.token;
		if (!token || !/^[A-Za-z0-9_-]{43}$/.test(token)) {
			message = 'Tautan reset tidak valid atau telah kedaluwarsa.';
			return;
		}
		if (password.length < 12 || password.length > 128) {
			message = 'Kata sandi harus terdiri dari 12 sampai 128 karakter.';
			return;
		}
		if (password !== confirmPassword) {
			message = 'Konfirmasi kata sandi tidak cocok.';
			return;
		}
		loading = true;
		try {
			await userAuth.resetPassword(token, password);
			completed = true;
			password = '';
			confirmPassword = '';
		} catch {
			message =
				userAuth.error || 'Tautan reset tidak valid atau telah kedaluwarsa. Minta tautan baru.';
		} finally {
			loading = false;
		}
	}
</script>

<svelte:head>
	<title>Atur kata sandi | CryptoSharia Academy</title>
	<meta name="robots" content="noindex, nofollow" />
	<meta name="referrer" content="no-referrer" />
</svelte:head>

<main class="mx-auto flex min-h-[70dvh] w-full max-w-xl items-center px-5 py-10 sm:px-6">
	<section class="academy-card-raised w-full p-5 sm:p-8" aria-labelledby="reset-title">
		<a class="academy-link inline-flex min-h-11 items-center text-sm" href={resolve('/auth/login')}
			>Kembali ke login</a
		>
		{#if completed}
			<div class="py-6 text-center">
				<h1 id="reset-title" class="text-2xl font-semibold text-white">Kata sandi diperbarui</h1>
				<p class="mt-3 text-sm leading-6 text-secondary">
					Anda dapat masuk dengan kata sandi baru.
				</p>
				<button
					class="academy-button-primary mt-6"
					type="button"
					onclick={() => goto(resolve('/auth/login'))}>Masuk</button
				>
			</div>
		{:else}
			<h1 id="reset-title" class="mt-4 text-2xl font-semibold text-white">Atur kata sandi baru</h1>
			<p class="mt-2 text-sm leading-6 text-secondary">Gunakan 12 sampai 128 karakter.</p>
			{#if message}<p
					role="alert"
					class="mt-4 rounded-xl border border-danger/30 bg-danger/10 p-3 text-sm text-danger"
				>
					{message}
				</p>{/if}
			<form class="mt-6 space-y-5" onsubmit={submit} aria-busy={loading}>
				<div>
					<label class="academy-form-label" for="reset-password">Kata sandi baru</label>
					<div class="relative">
						<input
							id="reset-password"
							class="academy-input pr-20"
							type={showPassword ? 'text' : 'password'}
							bind:value={password}
							autocomplete="new-password"
							minlength="12"
							maxlength="128"
							required
						/>
						<button
							type="button"
							class="absolute inset-y-0 right-2 px-3 text-xs text-muted hover:text-white"
							aria-label={showPassword ? 'Sembunyikan kata sandi' : 'Tampilkan kata sandi'}
							onclick={() => (showPassword = !showPassword)}
							>{showPassword ? 'Sembunyikan' : 'Lihat'}</button
						>
					</div>
				</div>
				<div>
					<label class="academy-form-label" for="reset-confirm">Konfirmasi kata sandi</label>
					<input
						id="reset-confirm"
						class="academy-input"
						type="password"
						bind:value={confirmPassword}
						autocomplete="new-password"
						minlength="12"
						maxlength="128"
						required
					/>
				</div>
				<button class="academy-button-primary w-full" type="submit" disabled={loading}>
					{loading ? 'Menyimpan…' : 'Atur kata sandi'}
				</button>
			</form>
		{/if}
	</section>
</main>
