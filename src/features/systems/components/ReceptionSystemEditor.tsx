import { useEffect, useRef, useState } from 'react';
import type { ChangeEvent, PointerEvent } from 'react';
import {
  DEFAULT_PLAYING_SYSTEM,
  RECEPTION_ROTATIONS,
} from '@src/config/systems';
import {
  getNearestDataVolleyZone,
  getRoleLabel,
  getSetterRotationLabel,
  type ReceptionPosition,
  type ReceptionRotation,
  type ReceptionSystemBlock,
} from '@src/domain/systems';
import { useTranslation } from '@src/i18n';

interface ReceptionSystemEditorProps {
  blocks: ReceptionSystemBlock[];
  activeBlock: ReceptionSystemBlock;
  teamId?: string;
  onSelectBlock: (blockId: string) => void;
  onSaveBlock: (block: ReceptionSystemBlock) => void;
  onDeleteBlock: (blockId: string) => void;
}

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
  positions: ReceptionPosition[],
  role: ReceptionPosition['role'],
  x: number,
  y: number,
): ReceptionPosition[] {
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
  block: ReceptionSystemBlock,
  rotation: ReceptionRotation,
): ReceptionPosition[] {
  return block.rotations.find((entry) => entry.rotation === rotation)?.positions ?? [];
}

function cloneReceptionSystemBlock(block: ReceptionSystemBlock): ReceptionSystemBlock {
  return {
    ...block,
    roleSequence: [...block.roleSequence],
    rotations: block.rotations.map((rotation) => ({
      ...rotation,
      positions: rotation.positions.map((position) => ({ ...position })),
    })),
  };
}

export function ReceptionSystemEditor({
  blocks,
  activeBlock,
  teamId,
  onSelectBlock,
  onSaveBlock,
  onDeleteBlock,
}: ReceptionSystemEditorProps) {
  const { t, locale } = useTranslation();
  const courtRef = useRef<HTMLDivElement>(null);
  const [draftBlock, setDraftBlock] = useState<ReceptionSystemBlock>(() => cloneReceptionSystemBlock(activeBlock));
  const [selectedRotation, setSelectedRotation] = useState<ReceptionRotation>(1);
  const [draggingRole, setDraggingRole] = useState<ReceptionPosition['role'] | null>(null);
  const [isModified, setIsModified] = useState(false);
  const [isSaved, setIsSaved] = useState(false);

  useEffect(() => {
    setDraftBlock(cloneReceptionSystemBlock(activeBlock));
    setSelectedRotation(1);
    setDraggingRole(null);
    setIsModified(false);
    setIsSaved(false);
  }, [activeBlock]);

  const selectedPositions = getRotationPositions(draftBlock, selectedRotation);
  const selectedRotationLabel = getSetterRotationLabel(selectedRotation, locale);

  const updateDraftPosition = (role: ReceptionPosition['role'], event: PointerEvent) => {
    const coordinates = getPointerCoordinates(event, courtRef.current);
    if (!coordinates) {
      return;
    }

    setDraftBlock((current) => ({
      ...current,
      rotations: current.rotations.map((rotation) => (
        rotation.rotation === selectedRotation
          ? {
              ...rotation,
              positions: updatePositionCoordinates(rotation.positions, role, coordinates.x, coordinates.y),
            }
          : rotation
      )),
    }));
    setIsModified(true);
    setIsSaved(false);
  };

  const handlePointerDown = (role: ReceptionPosition['role'], event: PointerEvent<HTMLButtonElement>) => {
    event.currentTarget.setPointerCapture(event.pointerId);
    setDraggingRole(role);
    updateDraftPosition(role, event);
  };

  const handlePointerMove = (role: ReceptionPosition['role'], event: PointerEvent<HTMLButtonElement>) => {
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

  const renderPositionMarker = (position: ReceptionPosition) => {
    const roleLabel = getRoleLabel(position.role, locale);

    return (
      <button
        key={position.role}
        type="button"
        className={`reception-system-editor__marker${draggingRole === position.role ? ' is-dragging' : ''}`}
        style={{
          left: `${position.x}%`,
          top: `${position.y}%`,
        }}
        aria-label={t('receptionMarkerLabel', {
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

  const roleSequenceLabel = draftBlock.roleSequence
    .map((role) => getRoleLabel(role, locale))
    .join(', ');

  return (
    <section className="reception-system-editor" aria-label={t('receptionSystem')}>
      <div className="reception-system-editor__toolbar">
        <label className="systems-editor__field">
          <span className="systems-editor__label">{t('selectReceptionSystem')}</span>
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

        <div className="reception-system-editor__save-group">
          <div className="reception-system-editor__actions">
            <button type="button" className="btn-primary" onClick={handleSave}>
              {t('saveSystem')}
            </button>
            <button type="button" className="btn-secondary" onClick={handleDelete}>
              {t('deleteSystem')}
            </button>
          </div>
          <span className="reception-system-editor__status" aria-live="polite">
            {isSaved ? t('systemSaved') : isModified ? t('unsavedChanges') : ''}
          </span>
        </div>
      </div>

      <div className="reception-system-editor__playing-system">
        <span className="systems-editor__summary-label">{t('defaultPlayingSystem')}</span>
        <strong className="systems-editor__summary-value">{roleSequenceLabel}</strong>
      </div>

      <div className="reception-system-editor__selectors">
        <div className="reception-system-editor__rotation-tabs" aria-label={t('setterRotation')}>
          {RECEPTION_ROTATIONS.map((rotation) => (
            <button
              key={rotation}
              type="button"
              className={`reception-system-editor__rotation-tab${selectedRotation === rotation ? ' is-active' : ''}`}
              onClick={() => setSelectedRotation(rotation)}
            >
              {getSetterRotationLabel(rotation, locale)}
            </button>
          ))}
        </div>
      </div>

      <div className="reception-system-editor__workspace">
        <div
          ref={courtRef}
          className="reception-system-editor__court"
          aria-label={`${t('receptionSystemCourt')} ${selectedRotationLabel}`}
        >
          <div className="reception-system-editor__net" aria-hidden="true" />
          <div className="reception-system-editor__attack-line" aria-hidden="true" />
          <div className="reception-system-editor__center-line" aria-hidden="true" />

          {selectedPositions.map(renderPositionMarker)}
        </div>

        <div className="reception-system-editor__positions" aria-label={t('receptionPositionSummary')}>
          {selectedPositions.map((position) => (
            <div key={position.role} className="reception-system-editor__position-card">
              <span className="reception-system-editor__position-role">{getRoleLabel(position.role, locale)}</span>
              <span className="reception-system-editor__position-coordinates">
                {Math.round(position.x)}, {Math.round(position.y)}
              </span>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
