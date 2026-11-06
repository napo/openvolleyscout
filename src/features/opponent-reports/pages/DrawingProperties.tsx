import { useTranslation } from '@src/i18n';
import type { OpponentReportDrawingTeam, OpponentReportShape } from '@src/domain/opponent-report/types';
import type { ReportPlayer } from '../model/report-metrics';
import { playerLabel } from '../model/report-keys';
import { drawingArrowBend, TEAM_COLORS } from '../model/tactical-board';
import type { DrawingTool } from './DrawingToolbar';

export type DrawingPointHandle = 'position' | 'start' | 'end' | 'control' | 'apex' | 'left' | 'right';

function RangeWidget({ label, value, min, max, step = 1, onChange, begin, finish }: { label: string; value: number; min: number; max: number; step?: number; onChange: (value: number) => void; begin: () => void; finish: () => void }) {
  return <label className="tactical-property"><span>{label}<output>{Math.round(value * 10) / 10}</output></span><input aria-label={label} type="range" min={min} max={max} step={step} value={value} onPointerDown={begin} onPointerUp={finish} onPointerCancel={finish} onKeyDown={begin} onKeyUp={finish} onBlur={finish} onChange={(event) => onChange(Number(event.target.value))} /></label>;
}

export function DrawingProperties({ shape, tool, team, onTeam, color, onColor, number, onNumber, text, onText, roster, onPatch, onPoint, onBend, begin, finish }: {
  shape: OpponentReportShape | null; tool: DrawingTool; team: OpponentReportDrawingTeam; onTeam: (team: OpponentReportDrawingTeam) => void;
  color: string; onColor: (color: string) => void; number: string; onNumber: (number: string) => void; text: string; onText: (text: string) => void;
  roster: readonly ReportPlayer[]; onPatch: (change: (shape: OpponentReportShape) => OpponentReportShape) => void;
  onPoint: (handle: DrawingPointHandle, x: number, y: number) => void; onBend: (bend: number) => void; begin: () => void; finish: () => void;
}) {
  const { t } = useTranslation();
  const kind = shape?.kind ?? tool;
  const range = (label: string, value: number, min: number, max: number, onChange: (value: number) => void, step?: number) => <RangeWidget label={label} value={value} min={min} max={max} step={step} onChange={onChange} begin={begin} finish={finish} />;
  const points: Array<{ label: string; handle: DrawingPointHandle; x: number; y: number }> = [];
  if (shape?.kind === 'player' || shape?.kind === 'text' || shape?.kind === 'area') points.push({ label: t('tacticalEditorPosition'), handle: 'position', x: shape.x, y: shape.y });
  if (shape?.kind === 'arrow') points.push(
    { label: t('opponentReportBoardArrowStart'), handle: 'start', x: shape.x1, y: shape.y1 },
    { label: t('opponentReportBoardArrowEnd'), handle: 'end', x: shape.x2, y: shape.y2 },
    { label: t('tacticalEditorCurve'), handle: 'control', x: shape.cx ?? (shape.x1 + shape.x2) / 2, y: shape.cy ?? (shape.y1 + shape.y2) / 2 },
  );
  if (shape?.kind === 'cone') points.push(
    { label: t('opponentReportBoardConeApex'), handle: 'apex', x: shape.x1, y: shape.y1 },
    { label: t('tacticalEditorLeftPoint'), handle: 'left', x: shape.x2, y: shape.y2 },
    { label: t('tacticalEditorRightPoint'), handle: 'right', x: shape.x3, y: shape.y3 },
  );
  return <aside className="opponent-report__board-inspector tactical-properties">
    <h3>{t('tacticalEditorProperties')}</h3>
    {!shape && (tool === 'select' || tool === 'pan') ? <p>{t(tool === 'pan' ? 'tacticalEditorPanHint' : 'tacticalEditorSelectHint')}</p> : <>
      {['player', 'arrow', 'cone'].includes(kind) ? <fieldset className="tactical-team-picker"><legend>{t('tacticalEditorTeam')}</legend>{(['opponent', 'own'] as const).map((side) => <button type="button" key={side} title={t(side === 'own' ? 'opponentReportBoardTeamOwn' : 'opponentReportBoardTeamOpponent')} aria-label={t(side === 'own' ? 'opponentReportBoardTeamOwn' : 'opponentReportBoardTeamOpponent')} aria-pressed={(shape && 'team' in shape ? shape.team : team) === side} onClick={() => onTeam(side)}><span style={{ background: TEAM_COLORS[side].fill }} />{t(side === 'own' ? 'opponentReportBoardTeamOwn' : 'opponentReportBoardTeamOpponent')}</button>)}</fieldset> : null}
      <label className="tactical-property tactical-color"><span>{t('tacticalEditorColor')}</span><input type="color" value={/^#[\da-f]{6}$/i.test(color) ? color : '#2563eb'} onChange={(event) => onColor(event.target.value)} /></label>
      {kind === 'player' ? <>
        <label className="tactical-property"><span>{t('opponentReportBoardJerseyNumber')}</span><input type="text" maxLength={12} value={shape?.kind === 'player' ? shape.number : number} onChange={(event) => onNumber(event.target.value)} /></label>
        {roster.length ? <label className="tactical-property"><span>{t('tacticalEditorRoster')}</span><select value="" onChange={(event) => onNumber(event.target.value)}><option value="">{t('tacticalEditorChooseNumber')}</option>{roster.map((player) => <option key={player.key} value={player.jersey || '?'}>{playerLabel(player)}</option>)}</select></label> : null}
        {shape?.kind === 'player' ? <>
          <label className="tactical-property"><span>{t('tacticalEditorLabel')}</span><input type="text" value={shape.label ?? ''} onChange={(event) => onPatch((current) => current.kind === 'player' ? { ...current, label: event.target.value } : current)} /></label>
          {range(t('tacticalEditorSize'), shape.radius ?? 15, 6, 30, (radius) => onPatch((current) => current.kind === 'player' ? { ...current, radius } : current))}
        </> : null}
      </> : null}
      {kind === 'text' ? <>
        <label className="tactical-property"><span>{t('opponentReportBoardTextValue')}</span><textarea rows={2} value={shape?.kind === 'text' ? shape.text : text} onChange={(event) => onText(event.target.value)} /></label>
        {shape?.kind === 'text' ? range(t('tacticalEditorFontSize'), shape.fontSize ?? 11, 7, 30, (fontSize) => onPatch((current) => current.kind === 'text' ? { ...current, fontSize } : current)) : null}
      </> : null}
      {shape?.kind === 'arrow' ? <>
        {range(t('tacticalEditorStroke'), shape.strokeWidth ?? 2.6, 1, 8, (strokeWidth) => onPatch((current) => current.kind === 'arrow' ? { ...current, strokeWidth } : current), .2)}
        {range(t('tacticalEditorCurve'), drawingArrowBend(shape), -50, 50, onBend)}
        <button type="button" className="btn-secondary btn-small" onClick={() => onBend(0)}>{t('opponentReportBoardResetCurve')}</button>
      </> : null}
      {shape?.kind === 'cone' || shape?.kind === 'area' ? range(t('tacticalEditorOpacity'), (shape.opacity ?? (shape.kind === 'area' ? .3 : .28)) * 100, 5, 100, (opacity) => onPatch((current) => current.kind === 'area' || current.kind === 'cone' ? { ...current, opacity: opacity / 100 } : current)) : null}
      {shape?.kind === 'area' ? <>
        {range(t('tacticalAreaWidth'), shape.rx * 2, 2, 100, (width) => onPatch((current) => current.kind === 'area' ? { ...current, rx: width / 2 } : current))}
        {range(t('tacticalAreaDepth'), shape.ry * 2, 2, 100, (depth) => onPatch((current) => current.kind === 'area' ? { ...current, ry: depth / 2 } : current))}
      </> : null}
    </>}
    {points.length ? <details className="tactical-advanced"><summary>{t('tacticalEditorAdvanced')}</summary>{points.map((point) => <fieldset key={point.handle}><legend>{point.label}</legend><div className="opponent-report__board-coord-pair">
      <label><span>{t('opponentReportBoardCoordX')}</span><input type="number" min={0} max={100} step={1} value={Math.round(point.x)} onChange={(event) => onPoint(point.handle, Number(event.target.value), point.y)} /></label>
      <label><span>{t('opponentReportBoardCoordY')}</span><input type="number" min={0} max={100} step={1} value={Math.round(point.y)} onChange={(event) => onPoint(point.handle, point.x, Number(event.target.value))} /></label>
    </div></fieldset>)}</details> : null}
  </aside>;
}
