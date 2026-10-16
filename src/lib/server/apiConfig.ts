export interface ApiConfig {
	baseUrl: string;
	apiKey: string;
}

let dynamicPrivateEnv: Record<string, string | undefined> = {};

try {
	const mod = await import('$env/dynamic/private');
	dynamicPrivateEnv = mod.env || {};
} catch {
	// Running in standalone test runner or non-SvelteKit environment
}

/**
 * Resolves API configuration from an explicit environment dictionary.
 */
export function resolveApiConfig(env: Record<string, string | undefined>): ApiConfig {
	let baseUrl = '';
	try {
		const url = new URL(env.API_BASE_URL || '');
		const isLoopback =
			url.protocol === 'http:' &&
			['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname) &&
			!url.username &&
			!url.password &&
			!url.search &&
			!url.hash;
		const isApprovedProductionApi =
			env.VERCEL_ENV === 'production' &&
			url.origin === 'https://api.cryptosharia.id' &&
			url.pathname === '/' &&
			!url.username &&
			!url.password &&
			!url.search &&
			!url.hash;

		// Keep local testing loopback-only and production pinned to the owner-specified API origin.
		if (isLoopback || isApprovedProductionApi) {
			baseUrl = url.href.replace(/\/+$/, '');
		}
	} catch {
		/* Missing or malformed configuration stays unavailable. */
	}
	const apiKey = env.API_KEY || '';
	return { baseUrl, apiKey };
}

/**
 * Retrieves server-side private configuration for CryptoSharia API v2.
 * Never exposed to browser bundles or client responses.
 */
export function getApiConfig(): ApiConfig {
	return resolveApiConfig({ ...dynamicPrivateEnv, ...process.env });
}
