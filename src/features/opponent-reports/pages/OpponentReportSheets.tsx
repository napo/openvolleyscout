import { ReportPriorities } from './ReportPriorities';
import { useTranslation } from '@src/i18n';
import type { OpponentReport } from '@src/domain/opponent-report/types';
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
import {
  SERVE_NOTES_KEY,
  SERVE_TARGETS_NOTES_KEY,
  formatViewCell,
  type ReportView,
  type ViewT,
  type ViewTable,
} from '../model/report-view';
import { buildReceptionFormationSvg } from '../model/reception-formation';
import { playerLabel } from '../model/report-keys';

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
                  {formatViewCell(cell)}
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

export function KeysSheet({ report, view, suggestions, update, viewT, onOpenBoard }: {
  report: OpponentReport;
  view: ReportView;
  suggestions: readonly KeySuggestion[];
  update: Update;
  viewT: ViewT;
  onOpenBoard?: () => void;
}) {
  return <section className="opponent-report__sheet">
    <BoardPieceToggleBar pieceId={PIECE_KEYS_MAIN} report={report} view={view} update={update} onOpenBoard={onOpenBoard} />
    <ReportPriorities report={report} suggestions={suggestions} update={update} viewT={viewT} />
    {view.overview.teamIndicators.rows.length > 0 && <>
      <h3>{viewT('opponentReportTeamIndicators')}</h3>
      <FewDataLegend minSample={view.minSample} />
      <ViewTableView table={view.overview.teamIndicators} />
    </>}
  </section>;
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

export function ServeTargetsSheet({ report, view, update, onOpenBoard }: {
  report: OpponentReport;
  view: ReportView;
  update: Update;
  onOpenBoard?: () => void;
}) {
  const { t } = useTranslation();
  const recommendations = new Map(view.serveTargets.recommendations.map((entry) => [entry.rotation, entry.text]));
  return (
    <section className="opponent-report__sheet">
      <FewDataLegend minSample={view.minSample} />
      <div className="opponent-report__section-header">
        <p className="opponent-report__hint">{t('opponentReportServeTargetsHelp')}</p>
        <BoardPieceToggleBar
          pieceId={PIECE_RECEPTION_SERVE_TARGETS}
          report={report}
          view={view}
          update={update}
          onOpenBoard={onOpenBoard}
        />
      </div>
      <div className="opponent-report__formations">
        {view.serveTargets.formations.map(({ title, formation }) => (
          <article key={formation.rotation} className="opponent-report__target-court">
            {/* Generated only from numeric formation data and escaped labels. */}
            {/* eslint-disable-next-line react/no-danger */}
            <div className="opponent-report__court" dangerouslySetInnerHTML={{
              __html: buildReceptionFormationSvg(formation, { title, net: t('opponentReportNet') }),
            }} />
            {recommendations.has(formation.rotation) ? (
              <p>{recommendations.get(formation.rotation)}</p>
            ) : (
              <p className="opponent-report__hint">{t('opponentReportNothingNotable')}</p>
            )}
          </article>
        ))}
      </div>
      <label className="opponent-report__notes">
        <span>{t('opponentReportSheetNotes')}</span>
        <textarea
          rows={4}
          value={view.serveTargets.notes}
          onChange={(event) => update((current) => ({
            ...current,
            freeTexts: { ...current.freeTexts, [SERVE_TARGETS_NOTES_KEY]: event.target.value },
          }))}
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
              <h2>{playerLabel(server.player)}</h2>
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
