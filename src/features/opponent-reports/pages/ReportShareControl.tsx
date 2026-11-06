import { useState } from 'react';
import { useTranslation } from '@src/i18n';
import { APP_METADATA } from '@src/lib/constants/app';
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
            setUrl(buildSharedReportUrl(APP_METADATA.urls.webApp, { title, pages, links, expiresAt: sharedPlaylistExpiryAfter(days)! }));
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
    <button type="button" className="btn-secondary" disabled={busy} onClick={() => void create()}>{t('tacticalCreateLink')}</button>
    {error ? <p role="alert">{t('tacticalShareError')}</p> : null}
    {url ? <label>{t('tacticalShareLink')}<textarea readOnly value={url} onFocus={(event) => event.target.select()}/><a href={url} target="_blank" rel="noopener noreferrer">{t('tacticalPreview')}</a></label> : null}
  </div>;
}
