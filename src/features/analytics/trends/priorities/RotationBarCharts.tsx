import {
  BarChart, Bar, Cell, XAxis, YAxis, CartesianGrid, ReferenceLine, Tooltip, ResponsiveContainer,
} from 'recharts';
import { useTranslation } from '@src/i18n';
import { CROSS_ROTATION_THRESHOLDS } from '../../cross-rotation/cross-rotation-format';
import type { RotationDiagnosis, RotationPhase } from './tactical-rotation';

const TONE_COLOR = {
  green: '#16a34a',
  red: '#dc2626',
  neutral: 'var(--color-text-secondary, #64748b)',
} as const;

const GRID_COLOR = 'var(--color-border, rgba(15, 23, 42, 0.12))';

interface RotationBarRow {
  rotation: string;
  value: number | null;
  tone: 'green' | 'red' | null;
  attempts: number;
  wins: number;
}

interface TooltipPayloadItem {
  payload: RotationBarRow;
}

function RotationTooltip({ active, payload }: { active?: boolean; payload?: TooltipPayloadItem[] }) {
  if (!active || !payload || payload.length === 0) return null;
  const row = payload[0].payload;
  if (row.value === null) return null;
  return (
    <div className="radar-chart__tooltip">
      <p className="radar-chart__tooltip-axis">{row.rotation}</p>
      <p className="radar-chart__tooltip-row">
        <span>{row.wins}/{row.attempts}</span>
        <span>{row.value.toFixed(0)}%</span>
      </p>
    </div>
  );
}

function PhaseBarChart({ phase, rows }: { phase: RotationPhase; rows: RotationBarRow[] }) {
  const { good, bad } = CROSS_ROTATION_THRESHOLDS[phase];

  return (
    <ResponsiveContainer width="100%" height={200}>
      <BarChart data={rows} margin={{ top: 8, right: 8, left: 0, bottom: 0 }} barCategoryGap="20%">
        <CartesianGrid stroke={GRID_COLOR} vertical={false} />
        <XAxis dataKey="rotation" tickLine={false} axisLine={{ stroke: GRID_COLOR }} />
        <YAxis
          domain={[0, 100]}
          ticks={[0, 25, 50, 75, 100]}
          tickFormatter={(v: number) => `${v}%`}
          tickLine={false}
          axisLine={false}
          width={44}
        />
        <ReferenceLine y={good * 100} stroke={TONE_COLOR.green} strokeDasharray="4 4" />
        <ReferenceLine y={bad * 100} stroke={TONE_COLOR.red} strokeDasharray="4 4" />
        <Tooltip content={<RotationTooltip />} />
        <Bar dataKey="value" radius={[4, 4, 0, 0]} maxBarSize={24}>
          {rows.map((row) => (
            <Cell key={row.rotation} fill={row.tone ? TONE_COLOR[row.tone] : TONE_COLOR.neutral} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

export function RotationBarCharts({ diagnosis }: { diagnosis: readonly RotationDiagnosis[] }) {
  const { t } = useTranslation();

  const sideOutRows: RotationBarRow[] = diagnosis.map((entry) => ({
    rotation: t('prioritiesRotationLabel', { number: entry.rotation }),
    value: entry.sideOut.percentage !== null ? entry.sideOut.percentage * 100 : null,
    tone: entry.sideOut.tone,
    attempts: entry.sideOut.attempts,
    wins: entry.sideOut.wins,
  }));
  const breakPointRows: RotationBarRow[] = diagnosis.map((entry) => ({
    rotation: t('prioritiesRotationLabel', { number: entry.rotation }),
    value: entry.breakPoint.percentage !== null ? entry.breakPoint.percentage * 100 : null,
    tone: entry.breakPoint.tone,
    attempts: entry.breakPoint.attempts,
    wins: entry.breakPoint.wins,
  }));

  return (
    <div className="priorities-panel__rotation-charts">
      <div className="priorities-panel__rotation-chart">
        <h4 className="priorities-panel__rotation-chart-title">{t('prioritiesRotationSideOutHeader')}</h4>
        <PhaseBarChart phase="sideOut" rows={sideOutRows} />
      </div>
      <div className="priorities-panel__rotation-chart">
        <h4 className="priorities-panel__rotation-chart-title">{t('prioritiesRotationBreakPointHeader')}</h4>
        <PhaseBarChart phase="breakPoint" rows={breakPointRows} />
      </div>
      <div className="priorities-panel__rotation-legend">
        <span className="priorities-panel__rotation-legend-item">
          <span className="priorities-panel__rotation-legend-swatch" style={{ background: TONE_COLOR.green }} />
          {t('crossRotationLegendSideOutGood')} · {t('crossRotationLegendBreakPointGood')}
        </span>
        <span className="priorities-panel__rotation-legend-item">
          <span className="priorities-panel__rotation-legend-swatch" style={{ background: TONE_COLOR.red }} />
          {t('crossRotationLegendSideOutBad')} · {t('crossRotationLegendBreakPointBad')}
        </span>
      </div>
    </div>
  );
}
