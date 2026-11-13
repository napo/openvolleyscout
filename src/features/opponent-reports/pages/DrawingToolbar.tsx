import { ActionIcon, type ActionIconName } from '@src/components/ActionIcon';
import { useTranslation, type TranslationKey } from '@src/i18n';

export type DrawingTool = 'select' | 'pan' | 'player' | 'arrow' | 'move' | 'cone' | 'area' | 'text';
export const DRAWING_TOOLS: Array<{ tool: DrawingTool; icon: ActionIconName; label: TranslationKey; key: string }> = [
  { tool: 'select', icon: 'select', label: 'opponentReportBoardToolSelect', key: 'v' },
  { tool: 'pan', icon: 'pan', label: 'tacticalEditorPan', key: 'h' },
  { tool: 'player', icon: 'player', label: 'opponentReportBoardToolPlayer', key: 'p' },
  { tool: 'arrow', icon: 'arrow', label: 'opponentReportBoardToolArrow', key: 'a' },
  { tool: 'move', icon: 'move', label: 'tacticalMoveArrow', key: 'm' },
  { tool: 'cone', icon: 'cone', label: 'opponentReportBoardToolCone', key: 'c' },
  { tool: 'area', icon: 'area', label: 'tacticalTargetArea', key: 'r' },
  { tool: 'text', icon: 'text', label: 'opponentReportBoardToolText', key: 't' },
];

function IconButton({ icon, label, onClick, disabled, pressed, shortcut }: { icon: ActionIconName; label: string; onClick: () => void; disabled?: boolean; pressed?: boolean; shortcut?: string }) {
  return <button type="button" className={`tactical-icon-button${pressed ? ' is-active' : ''}`} aria-label={label} title={`${label}${shortcut ? ` (${shortcut.toUpperCase()})` : ''}`} aria-pressed={pressed} aria-keyshortcuts={shortcut} onClick={onClick} disabled={disabled}><ActionIcon name={icon} /></button>;
}

export function DrawingToolbar({ tool, onTool, canUndo, canRedo, selected, onUndo, onRedo, onDuplicate, onDelete, zoom, canFit = true, onZoom, onFit, onOpenHeatmapGrid, onClose, onReset }: {
  tool: DrawingTool; onTool: (tool: DrawingTool) => void;
  canUndo: boolean; canRedo: boolean; selected: boolean;
  onUndo: () => void; onRedo: () => void; onDuplicate: () => void; onDelete: () => void;
  zoom: number; canFit?: boolean; onZoom: (zoom: number) => void; onFit: () => void; onOpenHeatmapGrid?: () => void; onClose?: () => void; onReset?: () => void;
}) {
  const { t } = useTranslation();
  return <div className="tactical-drawing-toolbar" role="toolbar" aria-label={t('tacticalDrawingTools')} onKeyDown={(event) => {
    if (event.target instanceof HTMLSelectElement || !['ArrowLeft', 'ArrowRight'].includes(event.key)) return;
    const buttons = [...event.currentTarget.querySelectorAll<HTMLButtonElement>('button:not(:disabled)')];
    const index = buttons.indexOf(event.target as HTMLButtonElement);
    if (index < 0) return;
    event.preventDefault(); event.stopPropagation();
    buttons[(index + (event.key === 'ArrowRight' ? 1 : buttons.length - 1)) % buttons.length]?.focus();
  }}>
    <div className="tactical-toolbar-group">
      {DRAWING_TOOLS.map((entry) => <IconButton key={entry.tool} icon={entry.icon} label={t(entry.label)} shortcut={entry.key} pressed={tool === entry.tool} onClick={() => onTool(entry.tool)} />)}
    </div>
    <div className="tactical-toolbar-group">
      <button type="button" className="tactical-toolbar-text-button" aria-label={t('opponentReportBoardUndo')} title={`${t('opponentReportBoardUndo')} (Ctrl+Z)`} disabled={!canUndo} onClick={onUndo}><ActionIcon name="undo" /><span>{t('opponentReportBoardUndo')}</span></button>
      <IconButton icon="redo" label={t('opponentReportBoardRedo')} disabled={!canRedo} onClick={onRedo} />
      <IconButton icon="copy" label={t('opponentReportDuplicate')} disabled={!selected} onClick={onDuplicate} />
      <IconButton icon="delete" label={t('opponentReportBoardDeleteSelected')} disabled={!selected} onClick={onDelete} />
    </div>
    <div className="tactical-toolbar-group">
      <IconButton icon="zoom-out" label={t('tacticalEditorZoomOut')} disabled={zoom <= 1} onClick={() => onZoom(zoom - .25)} />
      <output aria-label={t('tacticalEditorZoom')}>{Math.round(zoom * 100)}%</output>
      <IconButton icon="zoom-in" label={t('tacticalEditorZoomIn')} disabled={zoom >= 4} onClick={() => onZoom(zoom + .25)} />
      <IconButton icon="fit" label={t('tacticalEditorFitDrawing')} disabled={!canFit} onClick={onFit} />
    </div>
    {onOpenHeatmapGrid ? <div className="tactical-toolbar-group">
      <button type="button" className="tactical-toolbar-text-button" onClick={onOpenHeatmapGrid}><ActionIcon name="ods" /><span>{t('serveHeatmapEdit')}</span></button>
    </div> : null}
    {(onReset || onClose) ? <div className="tactical-toolbar-group">
      {onReset ? <IconButton icon="undo" label={t('opponentReportBoardResetSvg')} onClick={onReset} /> : null}
      {onClose ? <IconButton icon="close" label={t('opponentReportBoardCloseSvg')} onClick={onClose} /> : null}
    </div> : null}
  </div>;
}
