type PublicEnvironment = Record<string, string | undefined>;
export type FirebaseSettings = {
	mode: 'disabled' | 'emulator' | 'live';
	config: {
		apiKey: string;
		authDomain: string;
		projectId: string;
		messagingSenderId: string;
		appId: string;
	};
	authEmulatorUrl: string;
	firestoreEmulatorUrl: string;
};

function loopbackUrl(value: string | undefined, label: string): string {
	if (!value) throw new Error(`${label} is required in emulator mode.`);
	const url = new URL(value);
	if (
		url.protocol !== 'http:' ||
		!['127.0.0.1', 'localhost'].includes(url.hostname) ||
		!url.port ||
		url.username ||
		url.password ||
		url.pathname !== '/' ||
		url.search ||
		url.hash
	) {
		throw new Error(`${label} must be an explicit loopback HTTP endpoint.`);
	}
	return url.origin;
}

export function resolveFirebaseSettings(env: PublicEnvironment): FirebaseSettings {
	const mode = env.PUBLIC_FIREBASE_MODE || 'disabled';
	if (!['disabled', 'emulator', 'live'].includes(mode)) throw new Error('Invalid Firebase mode.');
	if (mode === 'disabled') {
		// ponytail: inert SDK handles preserve existing imports; both services stay on loopback.
		return {
			mode,
			config: {
				apiKey: 'demo-disabled-key',
				authDomain: 'localhost',
				projectId: 'demo-disabled',
				messagingSenderId: '0',
				appId: 'demo-disabled'
			},
			authEmulatorUrl: 'http://127.0.0.1:1',
			firestoreEmulatorUrl: 'http://127.0.0.1:1'
		};
	}
	const names = ['API_KEY', 'AUTH_DOMAIN', 'PROJECT_ID', 'MESSAGING_SENDER_ID', 'APP_ID'] as const;
	for (const name of names) {
		if (!env[`PUBLIC_FIREBASE_${name}`]?.trim())
			throw new Error(`PUBLIC_FIREBASE_${name} is required.`);
	}
	const config = {
		apiKey: env.PUBLIC_FIREBASE_API_KEY!.trim(),
		authDomain: env.PUBLIC_FIREBASE_AUTH_DOMAIN!.trim(),
		projectId: env.PUBLIC_FIREBASE_PROJECT_ID!.trim(),
		messagingSenderId: env.PUBLIC_FIREBASE_MESSAGING_SENDER_ID!.trim(),
		appId: env.PUBLIC_FIREBASE_APP_ID!.trim()
	};
	if (mode === 'emulator') {
		if (
			!/^demo-[a-z0-9-]+$/.test(config.projectId) ||
			config.authDomain !== 'localhost' ||
			!config.apiKey.startsWith('demo-')
		)
			throw new Error('Emulator mode requires synthetic demo configuration.');
		const authEmulatorUrl = loopbackUrl(env.PUBLIC_FIREBASE_AUTH_EMULATOR_URL, 'Auth emulator URL');
		const firestoreEmulatorUrl = loopbackUrl(
			env.PUBLIC_FIREBASE_FIRESTORE_EMULATOR_URL,
			'Firestore emulator URL'
		);
		if (authEmulatorUrl === firestoreEmulatorUrl)
			throw new Error('Auth and Firestore require separate endpoints.');
		return { mode, config, authEmulatorUrl, firestoreEmulatorUrl };
	}
	if (
		config.projectId.startsWith('demo-') ||
		env.PUBLIC_FIREBASE_AUTH_EMULATOR_URL ||
		env.PUBLIC_FIREBASE_FIRESTORE_EMULATOR_URL
	)
		throw new Error('Live and emulator configuration cannot be mixed.');
	return { mode: 'live', config, authEmulatorUrl: '', firestoreEmulatorUrl: '' };
}

// Standalone Academy has no approved hosted backend. Reject live before SDK initialization.
export function resolveAcademyFirebaseSettings(env: PublicEnvironment): FirebaseSettings {
	const settings = resolveFirebaseSettings(env);
	if (settings.mode === 'live')
		throw new Error('Standalone Academy supports local emulators only.');
	return settings;
}

export async function requireFirebaseServices(
	settings: FirebaseSettings,
	fetcher: typeof fetch = fetch
): Promise<void> {
	if (settings.mode === 'disabled') throw new Error('Firebase is disabled.');
	if (settings.mode !== 'emulator') return;
	await Promise.all(
		[settings.authEmulatorUrl, settings.firestoreEmulatorUrl].map(async (origin) => {
			const response = await fetcher(`${origin}/`, {
				signal: AbortSignal.timeout(3000),
				redirect: 'error'
			});
			if (response.status >= 500) throw new Error('Required emulator is unavailable.');
		})
	);
}
