import type { SyncScoutSettings } from './syncscout-settings';

export interface SyncScoutUpload {
  dvwText: string;
  /** Original .dvw file name, shown in the SyncScout match list. */
  fileName: string;
  category: string;
  youtubeId: string;
}

export interface SyncScoutUploadResult {
  dvwUrl: string;
  /** Link that opens the match in the SyncScout viewer, when its URL is configured. */
  viewerLink?: string;
}

async function describeFailure(step: string, response: Response): Promise<Error> {
  let detail = '';
  try {
    detail = (await response.text()).slice(0, 300);
  } catch {
    // ignore unreadable bodies
  }
  return new Error(`${step} (${response.status}) ${detail}`.trim());
}

/**
 * Uploads a match the same way the SyncScout viewer's "add match" form does:
 * the .dvw goes to the public `dvw_files` storage bucket and a row is added
 * to the `matches` table.
 */
export async function uploadMatchToSyncScout(
  settings: SyncScoutSettings,
  upload: SyncScoutUpload,
): Promise<SyncScoutUploadResult> {
  const base = settings.supabaseUrl.replace(/\/+$/, '');
  const headers = {
    apikey: settings.anonKey,
    Authorization: `Bearer ${settings.anonKey}`,
  };

  // Storage keys must be plain ASCII; the readable name goes into the table.
  const storageName = `${Date.now()}_${upload.fileName.replace(/[^\w.-]+/g, '_')}`;
  const storageResponse = await fetch(`${base}/storage/v1/object/dvw_files/${encodeURIComponent(storageName)}`, {
    method: 'POST',
    headers: { ...headers, 'Content-Type': 'text/plain; charset=utf-8' },
    body: upload.dvwText,
  });
  if (!storageResponse.ok) {
    throw await describeFailure('Storage upload failed', storageResponse);
  }

  const dvwUrl = `${base}/storage/v1/object/public/dvw_files/${encodeURIComponent(storageName)}`;
  const insertResponse = await fetch(`${base}/rest/v1/matches`, {
    method: 'POST',
    headers: { ...headers, 'Content-Type': 'application/json', Prefer: 'return=minimal' },
    body: JSON.stringify([{
      category: upload.category,
      dvw_filename: upload.fileName,
      dvw_url: dvwUrl,
      youtube_id: upload.youtubeId,
    }]),
  });
  if (!insertResponse.ok) {
    throw await describeFailure('Match registration failed', insertResponse);
  }

  const viewer = settings.viewerUrl.trim();
  return {
    dvwUrl,
    viewerLink: viewer ? `${viewer}${viewer.includes('?') ? '&' : '?'}match=${encodeURIComponent(dvwUrl)}` : undefined,
  };
}
