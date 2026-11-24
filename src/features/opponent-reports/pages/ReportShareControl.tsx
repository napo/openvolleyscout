import { ActionIcon } from '@src/components/ActionIcon';
import { ExternalLink } from '@src/components/ExternalLink';
import { useState } from 'react';
import { useTranslation } from '@src/i18n';
import { APP_METADATA } from '@src/lib/constants/app';
import { shortenWithCloud } from '@src/features/sharing/short-link';
import { sharedPlaylistExpiryAfter } from '@src/features/analysis/video/youtube-share-link';
import { buildSharedReportUrl, type SharedTacticalReport } from '../model/report-share-link';
export function ReportShareControl({ getSvgs, title, links = [] }: {
    getSvgs: () => Promise<string[]>;
    title: string;
    links?: SharedTacticalReport['links'];
}) {
    const { t } = useTranslation();
    const [days, setDays] = useState(7);
    const [url, setUrl] = useState('');
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState(false);
    const create = async () => {
        setBusy(true);
        setError(false);
        setUrl('');
        try {
            const pages = await getSvgs();
            if (!pages.length)
                throw new Error('Empty report');
            const longUrl = buildSharedReportUrl(APP_METADATA.urls.webApp, { title, pages, links, expiresAt: sharedPlaylistExpiryAfter(days)! });
            // Too long for chat apps: a short link through the connected Google Drive, when there is one.
            setUrl(await shortenWithCloud(longUrl, longUrl.slice(longUrl.indexOf('#')), APP_METADATA.urls.webApp));
        }
        catch {
            setError(true);
        }
        finally {
            setBusy(false);
        }
    };
    return <div className="tactical-share">
    <label>{t('tacticalExpiryDays')} <input type="number" min={1} max={90} value={days} onChange={(event) => { setDays(Math.max(1, Math.min(90, Number(event.target.value) || 1))); setUrl(''); }}/></label>
    <p>{t('tacticalShareHelp')}</p>
    <button type="button" className="btn-secondary" disabled={busy} onClick={() => void create()}><ActionIcon name="web" />{t('tacticalCreateLink')}</button>
    {error ? <p role="alert">{t('tacticalShareError')}</p> : null}
    {url ? <label>{t('tacticalShareLink')}<textarea readOnly value={url} onFocus={(event) => event.target.select()}/><div className="tactical-share__actions"><a className="btn-secondary btn-small" href={url} target="_blank" rel="noopener noreferrer"><ActionIcon name="preview" />{t('tacticalPreview')}</a><ExternalLink className="btn-secondary btn-small" href={`https://wa.me/?text=${encodeURIComponent(url)}`}><ActionIcon name="whatsapp" />{t('videoYoutubeShareWhatsApp')}</ExternalLink></div></label> : null}
  </div>;
}
