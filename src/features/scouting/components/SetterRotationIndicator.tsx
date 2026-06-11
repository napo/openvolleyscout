import { useTranslation } from '@src/i18n';
import type { ActiveLineup } from '@src/domain/lineup/types';

type SetterRotationIndicatorProps = {
  lineup: ActiveLineup | null | undefined;
};

export function SetterRotationIndicator({ lineup }: SetterRotationIndicatorProps) {
  const { t } = useTranslation();

  if (!lineup?.setterPlayerId || !lineup.rotationIndex) {
    return null;
  }

  const setterSlot = lineup.slots.find((slot) => slot.playerId === lineup.setterPlayerId);

  if (!setterSlot) {
    return null;
  }

  const courtPosition = setterSlot.courtPosition;

  // Map court position (1-6) to rotation position
  // Court positions: 1=back-right, 2=back-center, 3=back-left, 4=front-left, 5=front-center, 6=front-right
  const setterBadgeLabel = `${t('setter').charAt(0).toUpperCase()}${courtPosition}`;

  return (
    <div className="scouting-screen__setter-rotation-indicator">
      {setterBadgeLabel}
    </div>
  );
}
