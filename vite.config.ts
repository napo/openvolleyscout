import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';
import { resolve } from 'path';

const isTauri = Boolean(process.env.TAURI_ENV_PLATFORM);

export default defineConfig({
  base: isTauri ? './' : '/SyncScout-live/',
  plugins: [
    react(),
    // Web build only: installable on iPad home screen and usable offline in the gym.
    ...(isTauri
      ? []
      : [
          VitePWA({
            // New versions wait instead of reloading by themselves, so an update never
            // interrupts a rally; PwaUpdateBanner registers the worker and asks the scout.
            registerType: 'prompt',
            injectRegister: null,
            includeAssets: ['favicon.ico', 'favicon.svg', 'apple-touch-icon.png'],
            manifest: {
              name: 'SyncScout Live',
              short_name: 'SS Live',
              description: 'Volleyball live scouting (based on OpenVolleyScout)',
              lang: 'ja',
              display: 'standalone',
              orientation: 'any',
              background_color: '#ffffff',
              theme_color: '#0b1f4d',
              icons: [
                { src: 'pwa-192x192.png', sizes: '192x192', type: 'image/png' },
                { src: 'pwa-512x512.png', sizes: '512x512', type: 'image/png' },
                { src: 'pwa-maskable-512x512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
              ],
            },
            workbox: {
              globPatterns: ['**/*.{js,css,html,ico,png,svg,ttf,wasm,dvw}'],
              // The main bundle is ~2.5 MB; the default 2 MiB limit would skip it.
              maximumFileSizeToCacheInBytes: 8 * 1024 * 1024,
              navigateFallback: 'index.html',
            },
          }),
        ]),
  ],
  resolve: {
    alias: {
      '@src': resolve(__dirname, './src'),
      // No service worker in desktop builds: stand in for the PWA virtual module.
      ...(isTauri ? { 'virtual:pwa-register': resolve(__dirname, './src/app/components/pwa-register-stub.ts') } : {}),
    },
  },
  server: {
    watch: {
      ignored: ['**/src-tauri/target/**', '**/node_modules/**'],
    },
  },
});
