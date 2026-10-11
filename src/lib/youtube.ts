export type YouTubeVideo = { videoId: string; embedUrl: string };

/** Parse supported YouTube URLs; never return an arbitrary iframe source. */
export function parseYouTubeUrl(input: string): YouTubeVideo | null {
	if (
		!input ||
		input !== input.trim() ||
		/[\s\\]/u.test(input) ||
		[...input].some((char) => char.charCodeAt(0) < 32 || char.charCodeAt(0) === 127)
	)
		return null;
	let url: URL;
	try {
		url = new URL(input);
	} catch {
		return null;
	}
	if (url.protocol !== 'https:' || url.username || url.password || url.port || url.hash)
		return null;
	const youtubeHosts = ['youtube.com', 'www.youtube.com', 'm.youtube.com'];
	const embedHosts = [...youtubeHosts, 'youtube-nocookie.com', 'www.youtube-nocookie.com'];
	const keys = [...url.searchParams.keys()];
	if (
		new Set(keys).size !== keys.length ||
		keys.some((key) => !['v', 'si', 't', 'start'].includes(key))
	)
		return null;
	if (
		['t', 'start'].some(
			(key) => url.searchParams.has(key) && !/^\d+$/.test(url.searchParams.get(key) || '')
		)
	)
		return null;
	if (url.searchParams.has('t') && url.searchParams.has('start')) return null;
	let videoId: string | undefined;
	if (url.hostname === 'youtu.be' && !url.searchParams.has('v')) {
		videoId = url.pathname.match(/^\/([A-Za-z0-9_-]{11})$/)?.[1];
	} else if (youtubeHosts.includes(url.hostname) && url.pathname === '/watch') {
		videoId = url.searchParams.get('v') || undefined;
	} else if (embedHosts.includes(url.hostname) && !url.searchParams.has('v')) {
		const paths = youtubeHosts.includes(url.hostname) ? '(?:embed|shorts)' : 'embed';
		videoId = url.pathname.match(new RegExp(`^/${paths}/([A-Za-z0-9_-]{11})$`))?.[1];
	}
	if (!videoId || !/^[A-Za-z0-9_-]{11}$/.test(videoId)) return null;
	return { videoId, embedUrl: `https://www.youtube-nocookie.com/embed/${videoId}` };
}
