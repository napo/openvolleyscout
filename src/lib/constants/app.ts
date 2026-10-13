export const APP_METADATA = {
  name: 'OpenVolleyScout',
  version: '0.18.1',
  license: 'AGPL-3.0',
  status: 'active-development',
  author: {
    name: 'Maurizio Napolitano',
    email: 'maurizio.napolitano@gmail.com',
  },
  urls: {
    repository: 'https://github.com/napo/openvolleyscout',
    issues: 'https://github.com/napo/openvolleyscout/issues',
    releases: 'https://github.com/napo/openvolleyscout/releases',
    demo: 'https://napo.github.io/openvolleyscout',
    /** Voluntary donation; PayPal is contacted only when the user opens the link. */
    donation: 'https://paypal.me/MNapolitano570',
  },
} as const;

export const APP_VERSION = APP_METADATA.version;
