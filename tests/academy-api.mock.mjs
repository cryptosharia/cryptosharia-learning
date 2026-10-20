import { createServer } from 'node:http';

// Synthetic contract double only. No database, SMTP, Redis or remote API is used.
export async function mockAcademyApi() {
	const state = {
		online: true,
		grant: 'active',
		version: 1,
		refreshes: 0,
		profileFailure: false,
		rateLimited: false,
		mail: [],
		progress: new Map(),
		completions: new Map(),
		sessions: new Set(),
		accessUsers: new Set(),
		invalidUsers: new Set(),
		contentUpdates: []
	};
	const key = 'package3-synthetic-private-key';
	const lesson = () => ({
		id: 'lesson-synthetic',
		kind: 'lesson',
		parentId: 'chapter-synthetic',
		subjectId: 'fundamental',
		level: 1,
		chapterNumber: 1,
		order: 0,
		scopeId: 'scope-synthetic',
		title: 'Pelajaran sintetis Package 3',
		description: 'Data pengujian lokal',
		thumbnail: '/favicon.png',
		durationSeconds: 120,
		instructor: 'Pengajar sintetis',
		status: 'published',
		version: state.version,
		publishedAt: '2026-01-01T00:00:00Z'
	});
	const curriculum = () => [
		{
			...lesson(),
			id: 'fundamental',
			kind: 'subject',
			parentId: 'root',
			order: 0,
			title: 'Analisis Fundamental'
		},
		{
			...lesson(),
			id: 'level-synthetic',
			kind: 'level',
			parentId: 'fundamental',
			title: 'Level sintetis'
		},
		{
			...lesson(),
			id: 'chapter-synthetic',
			kind: 'chapter',
			parentId: 'level-synthetic',
			title: 'Bab sintetis'
		},
		lesson()
	];
	const adminContent = [
		{
			id: 'fundamental',
			kind: 'subject',
			parentId: 'root',
			subjectId: 'fundamental',
			level: 1,
			chapterNumber: 1,
			order: 0,
			title: 'Analisis Fundamental · data QA',
			status: 'published',
			version: 1,
			syariahRequired: false,
			rightsConfirmed: true
		},
		{
			id: 'admin-level-synthetic',
			kind: 'level',
			parentId: 'fundamental',
			subjectId: 'fundamental',
			level: 1,
			chapterNumber: 1,
			order: 0,
			title: 'Level QA sintetis',
			status: 'published',
			version: 1,
			syariahRequired: false,
			rightsConfirmed: true
		},
		{
			id: 'admin-chapter-synthetic',
			kind: 'chapter',
			parentId: 'admin-level-synthetic',
			subjectId: 'fundamental',
			level: 1,
			chapterNumber: 1,
			order: 0,
			title: 'Bab QA sintetis',
			status: 'published',
			version: 1,
			syariahRequired: false,
			rightsConfirmed: true
		},
		{
			id: 'admin-lesson-synthetic',
			kind: 'lesson',
			parentId: 'admin-chapter-synthetic',
			subjectId: 'fundamental',
			level: 1,
			chapterNumber: 1,
			order: 0,
			scopeId: 'scope-synthetic',
			title: 'Pelajaran sintetis QA',
			description: 'Konten pengujian lokal; bukan materi resmi.',
			status: 'draft',
			version: 1,
			durationSeconds: 120,
			syariahRequired: true,
			rightsConfirmed: false
		}
	];
	state.adminContent = adminContent;
	const server = createServer(async (req, res) => {
		const reply = (status, data, headers = {}) => {
			res.writeHead(status, { 'content-type': 'application/json', ...headers });
			res.end(data === undefined ? undefined : JSON.stringify(data));
		};
		if (!state.online)
			return reply(503, { error: 'SERVICE_UNAVAILABLE', message: 'Backend sintetis offline' });
		if (req.headers['api-key'] !== key) return reply(401, { error: 'UNAUTHORIZED' });
		let body = {};
		try {
			let raw = '';
			for await (const chunk of req) raw += chunk;
			if (raw) body = JSON.parse(raw);
		} catch {
			return reply(422, { error: 'VALIDATION_ERROR' });
		}
		const path = new URL(req.url, 'http://127.0.0.1').pathname;
		if (path === '/auth/otp/request') {
			if (state.rateLimited)
				return reply(
					429,
					{ error: 'OTP_REQUEST_RATE_LIMITED', message: 'Coba lagi setelah 60 detik.' },
					{ 'retry-after': '60' }
				);
			state.mail.push({ email: body.email, code: '123456' });
			return reply(204);
		}
		if (path === '/auth/otp/verify') {
			if (body.code !== '123456' || !state.mail.some((m) => m.email === body.email))
				return reply(400, { error: 'OTP_INVALID_OR_EXPIRED', message: 'OTP tidak valid' });
			const uid = body.email.split('@')[0];
			state.sessions.add(uid);
			state.accessUsers.add(uid);
			return reply(200, { accessToken: `mock-access-${uid}`, refreshToken: `${uid}:mock-refresh` });
		}
		if (path === '/auth/refresh') {
			state.refreshes++;
			const uid = body.refreshToken?.split(':')[0];
			if (!state.sessions.has(uid)) return reply(401, { error: 'REFRESH_TOKEN_INVALID' });
			return reply(200, { accessToken: `mock-access-${uid}` });
		}
		if (path === '/auth/signout') {
			state.sessions.delete(body.refreshToken?.split(':')[0]);
			return reply(204);
		}
		if (path === '/academy/catalog') return reply(200, [lesson()]);
		if (path === '/academy/curriculum') return reply(200, curriculum());
		const uid = req.headers.authorization?.replace('Bearer mock-access-', '');
		if (!uid || !state.accessUsers.has(uid) || state.invalidUsers.has(uid))
			return reply(401, { error: 'UNAUTHORIZED' });
		if (path === '/auth/me')
			return state.profileFailure
				? reply(503, { error: 'SERVICE_UNAVAILABLE' })
				: reply(200, {
						id: uid,
						email: `${uid}@example.test`,
						name: uid,
						role: uid === 'admin' ? 'admin' : 'member',
						status: 'active'
					});
		if (path.startsWith('/academy/admin/')) {
			if (uid !== 'admin') return reply(403, { error: 'FORBIDDEN' });
			if (path === '/academy/admin/stats')
				return reply(200, {
					totalLessons: 1,
					publishedLessons: 0,
					draftContent: 1,
					reviewContent: 0,
					totalScopes: 1,
					totalGrants: 1
				});
			if (path === '/academy/admin/scopes')
				return reply(200, [
					{
						id: 'scope-synthetic',
						name: 'Scope sintetis QA',
						description: 'Data uji lokal, bukan data siswa.',
						isActive: true,
						createdAt: '2026-01-01T00:00:00Z',
						updatedAt: '2026-01-01T00:00:00Z'
					}
				]);
			if (path === '/academy/admin/content') return reply(200, adminContent);
			const contentIdMatch = path.match(/^\/academy\/admin\/content\/([^/]+)$/);
			if (contentIdMatch && req.method === 'PUT') {
				const id = decodeURIComponent(contentIdMatch[1]);
				const item = adminContent.find((record) => record.id === id);
				if (!item) return reply(404, { error: 'NOT_FOUND' });
				const editableFields = [
					'title',
					'description',
					'thumbnail',
					'durationSeconds',
					'instructor',
					'order',
					'scopeId',
					'syariahRequired'
				];
				const updates = Object.fromEntries(
					editableFields.filter((field) => field in body).map((field) => [field, body[field]])
				);
				Object.assign(item, updates);
				state.contentUpdates.push({ id, body: structuredClone(body) });
				return reply(200, item);
			}
			if (path === '/academy/admin/grants')
				return reply(200, [
					{
						id: 'grant-synthetic',
						userId: 'learner-synthetic',
						scopeId: 'scope-synthetic',
						state: 'active',
						startsAt: '2026-01-01T00:00:00Z',
						expiresAt: '2099-01-01T00:00:00Z',
						source: 'QA fixture',
						createdAt: '2026-01-01T00:00:00Z'
					}
				]);
		}
		const entitled = uid === 'alice' && state.grant === 'active';
		const denial = () =>
			reply(403, {
				error:
					state.grant === 'expired'
						? 'GRANT_EXPIRED'
						: state.grant === 'revoked'
							? 'GRANT_REVOKED'
							: 'UNAUTHORIZED_SCOPE'
			});
		if (path === '/academy/me/grants')
			return reply(
				200,
				uid === 'alice'
					? [
							{
								userId: uid,
								scopeId: 'scope-synthetic',
								state: state.grant === 'revoked' ? 'revoked' : 'active',
								startsAt: '2020-01-01T00:00:00Z',
								expiresAt:
									state.grant === 'expired' ? '2021-01-01T00:00:00Z' : '2099-01-01T00:00:00Z'
							}
						]
					: []
			);
		if (path.startsWith('/academy/lessons/'))
			return entitled
				? reply(200, {
						lesson: lesson(),
						media: {
							videoId: 'synthetic01',
							version: state.version,
							readingRefs: [],
							slideRefs: [],
							subtitleRefs: [],
							attachmentRefs: []
						}
					})
				: denial();
		if (path === '/academy/me/progress')
			return reply(
				200,
				[...state.progress.values()].filter((p) => p.userId === uid)
			);
		if (path.startsWith('/academy/me/progress/')) {
			if (!entitled) return denial();
			if (body.version !== state.version)
				return reply(400, { error: 'COMPLETION_VERSION_MISMATCH' });
			const record = {
				userId: uid,
				lessonId: 'lesson-synthetic',
				...body,
				updatedAt: new Date().toISOString()
			};
			state.progress.set(uid, record);
			return reply(200, { success: true, ...body, lessonId: record.lessonId });
		}
		if (path === '/academy/me/completions') {
			const completions = [...state.completions.values()].filter((c) => c.userId === uid);
			const completed = entitled && completions.some((c) => c.version === state.version) ? 1 : 0;
			return reply(200, {
				completions,
				summary: { total: entitled ? 1 : 0, completed, percentage: completed * 100 }
			});
		}
		if (path.startsWith('/academy/me/completions/')) {
			if (!entitled) return denial();
			if (body.version !== state.version)
				return reply(400, { error: 'COMPLETION_VERSION_MISMATCH' });
			if (state.completions.get(uid)?.version !== body.version)
				state.completions.set(uid, {
					userId: uid,
					lessonId: 'lesson-synthetic',
					version: body.version,
					completedAt: new Date().toISOString()
				});
			return reply(200, { success: true, lessonId: 'lesson-synthetic', version: body.version });
		}
		return reply(404, { error: 'NOT_FOUND' });
	});
	await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
	return {
		state,
		key,
		url: `http://127.0.0.1:${server.address().port}`,
		close: () => new Promise((resolve) => server.close(resolve))
	};
}
