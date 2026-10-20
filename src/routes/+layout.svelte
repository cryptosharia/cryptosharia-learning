<script lang="ts">
	import '../app.css';
	import { resolve } from '$app/paths';
	import { page } from '$app/state';
	import { goto } from '$app/navigation';
	import { theme } from '$lib/theme.svelte';
	import { userAuth } from '$lib/auth.svelte';

	let { children } = $props();
	let mobileMenuOpen = $state(false);
	let logoutError = $state('');
	/** Tracks the current URL hash, updated on hashchange without full reload. */
	let currentHash = $state('');
	const isAuthRoute = $derived(page.url.pathname.startsWith('/auth/'));
	const isAdminRoute = $derived(page.url.pathname.startsWith('/admin/'));
	const hideSiteChrome = $derived(isAuthRoute || isAdminRoute);
	const navLinks = $derived(
		userAuth.isLoggedIn
			? [
					{ label: 'Kurikulum', href: '/e-learning' },
					{ label: 'Pembelajaran Saya', href: '/profile' },
					{ label: 'Profil', href: '/profile#profil-akun' }
				]
			: [
					{ label: 'Beranda', href: '/' },
					{ label: 'Kurikulum', href: '/e-learning' },
					{ label: 'Masuk', href: '/auth/login' }
				]
	);

	$effect(() => {
		theme.init();
		return userAuth.init();
	});
	$effect(() => {
		if (page.url.href) {
			mobileMenuOpen = false;
			// Sync hash state whenever SvelteKit navigation occurs
			currentHash = page.url.hash;
		}
	});

	/** Detect in-page hash changes (e.g. clicking <a href="#profil-akun">)
	 *  without triggering a full SvelteKit navigation. */
	function handleHashChange() {
		currentHash = window.location.hash;
	}

	/**
	 * Returns true when this nav link should be marked as the current page.
	 * Rules:
	 *   /profile              → active only when on /profile AND hash is empty
	 *   /profile#profil-akun → active only when on /profile AND hash is #profil-akun
	 *   All other links       → active when pathname matches (hash ignored)
	 */
	function isCurrent(href: string) {
		const [path, fragment] = href.split('#');
		if (path === '/') return page.url.pathname === '/';
		const pathMatch =
			page.url.pathname === path || page.url.pathname.startsWith(`${path}/`);
		if (!pathMatch) return false;
		// For links that share the same path but differ by hash,
		// use the reactive hash to distinguish them.
		if (fragment !== undefined) {
			return currentHash === `#${fragment}`;
		}
		// For /profile (no fragment): active only when no #profil-akun hash
		if (path === '/profile') {
			return currentHash !== '#profil-akun';
		}
		return true;
	}

	async function logout() {
		logoutError = '';
		try {
			await userAuth.logout();
			mobileMenuOpen = false;
			await goto(resolve('/'));
		} catch {
			logoutError = userAuth.error || 'Keluar belum berhasil. Silakan coba kembali.';
		}
	}

	function handleKeydown(event: KeyboardEvent) {
		if (event.key === 'Escape') mobileMenuOpen = false;
	}
</script>

<svelte:window onkeydown={handleKeydown} onhashchange={handleHashChange} />

<div class="flex min-h-screen flex-col bg-background text-foreground">
	{#if !hideSiteChrome}
		<header class="sticky top-0 z-40 border-b border-line bg-background/95 backdrop-blur">
			<div class="mx-auto flex max-w-6xl items-center gap-3 px-5 py-3 sm:px-6">
				<a
					href={resolve('/')}
					aria-label="CryptoSharia Academy, beranda"
					class="mr-auto inline-flex min-h-11 items-center gap-3 rounded-lg no-underline focus-visible:outline"
				>
					<img src="/logo.png" alt="" width="36" height="36" class="h-9 w-9 rounded-full" />
					<span class="leading-tight">
						<span class="block font-bold text-white">CryptoSharia</span>
						<span class="block text-xs text-muted">Academy</span>
					</span>
				</a>

				<nav aria-label="Navigasi utama" class="hidden items-center gap-1 md:flex">
					{#each navLinks as link (link.label)}
						<a
							href={link.href === '/'
								? resolve('/')
								: link.href === '/auth/login'
									? resolve('/auth/login')
									: link.href === '/profile'
										? resolve('/profile')
										: link.href === '/profile#profil-akun'
											? resolve('/profile#profil-akun')
											: resolve('/e-learning')}
							aria-current={isCurrent(link.href) ? 'page' : undefined}
							class={`inline-flex min-h-11 items-center rounded-lg px-3 text-sm no-underline transition hover:bg-surface hover:text-white ${isCurrent(link.href) ? 'font-semibold text-primary' : 'text-secondary'}`}
							>{link.label}</a
						>
					{/each}
				</nav>

				{#if userAuth.isLoggedIn}
					<div class="hidden items-center gap-3 md:flex">
						{#if userAuth.user?.displayName || userAuth.user?.email}
							<span class="max-w-40 truncate text-xs text-muted">
								{userAuth.user.displayName || userAuth.user.email}
							</span>
						{/if}
						<button class="academy-button-secondary min-h-11 px-4" onclick={() => void logout()}
							>Keluar</button
						>
					</div>
				{/if}

				<button
					type="button"
					class="academy-icon-button ml-1 md:hidden"
					aria-label={mobileMenuOpen ? 'Tutup navigasi' : 'Buka navigasi'}
					aria-expanded={mobileMenuOpen}
					aria-controls="academy-mobile-menu"
					onclick={() => (mobileMenuOpen = !mobileMenuOpen)}
				>
					{#if mobileMenuOpen}
						<svg
							aria-hidden="true"
							viewBox="0 0 24 24"
							class="h-5 w-5"
							fill="none"
							stroke="currentColor"
							stroke-width="2"
						>
							<path d="m6 6 12 12M18 6 6 18" />
						</svg>
					{:else}
						<svg
							aria-hidden="true"
							viewBox="0 0 24 24"
							class="h-5 w-5"
							fill="none"
							stroke="currentColor"
							stroke-width="2"
						>
							<path d="M4 7h16M4 12h16M4 17h16" />
						</svg>
					{/if}
				</button>
			</div>

			{#if mobileMenuOpen}
				<nav
					id="academy-mobile-menu"
					aria-label="Navigasi mobile"
					class="border-t border-line bg-surface px-5 py-3 md:hidden"
				>
					<div class="mx-auto grid max-w-6xl gap-1">
						{#each navLinks as link (link.label)}
							<a
								href={link.href === '/'
									? resolve('/')
									: link.href === '/auth/login'
										? resolve('/auth/login')
										: link.href === '/profile'
											? resolve('/profile')
											: link.href === '/profile#profil-akun'
												? resolve('/profile#profil-akun')
												: resolve('/e-learning')}
								aria-current={isCurrent(link.href) ? 'page' : undefined}
								class={`flex min-h-11 items-center rounded-lg px-3 text-sm no-underline hover:bg-background ${isCurrent(link.href) ? 'font-semibold text-primary' : 'text-secondary'}`}
								>{link.label}</a
							>
						{/each}
						{#if userAuth.isLoggedIn}
							<div class="mt-2 flex items-center justify-between border-t border-line pt-3">
								<span class="max-w-[65%] truncate text-xs text-muted">
									{userAuth.user?.displayName || userAuth.user?.email || 'Akun Academy'}
								</span>
								<button class="academy-button-secondary min-h-11 px-4" onclick={() => void logout()}
									>Keluar</button
								>
							</div>
						{/if}
					</div>
				</nav>
			{/if}
			{#if logoutError}<p role="alert" class="mx-auto max-w-6xl px-5 pb-3 text-sm text-danger">
					{logoutError}
				</p>{/if}
		</header>
	{/if}

	<main class="flex-1">{@render children()}</main>

	{#if !hideSiteChrome}
		<footer class="border-t border-line px-5 py-6 sm:px-6">
			<div
				class="mx-auto flex max-w-6xl flex-col gap-3 text-sm text-muted sm:flex-row sm:items-center sm:justify-between"
			>
				<p>CryptoSharia Academy · Pembelajaran mandiri berbasis modul</p>
				<a class="academy-link w-fit" href={resolve('/e-learning')}>Jelajahi kurikulum</a>
			</div>
		</footer>
	{/if}
</div>
