/** Matterport- und YouTube-Links → sichere Embed-URLs für iframes */

export function matterportModelIdFromUrl(input: string): string | null {
	const u = input.trim();
	const m = u.match(/[?&]m=([a-zA-Z0-9]+)/);
	if (m) return m[1];
	return null;
}

export function matterportEmbedUrl(input: string): string | null {
	const id = matterportModelIdFromUrl(input);
	if (!id) return null;
	return `https://my.matterport.com/show?m=${id}`;
}

export function youtubeVideoIdFromUrl(url: string): string | null {
	const u = url.trim();
	const shorts = u.match(/youtube\.com\/shorts\/([a-zA-Z0-9_-]{11})/);
	if (shorts) return shorts[1];
	const watch = u.match(/[?&]v=([a-zA-Z0-9_-]{11})/);
	if (watch) return watch[1];
	const youtu = u.match(/youtu\.be\/([a-zA-Z0-9_-]{11})/);
	if (youtu) return youtu[1];
	const embed = u.match(/youtube\.com\/embed\/([a-zA-Z0-9_-]{11})/);
	if (embed) return embed[1];
	return null;
}

export function youtubeEmbedUrl(input: string): string | null {
	const id = youtubeVideoIdFromUrl(input);
	return id ? `https://www.youtube-nocookie.com/embed/${id}` : null;
}
