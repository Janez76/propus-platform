import { defineConfig } from 'astro/config';
import react from '@astrojs/react';
import sitemap from '@astrojs/sitemap';
import tailwindcss from '@tailwindcss/vite';

// https://astro.build/config
export default defineConfig({
  site: 'https://codestudio.propus.ch',
  integrations: [react(), sitemap()],
  vite: {
    plugins: [tailwindcss()],
    server: {
      allowedHosts: [
        '.trycloudflare.com',
        '.loca.lt',
        '.ngrok-free.app',
        '.ngrok.io',
      ],
    },
  },
  server: {
    host: true,
    port: 4321,
    allowedHosts: [
      '.trycloudflare.com',
      '.loca.lt',
      '.ngrok-free.app',
      '.ngrok.io',
    ],
  },
});
