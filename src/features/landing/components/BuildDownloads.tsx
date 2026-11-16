import { useEffect, useState } from 'react';
import { ExternalLink } from '@src/components/ExternalLink';
import { useTranslation } from '@src/i18n';
import { APP_METADATA } from '@src/lib/constants/app';
import { parseReleaseDownloads, type ReleaseDownloads } from '../model/release-downloads';

export function BuildDownloads() {
  const { t } = useTranslation();
  const [release, setRelease] = useState<ReleaseDownloads | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 10_000);
    let active = true;
    void fetch('https://api.github.com/repos/napo/openvolleyscout/releases/latest', {
      signal: controller.signal,
      headers: { Accept: 'application/vnd.github+json' },
    }).then(async (response) => {
      if (!response.ok) return null;
      return parseReleaseDownloads(await response.json());
    }).then((result) => {
      if (active) setRelease(result);
    }).catch(() => {
      // Offline or rate limited: the releases page remains available below.
    }).finally(() => {
      window.clearTimeout(timeout);
      if (active) setLoading(false);
    });
    return () => {
      active = false;
      window.clearTimeout(timeout);
      controller.abort();
    };
  }, []);

  return (
    <section className="about-page__section" aria-busy={loading}>
      <h2 className="about-page__section-title">{t('aboutTabDownloads')}</h2>
      <p className="about-page__text">{t('aboutDownloadsIntro')}</p>
      <p className="about-page__text" role="status">
        {loading ? t('aboutDownloadsLoading')
          : release?.groups.length ? t('aboutDownloadsVersion', { version: release.version })
            : t('aboutDownloadsUnavailable')}
      </p>
      {release && release.groups.length > 0 && (
        <div className="about-downloads__grid">
          {release.groups.map((group) => (
            <section key={group.platform} className="about-downloads__platform">
              <h3>{group.platform}</h3>
              {group.platform === 'Android' && <p className="about-page__text">{t('aboutDownloadsAndroid')}</p>}
              <div className="about-downloads__links">
                {group.files.map((file) => (
                  <ExternalLink key={file.name} href={file.url} className="btn-secondary" title={file.name}>
                    <span aria-hidden="true">↓ </span>{file.label}
                  </ExternalLink>
                ))}
              </div>
            </section>
          ))}
        </div>
      )}
      <p className="about-page__text">
        <ExternalLink href={APP_METADATA.urls.releases} className="about-page__link">
          {t('aboutDownloadsAllReleases')}
        </ExternalLink>
      </p>
    </section>
  );
}
