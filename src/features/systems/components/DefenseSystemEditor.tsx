import { useEffect, useRef, useState } from 'react';
import type { ChangeEvent, PointerEvent } from 'react';
import {
  DEFENSE_CONTEXTS,
  DEFENSE_ROTATIONS,
  DEFAULT_PLAYING_SYSTEM,
  getNearestDataVolleyZone,
  getRoleLabel,
  getSetterRotationLabel,
  type DefenseContext,
  type DefensePosition,
  type DefenseRotation,
  type DefenseSystemBlock,
} from '@src/domain/systems';
import { useTranslation } from '@src/i18n';

interface DefenseSystemEditorProps {
  blocks: DefenseSystemBlock[];
  activeBlock: DefenseSystemBlock;
  teamId?: string;
  onSelectBlock: (blockId: string) => void;
  onSaveBlock: (block: DefenseSystemBlock) => void;
  onDeleteBlock: (blockId: string) => void;
}

const DEFENSE_CONTEXT_LABEL_KEYS: Record<DefenseContext, 'breakPointDefense' | 'sideOutDefense'> = {
  break_point: 'breakPointDefense',
  side_out: 'sideOutDefense',
};

const SHOW_DEFENSE_ZONE_CODES = import.meta.env.DEV
  && import.meta.env.VITE_SHOW_DEFENSE_ZONE_CODES === 'true';

function clampPercentage(value: number): number {
  return Math.min(100, Math.max(0, value));
}

function getPointerCoordinates(
  event: PointerEvent,
  courtElement: HTMLDivElement | null,
): { x: number; y: number } | null {
  if (!courtElement) {
    return null;
  }

  const bounds = courtElement.getBoundingClientRect();
  if (bounds.width === 0 || bounds.height === 0) {
    return null;
  }

  return {
    x: clampPercentage(((event.clientX - bounds.left) / bounds.width) * 100),
    y: clampPercentage(((event.clientY - bounds.top) / bounds.height) * 100),
  };
}

function updatePositionCoordinates(
  positions: DefensePosition[],
  role: DefensePosition['role'],
  x: number,
  y: number,
): DefensePosition[] {
  return positions.map((position) => (
    position.role === role
      ? {
          ...position,
          x,
          y,
          dataVolleyZone: getNearestDataVolleyZone(x, y),
        }
      : position
  ));
}

function getRotationPositions(
  block: DefenseSystemBlock,
  context: DefenseContext,
  rotation: DefenseRotation,
): DefensePosition[] {
  return block.contexts[context].find((entry) => entry.rotation === rotation)?.positions ?? [];
}

function cloneDefenseSystemBlock(block: DefenseSystemBlock): DefenseSystemBlock {
  return {
    ...block,
    roleSequence: [...block.roleSequence],
    contexts: {
      break_point: block.contexts.break_point.map((rotation) => ({
        ...rotation,
        positions: rotation.positions.map((position) => ({ ...position })),
      })),
      side_out: block.contexts.side_out.map((rotation) => ({
        ...rotation,
        positions: rotation.positions.map((position) => ({ ...position })),
      })),
    },
  };
}

export function DefenseSystemEditor({
  blocks,
  activeBlock,
  teamId,
  onSelectBlock,
  onSaveBlock,
  onDeleteBlock,
}: DefenseSystemEditorProps) {
  const { t, locale } = useTranslation();
  const courtRef = useRef<HTMLDivElement>(null);
  const [draftBlock, setDraftBlock] = useState<DefenseSystemBlock>(() => cloneDefenseSystemBlock(activeBlock));
  const [selectedContext, setSelectedContext] = useState<DefenseContext>('break_point');
  const [selectedRotation, setSelectedRotation] = useState<DefenseRotation>(1);
  const [draggingRole, setDraggingRole] = useState<DefensePosition['role'] | null>(null);
  const [isModified, setIsModified] = useState(false);
  const [isSaved, setIsSaved] = useState(false);

  useEffect(() => {
    setDraftBlock(cloneDefenseSystemBlock(activeBlock));
    setSelectedContext('break_point');
    setSelectedRotation(1);
    setDraggingRole(null);
    setIsModified(false);
    setIsSaved(false);
  }, [activeBlock]);

  const selectedPositions = getRotationPositions(draftBlock, selectedContext, selectedRotation);
  const selectedContextLabel = t(DEFENSE_CONTEXT_LABEL_KEYS[selectedContext]);
  const selectedRotationLabel = getSetterRotationLabel(selectedRotation, locale);

  const updateDraftPosition = (role: DefensePosition['role'], event: PointerEvent) => {
    const coordinates = getPointerCoordinates(event, courtRef.current);
    if (!coordinates) {
      return;
    }

    setDraftBlock((current) => ({
      ...current,
      contexts: {
        ...current.contexts,
        [selectedContext]: current.contexts[selectedContext].map((rotation) => (
          rotation.rotation === selectedRotation
            ? {
                ...rotation,
                positions: updatePositionCoordinates(rotation.positions, role, coordinates.x, coordinates.y),
              }
            : rotation
        )),
      },
    }));
    setIsModified(true);
    setIsSaved(false);
  };

  const handlePointerDown = (role: DefensePosition['role'], event: PointerEvent<HTMLButtonElement>) => {
    event.currentTarget.setPointerCapture(event.pointerId);
    setDraggingRole(role);
    updateDraftPosition(role, event);
  };

  const handlePointerMove = (role: DefensePosition['role'], event: PointerEvent<HTMLButtonElement>) => {
    if (draggingRole !== role) {
      return;
    }

    updateDraftPosition(role, event);
  };

  const handlePointerEnd = (event: PointerEvent<HTMLButtonElement>) => {
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }

    setDraggingRole(null);
  };

  const handleNameChange = (event: ChangeEvent<HTMLInputElement>) => {
    setDraftBlock((current) => ({
      ...current,
      name: event.target.value,
    }));
    setIsModified(true);
    setIsSaved(false);
  };

  const handleSave = () => {
    const nextBlock = {
      ...draftBlock,
      name: draftBlock.name.trim() || t('untitledSystem'),
      teamId: draftBlock.teamId ?? teamId,
      playingSystemId: draftBlock.playingSystemId ?? DEFAULT_PLAYING_SYSTEM.id,
      roleSequence: draftBlock.roleSequence.length > 0
        ? draftBlock.roleSequence
        : DEFAULT_PLAYING_SYSTEM.roleSequence,
    };

    onSaveBlock(nextBlock);
    setDraftBlock(nextBlock);
    setIsModified(false);
    setIsSaved(true);
  };

  const handleDelete = () => {
    onDeleteBlock(activeBlock.id);
  };

  const renderPositionMarker = (position: DefensePosition) => {
    const roleLabel = getRoleLabel(position.role, locale);

    return (
      <button
        key={position.role}
        type="button"
        className={`defense-system-editor__marker${draggingRole === position.role ? ' is-dragging' : ''}`}
        style={{
          left: `${position.x}%`,
          top: `${position.y}%`,
        }}
        aria-label={t('defenseMarkerLabel', {
          role: roleLabel,
        })}
        onPointerDown={(event) => handlePointerDown(position.role, event)}
        onPointerMove={(event) => handlePointerMove(position.role, event)}
        onPointerUp={handlePointerEnd}
        onPointerCancel={handlePointerEnd}
      >
        <strong>{roleLabel}</strong>
        {SHOW_DEFENSE_ZONE_CODES ? <span>{position.dataVolleyZone}</span> : null}
      </button>
    );
  };

  const roleSequenceLabel = draftBlock.roleSequence
    .map((role) => getRoleLabel(role, locale))
    .join(', ');

  return (
    <section className="defense-system-editor" aria-labelledby="defense-system-editor-title">
      <div className="defense-system-editor__toolbar">
        <label className="systems-editor__field">
          <span className="systems-editor__label">{t('selectDefenseSystem')}</span>
          <select
            className="systems-editor__input"
            value={activeBlock.id}
            onChange={(event) => onSelectBlock(event.target.value)}
          >
            {blocks.map((block) => (
              <option key={block.id} value={block.id}>
                {block.name || t('untitledSystem')}
              </option>
            ))}
          </select>
        </label>

        <label className="systems-editor__field">
          <span className="systems-editor__label">{t('playingSystem')}</span>
          <select className="systems-editor__input" value={DEFAULT_PLAYING_SYSTEM.id} disabled>
            <option value={DEFAULT_PLAYING_SYSTEM.id}>{t('defaultPlayingSystem')}</option>
          </select>
        </label>

        <label className="systems-editor__field">
          <span className="systems-editor__label">{t('systemName')}</span>
          <input
            className="systems-editor__input"
            value={draftBlock.name}
            onChange={handleNameChange}
            placeholder={t('systemNamePlaceholder')}
          />
        </label>

        <div className="defense-system-editor__save-group">
          <div className="defense-system-editor__actions">
            <button type="button" className="btn-primary" onClick={handleSave}>
              {t('saveSystem')}
            </button>
            <button type="button" className="btn-secondary" onClick={handleDelete}>
              {t('deleteSystem')}
            </button>
          </div>
          <span className="defense-system-editor__status" aria-live="polite">
            {isSaved ? t('systemSaved') : isModified ? t('unsavedChanges') : ''}
          </span>
        </div>
      </div>

      <div className="defense-system-editor__playing-system">
        <span className="systems-editor__summary-label">{t('defaultPlayingSystem')}</span>
        <strong className="systems-editor__summary-value">{roleSequenceLabel}</strong>
      </div>

      <div className="defense-system-editor__selectors">
        <label className="systems-editor__field">
          <span className="systems-editor__label">{t('defenseContext')}</span>
          <select
            className="systems-editor__input"
            value={selectedContext}
            onChange={(event) => setSelectedContext(event.target.value as DefenseContext)}
          >
            {DEFENSE_CONTEXTS.map((context) => (
              <option key={context} value={context}>
                {t(DEFENSE_CONTEXT_LABEL_KEYS[context])}
              </option>
            ))}
          </select>
        </label>

        <div className="defense-system-editor__rotation-tabs" aria-label={t('setterRotation')}>
          {DEFENSE_ROTATIONS.map((rotation) => (
            <button
              key={rotation}
              type="button"
              className={`defense-system-editor__rotation-tab${selectedRotation === rotation ? ' is-active' : ''}`}
              onClick={() => setSelectedRotation(rotation)}
            >
              {getSetterRotationLabel(rotation, locale)}
            </button>
          ))}
        </div>
      </div>

      <div className="defense-system-editor__workspace">
        <div
          ref={courtRef}
          className="defense-system-editor__court"
          aria-label={`${t('defenseSystemCourt')} ${selectedContextLabel} ${selectedRotationLabel}`}
        >
          <div className="defense-system-editor__net" aria-hidden="true" />
          <div className="defense-system-editor__attack-line" aria-hidden="true" />
          <div className="defense-system-editor__center-line" aria-hidden="true" />

          {selectedPositions.map(renderPositionMarker)}
        </div>

        <div className="defense-system-editor__positions" aria-label={t('defensePositionSummary')}>
          {selectedPositions.map((position) => (
            <div key={position.role} className="defense-system-editor__position-card">
              <span className="defense-system-editor__position-role">{getRoleLabel(position.role, locale)}</span>
              {SHOW_DEFENSE_ZONE_CODES ? (
                <span className="defense-system-editor__position-zone">
                  {t('zone')}: {position.dataVolleyZone}
                </span>
              ) : null}
              <span className="defense-system-editor__position-coordinates">
                {Math.round(position.x)}, {Math.round(position.y)}
              </span>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
