import { useEffect, useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import { APP_METADATA } from '@src/lib/constants/app';
import { useTranslation } from '@src/i18n';
import { decodeSharedReport, isSharedReportExpired } from '../model/report-share-link';
import './opponent-reports.css';
/** Public standalone snapshot: SVGs are image documents, never injected into the page DOM. */
export function SharedTacticalReportPage() {
    const { payload = '' } = useParams();
    const { t, locale } = useTranslation();
    const report = useMemo(() => decodeSharedReport(payload), [payload]);
    const [now, setNow] = useState(Date.now);
    const [zoomed, setZoomed] = useState<Record<number, boolean>>({});
    useEffect(() => { const timer = window.setInterval(() => setNow(Date.now()), 1000); return () => window.clearInterval(timer); }, []);
    if (!report)
        return <main dir={locale === 'ar' ? 'rtl' : 'ltr'} className="tactical-shared"><p>{t('tacticalInvalidLink')}</p></main>;
    if (isSharedReportExpired(report, now))
        return <main dir={locale === 'ar' ? 'rtl' : 'ltr'} className="tactical-shared"><p>{t('tacticalExpiredLink')}</p></main>;
    return <main dir={locale === 'ar' ? 'rtl' : 'ltr'} className="tactical-shared">
    <h1>{report.title}</h1>
    <a href={APP_METADATA.urls.releases} target="_blank" rel="noopener noreferrer">{t('tacticalDownloadSoftware')}</a>
    <p>{t('opponentReportVideoLink', { date: new Date(report.expiresAt).toLocaleDateString() })}</p>
    {report.pages.map((svg, index) => <section key={index}>
      <button type="button" className="btn-secondary" onClick={() => setZoomed((current) => ({ ...current, [index]: !current[index] }))}>{t(zoomed[index] ? 'tacticalFit' : 'tacticalZoom')}</button>
      <div className={zoomed[index] ? 'tactical-sheet-scroll tactical-sheet-scroll--zoomed' : 'tactical-sheet-scroll'}>
      <img className="tactical-preview" alt={`${report.title} · ${index + 1}`} src={`data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`}/>
      </div>
    </section>)}
    {report.links.length ? <nav aria-label={t('tacticalVideoActions')}>{report.links.map((link, index) => <p key={index}>{now > link.expiresAt ? <span>{link.label} · {t('tacticalExpiredLink')}</span> : <a href={link.url} target="_blank" rel="noopener noreferrer">{link.label}</a>}</p>)}</nav> : null}
  </main>;
}
