export const APP_METADATA = {
  name: 'OpenVolleyScout',
  version: '0.11.0',
  license: 'GPL-3.0',
  status: 'active-development',
  author: {
    name: 'Maurizio Napolitano',
    email: 'maurizio.napolitano@gmail.com',
  },
  urls: {
    repository: 'https://githum/napo/openvolleyscout',
    issues: 'https://github.com/napo/openvolleyscout/issues',
    demo: 'https://napo.github.io/openvolleyscout',
  },
} as const;

export const APP_VERSION = APP_METADATA.version;
