// SPDX-License-Identifier: AGPL-3.0-or-later
import { useState } from 'react';
import { useTranslation } from '@src/i18n';
import type { VideoEventFilters } from './video-filters';
import {
  applyVideoFilterPreset,
  loadVideoFilterPresets,
  storeVideoFilterPresets,
  upsertVideoFilterPreset,
  type VideoFilterPreset,
} from './video-filter-presets';

interface VideoFilterPresetsProps {
  filters: VideoEventFilters;
  defaults: VideoEventFilters;
  knownPlayerIds: ReadonlySet<string>;
  onApply: (filters: VideoEventFilters) => void;
}

/** Save the current filters under a name and bring them back with one choice. */
export function VideoFilterPresets({ filters, defaults, knownPlayerIds, onApply }: VideoFilterPresetsProps) {
  const { t } = useTranslation();
  const [presets, setPresets] = useState<VideoFilterPreset[]>(loadVideoFilterPresets);
  const [selectedId, setSelectedId] = useState('');
  const [name, setName] = useState('');
  const update = (next: VideoFilterPreset[]) => {
    setPresets(next);
    storeVideoFilterPresets(next);
  };
  const selected = presets.find((preset) => preset.id === selectedId);

  return (
    <div className="video-analysis__presets">
      <label>
        <span>{t('videoFilterPresets')}</span>
        <select
          className="form-select"
          value={selectedId}
          onChange={(event) => {
            setSelectedId(event.target.value);
            const preset = presets.find((item) => item.id === event.target.value);
            if (preset) {
              onApply(applyVideoFilterPreset(preset, defaults, knownPlayerIds));
              setName(preset.name);
            }
          }}
        >
          <option value="">{presets.length ? t('videoFilterPresetChoose') : t('videoFilterPresetNone')}</option>
          {presets.map((preset) => <option key={preset.id} value={preset.id}>{preset.name}</option>)}
        </select>
      </label>
      <input
        type="text"
        className="form-input"
        value={name}
        placeholder={t('videoFilterPresetName')}
        aria-label={t('videoFilterPresetName')}
        onChange={(event) => setName(event.target.value)}
        maxLength={60}
      />
      <button
        type="button"
        className="btn-secondary btn-small"
        disabled={!name.trim()}
        onClick={() => {
          const next = upsertVideoFilterPreset(presets, name, filters);
          update(next);
          setSelectedId(next.find((preset) => preset.name.toLowerCase() === name.trim().toLowerCase())?.id ?? '');
        }}
      >
        {t('videoFilterPresetSave')}
      </button>
      {selected ? (
        <button
          type="button"
          className="btn-secondary btn-small"
          onClick={() => {
            update(presets.filter((preset) => preset.id !== selected.id));
            setSelectedId('');
            setName('');
          }}
        >
          {t('videoFilterPresetDelete')}
        </button>
      ) : null}
    </div>
  );
}
