import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';
import { resolve } from 'path';
import type { Plugin } from 'vite';
import { buildTutorialPreviewPage, listTutorialPreviews } from './src/features/landing/tutorials/tutorial-previews';
import { buildStatsViewerPreviewPage, STATS_VIEWER_PREVIEW_PATH, STATS_VIEWER_PREVIEW_TEXTS } from './src/features/analytics/export/stats-preview';
import { APP_METADATA } from './src/lib/constants/app';
import { it } from './src/i18n/locales/it';
import { en } from './src/i18n/locales/en';

const isTauri = Boolean(process.env.TAURI_ENV_PLATFORM);

/**
 * One small page per tutorial, <base>/tutorial/<slug>/, so a shared tutorial
 * link shows its own title and picture in chats (crawlers ignore #/…).
 */
function tutorialPreviewPages(): Plugin {
  return {
    name: 'ovs-tutorial-preview-pages',
    apply: 'build',
    generateBundle() {
      for (const preview of listTutorialPreviews()) {
        const key = preview.titleKey as keyof typeof it;
        this.emitFile({
          type: 'asset',
          fileName: `tutorial/${preview.slug}/index.html`,
          source: buildTutorialPreviewPage(
            preview,
            { title: it[key] ?? en[key as keyof typeof en], subtitle: `Tutorial · ${en[key as keyof typeof en] ?? it[key]}`, appName: APP_METADATA.name },
            APP_METADATA.urls.webApp,
          ),
        });
      }
    },
  };
}

/**
 * <base>/stats-viewer/: static page with the social preview of shared statistics links
 * (crawlers ignore #/…); it forwards the fragment to the viewer inside the app.
 */
function statsViewerPreviewPage(): Plugin {
  return {
    name: 'ovs-stats-viewer-preview-page',
    apply: 'build',
    generateBundle() {
      this.emitFile({
        type: 'asset',
        fileName: `${STATS_VIEWER_PREVIEW_PATH}/index.html`,
        source: buildStatsViewerPreviewPage(STATS_VIEWER_PREVIEW_TEXTS, APP_METADATA.urls.webApp),
      });
    },
  };
}

export default defineConfig({
  // Web base path: '/openvolleyscout/' on napo.github.io until the move; set OVS_WEB_BASE=/
  // (or change the default) when the app is served from the root of its own domain.
  base: isTauri ? './' : (process.env.OVS_WEB_BASE ?? '/openvolleyscout/'),
  plugins: [
    react(),
    // Web build only: installable on tablet/phone home screens and usable
    // offline in the gym. Tauri builds already ship everything locally.
    ...(isTauri
      ? []
      : [
          tutorialPreviewPages(),
          statsViewerPreviewPage(),
          VitePWA({
            // New versions wait instead of reloading by themselves, so an update never
            // interrupts a rally; PwaUpdateBanner registers the worker and asks the scout.
            registerType: 'prompt',
            injectRegister: null,
            includeAssets: ['favicon.ico', 'favicon-32x32.png', 'apple-touch-icon.png'],
            manifest: {
              name: 'OpenVolleyScout',
              short_name: 'OpenVolleyScout',
              description: 'Free software volleyball scouting and analysis',
              display: 'standalone',
              orientation: 'any',
              background_color: '#ffffff',
              theme_color: '#002554',
              icons: [
                { src: 'pwa-192x192.png', sizes: '192x192', type: 'image/png' },
                { src: 'pwa-512x512.png', sizes: '512x512', type: 'image/png' },
                { src: 'pwa-maskable-512x512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
              ],
            },
            workbox: {
              globPatterns: ['**/*.{js,css,html,ico,png,svg,ttf,wasm,dvw}'],
              // The CJK PDF fonts (~10 MB) are only needed for Japanese/Chinese
              // reports: fetched on first use, then kept for offline use.
              // The social preview is only for shared links, never needed offline.
              // Tutorial screenshots load when a tutorial is opened, not on install.
              globIgnores: ['**/NotoSans*.ttf', '**/social-preview.png', '**/social-preview-stats.png', '**/tutorials/**'],
              runtimeCaching: [
                {
                  urlPattern: /\/NotoSans[^/]*\.ttf$/,
                  handler: 'CacheFirst',
                  options: { cacheName: 'pdf-cjk-fonts', expiration: { maxEntries: 8 } },
                },
              ],
              // The main bundle is a few MB; the default 2 MiB limit would skip it.
              maximumFileSizeToCacheInBytes: 8 * 1024 * 1024,
              navigateFallback: 'index.html',
              // Shared tutorial links have their own pages (they redirect into the app).
              navigateFallbackDenylist: [/\/tutorial\//, /\/stats-viewer\//],
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
