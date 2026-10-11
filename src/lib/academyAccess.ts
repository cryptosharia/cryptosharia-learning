import type { FirebaseSettings } from './firebaseConfig.ts';

export function isAcademyPath(path: string): boolean {
	return [
		'/e-learning',
		'/subscription',
		'/units',
		'/profile',
		'/payment',
		'/admin/courses',
		'/admin/orders',
		'/admin/vouchers'
	].some((prefix) => path === prefix || path.startsWith(`${prefix}/`));
}

export function academyTestEnabled(flag: string | undefined, settings: FirebaseSettings): boolean {
	return flag === 'true' && settings.mode === 'emulator';
}

export function isContainedPath(path: string): boolean {
	return ['/payment', '/admin/orders', '/admin/vouchers', '/e-learning/course'].some(
		(prefix) => path === prefix || path.startsWith(`${prefix}/`)
	);
}
