// Desktop (Tauri) builds have no service worker: this stands in for
// vite-plugin-pwa's virtual module there, so the update banner never shows.
export function registerSW(): (reloadPage?: boolean) => Promise<void> {
  return async () => undefined;
}
