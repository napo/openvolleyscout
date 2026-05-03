import { useEffect, useRef, useState } from 'react';
import type { ChangeEvent, PointerEvent } from 'react';
import {
  getZoneFromCoordinates,
  type DefenseSystem,
  type DefenseSystemPosition,
  type DefenseSystemRole,
} from '@src/domain/systems';
import { useTranslation } from '@src/i18n';

interface DefenseSystemEditorProps {
  systems: DefenseSystem[];
  activeSystem: DefenseSystem;
  teamId?: string;
  onSelectSystem: (systemId: string) => void;
  onSaveSystem: (system: DefenseSystem) => void;
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
  positions: DefenseSystemPosition[],
  role: DefenseSystemRole,
  x: number,
  y: number,
): DefenseSystemPosition[] {
  return positions.map((position) => (
    position.role === role
      ? {
          ...position,
          x,
          y,
          zone: getZoneFromCoordinates(x, y),
        }
      : position
  ));
}

export function DefenseSystemEditor({
  systems,
  activeSystem,
  teamId,
  onSelectSystem,
  onSaveSystem,
}: DefenseSystemEditorProps) {
  const { t } = useTranslation();
  const courtRef = useRef<HTMLDivElement>(null);
  const [draftSystem, setDraftSystem] = useState<DefenseSystem>(() => activeSystem);
  const [draggingRole, setDraggingRole] = useState<DefenseSystemRole | null>(null);
  const [isModified, setIsModified] = useState(false);
  const [isSaved, setIsSaved] = useState(false);

  useEffect(() => {
    setDraftSystem({
      ...activeSystem,
      positions: activeSystem.positions.map((position) => ({ ...position })),
    });
    setDraggingRole(null);
    setIsModified(false);
    setIsSaved(false);
  }, [activeSystem]);

  const updateDraftPosition = (role: DefenseSystemRole, event: PointerEvent) => {
    const coordinates = getPointerCoordinates(event, courtRef.current);
    if (!coordinates) {
      return;
    }

    setDraftSystem((current) => ({
      ...current,
      positions: updatePositionCoordinates(current.positions, role, coordinates.x, coordinates.y),
    }));
    setIsModified(true);
    setIsSaved(false);
  };

  const handlePointerDown = (role: DefenseSystemRole, event: PointerEvent<HTMLButtonElement>) => {
    event.currentTarget.setPointerCapture(event.pointerId);
    setDraggingRole(role);
    updateDraftPosition(role, event);
  };

  const handlePointerMove = (role: DefenseSystemRole, event: PointerEvent<HTMLButtonElement>) => {
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
    setDraftSystem((current) => ({
      ...current,
      name: event.target.value,
    }));
    setIsModified(true);
    setIsSaved(false);
  };

  const handleSave = () => {
    const nextSystem = {
      ...draftSystem,
      name: draftSystem.name.trim() || t('untitledSystem'),
      teamId: draftSystem.teamId ?? teamId,
    };

    onSaveSystem(nextSystem);
    setDraftSystem(nextSystem);
    setIsModified(false);
    setIsSaved(true);
  };

  return (
    <section className="defense-system-editor" aria-labelledby="defense-system-editor-title">
      <div className="defense-system-editor__toolbar">
        <label className="systems-editor__field">
          <span className="systems-editor__label">{t('selectDefenseSystem')}</span>
          <select
            className="systems-editor__input"
            value={activeSystem.id}
            onChange={(event) => onSelectSystem(event.target.value)}
          >
            {systems.map((system) => (
              <option key={system.id} value={system.id}>
                {system.name || t('untitledSystem')}
              </option>
            ))}
          </select>
        </label>

        <label className="systems-editor__field">
          <span className="systems-editor__label">{t('systemName')}</span>
          <input
            className="systems-editor__input"
            value={draftSystem.name}
            onChange={handleNameChange}
            placeholder={t('systemNamePlaceholder')}
          />
        </label>

        <div className="defense-system-editor__save-group">
          <button type="button" className="btn-primary" onClick={handleSave}>
            {t('saveSystem')}
          </button>
          <span className="defense-system-editor__status" aria-live="polite">
            {isSaved ? t('systemSaved') : isModified ? t('unsavedChanges') : ''}
          </span>
        </div>
      </div>

      <div className="defense-system-editor__workspace">
        <div
          ref={courtRef}
          className="defense-system-editor__court"
          aria-label={t('defenseSystemCourt')}
        >
          <div className="defense-system-editor__net" aria-hidden="true" />
          <div className="defense-system-editor__attack-line" aria-hidden="true" />
          <div className="defense-system-editor__center-line" aria-hidden="true" />

          {draftSystem.positions.map((position) => (
            <button
              key={position.role}
              type="button"
              className={`defense-system-editor__marker${draggingRole === position.role ? ' is-dragging' : ''}`}
              style={{
                left: `${position.x}%`,
                top: `${position.y}%`,
              }}
              aria-label={t('defenseMarkerLabel', {
                role: position.role,
                zone: position.zone,
              })}
              onPointerDown={(event) => handlePointerDown(position.role, event)}
              onPointerMove={(event) => handlePointerMove(position.role, event)}
              onPointerUp={handlePointerEnd}
              onPointerCancel={handlePointerEnd}
            >
              <strong>{position.role}</strong>
              <span>{position.zone}</span>
            </button>
          ))}
        </div>

        <div className="defense-system-editor__positions" aria-label={t('defensePositionSummary')}>
          {draftSystem.positions.map((position) => (
            <div key={position.role} className="defense-system-editor__position-card">
              <span className="defense-system-editor__position-role">{position.role}</span>
              <span className="defense-system-editor__position-zone">
                {t('zone')}: {position.zone}
              </span>
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
