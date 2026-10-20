<script lang="ts">
	import { beforeNavigate } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { SvelteURLSearchParams } from 'svelte/reactivity';
	import { onMount } from 'svelte';
	import type { PageData } from './$types';
	import type { AdminContentDto, ScopeDto, AdminStatsDto, AdminGrantDto } from '$lib/academyDtos';
	import { parseYouTubeUrl } from '$lib/youtube';
	import { subjects } from '$lib/academyCurriculum';

	let { data }: { data: PageData } = $props();

	type TabType = 'overview' | 'curriculum' | 'editor' | 'workflow' | 'scopes' | 'grants';
	let activeTab = $state<TabType>('overview');

	// Data states
	let stats = $state<AdminStatsDto | null>(null);
	let scopes = $state<ScopeDto[]>([]);
	let contentItems = $state<AdminContentDto[]>([]);
	let grants = $state<AdminGrantDto[]>([]);

	// Async state
	let loading = $state(false);
	let busy = $state(false);
	let statsLoading = $state(false);
	let statsError = $state('');
	let contentLoaded = $state(false);
	let contentError = $state(false);
	let errorMessage = $state('');
	let successMessage = $state('');

	// Filters
	let filterSubject = $state('all');
	let filterStatus = $state('all');
	let filterKind = $state('all');

	// Form Editor states
	let isEditing = $state(false);
	let editId = $state('');
	let formKind = $state<'subject' | 'level' | 'chapter' | 'lesson'>('lesson');
	let formParentId = $state('');
	let formSubjectId = $state<'fundamental' | 'technical' | 'muamalah' | 'web3'>('fundamental');
	let formLevel = $state(1);
	let formChapterNumber = $state(1);
	let formOrder = $state(0);
	let formScopeId = $state('');
	let formTitle = $state('');
	let formDescription = $state('');
	let formThumbnail = $state('/favicon.png');
	let formDurationMinutes = $state(10);
	let formInstructor = $state('');
	let formSyariahRequired = $state(false);

	// Video Media states
	let formVideoUrl = $state('');
	let parsedVideo = $derived(parseYouTubeUrl(formVideoUrl));
	let formInternalNote = $state('');
	let editorBaseline = $state('');
	let editorValue = $derived(
		JSON.stringify({
			formKind,
			formParentId,
			formSubjectId,
			formLevel,
			formChapterNumber,
			formOrder,
			formScopeId,
			formTitle,
			formDescription,
			formThumbnail,
			formDurationMinutes,
			formInstructor,
			formSyariahRequired,
			formVideoUrl,
			formInternalNote
		})
	);
	let editorHasUnsavedChanges = $derived(editorBaseline !== '' && editorValue !== editorBaseline);

	// Scope Modal/Form states
	let newScopeId = $state('');
	let newScopeName = $state('');
	let newScopeDesc = $state('');

	// Grant Form states
	let grantUserId = $state('');
	let grantScopeId = $state('');
	let grantDurationDays = $state(365);

	// Auto-clear messages
	function showSuccess(msg: string) {
		successMessage = msg;
		errorMessage = '';
		setTimeout(() => {
			if (successMessage === msg) successMessage = '';
		}, 5000);
	}

	function showError(msg: string) {
		errorMessage = msg;
		successMessage = '';
	}

	function confirmDiscardEditorChanges() {
		if (!editorHasUnsavedChanges) return true;
		if (!confirm('Perubahan belum disimpan. Buang perubahan ini dan lanjutkan?')) return false;
		resetEditor();
		return true;
	}

	function canSelectTab(nextTab: TabType) {
		return nextTab === activeTab || confirmDiscardEditorChanges();
	}

	function contentKindLabel(kind: AdminContentDto['kind']) {
		return { subject: 'Subjek', level: 'Level', chapter: 'Bab', lesson: 'Pelajaran' }[kind];
	}

	function subjectLabel(item: AdminContentDto) {
		return (
			contentItems.find((record) => record.kind === 'subject' && record.id === item.subjectId)
				?.title ??
			subjects.find((subject) => subject.id === item.subjectId)?.title ??
			'Subjek tidak tersedia'
		);
	}

	function parentLabel(item: AdminContentDto) {
		if (item.kind === 'subject') return 'Akar kurikulum';
		const parent = contentItems.find((record) => record.id === item.parentId);
		if (parent) return parent.title;
		if (item.kind === 'level') return subjectLabel(item);
		if (item.kind === 'chapter') return `Level ${item.level}`;
		return `Bab ${item.chapterNumber}`;
	}

	function curriculumPath(item: AdminContentDto) {
		const subject = subjectLabel(item);
		const level =
			contentItems.find(
				(record) =>
					record.kind === 'level' &&
					record.subjectId === item.subjectId &&
					record.level === item.level
			)?.title ?? `Level ${item.level}`;
		const chapter =
			contentItems.find(
				(record) =>
					record.kind === 'chapter' &&
					record.subjectId === item.subjectId &&
					record.level === item.level &&
					record.chapterNumber === item.chapterNumber
			)?.title ?? `Bab ${item.chapterNumber}`;
		if (item.kind === 'subject') return subject;
		if (item.kind === 'level') return `${subject} → ${item.title}`;
		if (item.kind === 'chapter') return `${subject} → ${level} → ${item.title}`;
		return `${subject} → ${level} → ${chapter} → ${item.title}`;
	}

	// Fetch helper methods
	async function loadStats() {
		statsLoading = true;
		statsError = '';
		try {
			const res = await fetch('/api/academy/admin/stats');
			if (!res.ok) throw new Error('Ringkasan belum dapat dimuat.');
			stats = await res.json();
		} catch {
			statsError = 'Ringkasan belum dapat dimuat. Coba segarkan data.';
		} finally {
			statsLoading = false;
		}
	}

	async function loadScopes() {
		try {
			const res = await fetch('/api/academy/admin/scopes');
			if (res.ok) scopes = await res.json();
		} catch (e) {
			console.error('Failed to load scopes', e);
		}
	}

	async function loadContent() {
		loading = true;
		contentLoaded = false;
		contentError = false;
		try {
			const query = new SvelteURLSearchParams();
			if (filterStatus !== 'all') query.set('status', filterStatus);
			if (filterKind !== 'all') query.set('kind', filterKind);
			if (filterSubject !== 'all') query.set('subjectId', filterSubject);

			const res = await fetch(`/api/academy/admin/content?${query.toString()}`);
			if (res.ok) {
				contentItems = await res.json();
				contentLoaded = true;
			} else {
				const err = await res.json();
				contentError = true;
				showError(err.message || 'Gagal memuat daftar konten');
			}
		} catch {
			contentError = true;
			showError('Koneksi ke server terputus');
		} finally {
			loading = false;
		}
	}

	async function loadGrants() {
		loading = true;
		try {
			const res = await fetch('/api/academy/admin/grants');
			if (res.ok) {
				grants = await res.json();
			} else {
				const err = await res.json();
				showError(err.message || 'Gagal memuat daftar hak akses siswa');
			}
		} catch {
			showError('Koneksi ke server terputus');
		} finally {
			loading = false;
		}
	}

	onMount(() => {
		if (data.initialStats) stats = data.initialStats;
		if (data.initialScopes) scopes = data.initialScopes;
		if (data.initialContent) contentItems = data.initialContent;
		void loadStats();
		void loadScopes();
		void loadContent();
	});

	// Filtered Content
	let filteredItems = $derived(
		contentItems.filter((item) => {
			if (filterSubject !== 'all' && item.subjectId !== filterSubject) return false;
			if (filterStatus !== 'all' && item.status !== filterStatus) return false;
			if (filterKind !== 'all' && item.kind !== filterKind) return false;
			return true;
		})
	);
	let structureCount = $derived(contentItems.filter((item) => item.kind !== 'lesson').length);
	let approvedCount = $derived(contentItems.filter((item) => item.status === 'approved').length);

	// Editor Actions
	function resetEditor() {
		isEditing = false;
		editId = '';
		formKind = 'lesson';
		formParentId = '';
		formSubjectId = 'fundamental';
		formLevel = 1;
		formChapterNumber = 1;
		formOrder = 0;
		formScopeId = scopes[0]?.id || '';
		formTitle = '';
		formDescription = '';
		formThumbnail = '/favicon.png';
		formDurationMinutes = 10;
		formInstructor = '';
		formSyariahRequired = false;
		formVideoUrl = '';
		formInternalNote = '';
		editorBaseline = editorValue;
	}

	function startEdit(item: AdminContentDto) {
		isEditing = true;
		editId = item.id;
		formKind = item.kind;
		formParentId = item.parentId;
		formSubjectId = item.subjectId as typeof formSubjectId;
		formLevel = item.level;
		formChapterNumber = item.chapterNumber;
		formOrder = item.order;
		formScopeId = item.scopeId || '';
		formTitle = item.title;
		formDescription = item.description || '';
		formThumbnail = item.thumbnail || '/favicon.png';
		formDurationMinutes = Math.round((item.durationSeconds || 0) / 60);
		formInstructor = item.instructor || '';
		formSyariahRequired = item.syariahRequired;
		formVideoUrl = '';
		formInternalNote = '';
		editorBaseline = editorValue;
		activeTab = 'editor';
	}

	async function handleSaveContent() {
		if (!formTitle.trim()) {
			showError('Judul materi wajib diisi');
			return;
		}

		if (formKind === 'lesson' && formVideoUrl.trim() && !parsedVideo) {
			showError('Format URL YouTube tidak valid');
			return;
		}

		busy = true;
		try {
			if (isEditing) {
				// Update existing
				const res = await fetch(`/api/academy/admin/content/${encodeURIComponent(editId)}`, {
					method: 'PUT',
					headers: { 'content-type': 'application/json' },
					body: JSON.stringify({
						title: formTitle.trim(),
						description: formDescription.trim(),
						thumbnail: formThumbnail.trim() || '/favicon.png',
						durationSeconds: formDurationMinutes * 60,
						instructor: formInstructor.trim(),
						order: formOrder,
						scopeId: formScopeId || null,
						syariahRequired: formSyariahRequired
					})
				});

				if (!res.ok) {
					const err = await res.json();
					throw new Error(err.message || 'Gagal memperbarui konten');
				}

				// If video is provided, update media
				if (formKind === 'lesson' && parsedVideo) {
					const mediaRes = await fetch(
						`/api/academy/admin/content/${encodeURIComponent(editId)}/media`,
						{
							method: 'PUT',
							headers: { 'content-type': 'application/json' },
							body: JSON.stringify({
								videoId: parsedVideo.videoId,
								internalNote: formInternalNote || null
							})
						}
					);
					if (!mediaRes.ok) {
						const err = await mediaRes.json();
						throw new Error(err.message || 'Gagal menyimpan konfigurasi video YouTube');
					}
				}

				showSuccess(`Konten "${formTitle}" berhasil diperbarui.`);
			} else {
				// Create new draft
				const generatedId =
					formKind === 'subject'
						? formSubjectId
						: `${formSubjectId}-l${formLevel}-c${formChapterNumber}-${Date.now().toString(36)}`;

				const payload = {
					id: generatedId,
					kind: formKind,
					parentId:
						formParentId ||
						(formKind === 'subject'
							? 'root'
							: `${formSubjectId}-l${formLevel}-c${formChapterNumber}`),
					subjectId: formSubjectId,
					level: formLevel,
					chapterNumber: formChapterNumber,
					order: formOrder,
					scopeId: formScopeId || null,
					title: formTitle.trim(),
					description: formDescription.trim(),
					thumbnail: formThumbnail.trim() || '/favicon.png',
					durationSeconds: formDurationMinutes * 60,
					instructor: formInstructor.trim(),
					syariahRequired: formSyariahRequired
				};

				const res = await fetch('/api/academy/admin/content', {
					method: 'POST',
					headers: { 'content-type': 'application/json' },
					body: JSON.stringify(payload)
				});

				if (!res.ok) {
					const err = await res.json();
					throw new Error(err.message || 'Gagal membuat materi baru');
				}

				const createdItem: AdminContentDto = await res.json();

				// If lesson, immediately attach media
				if (formKind === 'lesson' && parsedVideo) {
					const mediaRes = await fetch(
						`/api/academy/admin/content/${encodeURIComponent(createdItem.id)}/media`,
						{
							method: 'PUT',
							headers: { 'content-type': 'application/json' },
							body: JSON.stringify({
								videoId: parsedVideo.videoId,
								internalNote: formInternalNote || null
							})
						}
					);
					if (!mediaRes.ok) {
						const err = await mediaRes.json();
						throw new Error(err.message || 'Gagal mengaitkan video YouTube ke materi baru');
					}
				}

				showSuccess(`Materi draft baru "${formTitle}" berhasil dibuat.`);
			}

			resetEditor();
			await Promise.all([loadContent(), loadStats()]);
			activeTab = 'curriculum';
		} catch (err: unknown) {
			showError(err instanceof Error ? err.message : 'Terjadi kesalahan sistem');
		} finally {
			busy = false;
		}
	}

	async function handleTransition(
		id: string,
		targetStatus: 'draft' | 'review' | 'approved' | 'published' | 'archived',
		rightsConfirmed: boolean = false
	) {
		busy = true;
		try {
			const res = await fetch(`/api/academy/admin/content/${encodeURIComponent(id)}/transition`, {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ targetStatus, rightsConfirmed })
			});

			if (!res.ok) {
				const err = await res.json();
				throw new Error(err.message || `Gagal mengubah status menjadi ${targetStatus}`);
			}

			showSuccess(`Status konten berhasil diubah menjadi "${targetStatus.toUpperCase()}".`);
			await Promise.all([loadContent(), loadStats()]);
		} catch (err: unknown) {
			showError(err instanceof Error ? err.message : 'Gagal mengubah status materi');
		} finally {
			busy = false;
		}
	}

	async function handleDeleteDraft(id: string) {
		if (!confirm('Yakin ingin menghapus materi draft ini? Tindakan ini tidak dapat dibatalkan.'))
			return;

		busy = true;
		try {
			const res = await fetch(`/api/academy/admin/content/${encodeURIComponent(id)}`, {
				method: 'DELETE'
			});

			if (!res.ok) {
				const err = await res.json();
				throw new Error(err.message || 'Gagal menghapus materi draft');
			}

			showSuccess('Draft materi berhasil dihapus.');
			await Promise.all([loadContent(), loadStats()]);
		} catch (err: unknown) {
			showError(err instanceof Error ? err.message : 'Gagal menghapus draft');
		} finally {
			busy = false;
		}
	}

	// Scope Actions
	async function handleCreateScope() {
		if (!newScopeId.trim() || !newScopeName.trim()) {
			showError('ID dan Nama scope wajib diisi');
			return;
		}

		busy = true;
		try {
			const res = await fetch('/api/academy/admin/scopes', {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({
					id: newScopeId.trim().toLowerCase(),
					name: newScopeName.trim(),
					description: newScopeDesc.trim(),
					isActive: true
				})
			});

			if (!res.ok) {
				const err = await res.json();
				throw new Error(err.message || 'Gagal membuat lingkup akses');
			}

			showSuccess(`Lingkup akses "${newScopeName}" berhasil ditambahkan.`);
			newScopeId = '';
			newScopeName = '';
			newScopeDesc = '';
			await Promise.all([loadScopes(), loadStats()]);
		} catch (err: unknown) {
			showError(err instanceof Error ? err.message : 'Gagal membuat scope');
		} finally {
			busy = false;
		}
	}

	// Grant Actions
	async function handleCreateGrant() {
		if (!grantUserId.trim() || !grantScopeId.trim()) {
			showError('ID Pengguna (UUID) dan Scope wajib diisi');
			return;
		}

		busy = true;
		try {
			const startsAt = new Date().toISOString();
			const expiresAt = new Date(Date.now() + grantDurationDays * 24 * 3600 * 1000).toISOString();

			const res = await fetch('/api/academy/admin/grants', {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({
					userId: grantUserId.trim(),
					scopeId: grantScopeId.trim(),
					startsAt,
					expiresAt,
					source: 'admin_dashboard'
				})
			});

			if (!res.ok) {
				const err = await res.json();
				throw new Error(err.message || 'Gagal memberikan hak akses siswa');
			}

			showSuccess(`Hak akses lingkup "${grantScopeId}" berhasil diberikan kepada siswa.`);
			grantUserId = '';
			await Promise.all([loadGrants(), loadStats()]);
		} catch (err: unknown) {
			showError(err instanceof Error ? err.message : 'Gagal memproses grant siswa');
		} finally {
			busy = false;
		}
	}

	async function handleRevokeGrant(id: string) {
		if (!confirm('Yakin ingin mencabut hak akses siswa ini?')) return;

		busy = true;
		try {
			const res = await fetch(`/api/academy/admin/grants/${encodeURIComponent(id)}/revoke`, {
				method: 'PUT'
			});

			if (!res.ok) {
				const err = await res.json();
				throw new Error(err.message || 'Gagal mencabut hak akses');
			}

			showSuccess('Hak akses siswa berhasil dicabut.');
			await Promise.all([loadGrants(), loadStats()]);
		} catch (err: unknown) {
			showError(err instanceof Error ? err.message : 'Gagal mencabut grant');
		} finally {
			busy = false;
		}
	}

	beforeNavigate(({ cancel }) => {
		if (!confirmDiscardEditorChanges()) cancel();
	});
</script>

<svelte:head>
	<title>Admin Dashboard & CMS | CryptoSharia Academy</title>
</svelte:head>

<div class="admin-console min-h-screen bg-slate-950 text-slate-100">
	<!-- Top Navigation Banner -->
	<header class="sticky top-0 z-40 border-b border-slate-800 bg-slate-900/90 backdrop-blur-md">
		<div class="mx-auto flex max-w-7xl items-center justify-between px-4 py-3 sm:px-6">
			<div class="flex items-center space-x-3">
				<a
					href={resolve('/e-learning')}
					class="flex items-center space-x-2 text-primary hover:text-white"
				>
					<svg class="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
						<path
							stroke-linecap="round"
							stroke-linejoin="round"
							stroke-width="2"
							d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253"
						/>
					</svg>
					<span class="font-bold tracking-tight">CryptoSharia Academy</span>
				</a>
				<span
					class="rounded-full border border-primary/30 bg-primary/10 px-2.5 py-0.5 text-xs font-semibold text-primary"
				>
					Panel admin
				</span>
			</div>

			<div class="flex items-center space-x-4">
				<div class="hidden text-right text-xs sm:block">
					<p class="font-medium text-slate-200">{data.user?.email || 'admin@cryptosharia.id'}</p>
					<p class="text-slate-400 capitalize">
						Peran: <span class="font-semibold text-primary">{data.user?.role}</span>
					</p>
				</div>
				<form action="/auth/signout" method="POST">
					<button
						type="submit"
						class="rounded-lg border border-slate-700 bg-slate-800 px-3 py-1.5 text-xs font-medium text-slate-300 transition hover:bg-slate-700 hover:text-white"
					>
						Keluar
					</button>
				</form>
			</div>
		</div>

		<!-- Main Nav Tabs -->
		<div class="mx-auto max-w-7xl px-4 sm:px-6">
			<nav class="flex flex-wrap gap-x-1 py-1" aria-label="Tabs">
				<button
					onclick={() => {
						if (!canSelectTab('overview')) return;
						activeTab = 'overview';
					}}
					aria-current={activeTab === 'overview' ? 'page' : undefined}
					class="flex items-center space-x-2 border-b-2 px-3 py-2 text-sm font-medium transition {activeTab ===
					'overview'
						? 'border-emerald-400 text-emerald-400'
						: 'border-transparent text-slate-400 hover:border-slate-700 hover:text-slate-200'}"
				>
					<span>Ringkasan</span>
				</button>
				<button
					onclick={() => {
						if (!canSelectTab('curriculum')) return;
						activeTab = 'curriculum';
						void loadContent();
					}}
					aria-current={activeTab === 'curriculum' ? 'page' : undefined}
					class="flex items-center space-x-2 border-b-2 px-3 py-2 text-sm font-medium transition {activeTab ===
					'curriculum'
						? 'border-emerald-400 text-emerald-400'
						: 'border-transparent text-slate-400 hover:border-slate-700 hover:text-slate-200'}"
				>
					<span>Kurikulum & Konten</span>
				</button>
				<button
					onclick={() => {
						if (!canSelectTab('editor')) return;
						activeTab = 'editor';
					}}
					aria-current={activeTab === 'editor' ? 'page' : undefined}
					class="flex items-center space-x-2 border-b-2 px-3 py-2 text-sm font-medium transition {activeTab ===
					'editor'
						? 'border-emerald-400 text-emerald-400'
						: 'border-transparent text-slate-400 hover:border-slate-700 hover:text-slate-200'}"
				>
					<span>{isEditing ? 'Edit Materi' : '+ Buat Materi Baru'}</span>
				</button>
				<button
					onclick={() => {
						if (!canSelectTab('workflow')) return;
						activeTab = 'workflow';
						filterStatus = 'all';
						void loadContent();
					}}
					aria-current={activeTab === 'workflow' ? 'page' : undefined}
					class="flex items-center space-x-2 border-b-2 px-3 py-2 text-sm font-medium transition {activeTab ===
					'workflow'
						? 'border-emerald-400 text-emerald-400'
						: 'border-transparent text-slate-400 hover:border-slate-700 hover:text-slate-200'}"
				>
					<span>Alur Review & Publikasi</span>
					{#if stats && stats.reviewContent > 0}
						<span
							class="rounded-full bg-amber-500/20 px-1.5 py-0.5 text-xs font-bold text-amber-300"
						>
							{stats.reviewContent}
						</span>
					{/if}
				</button>
				<button
					onclick={() => {
						if (!canSelectTab('scopes')) return;
						activeTab = 'scopes';
						void loadScopes();
					}}
					aria-current={activeTab === 'scopes' ? 'page' : undefined}
					class="flex items-center space-x-2 border-b-2 px-3 py-2 text-sm font-medium transition {activeTab ===
					'scopes'
						? 'border-emerald-400 text-emerald-400'
						: 'border-transparent text-slate-400 hover:border-slate-700 hover:text-slate-200'}"
				>
					<span>Lingkup Akses</span>
				</button>
				<button
					onclick={() => {
						if (!canSelectTab('grants')) return;
						activeTab = 'grants';
						void loadGrants();
					}}
					aria-current={activeTab === 'grants' ? 'page' : undefined}
					class="flex items-center space-x-2 border-b-2 px-3 py-2 text-sm font-medium transition {activeTab ===
					'grants'
						? 'border-emerald-400 text-emerald-400'
						: 'border-transparent text-slate-400 hover:border-slate-700 hover:text-slate-200'}"
				>
					<span>Hak Akses Siswa</span>
				</button>
			</nav>
		</div>
	</header>

	<!-- Main Content Area -->
	<main class="mx-auto max-w-7xl px-4 py-8 sm:px-6">
		<!-- Alerts -->
		{#if errorMessage}
			<div
				role="alert"
				class="mb-6 flex items-start justify-between rounded-xl border border-red-800/80 bg-red-950/40 p-4 text-red-200"
			>
				<div class="flex items-center space-x-3">
					<svg
						class="h-5 w-5 flex-shrink-0 text-red-400"
						fill="none"
						viewBox="0 0 24 24"
						stroke="currentColor"
					>
						<path
							stroke-linecap="round"
							stroke-linejoin="round"
							stroke-width="2"
							d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
						/>
					</svg>
					<span class="text-sm leading-relaxed font-medium">{errorMessage}</span>
				</div>
				<button onclick={() => (errorMessage = '')} class="text-red-400 hover:text-red-300"
					>✕</button
				>
			</div>
		{/if}

		{#if successMessage}
			<div
				role="status"
				class="mb-6 flex items-start justify-between rounded-xl border border-emerald-800/80 bg-emerald-950/40 p-4 text-emerald-200"
			>
				<div class="flex items-center space-x-3">
					<svg
						class="h-5 w-5 flex-shrink-0 text-emerald-400"
						fill="none"
						viewBox="0 0 24 24"
						stroke="currentColor"
					>
						<path
							stroke-linecap="round"
							stroke-linejoin="round"
							stroke-width="2"
							d="M5 13l4 4L19 7"
						/>
					</svg>
					<span class="text-sm leading-relaxed font-medium">{successMessage}</span>
				</div>
				<button
					onclick={() => (successMessage = '')}
					class="text-emerald-400 hover:text-emerald-300">✕</button
				>
			</div>
		{/if}
		{#if busy}
			<p
				role="status"
				class="mb-5 rounded-lg border border-primary/30 bg-primary/10 px-4 py-3 text-sm text-primary"
			>
				Memproses perubahan…
			</p>
		{/if}

		<!-- TAB 1: OVERVIEW -->
		{#if activeTab === 'overview'}
			<div class="space-y-6">
				<div>
					<h1 class="text-2xl font-bold tracking-tight text-white">Ringkasan Academy</h1>
					<p class="mt-1 text-sm text-slate-400">
						Pantau konten, proses editorial, publikasi, dan hak akses dari satu ruang kerja.
					</p>
				</div>

				<!-- Stats Grid -->
				<div
					class="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6"
					aria-label="Ringkasan operasional"
				>
					<div class="rounded-xl border border-slate-800 bg-slate-900/60 p-4 shadow-sm">
						<p class="text-xs font-medium text-slate-400">Total Pelajaran</p>
						<p class="mt-2 text-2xl font-bold text-white">{stats?.totalLessons ?? '—'}</p>
						<p class="mt-1 text-[11px] leading-4 text-slate-500">Data dari ringkasan admin</p>
					</div>
					<div class="rounded-xl border border-slate-800 bg-slate-900/60 p-4 shadow-sm">
						<p class="text-xs font-medium text-emerald-400">Pelajaran Terbit</p>
						<p class="mt-2 text-2xl font-bold text-emerald-400">{stats?.publishedLessons ?? '—'}</p>
						<p class="mt-1 text-[11px] leading-4 text-slate-500">Status publikasi published</p>
					</div>
					<div class="rounded-xl border border-slate-800 bg-slate-900/60 p-4 shadow-sm">
						<p class="text-xs font-medium text-amber-400">Menunggu Review</p>
						<p class="mt-2 text-2xl font-bold text-amber-400">{stats?.reviewContent ?? '—'}</p>
						<p class="mt-1 text-[11px] leading-4 text-slate-500">Antrean editorial</p>
					</div>
					<div class="rounded-xl border border-slate-800 bg-slate-900/60 p-4 shadow-sm">
						<p class="text-xs font-medium text-slate-400">Draft Editorial</p>
						<p class="mt-2 text-2xl font-bold text-slate-300">{stats?.draftContent ?? '—'}</p>
						<p class="mt-1 text-[11px] leading-4 text-slate-500">Belum masuk antrean review</p>
					</div>
					<div class="rounded-xl border border-slate-800 bg-slate-900/60 p-4 shadow-sm">
						<p class="text-xs font-medium text-cyan-400">Lingkup Akses</p>
						<p class="mt-2 text-2xl font-bold text-cyan-400">{stats?.totalScopes ?? '—'}</p>
						<p class="mt-1 text-[11px] leading-4 text-slate-500">Scope terdaftar</p>
					</div>
					<div class="rounded-xl border border-slate-800 bg-slate-900/60 p-4 shadow-sm">
						<p class="text-xs font-medium text-indigo-400">Hak Akses Siswa</p>
						<p class="mt-2 text-2xl font-bold text-indigo-400">{stats?.totalGrants ?? '—'}</p>
						<p class="mt-1 text-[11px] leading-4 text-slate-500">Total catatan grant</p>
					</div>
				</div>
				{#if statsError}
					<div
						role="alert"
						class="rounded-lg border border-amber-800/50 bg-amber-950/20 px-4 py-3 text-sm text-amber-200"
					>
						{statsError}
						<button
							class="ml-2 font-semibold underline underline-offset-2"
							onclick={() => void loadStats()}>Coba lagi</button
						>
					</div>
				{:else if statsLoading && !stats}
					<p role="status" class="text-sm text-slate-400">Memuat ringkasan operasional…</p>
				{/if}

				<section
					class="rounded-xl border border-slate-800 bg-slate-900/40 p-5 sm:p-6"
					aria-labelledby="readiness-title"
					aria-busy={!contentLoaded && !contentError}
				>
					<div class="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
						<div>
							<p class="text-xs font-bold tracking-[0.16em] text-primary uppercase">
								Alur operasional
							</p>
							<h2 id="readiness-title" class="mt-2 text-lg font-semibold text-white">
								Kesiapan publikasi
							</h2>
						</div>
						<p class="max-w-xl text-xs leading-5 text-slate-400">
							Status mengikuti data editorial yang tersedia. Persetujuan dan publikasi tetap
							melewati otorisasi masing-masing.
						</p>
					</div>
					{#if contentError}
						<div
							class="mt-4 flex flex-col gap-3 rounded-lg border border-amber-800/50 bg-amber-950/20 p-4 sm:flex-row sm:items-center sm:justify-between"
						>
							<p role="alert" class="text-sm text-amber-200">Tahap editorial belum dapat dimuat.</p>
							<button
								class="rounded-lg border border-slate-700 px-3 py-2 text-sm text-slate-200 hover:bg-slate-800"
								onclick={() => void loadContent()}>Muat ulang status</button
							>
						</div>
					{:else if !contentLoaded}
						<div
							class="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-5"
							aria-label="Memuat status publikasi"
						>
							{#each [1, 2, 3, 4, 5] as stage (stage)}<div
									class="h-24 animate-pulse rounded-lg border border-slate-800 bg-slate-900/70"
								></div>{/each}
						</div>
						<p role="status" class="sr-only">Memuat status editorial…</p>
					{:else}
						<ol class="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
							<li class="rounded-lg border border-slate-800 bg-slate-950/50 p-4">
								<p class="text-xs text-slate-400">01 · Struktur kurikulum</p>
								<p class="mt-2 text-xl font-semibold text-white">{structureCount}</p>
								<p class="mt-1 text-xs text-slate-500">Record subject, level, dan chapter</p>
							</li>
							<li class="rounded-lg border border-slate-800 bg-slate-950/50 p-4">
								<p class="text-xs text-slate-400">02 · Draft editorial</p>
								<p class="mt-2 text-xl font-semibold text-white">{stats?.draftContent ?? '—'}</p>
								<p class="mt-1 text-xs text-slate-500">Dikelola tim editorial</p>
							</li>
							<li class="rounded-lg border border-slate-800 bg-slate-950/50 p-4">
								<p class="text-xs text-slate-400">03 · Menunggu review</p>
								<p class="mt-2 text-xl font-semibold text-amber-300">
									{stats?.reviewContent ?? '—'}
								</p>
								<p class="mt-1 text-xs text-slate-500">Belum dapat dipublikasikan</p>
							</li>
							<li class="rounded-lg border border-slate-800 bg-slate-950/50 p-4">
								<p class="text-xs text-slate-400">04 · Disetujui</p>
								<p class="mt-2 text-xl font-semibold text-blue-300">{approvedCount}</p>
								<p class="mt-1 text-xs text-slate-500">Menunggu transisi publisher</p>
							</li>
							<li class="rounded-lg border border-slate-800 bg-slate-950/50 p-4">
								<p class="text-xs text-slate-400">05 · Pelajaran terbit</p>
								<p class="mt-2 text-xl font-semibold text-emerald-300">
									{stats?.publishedLessons ?? '—'}
								</p>
								<p class="mt-1 text-xs text-slate-500">Tampil di katalog siswa</p>
							</li>
						</ol>
					{/if}
				</section>

				<!-- Quick Action Cards -->
				<div class="grid grid-cols-1 gap-4 md:grid-cols-3">
					<div class="rounded-xl border border-slate-800 bg-slate-900/40 p-6">
						<h3 class="text-base font-semibold text-white">Buat Materi Baru</h3>
						<p class="mt-2 text-xs leading-relaxed text-slate-400">
							Tambahkan pelajaran baru ke dalam subjek, tentukan bab dan urutan, serta masukkan
							tautan YouTube video.
						</p>
						<button
							onclick={() => {
								if (!confirmDiscardEditorChanges()) return;
								resetEditor();
								activeTab = 'editor';
							}}
							class="mt-4 inline-flex min-h-11 items-center rounded-lg bg-primary px-3.5 py-2 text-xs font-semibold text-slate-950 transition hover:bg-orange-400"
						>
							Buka Editor Materi →
						</button>
					</div>

					<div class="rounded-xl border border-slate-800 bg-slate-900/40 p-6">
						<h3 class="text-base font-semibold text-white">Tinjau Antrean Publikasi</h3>
						<p class="mt-2 text-xs leading-relaxed text-slate-400">
							Periksa materi yang diajukan oleh tim editorial. Konfirmasi hak cipta dan kesesuaian
							syariah sebelum penerbitan.
						</p>
						<button
							onclick={() => {
								if (!confirmDiscardEditorChanges()) return;
								activeTab = 'workflow';
								filterStatus = 'all';
								void loadContent();
							}}
							class="mt-4 inline-flex min-h-11 items-center rounded-lg border border-amber-700/60 bg-amber-600/15 px-3.5 py-2 text-xs font-semibold text-amber-200 transition hover:bg-amber-600/25"
						>
							Buka Alur Review →
						</button>
					</div>

					<div class="rounded-xl border border-slate-800 bg-slate-900/40 p-6">
						<h3 class="text-base font-semibold text-white">Kelola Hak Akses Siswa</h3>
						<p class="mt-2 text-xs leading-relaxed text-slate-400">
							Berikan atau cabut izin akses materi pada lingkup tertentu (misal: Crypto Dasar,
							Premium, dsb.) secara manual.
						</p>
						<button
							onclick={() => {
								if (!confirmDiscardEditorChanges()) return;
								activeTab = 'grants';
								void loadGrants();
							}}
							class="mt-4 inline-flex min-h-11 items-center rounded-lg border border-slate-700 bg-slate-800 px-3.5 py-2 text-xs font-semibold text-slate-200 transition hover:bg-slate-700"
						>
							Kelola Hak Akses →
						</button>
					</div>
				</div>
			</div>
		{/if}

		<!-- TAB 2: CURRICULUM & CONTENT LIST -->
		{#if activeTab === 'curriculum'}
			<div class="space-y-6">
				<div class="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
					<div>
						<h1 class="text-2xl font-bold tracking-tight text-white">
							Kurikulum & Materi Pembelajaran
						</h1>
						<p class="mt-1 text-sm text-slate-400">
							Daftar seluruh item hierarki kurikulum mulai dari subjek, level, bab, hingga
							pelajaran.
						</p>
					</div>
					<button
						onclick={() => {
							if (!confirmDiscardEditorChanges()) return;
							resetEditor();
							activeTab = 'editor';
						}}
						class="inline-flex items-center justify-center rounded-lg bg-emerald-600 px-4 py-2 text-xs font-semibold text-white shadow-sm hover:bg-emerald-500"
					>
						+ Buat Materi Baru
					</button>
				</div>

				<!-- Filters -->
				<div
					class="flex flex-wrap items-center gap-3 rounded-xl border border-slate-800 bg-slate-900/40 p-4"
				>
					<div class="flex items-center space-x-2">
						<label for="filter-sub" class="text-xs font-medium text-slate-400">Subjek:</label>
						<select
							id="filter-sub"
							bind:value={filterSubject}
							class="rounded-lg border border-slate-700 bg-slate-800 px-2.5 py-1.5 text-xs text-slate-200 focus:border-emerald-500"
						>
							<option value="all">Semua Subjek</option>
							{#each subjects as s (s.id)}
								<option value={s.id}>{s.title}</option>
							{/each}
						</select>
					</div>

					<div class="flex items-center space-x-2">
						<label for="filter-stat" class="text-xs font-medium text-slate-400">Status:</label>
						<select
							id="filter-stat"
							bind:value={filterStatus}
							class="rounded-lg border border-slate-700 bg-slate-800 px-2.5 py-1.5 text-xs text-slate-200 focus:border-emerald-500"
						>
							<option value="all">Semua Status</option>
							<option value="draft">Draft</option>
							<option value="review">Review</option>
							<option value="approved">Approved</option>
							<option value="published">Published</option>
							<option value="archived">Archived</option>
						</select>
					</div>

					<div class="flex items-center space-x-2">
						<label for="filter-kd" class="text-xs font-medium text-slate-400">Jenis:</label>
						<select
							id="filter-kd"
							bind:value={filterKind}
							class="rounded-lg border border-slate-700 bg-slate-800 px-2.5 py-1.5 text-xs text-slate-200 focus:border-emerald-500"
						>
							<option value="all">Semua Jenis</option>
							<option value="lesson">Pelajaran (Lesson)</option>
							<option value="chapter">Bab (Chapter)</option>
							<option value="level">Level</option>
							<option value="subject">Subjek</option>
						</select>
					</div>

					<button
						onclick={loadContent}
						class="rounded-lg border border-slate-700 bg-slate-800 px-3 py-1.5 text-xs font-medium text-slate-300 hover:bg-slate-700"
					>
						Segarkan
					</button>
				</div>

				<!-- Table of Content -->
				<div class="overflow-x-auto rounded-xl border border-slate-800 bg-slate-900/60 shadow-sm">
					<table class="w-full text-left text-xs text-slate-300">
						<thead
							class="border-b border-slate-800 bg-slate-900/90 text-[11px] tracking-wider text-slate-400 uppercase"
						>
							<tr>
								<th class="px-4 py-3">Materi & hierarki</th>
								<th class="px-4 py-3">Posisi kurikulum</th>
								<th class="px-4 py-3">Status</th>
								<th class="px-4 py-3">Durasi</th>
								<th class="px-4 py-3">Lingkup</th>
								<th class="px-4 py-3 text-right">Aksi</th>
							</tr>
						</thead>
						<tbody class="divide-y divide-slate-800/60 font-sans">
							{#if loading}
								<tr>
									<td colspan="6" class="px-4 py-8 text-center text-slate-400">
										<div class="mx-auto h-5 w-48 animate-pulse rounded bg-slate-800"></div>
										<p role="status" class="mt-3">Memuat struktur kurikulum…</p>
									</td>
								</tr>
							{:else if filteredItems.length === 0}
								<tr>
									<td colspan="6" class="px-4 py-8 text-center text-slate-400">
										Belum ada materi yang sesuai dengan filter.
									</td>
								</tr>
							{:else}
								{#each filteredItems as item (item.id)}
									<tr class="transition hover:bg-slate-800/30">
										<td class="px-4 py-3">
											<div class="font-medium text-white">{item.title}</div>
											<div class="mt-1 flex flex-wrap items-center gap-2">
												<span
													class="rounded-full border border-slate-700 bg-slate-800 px-2 py-0.5 text-[10px] font-semibold text-slate-300"
												>
													{contentKindLabel(item.kind)}
												</span>
												<span class="font-mono text-[11px] text-slate-500">ID: {item.id}</span>
											</div>
											<div class="mt-2 text-[11px] leading-5 text-slate-400">
												{curriculumPath(item)}
											</div>
										</td>
										<td class="px-4 py-3">
											<div class="text-slate-200">{subjectLabel(item)}</div>
											<div class="mt-1 text-[11px] text-slate-400">
												{item.kind === 'subject'
													? 'Posisi akar kurikulum'
													: `Level ${item.level} · Bab ${item.chapterNumber} · Urutan ${item.order}`}
											</div>
											<div class="mt-1 text-[11px] text-slate-500">Parent: {parentLabel(item)}</div>
										</td>
										<td class="px-4 py-3">
											{#if item.status === 'published'}
												<span
													class="inline-flex items-center rounded-full border border-emerald-500/20 bg-emerald-500/10 px-2 py-0.5 text-[11px] font-semibold text-emerald-400"
												>
													Published (v{item.version})
												</span>
											{:else if item.status === 'review'}
												<span
													class="inline-flex items-center rounded-full border border-amber-500/20 bg-amber-500/10 px-2 py-0.5 text-[11px] font-semibold text-amber-300"
												>
													Review (v{item.version})
												</span>
											{:else if item.status === 'approved'}
												<span
													class="inline-flex items-center rounded-full border border-blue-500/20 bg-blue-500/10 px-2 py-0.5 text-[11px] font-semibold text-blue-300"
												>
													Approved (v{item.version})
												</span>
											{:else if item.status === 'draft'}
												<span
													class="inline-flex items-center rounded-full border border-slate-700 bg-slate-800 px-2 py-0.5 text-[11px] font-medium text-slate-300"
												>
													Draft (v{item.version})
												</span>
											{:else}
												<span
													class="inline-flex items-center rounded-full border border-stone-800 bg-stone-900 px-2 py-0.5 text-[11px] font-medium text-stone-400"
												>
													{item.status}
												</span>
											{/if}
										</td>
										<td class="px-4 py-3 text-slate-300">
											{item.durationSeconds ? `${Math.round(item.durationSeconds / 60)} mnt` : '—'}
										</td>
										<td class="px-4 py-3 font-mono text-[11px] text-slate-300">
											{item.scopeId || 'Global'}
										</td>
										<td class="px-4 py-3 text-right">
											<div class="inline-flex items-center space-x-2">
												<button
													onclick={() => startEdit(item)}
													class="rounded bg-slate-800 px-2 py-1 text-[11px] font-medium text-slate-200 hover:bg-slate-700"
												>
													Edit
												</button>

												{#if item.status === 'draft'}
													<button
														disabled={busy}
														onclick={() => handleTransition(item.id, 'review')}
														class="rounded border border-amber-600/30 bg-amber-600/20 px-2 py-1 text-[11px] font-semibold text-amber-300 hover:bg-amber-600/30"
													>
														Ajukan
													</button>
													<button
														disabled={busy}
														onclick={() => handleDeleteDraft(item.id)}
														class="rounded border border-red-800/40 bg-red-950/40 px-2 py-1 text-[11px] font-medium text-red-400 hover:bg-red-900/50"
													>
														Hapus
													</button>
												{:else if item.status === 'published'}
													<button
														disabled={busy}
														onclick={() => handleTransition(item.id, 'archived')}
														class="rounded bg-stone-800 px-2 py-1 text-[11px] font-medium text-stone-300 hover:bg-stone-700"
													>
														Arsipkan
													</button>
												{/if}
											</div>
										</td>
									</tr>
								{/each}
							{/if}
						</tbody>
					</table>
				</div>
			</div>
		{/if}

		<!-- TAB 3: CONTENT & VIDEO EDITOR -->
		{#if activeTab === 'editor'}
			<div class="max-w-3xl space-y-6">
				<div>
					<h1 class="text-2xl font-bold tracking-tight text-white">
						{isEditing ? `Edit Materi: ${formTitle}` : 'Buat Materi Baru'}
					</h1>
					<p class="mt-1 text-sm text-slate-400">
						Formulir penyusunan materi kurikulum, penempatan posisi hierarki, dan integrasi video
						YouTube berizin.
					</p>
				</div>

				<div class="space-y-5 rounded-xl border border-slate-800 bg-slate-900/60 p-6">
					{#if editorHasUnsavedChanges}
						<p
							role="status"
							class="rounded-lg border border-amber-700/60 bg-amber-950/30 px-3 py-2 text-xs text-amber-200"
						>
							Ada perubahan yang belum disimpan. Simpan sebelum berpindah dari editor.
						</p>
					{/if}
					<!-- Jenis Konten -->
					<div>
						<span class="mb-1 block text-xs font-semibold text-slate-300">Jenis Konten</span>
						<div class="grid grid-cols-4 gap-2">
							{#each ['lesson', 'chapter', 'level', 'subject'] as k (k)}
								<button
									type="button"
									disabled={isEditing}
									onclick={() => (formKind = k as AdminContentDto['kind'])}
									class="rounded-lg border px-3 py-2 text-xs font-medium capitalize transition {formKind ===
									k
										? 'border-emerald-500 bg-emerald-500/10 text-emerald-400'
										: 'border-slate-700 bg-slate-800 text-slate-300 hover:bg-slate-700'} {isEditing
										? 'cursor-not-allowed opacity-60'
										: ''}"
								>
									{k}
								</button>
							{/each}
						</div>
					</div>

					<!-- Judul -->
					<div>
						<label for="form-title" class="mb-1 block text-xs font-semibold text-slate-300"
							>Judul Materi *</label
						>
						<input
							id="form-title"
							type="text"
							bind:value={formTitle}
							placeholder="Contoh: Pengantar Analisis On-Chain Bitcoin"
							class="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-white focus:border-emerald-500 focus:outline-none"
						/>
					</div>

					<!-- Hierarki: Subjek, Level, Bab, Urutan -->
					<div class="grid grid-cols-2 gap-4 sm:grid-cols-4">
						<div>
							<label for="form-sub" class="mb-1 block text-xs font-semibold text-slate-300"
								>Subjek</label
							>
							<select
								id="form-sub"
								bind:value={formSubjectId}
								disabled={isEditing}
								class="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-xs text-white"
							>
								{#each subjects as s (s.id)}
									<option value={s.id}>{s.title}</option>
								{/each}
							</select>
						</div>

						<div>
							<label for="form-lvl" class="mb-1 block text-xs font-semibold text-slate-300"
								>Level (1-6)</label
							>
							<input
								id="form-lvl"
								type="number"
								min="1"
								max="6"
								bind:value={formLevel}
								disabled={isEditing}
								class="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-xs text-white"
							/>
						</div>

						<div>
							<label for="form-chap" class="mb-1 block text-xs font-semibold text-slate-300"
								>Bab (1-7)</label
							>
							<input
								id="form-chap"
								type="number"
								min="1"
								max="7"
								bind:value={formChapterNumber}
								disabled={isEditing}
								class="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-xs text-white"
							/>
						</div>

						<div>
							<label for="form-ord" class="mb-1 block text-xs font-semibold text-slate-300"
								>Urutan (Order)</label
							>
							<input
								id="form-ord"
								type="number"
								min="0"
								bind:value={formOrder}
								class="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-xs text-white"
							/>
						</div>
					</div>

					<!-- Lingkup Akses & Durasi -->
					<div class="grid grid-cols-1 gap-4 sm:grid-cols-2">
						<div>
							<label for="form-scope" class="mb-1 block text-xs font-semibold text-slate-300"
								>Lingkup Akses (Scope)</label
							>
							<select
								id="form-scope"
								bind:value={formScopeId}
								class="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-xs text-white"
							>
								<option value="">Akses Terbuka / Global</option>
								{#each scopes as sc (sc.id)}
									<option value={sc.id}>{sc.name} ({sc.id})</option>
								{/each}
							</select>
						</div>

						<div>
							<label for="form-dur" class="mb-1 block text-xs font-semibold text-slate-300"
								>Perkiraan Durasi (Menit)</label
							>
							<input
								id="form-dur"
								type="number"
								min="1"
								bind:value={formDurationMinutes}
								class="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-xs text-white"
							/>
						</div>
					</div>

					<!-- Instruktur -->
					<div>
						<label for="form-inst" class="mb-1 block text-xs font-semibold text-slate-300"
							>Pengajar / Instruktur</label
						>
						<input
							id="form-inst"
							type="text"
							bind:value={formInstructor}
							placeholder="Nama pemateri / narasumber"
							class="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-xs text-white"
						/>
					</div>

					<!-- Deskripsi -->
					<div>
						<label for="form-desc" class="mb-1 block text-xs font-semibold text-slate-300"
							>Deskripsi & Silabus Materi</label
						>
						<textarea
							id="form-desc"
							rows="3"
							bind:value={formDescription}
							placeholder="Penjelasan ringkas pokok bahasan materi ini..."
							class="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-xs text-white"
						></textarea>
					</div>

					<!-- Bagian Khusus Video YouTube (Hanya Lesson) -->
					{#if formKind === 'lesson'}
						<div class="space-y-3 rounded-xl border border-slate-700/80 bg-slate-800/50 p-4">
							<div class="flex items-center justify-between">
								<h3 class="text-xs font-bold tracking-wider text-emerald-400 uppercase">
									Integrasi Video YouTube Terproteksi
								</h3>
								{#if parsedVideo}
									<span
										class="rounded bg-emerald-500/20 px-2 py-0.5 text-[10px] font-bold text-emerald-300"
									>
										Video ID: {parsedVideo.videoId}
									</span>
								{/if}
							</div>
							<p class="text-[11px] text-slate-400">
								Masukkan URL YouTube (misal: <code>https://youtu.be/dQw4w9WgXcQ</code> atau
								<code>https://youtube.com/watch?v=...</code>). Video hanya akan diberikan kepada
								siswa yang memiliki hak akses aktif.
							</p>

							<input
								type="url"
								bind:value={formVideoUrl}
								placeholder="https://youtu.be/..."
								class="w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-xs text-white focus:border-emerald-500"
							/>

							{#if parsedVideo}
								<div
									class="mt-3 aspect-video w-full max-w-sm overflow-hidden rounded-lg border border-slate-700 bg-black"
								>
									<iframe
										src={parsedVideo.embedUrl}
										title="Preview Video"
										class="h-full w-full"
										allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
									></iframe>
								</div>
							{/if}

							<div>
								<label for="form-note" class="mb-1 block text-[11px] font-semibold text-slate-300"
									>Catatan Internal / Editorial (Opsional)</label
								>
								<input
									id="form-note"
									type="text"
									bind:value={formInternalNote}
									placeholder="Catatan tim pengajar atau timestamp penting..."
									class="w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-1.5 text-xs text-slate-300"
								/>
							</div>
						</div>
					{/if}

					<!-- Syariah Required Toggle -->
					<div class="flex items-center space-x-2 pt-2">
						<input
							type="checkbox"
							id="syariah-req"
							bind:checked={formSyariahRequired}
							class="h-4 w-4 rounded border-slate-700 bg-slate-800 text-emerald-600 focus:ring-emerald-500"
						/>
						<label for="syariah-req" class="text-xs text-slate-300">
							Materi ini memerlukan peninjauan khusus aspek Fikih Muamalah Syariah sebelum terbit
						</label>
					</div>

					<!-- Form Actions -->
					<div class="flex items-center justify-end space-x-3 border-t border-slate-800 pt-4">
						<button
							type="button"
							onclick={() => {
								if (!confirmDiscardEditorChanges()) return;
								resetEditor();
								activeTab = 'curriculum';
							}}
							class="rounded-lg border border-slate-700 bg-slate-800 px-4 py-2 text-xs font-semibold text-slate-300 hover:bg-slate-700"
						>
							Batal
						</button>
						<button
							type="button"
							disabled={busy}
							onclick={handleSaveContent}
							class="rounded-lg bg-emerald-600 px-5 py-2 text-xs font-semibold text-white shadow-sm hover:bg-emerald-500 disabled:opacity-50"
						>
							{busy ? 'Menyimpan…' : isEditing ? 'Simpan Perubahan' : 'Buat Materi Draft'}
						</button>
					</div>
				</div>
			</div>
		{/if}

		<!-- TAB 4: REVIEW & PUBLISH WORKFLOW -->
		{#if activeTab === 'workflow'}
			<div class="space-y-6">
				<div>
					<h1 class="text-2xl font-bold tracking-tight text-white">
						Alur Review & Publikasi Materi
					</h1>
					<p class="mt-1 text-sm text-slate-400">
						Antrean persetujuan konten sebelum dipublikasikan kepada siswa. Melindungi integritas
						hak cipta dan kepatuhan syariah.
					</p>
				</div>

				<div class="rounded-xl border border-slate-800 bg-slate-900/60 p-4">
					<div class="divide-y divide-slate-800">
						{#if loading}
							<p class="py-8 text-center text-xs text-slate-400">Memuat antrean review…</p>
						{:else}
							{@const queue = contentItems.filter(
								(i) => i.status === 'review' || i.status === 'approved'
							)}
							{#if queue.length === 0}
								<div class="py-12 text-center">
									<p class="text-sm font-medium text-slate-300">
										Tidak ada antrean materi yang menunggu review saat ini.
									</p>
									<p class="mt-1 text-xs text-slate-500">
										Materi yang diajukan oleh tim editorial akan muncul di sini.
									</p>
								</div>
							{:else}
								{#each queue as item (item.id)}
									<div
										data-content-id={item.id}
										class="flex flex-col justify-between gap-4 py-4 sm:flex-row sm:items-center"
									>
										<div>
											<div class="flex items-center space-x-2">
												<span class="text-sm font-semibold text-white">{item.title}</span>
												<span
													class="rounded border border-amber-500/20 bg-amber-500/10 px-2 py-0.5 text-[10px] font-bold text-amber-300 uppercase"
												>
													{item.status}
												</span>
												{#if item.syariahRequired}
													<span
														class="rounded border border-emerald-500/20 bg-emerald-500/10 px-2 py-0.5 text-[10px] font-semibold text-emerald-300"
													>
														Wajib Tinjau Syariah
													</span>
												{/if}
											</div>
											<p class="mt-1 text-xs text-slate-400">
												ID: <span class="font-mono text-slate-300">{item.id}</span> · Subjek:
												<span class="text-slate-200 capitalize">{item.subjectId}</span>
												· L{item.level} Bab {item.chapterNumber} · Versi {item.version}
											</p>
										</div>

										<div class="flex items-center space-x-2">
											{#if item.status === 'review'}
												<button
													disabled={busy}
													onclick={() => handleTransition(item.id, 'approved', true)}
													class="rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-blue-500"
												>
													Setujui (Approve)
												</button>
												<button
													disabled={busy}
													onclick={() => handleTransition(item.id, 'draft')}
													class="rounded-lg border border-slate-700 bg-slate-800 px-3 py-1.5 text-xs font-medium text-slate-300 hover:bg-slate-700"
												>
													Tolak ke Draft
												</button>
											{:else if item.status === 'approved'}
												<button
													disabled={busy}
													onclick={() => handleTransition(item.id, 'published')}
													class="rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-500"
												>
													Terbitkan (Publish)
												</button>
												<button
													disabled={busy}
													onclick={() => handleTransition(item.id, 'draft')}
													class="rounded-lg border border-slate-700 bg-slate-800 px-3 py-1.5 text-xs font-medium text-slate-300 hover:bg-slate-700"
												>
													Kembalikan ke Draft
												</button>
											{/if}
										</div>
									</div>
								{/each}
							{/if}
						{/if}
					</div>
				</div>
			</div>
		{/if}

		<!-- TAB 5: SCOPES MANAGEMENT -->
		{#if activeTab === 'scopes'}
			<div class="space-y-6">
				<div>
					<h1 class="text-2xl font-bold tracking-tight text-white">
						Lingkup Akses (Scope Management)
					</h1>
					<p class="mt-1 text-sm text-slate-400">
						Definisi grup akses paket kursus (misal: Fundamental, Premium, VIP Bootcamp).
					</p>
				</div>

				<!-- Create New Scope Form -->
				<div class="space-y-4 rounded-xl border border-slate-800 bg-slate-900/60 p-6">
					<h3 class="text-sm font-bold text-white">Tambah Lingkup Akses Baru</h3>
					<div class="grid grid-cols-1 gap-4 sm:grid-cols-3">
						<div>
							<label for="scope-id" class="mb-1 block text-xs font-semibold text-slate-300"
								>ID Scope (slug unik)</label
							>
							<input
								id="scope-id"
								type="text"
								bind:value={newScopeId}
								placeholder="contoh: crypto-dasar"
								class="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-xs text-white"
							/>
						</div>
						<div>
							<label for="scope-name" class="mb-1 block text-xs font-semibold text-slate-300"
								>Nama Scope</label
							>
							<input
								id="scope-name"
								type="text"
								bind:value={newScopeName}
								placeholder="contoh: Kursus Kripto Syariah Dasar"
								class="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-xs text-white"
							/>
						</div>
						<div>
							<label for="scope-desc" class="mb-1 block text-xs font-semibold text-slate-300"
								>Keterangan</label
							>
							<input
								id="scope-desc"
								type="text"
								bind:value={newScopeDesc}
								placeholder="Deskripsi hak akses..."
								class="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-xs text-white"
							/>
						</div>
					</div>
					<button
						disabled={busy}
						onclick={handleCreateScope}
						class="rounded-lg bg-emerald-600 px-4 py-2 text-xs font-semibold text-white hover:bg-emerald-500 disabled:opacity-50"
					>
						+ Tambah Lingkup Akses
					</button>
				</div>

				<!-- Scope List -->
				<div class="overflow-x-auto rounded-xl border border-slate-800 bg-slate-900/60">
					<table class="w-full text-left text-xs text-slate-300">
						<thead
							class="border-b border-slate-800 bg-slate-900/90 text-[11px] tracking-wider text-slate-400 uppercase"
						>
							<tr>
								<th class="px-4 py-3">ID Scope</th>
								<th class="px-4 py-3">Nama</th>
								<th class="px-4 py-3">Keterangan</th>
								<th class="px-4 py-3">Status</th>
							</tr>
						</thead>
						<tbody class="divide-y divide-slate-800/60">
							{#each scopes as sc (sc.id)}
								<tr class="hover:bg-slate-800/30">
									<td class="px-4 py-3 font-mono font-semibold text-emerald-400">{sc.id}</td>
									<td class="px-4 py-3 font-medium text-white">{sc.name}</td>
									<td class="px-4 py-3 text-slate-400">{sc.description || '—'}</td>
									<td class="px-4 py-3">
										<span
											class="rounded-full border border-emerald-500/20 bg-emerald-500/10 px-2 py-0.5 text-[10px] font-semibold text-emerald-400"
										>
											{sc.isActive ? 'Aktif' : 'Non-aktif'}
										</span>
									</td>
								</tr>
							{/each}
						</tbody>
					</table>
				</div>
			</div>
		{/if}

		<!-- TAB 6: STUDENT GRANTS & ENTITLEMENTS -->
		{#if activeTab === 'grants'}
			<div class="space-y-6">
				<div>
					<h1 class="text-2xl font-bold tracking-tight text-white">
						Kelola Hak Akses Siswa (Entitlements)
					</h1>
					<p class="mt-1 text-sm text-slate-400">
						Otorisasi langsung bagi siswa untuk mengakses video pembelajaran pada lingkup tertentu.
					</p>
				</div>

				<!-- Grant Form -->
				<div class="space-y-4 rounded-xl border border-slate-800 bg-slate-900/60 p-6">
					<h3 class="text-sm font-bold text-white">Alokasi Hak Akses Baru</h3>
					<div class="grid grid-cols-1 gap-4 sm:grid-cols-3">
						<div>
							<label for="grant-uid" class="mb-1 block text-xs font-semibold text-slate-300"
								>User ID Siswa (UUID)</label
							>
							<input
								id="grant-uid"
								type="text"
								bind:value={grantUserId}
								placeholder="e.g. 25f4507b-7908-458c-a07b-edae1f0e107a"
								class="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 font-mono text-xs text-white"
							/>
						</div>
						<div>
							<label for="grant-scope" class="mb-1 block text-xs font-semibold text-slate-300"
								>Lingkup Akses (Scope)</label
							>
							<select
								id="grant-scope"
								bind:value={grantScopeId}
								class="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-xs text-white"
							>
								<option value="">Pilih Scope...</option>
								{#each scopes as sc (sc.id)}
									<option value={sc.id}>{sc.name} ({sc.id})</option>
								{/each}
							</select>
						</div>
						<div>
							<label for="grant-dur" class="mb-1 block text-xs font-semibold text-slate-300"
								>Masa Berlaku (Hari)</label
							>
							<input
								id="grant-dur"
								type="number"
								min="1"
								bind:value={grantDurationDays}
								class="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-xs text-white"
							/>
						</div>
					</div>
					<button
						disabled={busy}
						onclick={handleCreateGrant}
						class="rounded-lg bg-emerald-600 px-4 py-2 text-xs font-semibold text-white hover:bg-emerald-500 disabled:opacity-50"
					>
						+ Berikan Hak Akses
					</button>
				</div>

				<!-- Grants Table -->
				<div class="overflow-x-auto rounded-xl border border-slate-800 bg-slate-900/60">
					<table class="w-full text-left text-xs text-slate-300">
						<thead
							class="border-b border-slate-800 bg-slate-900/90 text-[11px] tracking-wider text-slate-400 uppercase"
						>
							<tr>
								<th class="px-4 py-3">Siswa (User ID)</th>
								<th class="px-4 py-3">Lingkup</th>
								<th class="px-4 py-3">Mulai</th>
								<th class="px-4 py-3">Berakhir</th>
								<th class="px-4 py-3">Status</th>
								<th class="px-4 py-3 text-right">Aksi</th>
							</tr>
						</thead>
						<tbody class="divide-y divide-slate-800/60">
							{#if loading}
								<tr>
									<td colspan="6" class="px-4 py-8 text-center text-slate-400">
										Memuat daftar hak akses siswa…
									</td>
								</tr>
							{:else if grants.length === 0}
								<tr>
									<td colspan="6" class="px-4 py-8 text-center text-slate-400">
										Belum ada catatan hak akses siswa.
									</td>
								</tr>
							{:else}
								{#each grants as g (g.id)}
									<tr class="hover:bg-slate-800/30">
										<td class="px-4 py-3 font-mono text-[11px] text-white">{g.userId}</td>
										<td class="px-4 py-3 font-semibold text-emerald-400">{g.scopeId}</td>
										<td class="px-4 py-3 text-slate-400"
											>{new Date(g.startsAt).toLocaleDateString()}</td
										>
										<td class="px-4 py-3 text-slate-400"
											>{new Date(g.expiresAt).toLocaleDateString()}</td
										>
										<td class="px-4 py-3">
											{#if g.state === 'active'}
												<span
													class="rounded-full border border-emerald-500/20 bg-emerald-500/10 px-2 py-0.5 text-[10px] font-semibold text-emerald-400"
												>
													Aktif
												</span>
											{:else}
												<span
													class="rounded-full border border-red-500/20 bg-red-500/10 px-2 py-0.5 text-[10px] font-semibold text-red-400"
												>
													Dicabut (Revoked)
												</span>
											{/if}
										</td>
										<td class="px-4 py-3 text-right">
											{#if g.state === 'active'}
												<button
													disabled={busy}
													onclick={() => handleRevokeGrant(g.id)}
													class="rounded border border-red-800/40 bg-red-950/40 px-2 py-1 text-[11px] font-medium text-red-400 hover:bg-red-900/50"
												>
													Cabut Akses
												</button>
											{/if}
										</td>
									</tr>
								{/each}
							{/if}
						</tbody>
					</table>
				</div>
			</div>
		{/if}
	</main>
</div>
