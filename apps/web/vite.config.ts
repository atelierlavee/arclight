// Copyright 2026 atelierlavee
// SPDX-License-Identifier: Apache-2.0

import path from 'node:path'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@': path.resolve(import.meta.dirname, './src'),
    },
  },
  server: {
    // Listen on all interfaces — required for the dev-mode Docker Compose
    // override (docker/docker-compose.dev.yml), where Vite runs inside a
    // container and needs to accept connections proxied from the host.
    host: '0.0.0.0',
    /**
     * Poll for file changes when running inside the dev container.
     *
     * macOS does not forward inotify events across a Docker bind mount, so
     * Vite's native watcher never fires and it goes on serving whatever it
     * compiled at startup — silently, with nothing logged. Every edit on the
     * host then appears to do nothing, which costs far more than the polling
     * does.
     *
     * Gated on the env var rather than always on, so running Vite directly on
     * the host keeps the cheap native watcher. The interval is a compromise:
     * low enough to feel immediate, high enough not to stat the tree
     * constantly. node_modules is a named volume rather than part of the bind
     * mount, so the polled set stays small.
     */
    watch: process.env.CHOKIDAR_USEPOLLING
      ? {
          usePolling: true,
          interval: Number(process.env.CHOKIDAR_INTERVAL ?? 300),
        }
      : undefined,
    proxy: {
      // PROXY_TARGET lets docker-compose.dev.yml point this at the app
      // service by container name (http://app:3000) instead of localhost,
      // since "localhost" inside a container means the container itself.
      '/api': {
        target: process.env.PROXY_TARGET ?? 'http://localhost:3000',
        /**
         * Forward the browser's own Host rather than rewriting it to the
         * target.
         *
         * The local-network switch decides what to answer from the address
         * the client asked for, because under Docker every request arrives
         * from the same bridge address and the IP says nothing. Vite's
         * default rewrites Host to `app:3000`, which erases exactly that
         * distinction: every request then looks identical to the server, and
         * turning the switch off locked this machine out along with the
         * phone it was meant to stop.
         */
        changeOrigin: false,
      },
    },
  },
})
