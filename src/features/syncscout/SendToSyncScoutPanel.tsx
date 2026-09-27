import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from '@src/i18n';
import { matchRepository } from '@src/infrastructure/repositories';
import { exportMatchToDataVolley } from '@src/features/export/datavolley';
import {
  isSyncScoutConfigured,
  loadLastSyncScoutCategory,
  loadSyncScoutSettings,
  saveLastSyncScoutCategory,
} from './syncscout-settings';
import { uploadMatchToSyncScout, type SyncScoutUploadResult } from './syncscout-client';
import { extractYouTubeId, extractYouTubeStartSeconds, formatVideoPosition, parseVideoPosition } from './youtube';
import './send-to-syncscout.css';

interface SendToSyncScoutPanelProps {
  projectId: string;
}

async function fetchKnownCategories(supabaseUrl: string, anonKey: string): Promise<string[]> {
  try {
    const response = await fetch(`${supabaseUrl}/rest/v1/matches?select=category`, {
      headers: { apikey: anonKey, Authorization: `Bearer ${anonKey}` },
    });
    if (!response.ok) return [];
    const rows = (await response.json()) as Array<{ category?: string }>;
    return [...new Set(rows.map((row) => row.category?.trim()).filter((c): c is string => Boolean(c)))].sort();
  } catch {
    return [];
  }
}

/**
 * Sends the match to SyncScout: exports the .dvw with video times aligned to
 * the YouTube recording, uploads it and registers it with the video.
 */
export function SendToSyncScoutPanel({ projectId }: SendToSyncScoutPanelProps) {
  const { t } = useTranslation();
  const settings = useMemo(() => loadSyncScoutSettings(), []);
  const configured = isSyncScoutConfigured(settings);
  const [category, setCategory] = useState(loadLastSyncScoutCategory);
  const [knownCategories, setKnownCategories] = useState<string[]>([]);
  const [youtubeUrl, setYoutubeUrl] = useState('');
  const [firstServe, setFirstServe] = useState('');
  const [status, setStatus] = useState<'idle' | 'sending' | 'done' | 'error'>('idle');
  const [errorMessage, setErrorMessage] = useState('');
  const [result, setResult] = useState<SyncScoutUploadResult | null>(null);

  useEffect(() => {
    if (configured) {
      void fetchKnownCategories(settings.supabaseUrl, settings.anonKey).then(setKnownCategories);
    }
  }, [configured, settings]);

  const youtubeId = extractYouTubeId(youtubeUrl);
  const firstServeSeconds = parseVideoPosition(firstServe);
  const canSend = configured && category.trim() !== '' && youtubeId !== null && firstServeSeconds !== null && status !== 'sending';

  const handleYoutubeUrlChange = (value: string) => {
    setYoutubeUrl(value);
    // A link copied at the first serve ("share at current time") carries the position.
    const start = extractYouTubeStartSeconds(value);
    if (start !== null && !firstServe) {
      setFirstServe(formatVideoPosition(start));
    }
  };

  const handleSend = async () => {
    if (!canSend || youtubeId === null || firstServeSeconds === null) return;
    setStatus('sending');
    setErrorMessage('');
    try {
      const project = await matchRepository.getById(projectId);
      if (!project) throw new Error(t('syncScoutMatchNotFound'));
      const exported = exportMatchToDataVolley(project, { firstServeVideoSeconds: firstServeSeconds });
      const uploaded = await uploadMatchToSyncScout(settings, {
        dvwText: exported.text,
        fileName: exported.fileName,
        category: category.trim(),
        youtubeId,
      });
      saveLastSyncScoutCategory(category.trim());
      setResult(uploaded);
      setStatus('done');
    } catch (error) {
      console.error('Sending to SyncScout failed:', error);
      // fetch() rejects with a TypeError when the network or the address is unreachable.
      setErrorMessage(error instanceof TypeError ? t('syncScoutNetworkError') : error instanceof Error ? error.message : String(error));
      setStatus('error');
    }
  };

  if (!configured) {
    return (
      <section className="send-syncscout">
        <h3 className="send-syncscout__title">{t('syncScoutSendTitle')}</h3>
        <p className="send-syncscout__hint">
          {t('syncScoutNotConfigured')} <Link to="/settings">{t('settings')}</Link>
        </p>
      </section>
    );
  }

  return (
    <section className="send-syncscout">
      <h3 className="send-syncscout__title">{t('syncScoutSendTitle')}</h3>
      <p className="send-syncscout__hint">{t('syncScoutSendDescription')}</p>

      <label className="send-syncscout__field">
        <span>{t('syncScoutCategory')}</span>
        <input
          className="form-input"
          list="syncscout-categories"
          value={category}
          placeholder={t('syncScoutCategoryPlaceholder')}
          onChange={(event) => setCategory(event.target.value)}
        />
        <datalist id="syncscout-categories">
          {knownCategories.map((known) => <option key={known} value={known} />)}
        </datalist>
      </label>

      <label className="send-syncscout__field">
        <span>{t('syncScoutYoutubeUrl')}</span>
        <input
          className="form-input"
          inputMode="url"
          value={youtubeUrl}
          placeholder="https://youtu.be/…"
          onChange={(event) => handleYoutubeUrlChange(event.target.value)}
        />
        {youtubeUrl && !youtubeId && <small className="send-syncscout__error">{t('videoInvalidYoutubeUrl')}</small>}
      </label>

      <label className="send-syncscout__field">
        <span>{t('syncScoutFirstServe')}</span>
        <input
          className="form-input send-syncscout__time"
          inputMode="numeric"
          value={firstServe}
          placeholder="12:34"
          onChange={(event) => setFirstServe(event.target.value)}
        />
        <small className="send-syncscout__hint">{t('syncScoutFirstServeHint')}</small>
        {firstServe && firstServeSeconds === null && <small className="send-syncscout__error">{t('syncScoutFirstServeInvalid')}</small>}
      </label>

      <div className="send-syncscout__actions">
        <button type="button" className="btn-primary" disabled={!canSend} onClick={() => void handleSend()}>
          {status === 'sending' ? t('syncScoutSending') : t('syncScoutSend')}
        </button>
      </div>

      {status === 'done' && result && (
        <p className="send-syncscout__success" role="status">
          {t('syncScoutSent')}{' '}
          {result.viewerLink && (
            <a href={result.viewerLink} target="_blank" rel="noopener noreferrer">{t('syncScoutOpen')}</a>
          )}
        </p>
      )}
      {status === 'error' && (
        <p className="send-syncscout__error" role="alert">{t('syncScoutSendFailed')} {errorMessage}</p>
      )}
    </section>
  );
}
