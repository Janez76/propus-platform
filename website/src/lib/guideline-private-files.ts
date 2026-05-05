import { existsSync } from 'node:fs';
import { dirname, join, resolve, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const MIME_BY_EXT: Record<string, string> = {
	'.pdf': 'application/pdf',
	'.doc': 'application/msword',
	'.docx':
		'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
	'.ppt': 'application/vnd.ms-powerpoint',
	'.pptx':
		'application/vnd.openxmlformats-officedocument.presentationml.presentation',
	'.xls': 'application/vnd.ms-excel',
	'.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
	'.zip': 'application/zip',
	'.png': 'image/png',
	'.jpg': 'image/jpeg',
	'.jpeg': 'image/jpeg',
	'.webp': 'image/webp',
	'.txt': 'text/plain; charset=utf-8',
};

function repoRootFromLib(): string {
	const here = dirname(fileURLToPath(import.meta.url));
	return resolve(here, '..', '..');
}

/** Basisordner `private-guideline-assets` (Build + Docker: unter `process.cwd()`). */
export function getGuidelineAssetsBase(): string {
	const cwd = process.cwd();
	const cwdJoined = join(cwd, 'private-guideline-assets');
	if (existsSync(cwdJoined)) return cwdJoined;
	const devJoined = join(repoRootFromLib(), 'private-guideline-assets');
	if (existsSync(devJoined)) return devJoined;
	return cwdJoined;
}

export function resolveGuidelineAssetPath(entryRelativePath: string): string | null {
	const base = getGuidelineAssetsBase();
	const resolved = resolve(base, entryRelativePath);
	const rel = relative(base, resolved);
	if (rel.startsWith('..') || rel.includes('..')) return null;
	return resolved;
}

export function mimeForFilename(filename: string): string {
	const lower = filename.toLowerCase();
	const dot = lower.lastIndexOf('.');
	const ext = dot >= 0 ? lower.slice(dot) : '';
	return MIME_BY_EXT[ext] || 'application/octet-stream';
}
