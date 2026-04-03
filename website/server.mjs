/**
 * Astro Node Standalone – Wrapper mit Gzip/Brotli-Kompression.
 *
 * Statt `node dist/server/entry.mjs` wird `node server.mjs` gestartet.
 * `compression` fuegt Accept-Encoding basierte Kompression hinzu, die der
 * eingebaute Astro-Server nicht liefert.
 */

import compression from 'compression';
import http from 'node:http';
import { handler as astroHandler } from './dist/server/entry.mjs';

const PORT = parseInt(process.env.PORT ?? '4343', 10);
const HOST = process.env.HOST ?? '0.0.0.0';

const compress = compression({
	level: 6,
	threshold: 1024,
	filter: (req, res) => {
		// Bilder, bereits komprimierte Formate nicht nochmal komprimieren
		const ct = res.getHeader('content-type');
		if (typeof ct === 'string' && /image\/(png|jpg|jpeg|webp|avif|gif|svg)|font\/woff2/.test(ct)) {
			return false;
		}
		return compression.filter(req, res);
	},
});

const server = http.createServer((req, res) => {
	compress(req, res, () => {
		astroHandler(req, res);
	});
});

server.listen(PORT, HOST, () => {
	console.log(`Server gestartet auf http://${HOST}:${PORT}`);
});

server.on('error', (err) => {
	console.error('Server-Fehler:', err);
	process.exit(1);
});
