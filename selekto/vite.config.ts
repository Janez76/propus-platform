import type { IncomingMessage, ServerResponse } from 'node:http'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import { nextcloudDevProxyPlugin } from './vite/nextcloudDevProxyPlugin.ts'

const projectDir = path.dirname(fileURLToPath(import.meta.url))

/** Explizite Pfade: zuverlässiger unter Windows (z. B. Ordner mit Leerzeichen „Propus Picdrop“). */
function nm(pkg: string): string {
  return path.join(projectDir, 'node_modules', pkg)
}

/** Wie design-preview-react (Propus order review): PDF mit Content-Disposition inline ausliefern. */
function pdfInlinePlugin(): Plugin {
  const handler = async (req: IncomingMessage, res: ServerResponse, next: () => void) => {
    const p = req.url?.split('?')[0] ?? ''
    if (p !== '/__propus-pdf-inline' || req.method !== 'GET') {
      return next()
    }
    try {
      const full = new URL(req.url || '', 'http://local')
      const target = full.searchParams.get('url')
      if (!target || !/^https?:\/\//i.test(target)) {
        res.statusCode = 400
        res.setHeader('Content-Type', 'text/plain; charset=utf-8')
        res.end('Parameter url fehlt oder ungültig.')
        return
      }
      const upstream = await fetch(target, { redirect: 'follow' })
      if (!upstream.ok) {
        res.statusCode = upstream.status
        res.end()
        return
      }
      const buf = Buffer.from(await upstream.arrayBuffer())
      const rawCt = upstream.headers.get('content-type') || 'application/pdf'
      const ct = rawCt.split(';')[0]?.trim() || 'application/pdf'
      res.statusCode = 200
      res.setHeader('Content-Type', ct)
      res.setHeader('Content-Disposition', 'inline')
      res.setHeader('Cache-Control', 'private, max-age=120')
      res.end(buf)
    } catch (e) {
      res.statusCode = 502
      res.setHeader('Content-Type', 'text/plain; charset=utf-8')
      res.end(e instanceof Error ? e.message : 'Proxy-Fehler')
    }
  }

  return {
    name: 'propus-pdf-inline',
    configureServer(server) {
      server.middlewares.use(handler)
    },
    configurePreviewServer(server) {
      server.middlewares.use(handler)
    },
  }
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), pdfInlinePlugin(), nextcloudDevProxyPlugin()],
  base: '/selekto/',
  resolve: {
    alias: {
      'react-router-dom': nm('react-router-dom'),
      'react-router': nm('react-router'),
    },
  },
  optimizeDeps: {
    include: ['react-router-dom', 'react-router'],
  },
  server: {
    host: '0.0.0.0',
    port: 5173,
    strictPort: true,
    cors: true,
    hmr: {
      ...(process.env.VITE_HMR_HOST ? { host: process.env.VITE_HMR_HOST } : {}),
      clientPort: 5173,
    },
    open: true,
    /**
     * WebDAV: wie «Propus order review» (`server.proxy` + `x-prop-nc-host`), hier als
     * `nextcloudDevProxyPlugin` — gleiche Weiterleitung, plus öffentliche DNS-Auflösung
     * wenn `cloud.propus.ch` lokal auf eine private IP zeigt (Split-DNS).
     */
  },
  preview: {
    host: '0.0.0.0',
    open: true,
    cors: true,
  },
})
