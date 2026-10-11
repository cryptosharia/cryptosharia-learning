import {
	onAuthStateChanged,
	signInWithPopup,
	signInWithEmailAndPassword,
	createUserWithEmailAndPassword,
	GoogleAuthProvider,
	signOut,
	updatePassword,
	EmailAuthProvider,
	reauthenticateWithCredential,
	linkWithCredential,
	type User
} from 'firebase/auth';
import { doc, setDoc, getDoc, serverTimestamp } from 'firebase/firestore';
import { FirebaseError } from 'firebase/app';
import { auth, db, ensureFirebaseReady } from '$lib/firebase';

let currentUser = $state<User | null>(null);
let loading = $state(true);
let error = $state<string | null>(null);

const googleProvider = new GoogleAuthProvider();

/** Save or update user profile in Firestore */
async function saveUserToFirestore(user: User, provider: string) {
	const userRef = doc(db, 'users', user.uid);
	const userSnap = await getDoc(userRef);

	if (!userSnap.exists()) {
		// New user — create profile
		await setDoc(userRef, {
			uid: user.uid,
			email: user.email,
			displayName: user.displayName || '',
			photoURL: user.photoURL || null,
			provider,
			createdAt: serverTimestamp(),
			lastLoginAt: serverTimestamp()
		});
	} else {
		// Existing user — update last login
		await setDoc(userRef, { lastLoginAt: serverTimestamp() }, { merge: true });
	}
}

/** Initialize auth state listener */
export function initAuth() {
	if (typeof window === 'undefined') return;
	let cancelled = false;
	let unsubscribe: (() => void) | undefined;
	void ensureFirebaseReady()
		.then(() => {
			if (cancelled) return;

			unsubscribe = onAuthStateChanged(auth, (user) => {
				currentUser = user;
				loading = false;
			});
		})
		.catch(() => {
			if (!cancelled) {
				error = 'Layanan akun belum tersedia.';
				loading = false;
				currentUser = null;
			}
		});
	return () => {
		cancelled = true;
		unsubscribe?.();
	};
}

/** Login with Google popup */
export async function loginWithGoogle() {
	error = null;
	try {
		await ensureFirebaseReady();
		const result = await signInWithPopup(auth, googleProvider);
		await saveUserToFirestore(result.user, 'google');
	} catch (e) {
		if ((e instanceof FirebaseError ? e.code : '') === 'auth/popup-closed-by-user') {
			error = 'Login dibatalkan.';
			throw e;
		}
		error = (e instanceof Error ? e.message : '') || 'Gagal login dengan Google';
		throw e;
	}
}

/** Login with email/password */
export async function loginWithEmail(email: string, password: string) {
	error = null;
	try {
		await ensureFirebaseReady();
		const result = await signInWithEmailAndPassword(auth, email, password);
		await saveUserToFirestore(result.user, 'email');
	} catch (e) {
		if (
			(e instanceof FirebaseError ? e.code : '') === 'auth/user-not-found' ||
			(e instanceof FirebaseError ? e.code : '') === 'auth/wrong-password' ||
			(e instanceof FirebaseError ? e.code : '') === 'auth/invalid-credential'
		) {
			error = 'Email atau password salah';
		} else if ((e instanceof FirebaseError ? e.code : '') === 'auth/too-many-requests') {
			error = 'Terlalu banyak percobaan. Coba lagi nanti.';
		} else {
			error = (e instanceof Error ? e.message : '') || 'Gagal login';
		}
		throw e;
	}
}

/** Register with email/password */
export async function registerWithEmail(email: string, password: string) {
	error = null;
	try {
		await ensureFirebaseReady();
		const result = await createUserWithEmailAndPassword(auth, email, password);
		await saveUserToFirestore(result.user, 'email');
	} catch (e) {
		if ((e instanceof FirebaseError ? e.code : '') === 'auth/email-already-in-use') {
			error = 'Email sudah terdaftar. Silakan login.';
		} else if ((e instanceof FirebaseError ? e.code : '') === 'auth/weak-password') {
			error = 'Password minimal 6 karakter';
		} else {
			error = (e instanceof Error ? e.message : '') || 'Gagal mendaftar';
		}
		throw e;
	}
}

/** Change password for current user */
export async function changePassword(currentPassword: string, newPassword: string) {
	error = null;
	await ensureFirebaseReady();
	if (!auth.currentUser) throw new Error('Not authenticated');
	const user = auth.currentUser as User;
	const hasPassword = (user.providerData || []).some((p) => p.providerId === 'password');

	try {
		if (hasPassword) {
			// User already has email/password — re-authenticate then update
			const credential = EmailAuthProvider.credential(user.email || '', currentPassword);
			await reauthenticateWithCredential(user, credential);
			await updatePassword(user, newPassword);
		} else {
			// Google-only user — link a new email/password provider
			const credential = EmailAuthProvider.credential(user.email || '', newPassword);
			await linkWithCredential(user, credential);
		}
		const userRef = doc(db, 'users', user.uid);
		await setDoc(userRef, { updatedAt: serverTimestamp() }, { merge: true });
	} catch (e) {
		if (
			(e instanceof FirebaseError ? e.code : '') === 'auth/wrong-password' ||
			(e instanceof FirebaseError ? e.code : '') === 'auth/invalid-credential'
		) {
			error = 'Password lama salah';
		} else if ((e instanceof FirebaseError ? e.code : '') === 'auth/weak-password') {
			error = 'Password baru terlalu lemah (minimal 6 karakter)';
		} else if ((e instanceof FirebaseError ? e.code : '') === 'auth/provider-already-linked') {
			error = 'Akun sudah memiliki password. Gunakan password lama untuk mengubah.';
		} else {
			error = (e instanceof Error ? e.message : '') || 'Gagal mengubah password';
		}
		throw e;
	}
}

/** Logout */
export async function logout() {
	await signOut(auth);
}

/** Reactive auth object */
export const userAuth = {
	get user() {
		return currentUser;
	},
	get loading() {
		return loading;
	},
	get error() {
		return error;
	},
	get isLoggedIn() {
		return !!currentUser;
	},
	get hasPasswordProvider() {
		return (currentUser?.providerData || []).some((p) => p.providerId === 'password');
	},
	init: initAuth,
	loginWithGoogle,
	loginWithEmail,
	registerWithEmail,
	changePassword,
	logout
};
