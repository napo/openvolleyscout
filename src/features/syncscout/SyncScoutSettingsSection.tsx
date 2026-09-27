import { useState } from 'react';
import { useTranslation } from '@src/i18n';
import { isSyncScoutConfigured, loadSyncScoutSettings, saveSyncScoutSettings, type SyncScoutSettings } from './syncscout-settings';
import './send-to-syncscout.css';

/** Settings page block where a team enters its own SyncScout destination once. */
export function SyncScoutSettingsSection() {
  const { t } = useTranslation();
  const [settings, setSettings] = useState<SyncScoutSettings>(loadSyncScoutSettings);
  const [saved, setSaved] = useState(false);

  const update = (field: keyof SyncScoutSettings, value: string) => {
    setSaved(false);
    setSettings((current) => ({ ...current, [field]: value }));
  };

  const handleSave = () => {
    saveSyncScoutSettings(settings);
    setSettings(loadSyncScoutSettings());
    setSaved(true);
  };

  return (
    <div className="send-syncscout">
      <h3 className="send-syncscout__title">{t('syncScoutSettingsTitle')}</h3>
      <p className="send-syncscout__hint">{t('syncScoutSettingsDescription')}</p>
      <label className="send-syncscout__field">
        <span>{t('syncScoutSupabaseUrl')}</span>
        <input className="form-input" inputMode="url" autoComplete="off" value={settings.supabaseUrl}
          placeholder="https://xxxxxxxx.supabase.co" onChange={(event) => update('supabaseUrl', event.target.value)} />
      </label>
      <label className="send-syncscout__field">
        <span>{t('syncScoutAnonKey')}</span>
        <input className="form-input" autoComplete="off" value={settings.anonKey}
          placeholder="eyJhbGciOi…" onChange={(event) => update('anonKey', event.target.value)} />
      </label>
      <label className="send-syncscout__field">
        <span>{t('syncScoutViewerUrl')}</span>
        <input className="form-input" inputMode="url" autoComplete="off" value={settings.viewerUrl}
          placeholder="https://…/" onChange={(event) => update('viewerUrl', event.target.value)} />
      </label>
      <div className="send-syncscout__actions">
        <button type="button" className="btn-primary" onClick={handleSave}>{t('syncScoutSettingsSave')}</button>
      </div>
      {saved && (
        <p className={isSyncScoutConfigured(settings) ? 'send-syncscout__success' : 'send-syncscout__error'} role="status">
          {isSyncScoutConfigured(settings) ? t('syncScoutSettingsSaved') : t('syncScoutSettingsIncomplete')}
        </p>
      )}
    </div>
  );
}
