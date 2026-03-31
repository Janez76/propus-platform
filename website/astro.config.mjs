// @ts-check
import { defineConfig } from 'astro/config';
import node from '@astrojs/node';

let supabaseImageHost = null;
try {
	if (process.env.SUPABASE_URL) {
		supabaseImageHost = new URL(process.env.SUPABASE_URL).hostname;
	}
} catch {
	// ignore
}

// Passe die Produktions-URL an (SEO, Canonical, Open Graph).
export default defineConfig({
	site: 'https://www.propus.ch',
	output: 'server',
	adapter: node({ mode: 'standalone' }),
	/* Fester Port: weniger Konflikte mit anderem Dev-Server, Cookies immer für dieselbe Origin */
	server: {
		port: 4343,
		/* Explizit alle IPv4-Interfaces – sonst kann LAN-Zugriff (z. B. 192.168.x.x:4343) je nach System ausbleiben. */
		host: '0.0.0.0',
		/* Gleicher Port wie konfiguriert – sonst wechselt Astro still den Port und Lesezeichen/Origin passen nicht. */
		strictPort: true,
	},
	image: {
		remotePatterns: [
			{
				protocol: 'https',
				hostname: 'images.unsplash.com',
				pathname: '/**',
			},
			...(supabaseImageHost
				? [
						{
							protocol: 'https',
							hostname: supabaseImageHost,
							pathname: '/storage/v1/object/public/**',
						},
						{
							protocol: 'https',
							hostname: supabaseImageHost,
							pathname: '/storage/v1/render/image/public/**',
						},
					]
				: []),
		],
	},
});
