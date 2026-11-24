// SPDX-License-Identifier: AGPL-3.0-or-later
import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { useTranslation } from '@src/i18n';
import { googleDriveApiKey } from '@src/features/analysis/video/google-drive-video';
import { resolveShortLink } from './short-link';

/** Opens a short shared link: reads the stored route and goes there. */
export function ShortLinkPage() {
  const { t } = useTranslation();
  const { provider = '', id = '' } = useParams();
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let active = true;
    void resolveShortLink(provider, id, googleDriveApiKey()).then((hash) => {
      if (!active) return;
      if (hash) window.location.replace(hash);
      else setFailed(true);
    });
    return () => { active = false; };
  }, [provider, id]);

  return (
    <main className="app-page-card" style={{ padding: '2rem 1rem', textAlign: 'center' }}>
      <p role="status">{t(failed ? 'shortLinkUnavailable' : 'shortLinkOpening')}</p>
    </main>
  );
}
