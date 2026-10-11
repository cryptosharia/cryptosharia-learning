/**
 * Theme store for CryptoSharia Academy
 * Dark mode only.
 */

type ThemeMode = 'dark';

const STORAGE_KEY = 'cryptosharia-theme';

let mode = $state<ThemeMode>('dark');
let resolved = $state<'dark'>('dark');

function applyTheme() {
	if (typeof document === 'undefined') return;
	mode = 'dark';
	resolved = 'dark';
	document.documentElement.classList.add('dark');
}

export function initTheme() {
	if (typeof window !== 'undefined') {
		localStorage.setItem(STORAGE_KEY, 'dark');
	}
	applyTheme();
}

export function setTheme() {
	if (typeof window !== 'undefined') {
		localStorage.setItem(STORAGE_KEY, 'dark');
	}
	applyTheme();
}

export function getThemeMode(): ThemeMode {
	return mode;
}

export function getResolvedTheme(): 'dark' {
	return resolved;
}

export const theme = {
	get mode() {
		return mode;
	},
	get resolved() {
		return resolved;
	},
	set: setTheme,
	init: initTheme
};
