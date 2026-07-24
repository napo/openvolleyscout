import { useTranslation, type TranslationKey } from '@src/i18n';
import type { TrendTier } from './deficit-score';
import './trend-arrow.css';

interface TierConfig {
  rotation: number;
  color: string;
  scale: number;
  labelKey: TranslationKey;
}

const TIER_CONFIG: Record<TrendTier, TierConfig> = {
  'up-strong': {
    rotation: 0, color: '#16a34a', scale: 1.15, labelKey: 'prioritiesTrendUpStrong',
  },
  up: {
    rotation: 0, color: '#86efac', scale: 0.85, labelKey: 'prioritiesTrendUp',
  },
  flat: {
    rotation: 90, color: '#94a3b8', scale: 0.85, labelKey: 'prioritiesTrendFlat',
  },
  down: {
    rotation: 180, color: '#fb923c', scale: 0.85, labelKey: 'prioritiesTrendDown',
  },
  'down-strong': {
    rotation: 180, color: '#dc2626', scale: 1.15, labelKey: 'prioritiesTrendDownStrong',
  },
};

export interface TrendArrowProps {
  tier: TrendTier | null;
}

export function TrendArrow({ tier }: TrendArrowProps) {
  const { t } = useTranslation();

  if (tier === null) {
    return <span className="priorities-trend-arrow priorities-trend-arrow--none" aria-hidden="true">—</span>;
  }

  const config = TIER_CONFIG[tier];
  return (
    <span
      className="priorities-trend-arrow"
      style={{ color: config.color, transform: `rotate(${config.rotation}deg) scale(${config.scale})` }}
      role="img"
      aria-label={t(config.labelKey)}
      title={t(config.labelKey)}
    >
      &#9650;
    </span>
  );
}
