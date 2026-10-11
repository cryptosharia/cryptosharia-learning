<script lang="ts">
	import { onMount } from 'svelte';
	import { onAuthStateChanged } from 'firebase/auth';
	import { collection, getDocsFromServer, Timestamp } from 'firebase/firestore';
	import { auth, db, ensureFirebaseReady } from '$lib/firebase';
	import {
		academyRoles,
		saveEditorial,
		transitionEditorial,
		deleteDraft,
		writeGrant,
		type Editorial,
		type Metadata
	} from '$lib/academyData';
	import { parseYouTubeUrl } from '$lib/youtube';
	import { subjects } from '$lib/academyCurriculum';
	let roles = $state({ admin: false, reviewer: false, publisher: false, syariah: false });
	let items = $state<Editorial[]>([]),
		loading = $state(true),
		error = $state(''),
		result = $state(''),
		busy = $state(false);
	let edit = $state<Editorial | null>(null);
	let kind = $state<Metadata['kind']>('lesson'),
		parentId = $state(''),
		subjectId = $state('fundamental'),
		chapterNumber = $state(1),
		order = $state(0),
		description = $state('');
	let title = $state(''),
		scope = $state(''),
		chapter = $state(''),
		subject = $state(''),
		instructor = $state(''),
		videoUrl = $state(''),
		level = $state(1),
		duration = $state(60),
		required = $state(false);
	let grantUid = $state(''),
		grantScope = $state(''),
		grantHours = $state(1);
	let generation = 0;
	async function refresh() {
		const g = ++generation,
			uid = auth.currentUser?.uid;
		items = [];
		roles = { admin: false, reviewer: false, publisher: false, syariah: false };
		loading = true;
		error = '';
		choose(null);
		try {
			await ensureFirebaseReady();
			const r = await academyRoles(auth.currentUser);
			if (g !== generation || auth.currentUser?.uid !== uid) return;
			roles = r;
			if (r.admin || r.reviewer || r.publisher) {
				const snap = await getDocsFromServer(collection(db, 'academy_editorial'));
				if (g === generation && auth.currentUser?.uid === uid)
					items = snap.docs.map((d) => d.data() as Editorial);
			}
		} catch {
			if (g === generation) error = 'Backend tidak tersedia atau izin ditolak.';
		} finally {
			if (g === generation) loading = false;
		}
	}
	onMount(() => {
		const stop = onAuthStateChanged(auth, () => {
			void refresh();
		});
		return () => {
			generation++;
			stop();
		};
	});
	function choose(item: Editorial | null) {
		edit = item;
		kind = item?.metadata.kind ?? 'lesson';
		parentId = item?.metadata.parentId ?? '';
		subjectId = item?.metadata.subjectId ?? 'fundamental';
		chapterNumber = item?.metadata.chapterNumber ?? 1;
		order = item?.metadata.order ?? 0;
		description = item?.metadata.description ?? '';
		title = item?.metadata.title ?? '';
		scope = item?.metadata.scopeId ?? '';
		chapter = item?.metadata.chapter ?? '';
		subject = item?.metadata.subject ?? '';
		instructor = item?.metadata.instructor ?? '';
		videoUrl = item?.media ? `https://youtu.be/${item.media.videoId}` : '';
		level = item?.metadata.level ?? 1;
		duration = item?.metadata.durationSeconds ?? 60;
		required = item?.syariahRequired ?? false;
	}
	async function perform(action: (uid: string) => Promise<void>) {
		const uid = auth.currentUser?.uid;
		if (!uid) return;
		busy = true;
		error = '';
		result = '';
		try {
			await action(uid);
			if (auth.currentUser?.uid === uid) {
				await refresh();
				result = 'Perubahan tersimpan.';
			}
		} catch (e) {
			if (auth.currentUser?.uid === uid)
				error = e instanceof Error ? e.message : 'Operasi ditolak.';
		} finally {
			busy = false;
		}
	}
	async function save(uid: string) {
		const video = parseYouTubeUrl(videoUrl);
		if (kind === 'lesson' && !video) throw new Error('Tautan YouTube tidak valid.');
		const parent = items.find((item) => item.metadata.id === parentId)?.metadata;
		if (kind !== 'subject' && !parent) throw new Error('Pilih parent kurikulum yang valid.');
		const id = edit?.metadata.id ?? (kind === 'subject' ? subjectId : crypto.randomUUID());
		await saveEditorial(
			db,
			uid,
			{
				metadata: {
					id,
					kind,
					parentId: kind === 'subject' ? 'root' : parentId,
					subjectId: parent?.subjectId ?? subjectId,
					chapterNumber: kind === 'lesson' ? parent!.chapterNumber : chapterNumber,
					scopeId: parent?.scopeId ?? scope,
					subject: parent?.subject ?? subject,
					level: kind === 'lesson' || kind === 'chapter' ? parent!.level : level,
					chapter: kind === 'lesson' ? parent!.title : chapter,
					title,
					description,
					thumbnail: edit?.metadata.thumbnail ?? '/favicon.png',
					durationSeconds: kind === 'lesson' ? duration : 0,
					order,
					instructor: kind === 'lesson' ? instructor : ''
				},
				media:
					kind !== 'lesson'
						? null
						: {
								...(edit?.media ?? {
									readingRefs: [],
									slideRefs: [],
									subtitleRefs: [],
									attachmentRefs: [],
									internalNote: ''
								}),
								videoId: video!.videoId
							},
				syariahRequired: required
			},
			edit?.version ?? null
		);
	}
	async function grant(uid: string, state: 'active' | 'revoked') {
		await writeGrant(
			db,
			uid,
			grantUid,
			grantScope,
			state,
			Timestamp.fromMillis(Date.now() - 1000),
			Timestamp.fromMillis(Date.now() + grantHours * 3600000)
		);
	}
</script>

<svelte:head><title>Kelola Materi | CryptoSharia Academy</title></svelte:head>
<section class="mx-auto max-w-5xl px-6 py-24">
	<h1 class="text-2xl font-bold">Kelola Materi Academy</h1>
	<p>Lingkungan lokal sintetis. Role organisasi dan materi nyata belum disetujui.</p>
	{#if loading}<p role="status">
			Memuat otoritas…
		</p>{:else if !roles.admin && !roles.reviewer && !roles.publisher}<p role="status">
			Akses pengelolaan ditolak.
		</p>{:else}
		<ul class="my-6 space-y-4">
			{#each items as item (item.metadata.id)}<li class="rounded border p-4">
					<strong>{item.metadata.title}</strong>
					<p>{item.status} · versi {item.version}</p>
					{#if roles.admin}<button onclick={() => choose(item)}>Edit</button>{/if}
					{#if roles.admin && item.status === 'draft'}<button
							disabled={busy}
							onclick={() =>
								perform((uid) =>
									transitionEditorial(db, uid, item.metadata.id, item.version, 'review')
								)}>Ajukan review</button
						>{#if item.metadata.kind === 'lesson'}<button
								disabled={busy}
								onclick={() =>
									perform((uid) => deleteDraft(db, uid, item.metadata.id, item.version))}
								>Hapus draft</button
							>{/if}{/if}
					{#if roles.reviewer && item.status === 'review'}<button
							disabled={busy}
							onclick={() =>
								perform((uid) =>
									transitionEditorial(db, uid, item.metadata.id, item.version, 'approved')
								)}>Setujui rights dan review</button
						>{/if}
					{#if roles.reviewer && ['review', 'approved'].includes(item.status)}<button
							disabled={busy}
							onclick={() =>
								perform((uid) =>
									transitionEditorial(db, uid, item.metadata.id, item.version, 'draft')
								)}>Tolak / kembali ke draft</button
						>{/if}
					{#if roles.publisher && item.status === 'approved'}<button
							disabled={busy}
							onclick={() =>
								perform((uid) =>
									transitionEditorial(db, uid, item.metadata.id, item.version, 'published')
								)}>Terbitkan versi disetujui</button
						>{/if}
				</li>{/each}
		</ul>
		{#if roles.admin}
			<button onclick={() => choose(null)}>Draft baru</button>
			<form
				class="my-6 grid gap-3"
				onsubmit={(e) => {
					e.preventDefault();
					void perform(save);
				}}
			>
				<h2>{edit ? 'Edit materi (review ulang)' : 'Draft baru'}</h2>
				{#if edit}<p>ID tetap: {edit.metadata.id}</p>{/if}
				<label for="curriculum-kind">Jenis kurikulum</label><select
					id="curriculum-kind"
					disabled={!!edit}
					bind:value={kind}
					><option value="subject">Bidang</option><option value="level">Level</option><option
						value="chapter">Bab</option
					><option value="lesson">Lesson</option></select
				>
				{#if kind === 'subject'}<label for="subject-id">Identitas bidang</label><select
						id="subject-id"
						bind:value={subjectId}
						>{#each subjects as s (s.id)}<option value={s.id}>{s.title}</option>{/each}</select
					>
				{:else}<label for="curriculum-parent">Parent kurikulum</label><select
						id="curriculum-parent"
						required
						bind:value={parentId}
						><option value="">Pilih parent</option
						>{#each items.filter((i) => i.metadata.kind === { subject: 'root', level: 'subject', chapter: 'level', lesson: 'chapter' }[kind]) as p (p.metadata.id)}<option
								value={p.metadata.id}>{p.metadata.title} · {p.status} · {p.metadata.id}</option
							>{/each}</select
					>{/if}
				<label
					>Deskripsi / learning outcomes<textarea maxlength="2000" bind:value={description}
					></textarea></label
				>
				<label>Urutan<input type="number" min="0" max="10000" required bind:value={order} /></label>
				<label
					>Nomor bab<input
						type="number"
						min="1"
						max="7"
						required
						bind:value={chapterNumber}
					/></label
				>
				<label>Judul<input required bind:value={title} /></label><label
					>Scope ID<input required pattern={'[a-zA-Z0-9_-]{1,80}'} bind:value={scope} /></label
				>
				<label>Bidang<input required bind:value={subject} /></label><label
					>Level<input type="number" min="1" max="6" bind:value={level} /></label
				><label>Bab<input required bind:value={chapter} /></label>
				{#if kind === 'lesson'}<label
						>Pemateri disetujui<input required bind:value={instructor} /></label
					><label
						>Durasi detik<input type="number" min="1" max="86400" bind:value={duration} /></label
					><label>Tautan video<input required type="url" bind:value={videoUrl} /></label>{/if}
				<label><input type="checkbox" bind:checked={required} /> Memerlukan review syariah</label
				><button disabled={busy}>Simpan draft</button>
			</form>
			<form
				class="my-6 grid gap-3"
				onsubmit={(e) => {
					e.preventDefault();
					void perform((uid) => grant(uid, 'active'));
				}}
			>
				<h2>Grant sintetis per scope</h2>
				<label>UID peserta<input required bind:value={grantUid} /></label><label
					>Scope ID<input required pattern={'[a-zA-Z0-9_-]{1,80}'} bind:value={grantScope} /></label
				><label
					>Masa akses (jam)<input type="number" min="1" max="24" bind:value={grantHours} /></label
				><button disabled={busy}>Berikan grant</button><button
					type="button"
					disabled={busy}
					onclick={() => perform((uid) => grant(uid, 'revoked'))}>Cabut grant</button
				>
			</form>
		{/if}{/if}
	{#if error}<p role="alert">{error}</p>{/if}
	<p role="status">{result}</p>
</section>

<style>
	input:not([type='checkbox']) {
		display: block;
		border: 1px solid #777;
		padding: 0.5rem;
		width: 100%;
	}
	button {
		border: 1px solid #777;
		padding: 0.5rem;
		margin: 0.25rem;
	}
</style>
