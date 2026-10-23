<script lang="ts">
	import { resolve } from '$app/paths';
	import { userAuth } from '$lib/auth.svelte';

	let email = $state('');
	let loading = $state(false);
	let submitted = $state(false);
	let message = $state('');

	async function submit(event: SubmitEvent) {
		event.preventDefault();
		loading = true;
		message = '';
		try {
			await userAuth.requestPasswordReset(email.trim());
			submitted = true;
		} catch {
			message = userAuth.error || 'Permintaan belum dapat diproses. Coba lagi nanti.';
		} finally {
			loading = false;
		}
	}
</script>

<svelte:head>
	<title>Lupa kata sandi | CryptoSharia Academy</title>
	<meta name="robots" content="noindex, nofollow" />
	<meta name="referrer" content="no-referrer" />
</svelte:head>

<main class="mx-auto flex min-h-[70dvh] w-full max-w-xl items-center px-5 py-10 sm:px-6">
	<section class="academy-card-raised w-full p-5 sm:p-8" aria-labelledby="forgot-title">
		<a class="academy-link inline-flex min-h-11 items-center text-sm" href={resolve('/auth/login')}
			>Kembali ke login</a
		>
		{#if submitted}
			<div class="py-6 text-center">
				<p class="text-xs font-bold tracking-[0.16em] text-primary uppercase">
					Permintaan diterima
				</p>
				<h1 id="forgot-title" class="mt-2 text-2xl font-semibold text-white">Periksa email Anda</h1>
				<p class="mt-3 text-sm leading-6 text-secondary">
					Jika email tersebut terdaftar, tautan reset akan dikirim. Tautan berlaku selama 15 menit.
				</p>
			</div>
		{:else}
			<h1 id="forgot-title" class="mt-4 text-2xl font-semibold text-white">Lupa kata sandi?</h1>
			<p class="mt-2 text-sm leading-6 text-secondary">
				Masukkan email akun untuk menerima tautan reset.
			</p>
			{#if message}<p
					role="alert"
					class="mt-4 rounded-xl border border-danger/30 bg-danger/10 p-3 text-sm text-danger"
				>
					{message}
				</p>{/if}
			<form class="mt-6 space-y-5" onsubmit={submit} aria-busy={loading}>
				<div>
					<label class="academy-form-label" for="forgot-email">Email akun</label>
					<input
						id="forgot-email"
						class="academy-input"
						type="email"
						bind:value={email}
						autocomplete="email"
						maxlength="255"
						required
					/>
				</div>
				<button class="academy-button-primary w-full" type="submit" disabled={loading || !email}>
					{loading ? 'Mengirim permintaan…' : 'Kirim tautan reset'}
				</button>
			</form>
		{/if}
	</section>
</main>
