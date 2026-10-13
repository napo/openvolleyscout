import { useEffect, useRef, useState } from 'react';
import type { ChangeEvent, PointerEvent } from 'react';
import {
  DEFENSE_CONTEXTS,
  DEFENSE_ROTATIONS,
  DEFAULT_PLAYING_SYSTEM,
} from '@src/config/systems';
import {
  getNearestDataVolleyZone,
  getRoleLabel,
  getRoleOrder,
  getSetterRotationLabel,
  type DefenseContext,
  type DefensePosition,
  type DefenseRotation,
  type DefenseSystemBlock,
} from '@src/domain/systems';
import type { ArchivedTeam } from '@src/domain/team/types';
import { useTranslation } from '@src/i18n';

interface DefenseSystemEditorProps {
  blocks: DefenseSystemBlock[];
  activeBlock: DefenseSystemBlock;
  /** Archived teams a system can be assigned to. */
  teams: ArchivedTeam[];
  onSelectBlock: (blockId: string) => void;
  onSaveBlock: (block: DefenseSystemBlock) => void;
  onDeleteBlock: (blockId: string) => void;
  /** Saves this system as a configuration file that can be imported again. */
  onExportBlock: (block: DefenseSystemBlock) => void;
}

const DEFENSE_CONTEXT_LABEL_KEYS: Record<DefenseContext, 'breakPointDefense' | 'sideOutDefense'> = {
  break_point: 'breakPointDefense',
  side_out: 'sideOutDefense',
};

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

const ROLE_ORDER_LABELS = { PSC: 'P-S-C', PCS: 'P-C-S' } as const;

export function DefenseSystemEditor({
  blocks,
  activeBlock,
  teams,
  onSelectBlock,
  onSaveBlock,
  onDeleteBlock,
  onExportBlock,
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

  const handleTeamChange = (event: ChangeEvent<HTMLSelectElement>) => {
    setDraftBlock((current) => ({
      ...current,
      teamId: event.target.value || undefined,
    }));
    setIsModified(true);
    setIsSaved(false);
  };

  const handleNameChange = (event: ChangeEvent<HTMLInputElement>) => {
    setDraftBlock((current) => ({
      ...current,
      name: event.target.value,
    }));
    setIsModified(true);
    setIsSaved(false);
  };

  const getPersistableDraftBlock = (): DefenseSystemBlock => ({
    ...draftBlock,
    name: draftBlock.name.trim() || t('untitledSystem'),
    teamId: draftBlock.teamId || undefined,
    playingSystemId: draftBlock.playingSystemId ?? DEFAULT_PLAYING_SYSTEM.id,
    roleSequence: draftBlock.roleSequence.length > 0
      ? draftBlock.roleSequence
      : DEFAULT_PLAYING_SYSTEM.roleSequence,
  });

  const handleSave = () => {
    const nextBlock = getPersistableDraftBlock();

    onSaveBlock(nextBlock);
    setDraftBlock(nextBlock);
    setIsModified(false);
    setIsSaved(true);
  };

  // Exports what is on screen, unsaved changes included.
  const handleExport = () => {
    onExportBlock(getPersistableDraftBlock());
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
      </button>
    );
  };

  const roleOrder = getRoleOrder(draftBlock.roleSequence);
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
          <span className="systems-editor__label">{t('systemTeam')}</span>
          <select className="systems-editor__input" value={draftBlock.teamId ?? ''} onChange={handleTeamChange}>
            <option value="">{t('systemTeamNone')}</option>
            {teams.map((team) => (
              <option key={team.id} value={team.id}>{team.name}</option>
            ))}
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
            <button type="button" className="btn-secondary" onClick={handleExport}>
              {t('exportConfiguration')}
            </button>
          </div>
          <span className="defense-system-editor__status" aria-live="polite">
            {isSaved ? t('systemSaved') : isModified ? t('unsavedChanges') : ''}
          </span>
        </div>
      </div>

      <div className="defense-system-editor__playing-system">
        <span className="systems-editor__summary-label">{t('roleOrder')}</span>
        <strong className="systems-editor__summary-value">
          {roleOrder ? `${ROLE_ORDER_LABELS[roleOrder]} · ${roleSequenceLabel}` : roleSequenceLabel}
        </strong>
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

          {selectedPositions.map(renderPositionMarker)}
        </div>
      </div>

    </section>
  );
}
