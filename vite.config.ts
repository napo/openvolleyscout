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
            // New versions wait until every window of the app is closed,
            // so an update never reloads the page in the middle of a rally.
            registerType: 'prompt',
            injectRegister: 'auto',
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
    },
  },
  server: {
    watch: {
      ignored: ['**/src-tauri/target/**', '**/node_modules/**'],
    },
  },
});
