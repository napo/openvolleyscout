import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from 'recharts';
import { useTranslation, type TranslationKey } from '@src/i18n';
import { EVALUATION_SYMBOL_COLOR, type EvaluationSymbol } from '../../../scouting/model/indicators';
import type { MatchEvaluationPoint } from './evaluation-breakdown';

const GRID_COLOR = 'var(--color-border, rgba(15, 23, 42, 0.12))';

const SYMBOL_ORDER: readonly EvaluationSymbol[] = ['#', '+', '!', '-', '/', '='];

const SYMBOL_LABEL_KEY: Record<EvaluationSymbol, TranslationKey> = {
  '#': 'evalSymbolPerfect',
  '+': 'evalSymbolPositive',
  '!': 'evalSymbolHalf',
  '-': 'evalSymbolNegative',
  '/': 'evalSymbolPoor',
  '=': 'evalSymbolError',
};

interface ChartRow {
  label: string;
  total: number;
  [symbol: string]: number | string;
}

interface TooltipPayloadItem {
  dataKey: string;
  value: number;
  color: string;
}

function EvaluationTooltip({ active, payload, label }: { active?: boolean; payload?: TooltipPayloadItem[]; label?: string }) {
  const { t } = useTranslation();
  if (!active || !payload || payload.length === 0) return null;

  return (
    <div className="radar-chart__tooltip">
      <p className="radar-chart__tooltip-axis">{label}</p>
      {payload.filter((item) => item.value > 0).map((item) => (
        <p key={item.dataKey} className="radar-chart__tooltip-row">
          <span style={{ color: item.color }}>{t(SYMBOL_LABEL_KEY[item.dataKey as EvaluationSymbol])}</span>
          <span>{item.value.toFixed(0)}%</span>
        </p>
      ))}
    </div>
  );
}

export function StackedEvaluationChart({ points }: { points: readonly MatchEvaluationPoint[] }) {
  const { t } = useTranslation();

  const rows: ChartRow[] = points.map((point) => {
    const row: ChartRow = {
      label: point.playedAt ? point.playedAt.slice(0, 10) : point.opponentName,
      total: point.total,
    };
    SYMBOL_ORDER.forEach((symbol) => {
      row[symbol] = point.total > 0 ? (point.counts[symbol] / point.total) * 100 : 0;
    });
    return row;
  });

  const hasData = rows.some((row) => row.total > 0);
  if (!hasData) {
    return <p className="trends-panel__empty">{t('prioritiesEvaluationTrendEmpty')}</p>;
  }

  return (
    <ResponsiveContainer width="100%" height={220}>
      <BarChart data={rows} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
        <CartesianGrid stroke={GRID_COLOR} vertical={false} />
        <XAxis dataKey="label" tickLine={false} axisLine={{ stroke: GRID_COLOR }} />
        <YAxis domain={[0, 100]} ticks={[0, 25, 50, 75, 100]} tickFormatter={(v: number) => `${v}%`} tickLine={false} axisLine={false} width={44} />
        <Tooltip content={<EvaluationTooltip />} />
        <Legend formatter={(symbol: string) => t(SYMBOL_LABEL_KEY[symbol as EvaluationSymbol])} />
        {SYMBOL_ORDER.map((symbol) => (
          <Bar key={symbol} dataKey={symbol} stackId="evaluation" fill={EVALUATION_SYMBOL_COLOR[symbol]} maxBarSize={28} />
        ))}
      </BarChart>
    </ResponsiveContainer>
  );
}
