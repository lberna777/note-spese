/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import preact from '@preact/preset-vite';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  // Percorsi relativi: la demo funziona anche pubblicata in una sottocartella (GitHub Pages).
  base: './',
  plugins: [
    preact(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icon.svg', 'icon-192.png', 'icon-512.png', 'apple-touch-icon.png'],
      manifest: {
        name: 'Note spese',
        short_name: 'Note spese',
        description: 'Note spese dal telefono: foto dello scontrino, PDF ed Excel.',
        lang: 'it',
        display: 'standalone',
        start_url: './',
        scope: './',
        background_color: '#f4f5f7',
        theme_color: '#1f3a5f',
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
          { src: 'icon.svg', sizes: 'any', type: 'image/svg+xml' },
        ],
      },
      workbox: {
        maximumFileSizeToCacheInBytes: 30 * 1024 * 1024,
        globPatterns: ['**/*.{js,css,html,svg,png,wasm,gz,traineddata,woff2}'],
        // I file di public/tesseract finiscono in dist/tesseract e rientrano nei glob (wasm, js, gz).
      },
    }),
  ],
  test: {
    environment: 'jsdom',
    include: ['src/**/*.test.ts'],
  },
});
