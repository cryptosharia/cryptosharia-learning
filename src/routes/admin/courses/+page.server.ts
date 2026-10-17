import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { getAdminStats, getAdminScopes, getAdminContent } from '$lib/server/apiClient';

export const load: PageServerLoad = async ({ locals }) => {
	if (!locals.user || !locals.accessToken) {
		throw redirect(303, '/auth/login?redirect=/admin/courses');
	}

	if (locals.user.role !== 'super_admin' && locals.user.role !== 'admin') {
		throw redirect(303, '/e-learning');
	}

	const [statsRes, scopesRes, contentRes] = await Promise.all([
		getAdminStats(locals.accessToken),
		getAdminScopes(locals.accessToken),
		getAdminContent({}, locals.accessToken)
	]);

	return {
		user: locals.user,
		initialStats: statsRes.ok ? statsRes.data : null,
		initialScopes: scopesRes.ok ? scopesRes.data ?? [] : [],
		initialContent: contentRes.ok ? contentRes.data ?? [] : []
	};
};
