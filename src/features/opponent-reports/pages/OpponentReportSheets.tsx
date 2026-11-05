import { useTranslation } from '@src/i18n';
import type { OpponentReport, OpponentReportKey } from '@src/domain/opponent-report/types';
import {
  isPieceOnBoard,
  PIECE_KEYS_MAIN,
  PIECE_OVERVIEW_BREAK_REACTION,
  PIECE_OVERVIEW_ERRORS,
  PIECE_OVERVIEW_ROTATIONS,
  PIECE_OVERVIEW_STRENGTHS,
  PIECE_RECEPTION_FIRST_BALL,
  PIECE_RECEPTION_FORMATIONS,
  PIECE_RECEPTION_POSITIVE,
  PIECE_RECEPTION_RECEIVERS,
  PIECE_RECEPTION_SERVE_TARGETS,
  PIECE_RECEPTION_SUMMARY,
  servePieceId,
  toggleBoardPiece,
} from '../model/board-pieces';
import type { KeySuggestion } from '../model/report-keys';
import { buildServeTargetCourtSvg, SERVE_NOTES_KEY, suggestionText, type ReportView, type ViewT, type ViewTable } from '../model/report-view';
import { buildReceptionFormationSvg } from '../model/reception-formation';

type Update = (change: (current: OpponentReport) => OpponentReport) => void;

export function BoardPieceToggleBar({
  pieceId,
  report,
  view,
  update,
  onOpenBoard,
}: {
  pieceId: string;
  report: OpponentReport;
  view: ReportView;
  update: Update;
  onOpenBoard?: () => void;
}) {
  const { t } = useTranslation();
  const included = isPieceOnBoard(report, view, pieceId);
  return (
    <div className="opponent-report__piece-toggle">
      <button
        type="button"
        className={included ? 'btn-primary btn-small' : 'btn-secondary btn-small'}
        onClick={() => update((current) => toggleBoardPiece(current, view, pieceId))}
      >
        {included ? `✓ ${t('opponentReportPieceIncluded')}` : `+ ${t('opponentReportPieceInclude')}`}
      </button>
      {included && onOpenBoard ? (
        <button type="button" className="btn-secondary btn-small" onClick={onOpenBoard}>
          {`✎ ${t('opponentReportPieceOpenInBoard')}`}
        </button>
      ) : null}
    </div>
  );
}

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

export function KeysSheet({ report, view, suggestions, update, viewT, onOpenBoard }: {
  report: OpponentReport;
  view: ReportView;
  suggestions: readonly KeySuggestion[];
  update: Update;
  viewT: ViewT;
  onOpenBoard?: () => void;
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
      <div className="opponent-report__section-header">
        <p className="opponent-report__hint">{t('opponentReportKeysHelp')}</p>
        <BoardPieceToggleBar pieceId={PIECE_KEYS_MAIN} report={report} view={view} update={update} onOpenBoard={onOpenBoard} />
      </div>
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

export function OverviewSheet({ report, view, update, onOpenBoard }: {
  report: OpponentReport;
  view: ReportView;
  update: Update;
  onOpenBoard?: () => void;
}) {
  const { t } = useTranslation();
  return (
    <section className="opponent-report__sheet">
      <FewDataLegend minSample={view.minSample} />
      <div className="opponent-report__section-header">
        <h3>{t('opponentReportRotations')}</h3>
        <BoardPieceToggleBar pieceId={PIECE_OVERVIEW_ROTATIONS} report={report} view={view} update={update} onOpenBoard={onOpenBoard} />
      </div>
      <ViewTableView table={view.overview.rotations} />
      <div className="opponent-report__section-header">
        <h3>{`${t('opponentReportStrengths')} / ${t('opponentReportWeaknesses')}`}</h3>
        <BoardPieceToggleBar pieceId={PIECE_OVERVIEW_STRENGTHS} report={report} view={view} update={update} onOpenBoard={onOpenBoard} />
      </div>
      <div className="opponent-report__columns">
        <BulletList title={t('opponentReportStrengths')} items={view.overview.strengths} tone="good" />
        <BulletList title={t('opponentReportWeaknesses')} items={view.overview.weaknesses} tone="bad" />
      </div>
      <div className="opponent-report__section-header">
        <h3>{t('opponentReportErrors')}</h3>
        <BoardPieceToggleBar pieceId={PIECE_OVERVIEW_ERRORS} report={report} view={view} update={update} onOpenBoard={onOpenBoard} />
      </div>
      <ViewTableView table={view.overview.errors} />
      <div className="opponent-report__section-header">
        <h3>{t('opponentReportBreakReaction')}</h3>
        <BoardPieceToggleBar pieceId={PIECE_OVERVIEW_BREAK_REACTION} report={report} view={view} update={update} onOpenBoard={onOpenBoard} />
      </div>
      <p className="opponent-report__hint">{t('opponentReportBreakReactionHelp')}</p>
      <ViewTableView table={view.overview.breakReaction} />
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

export function ReceptionSheet({ report, view, update, notesKey, onOpenBoard }: {
  report: OpponentReport;
  view: ReportView;
  update: Update;
  notesKey: string;
  onOpenBoard?: () => void;
}) {
  const { t } = useTranslation();
  const court = buildServeTargetCourtSvg(view.reception.targets, t('opponentReportNet'));
  return (
    <section className="opponent-report__sheet">
      <FewDataLegend minSample={view.minSample} />
      <div className="opponent-report__section-header">
        <p><strong>{view.reception.summary}</strong></p>
        <BoardPieceToggleBar pieceId={PIECE_RECEPTION_SUMMARY} report={report} view={view} update={update} onOpenBoard={onOpenBoard} />
      </div>
      <div className="opponent-report__columns">
        <BulletList title={t('opponentReportDoesWell')} items={view.reception.good} tone="good" />
        <BulletList title={t('opponentReportDoesBadly')} items={view.reception.bad} tone="bad" />
      </div>
      <div className="opponent-report__section-header">
        <h3>{t('opponentReportFormations')}</h3>
        <BoardPieceToggleBar pieceId={PIECE_RECEPTION_FORMATIONS} report={report} view={view} update={update} onOpenBoard={onOpenBoard} />
      </div>
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
      <div className="opponent-report__section-header">
        <h3>{t('opponentReportReceivers')}</h3>
        <BoardPieceToggleBar pieceId={PIECE_RECEPTION_RECEIVERS} report={report} view={view} update={update} onOpenBoard={onOpenBoard} />
      </div>
      <ViewTableView table={view.reception.receivers} />
      <div className="opponent-report__section-header">
        <h3>{t('opponentReportFirstBall')}</h3>
        <BoardPieceToggleBar pieceId={PIECE_RECEPTION_FIRST_BALL} report={report} view={view} update={update} onOpenBoard={onOpenBoard} />
      </div>
      <ViewTableView table={view.reception.firstBall} />
      <div className="opponent-report__section-header">
        <h3>{t('opponentReportPositiveReception')}</h3>
        <BoardPieceToggleBar pieceId={PIECE_RECEPTION_POSITIVE} report={report} view={view} update={update} onOpenBoard={onOpenBoard} />
      </div>
      <p className="opponent-report__hint">{t('opponentReportPositiveReceptionHelp')}</p>
      <ViewTableView table={view.reception.positiveReception} />
      <div className="opponent-report__section-header">
        <h3>{t('opponentReportServeTargets')}</h3>
        <BoardPieceToggleBar pieceId={PIECE_RECEPTION_SERVE_TARGETS} report={report} view={view} update={update} onOpenBoard={onOpenBoard} />
      </div>
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

export function ServeSheet({ report, view, update, onOpenBoard }: {
  report: OpponentReport;
  view: ReportView;
  update: Update;
  onOpenBoard?: () => void;
}) {
  const { t } = useTranslation();
  return (
    <section className="opponent-report__sheet">
      <FewDataLegend minSample={view.minSample} />
      {view.serve.servers.length === 0 ? <p className="opponent-report__hint">{t('opponentReportNothingNotable')}</p> : (
        view.serve.servers.map((server) => (
          <article className="opponent-report__attacker" key={server.player.key}>
            <div className="opponent-report__section-header">
              <h2>{[server.player.jersey ? `#${server.player.jersey}` : '', server.player.name].filter(Boolean).join(' ')}</h2>
              <BoardPieceToggleBar
                pieceId={servePieceId(server.player.key)}
                report={report}
                view={view}
                update={update}
                onOpenBoard={onOpenBoard}
              />
            </div>
            <div className="opponent-report__attacker-summary">
              <div>
                {/* Built from numeric zone statistics and escaped player labels (buildServerCourtSvg). */}
                {/* eslint-disable-next-line react/no-danger */}
                <div className="opponent-report__court" dangerouslySetInnerHTML={{ __html: server.courtSvg }} />
                <p className="opponent-report__legend">{server.courtSample}</p>
              </div>
              <div>
                <ViewTableView table={server.highlights} />
              </div>
            </div>
          </article>
        ))
      )}
      <label className="opponent-report__notes">
        <span>{t('opponentReportSheetNotes')}</span>
        <textarea
          rows={4}
          value={view.serve.notes}
          onChange={(event) => update((current) => ({
            ...current,
            freeTexts: { ...current.freeTexts, [SERVE_NOTES_KEY]: event.target.value },
          }))}
        />
      </label>
    </section>
  );
}
