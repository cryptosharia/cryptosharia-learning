export type AcademyBackendMode = 'api' | 'emulator' | 'disabled';

/**
 * Resolves the explicit backend mode for CryptoSharia Academy.
 * - 'api': CryptoSharia API v2 + SvelteKit BFF.
 * - 'emulator': Local Firebase emulator regression testing.
 * - 'disabled': Safe unavailable state (default).
 */
export function resolveBackendMode(env: Record<string, string | undefined>): AcademyBackendMode {
	if (env.PUBLIC_ACADEMY_ENABLED !== 'true') {
		return 'disabled';
	}

	const backend = env.PUBLIC_ACADEMY_BACKEND;

	if (backend === 'api') {
		if (env.PUBLIC_FIREBASE_MODE && env.PUBLIC_FIREBASE_MODE !== 'disabled') {
			throw new Error(
				'Live Firebase and API mode cannot be mixed. Select disabled Firebase for API mode.'
			);
		}
		return 'api';
	}

	if (backend === 'emulator' || (!backend && env.PUBLIC_FIREBASE_MODE === 'emulator')) {
		return 'emulator';
	}

	return 'disabled';
}

export const resolveAcademyMode = resolveBackendMode;

/**
 * Checks if Academy API mode is actively selected and enabled.
 */
export function isApiMode(env: Record<string, string | undefined>): boolean {
	return resolveBackendMode(env) === 'api';
}

/**
 * Checks if Academy Emulator mode is actively selected and enabled.
 */
export function isEmulatorMode(env: Record<string, string | undefined>): boolean {
	return resolveBackendMode(env) === 'emulator';
}
