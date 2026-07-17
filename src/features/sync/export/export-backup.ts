import { exportBackupToOvsBundle, type BackupSelection } from '../backup-bundle';
import { downloadOvsBundleFile } from './ovs-file-utils';

export async function exportBackupAsOvs(selection: BackupSelection = {}): Promise<void> {
  const { fileName, bytes } = await exportBackupToOvsBundle(selection);
  downloadOvsBundleFile(fileName, bytes);
}
