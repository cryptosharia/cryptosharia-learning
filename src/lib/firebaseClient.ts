import { initializeApp, getApps } from 'firebase/app';
import { connectAuthEmulator, getAuth } from 'firebase/auth';
import { connectFirestoreEmulator, getFirestore } from 'firebase/firestore';
import {
	connectFirestoreEmulator as connectLiteEmulator,
	getFirestore as getLiteFirestore
} from 'firebase/firestore/lite';
import type { FirebaseSettings } from './firebaseConfig.ts';

const clientConfigurations = new Map<string, string>();

export function initializeFirebaseClient(
	settings: FirebaseSettings,
	name = `academy-${settings.mode}`
) {
	const existing = getApps().find((app) => app.name === name);
	const fingerprint = JSON.stringify(settings);
	if (existing && clientConfigurations.get(name) !== fingerprint)
		throw new Error('Firebase client configuration changed; restart the app.');
	const app = existing || initializeApp(settings.config, name);
	const auth = getAuth(app);
	const db = getFirestore(app);
	const lessonDb = getLiteFirestore(app);
	if (!existing && settings.mode !== 'live') {
		connectAuthEmulator(auth, settings.authEmulatorUrl, { disableWarnings: true });
		const endpoint = new URL(settings.firestoreEmulatorUrl);
		connectFirestoreEmulator(db, endpoint.hostname, Number(endpoint.port));
		connectLiteEmulator(lessonDb, endpoint.hostname, Number(endpoint.port));
	}
	clientConfigurations.set(name, fingerprint);
	return { app, auth, db, lessonDb };
}
