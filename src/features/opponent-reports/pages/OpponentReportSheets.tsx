import { useTranslation } from '@src/i18n';
import type { OpponentReport, OpponentReportKey } from '@src/domain/opponent-report/types';
import type { KeySuggestion } from '../model/report-keys';
import { buildServeTargetCourtSvg, suggestionText, type ReportView, type ViewT, type ViewTable } from '../model/report-view';
import { buildReceptionFormationSvg } from '../model/reception-formation';

type Update = (change: (current: OpponentReport) => OpponentReport) => void;

export function ViewTableView({ table }: { table: ViewTable }) {
  return (
    <div className="opponent-report__table-wrap">
      <table className="opponent-report__table">
        <thead>
          <tr>{table.columns.map((column) => <th key={column}>{column}</th>)}</tr>
        </thead>
        <tbody>
          {table.rows.map((row, rowIndex) => (
            // Rows are positional (one per rotation, player…): the index is their identity.
            // eslint-disable-next-line react/no-array-index-key
            <tr key={rowIndex}>
              {row.map((cell, cellIndex) => (
                // eslint-disable-next-line react/no-array-index-key
                <td key={cellIndex} className={[
                  cell.band ? `opponent-report__cell--${cell.band}` : '',
                  cell.few ? 'opponent-report__cell--few' : '',
                ].filter(Boolean).join(' ')}>
                  {cell.text}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function BulletList({ title, items, tone }: { title: string; items: string[]; tone: 'good' | 'bad' }) {
  const { t } = useTranslation();
  return (
    <div className={`opponent-report__bullets opponent-report__bullets--${tone}`}>
      <h3>{title}</h3>
      {items.length === 0 ? <p className="opponent-report__hint">{t('opponentReportNothingNotable')}</p> : (
        <ul>{items.map((item) => <li key={item}>{item}</li>)}</ul>
      )}
    </div>
  );
}

function FewDataLegend({ minSample }: { minSample: number }) {
  const { t } = useTranslation();
  return <p className="opponent-report__legend">{t('opponentReportLegend', { n: minSample })}</p>;
}

const newKeyId = () => `key-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

export function KeysSheet({ report, suggestions, update, viewT }: {
  report: OpponentReport;
  suggestions: readonly KeySuggestion[];
  update: Update;
  viewT: ViewT;
}) {
  const { t } = useTranslation();
  const kept = report.keys ?? [];
  const keptIds = new Set(kept.map((key) => key.id));
  const dismissed = new Set(report.dismissedKeyIds ?? []);
  const proposals = suggestions.filter((suggestion) => !keptIds.has(suggestion.id) && !dismissed.has(suggestion.id));

  const setKeys = (keys: OpponentReportKey[]) => update((current) => ({ ...current, keys }));
  const move = (index: number, delta: number) => {
    const next = [...kept];
    const [item] = next.splice(index, 1);
    next.splice(index + delta, 0, item);
    setKeys(next);
  };

  return (
    <section className="opponent-report__sheet">
      <p className="opponent-report__hint">{t('opponentReportKeysHelp')}</p>
      <h3>{t('opponentReportKeysKept')}</h3>
      {kept.length === 0 ? <p className="opponent-report__hint">{t('opponentReportKeysNoneKept')}</p> : (
        <ol className="opponent-report__keys">
          {kept.map((key, index) => (
            <li key={key.id}>
              <textarea
                rows={2}
                value={key.text}
                onChange={(event) => setKeys(kept.map((entry) => (entry.id === key.id ? { ...entry, text: event.target.value } : entry)))}
                aria-label={t('opponentReportKeyText')}
              />
              <div className="opponent-report__key-actions">
                <button type="button" className="btn-secondary btn-small" onClick={() => move(index, -1)} disabled={index === 0} aria-label={t('opponentReportMoveUp')}>↑</button>
                <button type="button" className="btn-secondary btn-small" onClick={() => move(index, 1)} disabled={index === kept.length - 1} aria-label={t('opponentReportMoveDown')}>↓</button>
                <button
                  type="button"
                  className="btn-secondary btn-small"
                  onClick={() => update((current) => ({
                    ...current,
                    keys: kept.filter((entry) => entry.id !== key.id),
                    dismissedKeyIds: key.source === 'auto' ? [...(current.dismissedKeyIds ?? []), key.id] : current.dismissedKeyIds,
                  }))}
                >
                  {t('opponentReportDelete')}
                </button>
              </div>
            </li>
          ))}
        </ol>
      )}
      <button type="button" className="btn-secondary" onClick={() => setKeys([...kept, { id: newKeyId(), text: '', source: 'custom' }])}>
        {t('opponentReportKeyAdd')}
      </button>

      <h3>{t('opponentReportKeysProposed')}</h3>
      {proposals.length === 0 ? <p className="opponent-report__hint">{t('opponentReportKeysNoProposals')}</p> : (
        <ul className="opponent-report__proposals">
          {proposals.map((suggestion, index) => (
            <li key={suggestion.id} className={index < 5 ? 'is-top' : ''}>
              <span>{suggestionText(suggestion, viewT)}</span>
              <small>{t('opponentReportKeySample', { n: suggestion.sample })}</small>
              <div className="opponent-report__key-actions">
                <button
                  type="button"
                  className="btn-primary btn-small"
                  onClick={() => setKeys([...kept, { id: suggestion.id, text: suggestionText(suggestion, viewT), source: 'auto' }])}
                >
                  {t('opponentReportKeyConfirm')}
                </button>
                <button
                  type="button"
                  className="btn-secondary btn-small"
                  onClick={() => update((current) => ({ ...current, dismissedKeyIds: [...(current.dismissedKeyIds ?? []), suggestion.id] }))}
                >
                  {t('opponentReportKeyDismiss')}
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
      {(report.dismissedKeyIds?.length ?? 0) > 0 ? (
        <button type="button" className="btn-secondary btn-small" onClick={() => update((current) => ({ ...current, dismissedKeyIds: [] }))}>
          {t('opponentReportKeysRestore')}
        </button>
      ) : null}
    </section>
  );
}

export function OverviewSheet({ view, update }: { view: ReportView; update: Update }) {
  const { t } = useTranslation();
  return (
    <section className="opponent-report__sheet">
      <FewDataLegend minSample={view.minSample} />
      <h3>{t('opponentReportRotations')}</h3>
      <ViewTableView table={view.overview.rotations} />
      <div className="opponent-report__columns">
        <BulletList title={t('opponentReportStrengths')} items={view.overview.strengths} tone="good" />
        <BulletList title={t('opponentReportWeaknesses')} items={view.overview.weaknesses} tone="bad" />
      </div>
      <h3>{t('opponentReportErrors')}</h3>
      <ViewTableView table={view.overview.errors} />
      <label className="opponent-report__notes">
        <span>{t('opponentReportNotes')}</span>
        <textarea
          rows={5}
          value={view.overview.notes}
          onChange={(event) => update((current) => ({ ...current, notes: event.target.value }))}
          placeholder={t('opponentReportNotesPlaceholder')}
        />
      </label>
    </section>
  );
}

export function ReceptionSheet({ view, update, notesKey }: { view: ReportView; update: Update; notesKey: string }) {
  const { t } = useTranslation();
  const court = buildServeTargetCourtSvg(view.reception.targets, t('opponentReportNet'));
  return (
    <section className="opponent-report__sheet">
      <FewDataLegend minSample={view.minSample} />
      <p><strong>{view.reception.summary}</strong></p>
      <div className="opponent-report__columns">
        <BulletList title={t('opponentReportDoesWell')} items={view.reception.good} tone="good" />
        <BulletList title={t('opponentReportDoesBadly')} items={view.reception.bad} tone="bad" />
      </div>
      <h3>{t('opponentReportFormations')}</h3>
      <p className="opponent-report__hint">{view.reception.formationSystem}</p>
      {view.reception.formations.length === 0 ? <p className="opponent-report__hint">{t('opponentReportNothingNotable')}</p> : (
        <div className="opponent-report__formations">
          {view.reception.formations.map(({ title, formation }) => (
            // Built from numbers and escaped labels only (buildReceptionFormationSvg).
            // eslint-disable-next-line react/no-danger
            <div key={formation.rotation} className="opponent-report__court" dangerouslySetInnerHTML={{
              __html: buildReceptionFormationSvg(formation, { title, net: t('opponentReportNet') }),
            }} />
          ))}
        </div>
      )}
      <h3>{t('opponentReportReceivers')}</h3>
      <ViewTableView table={view.reception.receivers} />
      <h3>{t('opponentReportFirstBall')}</h3>
      <ViewTableView table={view.reception.firstBall} />
      <h3>{t('opponentReportPositiveReception')}</h3>
      <p className="opponent-report__hint">{t('opponentReportPositiveReceptionHelp')}</p>
      <ViewTableView table={view.reception.positiveReception} />
      <h3>{t('opponentReportServeTargets')}</h3>
      <div className="opponent-report__serve-targets">
        {/* Built from numbers and escaped labels only (buildServeTargetCourtSvg). */}
        {/* eslint-disable-next-line react/no-danger */}
        <div className="opponent-report__court" dangerouslySetInnerHTML={{ __html: court }} />
        {view.reception.serveTargets.length === 0 ? <p className="opponent-report__hint">{t('opponentReportNothingNotable')}</p> : (
          <ul>{view.reception.serveTargets.map((line) => <li key={line}>{line}</li>)}</ul>
        )}
      </div>
      <label className="opponent-report__notes">
        <span>{t('opponentReportSheetNotes')}</span>
        <textarea
          rows={4}
          value={view.reception.notes}
          onChange={(event) => update((current) => ({ ...current, freeTexts: { ...current.freeTexts, [notesKey]: event.target.value } }))}
        />
      </label>
    </section>
  );
}
