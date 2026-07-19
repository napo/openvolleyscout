import { saveFile } from '../../../lib/utils/save-file';

export async function downloadOvsBundleFile(fileName: string, bytes: Uint8Array): Promise<void> {
  await saveFile(fileName, bytes, 'application/zip');
}
