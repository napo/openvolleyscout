export const APP_METADATA = {
  name: 'OpenVolleyScout',
  version: '0.18.5',
  license: 'AGPL-3.0-only',
  status: 'active-development',
  author: {
    name: 'Maurizio Napolitano',
    email: 'maurizio.napolitano@gmail.com',
  },
  urls: {
    repository: 'https://github.com/napo/openvolleyscout',
    issues: 'https://github.com/napo/openvolleyscout/issues',
    releases: 'https://github.com/napo/openvolleyscout/releases',
    /**
     * Where the OVS web app is hosted. The desktop app builds shared links
     * (e.g. YouTube playlists, #/player/...) on it, so it must change here
     * when OVS moves to its own domain; the web app uses its own address.
     * index.html's og:url / og:image carry the same address and move with it.
     */
    webApp: 'https://napo.github.io/openvolleyscout',
    /** Voluntary donation; PayPal is contacted only when the user opens the link. */
    donation: 'https://paypal.me/MNapolitano570',
  },
} as const;

export const APP_VERSION = APP_METADATA.version;
