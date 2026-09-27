export const APP_METADATA = {
  name: 'SyncScout Live',
  version: '0.16.1',
  license: 'AGPL-3.0',
  status: 'active-development',
  // Maintainer of this fork; questions go to the fork's GitHub issues.
  author: {
    name: 'courtendvb',
  },
  // The app this fork is based on (AGPL-3.0), credited on the About page and in PDFs.
  upstream: {
    name: 'OpenVolleyScout',
    author: 'Maurizio Napolitano',
    repository: 'https://github.com/napo/openvolleyscout',
  },
  urls: {
    // Source of this modified version (AGPL-3.0 §13). Native app releases still come from upstream.
    repository: 'https://github.com/courtendvb/SyncScout-live',
    issues: 'https://github.com/courtendvb/SyncScout-live/issues',
    releases: 'https://github.com/napo/openvolleyscout/releases',
    demo: 'https://courtendvb.github.io/SyncScout-live/',
  },
} as const;

export const APP_VERSION = APP_METADATA.version;
