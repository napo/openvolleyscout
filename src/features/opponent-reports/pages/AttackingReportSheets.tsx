import { useTranslation } from '@src/i18n';
import type { OpponentReport } from '@src/domain/opponent-report/types';
import { attackerNotesKey, SETTER_NOTES_KEY, type ReportView } from '../model/report-view';
import { ViewTableView } from './OpponentReportSheets';

type Update = (change: (current: OpponentReport) => OpponentReport) => void;

function FewDataLegend({ minSample }: { minSample: number }) {
  const { t } = useTranslation();
  return <p className="opponent-report__legend">{t('opponentReportLegend', { n: minSample })}</p>;
}

export function AttackerSheet({ view, update }: { view: ReportView; update: Update }) {
  const { t } = useTranslation();
  return (
    <section className="opponent-report__sheet">
      <FewDataLegend minSample={view.minSample} />
      {view.attackers.length === 0 ? <p className="opponent-report__hint">{t('opponentReportNothingNotable')}</p> : (
        view.attackers.map((attacker) => (
          <article className="opponent-report__attacker" key={attacker.player.key}>
            <h2>{[attacker.player.jersey ? `#${attacker.player.jersey}` : '', attacker.player.name].filter(Boolean).join(' ')}</h2>
            <div className="opponent-report__attacker-summary">
              {/* Produced from numeric scouting coordinates by the pure report view model. */}
              {/* eslint-disable-next-line react/no-danger */}
              <div>
                <div className="opponent-report__court" dangerouslySetInnerHTML={{ __html: attacker.courtSvg }} />
                <p className="opponent-report__legend">{attacker.courtSample}</p>
              </div>
              <div>
                <h3>{t('opponentReportAttackPerformance')}</h3>
                <ViewTableView table={attacker.highlights} />
              </div>
            </div>
            <details className="opponent-report__details">
              <summary>{t('opponentReportAttackDetailedMetrics')}</summary>
              <h3>{t('opponentReportAttackPerformance')}</h3>
              <ViewTableView table={attacker.performance} />
              <h3>{t('opponentReportAttackDistributions')}</h3>
              <ViewTableView table={attacker.distribution} />
            </details>
            {attacker.videoLink ? (
              <p className="opponent-report__video-link">
                <a href={attacker.videoLink.url} target="_blank" rel="noopener noreferrer">
                  {t('opponentReportVideoLink', {
                    date: new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' }).format(attacker.videoLink.expiresAt),
                  })}
                </a>
              </p>
            ) : null}
            <label className="opponent-report__notes">
              <span>{t('opponentReportPlayerNotes')}</span>
              <textarea
                rows={3}
                value={attacker.notes}
                onChange={(event) => update((current) => ({
                  ...current,
                  freeTexts: { ...current.freeTexts, [attackerNotesKey(attacker.player.key)]: event.target.value },
                }))}
              />
            </label>
          </article>
        ))
      )}
    </section>
  );
}

export function SetterSheet({ view, update }: { view: ReportView; update: Update }) {
  const { t } = useTranslation();
  return (
    <section className="opponent-report__sheet">
      <FewDataLegend minSample={view.minSample} />
      <p className="opponent-report__hint">{t('opponentReportSetterHelp')}</p>
      {view.setter.distribution.rows.length > 0
        ? <ViewTableView table={view.setter.distribution} />
        : <p className="opponent-report__hint">{t('opponentReportNothingNotable')}</p>}
      <label className="opponent-report__notes">
        <span>{t('opponentReportSheetNotes')}</span>
        <textarea
          rows={4}
          value={view.setter.notes}
          onChange={(event) => update((current) => ({
            ...current,
            freeTexts: { ...current.freeTexts, [SETTER_NOTES_KEY]: event.target.value },
          }))}
        />
      </label>
    </section>
  );
}
