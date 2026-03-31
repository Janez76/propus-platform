/**
 * Server-seitige .env-Werte.
 * Im Dev befüllt Astro/Vite `import.meta.env` aus `.env`, aber nicht zuverlässig `process.env`
 * (siehe astro `vite-plugin-env`: `process.env` wird vor allem beim Build gesetzt).
 */
export function serverEnv(name: string): string | undefined {
	const meta = import.meta.env as Record<string, string | boolean | undefined>;
	const fromVite = meta[name];
	if (typeof fromVite === 'string' && fromVite.trim() !== '') {
		return fromVite;
	}
	const fromProcess = process.env[name];
	if (fromProcess !== undefined && String(fromProcess).trim() !== '') {
		return String(fromProcess);
	}
	return undefined;
}
