<script lang="ts">
	import '../app.css';
	import { resolve } from '$app/paths';
	import { theme } from '$lib/theme.svelte';
	import { userAuth } from '$lib/auth.svelte';

	let { children } = $props();
	$effect(() => {
		theme.init();
		return userAuth.init();
	});
</script>

<div class="flex min-h-screen flex-col bg-background text-foreground">
	<header class="border-b px-5 py-4">
		<nav aria-label="Navigasi Academy" class="mx-auto flex max-w-6xl flex-wrap items-center gap-4">
			<a
				href={resolve('/')}
				aria-label="CryptoSharia Academy"
				class="mr-auto inline-flex items-center gap-2.5 font-bold no-underline"
			>
				<img
					src="/logo.png"
					alt=""
					width="32"
					height="32"
					class="h-8 w-8 rounded-full object-contain"
				/>
				<span>CryptoSharia Academy</span>
			</a>
			<a href={resolve('/e-learning')} class="underline">Katalog</a>
			<a href={resolve('/profile')} class="underline">Dashboard</a>
			{#if userAuth.isLoggedIn}
				<button type="button" class="rounded border px-3 py-2" onclick={() => userAuth.logout()}
					>Keluar</button
				>
			{:else}
				<a href={resolve('/auth/login')} class="underline">Masuk</a>
			{/if}
		</nav>
	</header>
	<main class="flex-1">{@render children()}</main>
	<footer class="border-t px-5 py-6 text-center text-sm">
		CryptoSharia Academy · Pembelajaran mandiri berbasis modul
	</footer>
</div>
