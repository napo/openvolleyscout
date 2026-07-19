import type { MatchProject } from '@src/domain/match/types';
import { exportMatchToOvsBundle } from '../ovs-bundle';
import { downloadOvsBundleFile } from './ovs-file-utils';

export async function exportMatchAsOvs(project: MatchProject): Promise<void> {
  const { fileName, bytes } = exportMatchToOvsBundle(project);
  await downloadOvsBundleFile(fileName, bytes);
}
