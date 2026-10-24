/// <reference types="vitest/config" />
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { defineConfig, type Plugin } from 'vite';
import preact from '@preact/preset-vite';
import { VitePWA } from 'vite-plugin-pwa';

// `import x from './font.ttf?base64'` restituisce il file come testo base64: i caratteri del PDF stanno
// nel pacchetto JavaScript caricato solo quando si genera il PDF, senza richieste di rete.
function ttfBase64(): Plugin {
  return {
    name: 'ttf-base64',
    enforce: 'pre',
    load(id) {
      if (!id.endsWith('.ttf?base64')) return null;
      return `export default ${JSON.stringify(readFileSync(id.slice(0, -'?base64'.length)).toString('base64'))};`;
    },
  };
}

export default defineConfig({
  // Percorsi relativi: la demo funziona anche pubblicata in una sottocartella (GitHub Pages).
  base: './',
  plugins: [
    ttfBase64(),
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
        background_color: '#f6f7f9',
        theme_color: '#f6f7f9',
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
    // OpenCV.js ha un metodo `then`: importato da vitest come modulo esterno viene scambiato per una
    // promessa e l'importazione non finisce mai. Nei test lo carica un involucro (vedi cv-node.ts).
    alias: { '@techstark/opencv-js': fileURLToPath(new URL('./src/scan/cv-node.ts', import.meta.url)) },
  },
});
