import { SvelteSet } from 'svelte/reactivity';
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
import * as publicEnv from '$env/static/public';
import { isApiMode } from '$lib/academyConfig';

export type AuthUser = {
	uid: string;
	email: string;
	displayName?: string;
	role?: string;
	hasPassword?: boolean;
	providerData?: { providerId: string }[];
};

let currentUser = $state<AuthUser | null>(null);
let loading = $state(true);
let error = $state<string | null>(null);
let authGeneration = 0;

const googleProvider = new GoogleAuthProvider();
const listeners = new SvelteSet<(user: AuthUser | null) => void>();

function notifyListeners() {
	listeners.forEach((listener) => {
		try {
			listener(currentUser);
		} catch {
			/* Ignore subscriber errors */
		}
	});
}

/** Subscribe to auth user changes */
export function onAuthChange(cb: (user: AuthUser | null) => void): () => void {
	listeners.add(cb);
	cb(currentUser);
	return () => {
		listeners.delete(cb);
	};
}

/** Save or update user profile in Firestore (emulator mode) */
async function saveUserToFirestore(user: User, provider: string) {
	const userRef = doc(db, 'users', user.uid);
	const userSnap = await getDoc(userRef);

	if (!userSnap.exists()) {
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
		await setDoc(userRef, { lastLoginAt: serverTimestamp() }, { merge: true });
	}
}

/** Initialize auth state listener */
export function initAuth() {
	if (typeof window === 'undefined') return;

	if (isApiMode(publicEnv)) {
		let cancelled = false;
		const generation = ++authGeneration;
		const expired = () => {
			++authGeneration;
			currentUser = null;
			loading = false;
			notifyListeners();
		};
		window.addEventListener('academy-session-expired', expired);
		loading = true;

		fetch('/api/auth/me', { headers: { accept: 'application/json' } })
			.then(async (res) => {
				if (cancelled || generation !== authGeneration) return;
				if (res.ok) {
					const data = await res.json();
					if (data?.user) {
						currentUser = {
							uid: data.user.id,
							email: data.user.email,
							displayName: data.user.name,
							role: data.user.role,
							hasPassword: data.user.hasPassword,
							providerData: []
						};
					} else {
						currentUser = null;
					}
				} else {
					currentUser = null;
				}
				loading = false;
				notifyListeners();
			})
			.catch(() => {
				if (cancelled || generation !== authGeneration) return;
				currentUser = null;
				loading = false;
				notifyListeners();
			});

		return () => {
			cancelled = true;
			window.removeEventListener('academy-session-expired', expired);
		};
	}

	let cancelled = false;
	let unsubscribe: (() => void) | undefined;
	void ensureFirebaseReady()
		.then(() => {
			if (cancelled) return;

			unsubscribe = onAuthStateChanged(auth, (user) => {
				if (user) {
					currentUser = {
						uid: user.uid,
						email: user.email || '',
						displayName: user.displayName || '',
						providerData: (user.providerData || []).map((p) => ({ providerId: p.providerId }))
					};
				} else {
					currentUser = null;
				}
				loading = false;
				notifyListeners();
			});
		})
		.catch(() => {
			if (!cancelled) {
				error = 'Layanan akun belum tersedia.';
				loading = false;
				currentUser = null;
				notifyListeners();
			}
		});

	return () => {
		cancelled = true;
		unsubscribe?.();
	};
}

/** Request OTP via API v2 */
export async function requestOtp(email: string): Promise<void> {
	error = null;
	const res = await fetch('/api/auth/otp/request', {
		method: 'POST',
		headers: { 'content-type': 'application/json' },
		body: JSON.stringify({ email })
	});

	if (!res.ok) {
		const data = await res.json().catch(() => null);
		const msg = data?.message || 'Gagal mengirim kode OTP.';
		error = msg;
		throw new Error(msg);
	}
}

/** Verify OTP via API v2 */
export async function verifyOtp(email: string, code: string): Promise<AuthUser> {
	++authGeneration;
	error = null;
	const res = await fetch('/api/auth/otp/verify', {
		method: 'POST',
		headers: { 'content-type': 'application/json' },
		body: JSON.stringify({ email, code })
	});

	if (!res.ok) {
		const data = await res.json().catch(() => null);
		const msg = data?.message || 'Kode verifikasi tidak valid atau telah kedaluwarsa.';
		error = msg;
		throw new Error(msg);
	}

	const data = await res.json();
	const user = data.user;
	currentUser = {
		uid: user.id,
		email: user.email,
		displayName: user.name,
		role: user.role,
		hasPassword: user.hasPassword,
		providerData: []
	};
	notifyListeners();
	return currentUser;
}

/** Login with the central CryptoSharia API password session. */
export async function loginWithPassword(email: string, password: string): Promise<AuthUser> {
	++authGeneration;
	error = null;
	const res = await fetch('/api/auth/password/login', {
		method: 'POST',
		headers: { 'content-type': 'application/json' },
		body: JSON.stringify({ email, password })
	});
	if (!res.ok) {
		const data = await res.json().catch(() => null);
		const message = data?.message || 'Email atau kata sandi tidak valid.';
		error = message;
		throw new Error(message);
	}

	const data = await res.json();
	const user = data.user;
	currentUser = {
		uid: user.id,
		email: user.email,
		displayName: user.name,
		role: user.role,
		hasPassword: user.hasPassword,
		providerData: []
	};
	notifyListeners();
	return currentUser;
}

/** Request a reset link through the API BFF. */
export async function requestPasswordReset(email: string): Promise<void> {
	error = null;
	const res = await fetch('/api/auth/password/forgot', {
		method: 'POST',
		headers: { 'content-type': 'application/json' },
		body: JSON.stringify({ email })
	});
	if (!res.ok) {
		const data = await res.json().catch(() => null);
		const message = data?.message || 'Permintaan belum dapat diproses. Coba lagi nanti.';
		error = message;
		throw new Error(message);
	}
}

/** Complete a one-time password reset token flow through the API BFF. */
export async function resetPassword(token: string, newPassword: string): Promise<void> {
	error = null;
	const res = await fetch('/api/auth/password/reset', {
		method: 'POST',
		headers: { 'content-type': 'application/json' },
		body: JSON.stringify({ token, newPassword })
	});
	if (!res.ok) {
		const data = await res.json().catch(() => null);
		const message = data?.message || 'Tautan reset tidak valid atau telah kedaluwarsa.';
		error = message;
		throw new Error(message);
	}
}

/** Add the first password after a fresh OTP proof on the active session. */
export async function setPassword(otpCode: string, newPassword: string): Promise<void> {
	error = null;
	const res = await fetch('/api/auth/password/set', {
		method: 'POST',
		headers: { 'content-type': 'application/json' },
		body: JSON.stringify({ otpCode, newPassword })
	});
	if (!res.ok) {
		const data = await res.json().catch(() => null);
		const message = data?.message || 'Kata sandi belum dapat diatur.';
		error = message;
		throw new Error(message);
	}
	if (currentUser) currentUser = { ...currentUser, hasPassword: true };
	notifyListeners();
}

/** Login with Google popup (emulator mode) */
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

/** Login with email/password (emulator mode) */
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

/** Register with email/password (emulator mode) */
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

/** Change password for current user (emulator mode) */
export async function changePassword(currentPassword: string, newPassword: string) {
	error = null;
	await ensureFirebaseReady();
	if (!auth.currentUser) throw new Error('Not authenticated');
	const user = auth.currentUser as User;
	const hasPassword = (user.providerData || []).some((p) => p.providerId === 'password');

	try {
		if (hasPassword) {
			const credential = EmailAuthProvider.credential(user.email || '', currentPassword);
			await reauthenticateWithCredential(user, credential);
			await updatePassword(user, newPassword);
		} else {
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
	if (isApiMode(publicEnv)) {
		++authGeneration;
		currentUser = null;
		notifyListeners();
		const response = await fetch('/api/auth/logout', { method: 'POST' });
		if (!response.ok) {
			error = 'Logout server belum berhasil. Coba kembali.';
			throw new Error(error);
		}
		return;
	}
	await signOut(auth);
	currentUser = null;
	notifyListeners();
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
	loginWithPassword,
	registerWithEmail,
	changePassword,
	requestPasswordReset,
	resetPassword,
	setPassword,
	requestOtp,
	verifyOtp,
	logout
};
