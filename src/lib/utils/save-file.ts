import { isTauri } from '@tauri-apps/api/core';

/**
 * A synthetic `<a download>` click — the only option in a plain browser —
 * silently does nothing in Tauri's desktop webviews (confirmed on
 * WebKitGTK/Linux): no save dialog, no file, no error. Desktop goes through
 * the dialog+fs plugins instead; the anchor trick remains for the web build,
 * where it does work.
 */
export async function saveFile(fileName: string, data: Blob | Uint8Array | string, mimeType?: string): Promise<void> {
  const bytes = await toBytes(data);

  if (isTauri()) {
    const { save } = await import('@tauri-apps/plugin-dialog');
    const { writeFile } = await import('@tauri-apps/plugin-fs');
    const path = await save({ defaultPath: fileName });
    if (!path) return; // user cancelled the dialog
    await writeFile(path, bytes);
    return;
  }

  const blob = new Blob([bytes as BlobPart], mimeType ? { type: mimeType } : undefined);
  const url = window.URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  link.rel = 'noopener';
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => window.URL.revokeObjectURL(url), 60000);
}

async function toBytes(data: Blob | Uint8Array | string): Promise<Uint8Array> {
  if (data instanceof Uint8Array) return data;
  if (typeof data === 'string') return new TextEncoder().encode(data);
  return new Uint8Array(await data.arrayBuffer());
}
