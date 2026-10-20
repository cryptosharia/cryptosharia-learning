const FALLBACK_DESTINATION = '/e-learning';
const ADMIN_ROLES = new Set(['admin', 'super_admin']);

function hasUnsafeCharacter(value: string) {
	for (const character of value) {
		const code = character.charCodeAt(0);
		if (character === '\\' || code < 32 || code === 127) return true;
	}
	return false;
}

/** Accept only known Academy routes; a login redirect never controls an origin. */
export function safePostLoginDestination(value: string | null, role?: string): string {
	if (!value || !value.startsWith('/') || value.startsWith('//') || hasUnsafeCharacter(value))
		return FALLBACK_DESTINATION;

	try {
		const destination = new URL(value, 'https://academy.invalid');
		if (destination.origin !== 'https://academy.invalid') return FALLBACK_DESTINATION;

		if (destination.pathname === '/admin/courses') {
			return ADMIN_ROLES.has(role ?? '') ? destination.pathname : FALLBACK_DESTINATION;
		}
		if (destination.pathname === '/profile') {
			return ['', '#profil-akun'].includes(destination.hash) && !destination.search
				? `${destination.pathname}${destination.hash}`
				: FALLBACK_DESTINATION;
		}
		if (destination.pathname === '/' || destination.pathname === '/e-learning') {
			return !destination.search && !destination.hash ? destination.pathname : FALLBACK_DESTINATION;
		}
		if (/^\/e-learning\/[A-Za-z0-9_-]+$/.test(destination.pathname)) {
			const lesson = destination.searchParams.get('lesson');
			const onlyLessonParameter = [...destination.searchParams.keys()].every(
				(key) => key === 'lesson'
			);
			return onlyLessonParameter &&
				(!lesson || /^[A-Za-z0-9_-]+$/.test(lesson)) &&
				!destination.hash
				? `${destination.pathname}${destination.search}`
				: FALLBACK_DESTINATION;
		}
	} catch {
		return FALLBACK_DESTINATION;
	}

	return FALLBACK_DESTINATION;
}
