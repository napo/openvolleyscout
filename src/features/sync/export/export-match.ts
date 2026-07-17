import type { MatchProject } from '@src/domain/match/types';
import { exportMatchToOvsBundle } from '../ovs-bundle';
import { downloadOvsBundleFile } from './ovs-file-utils';

export function exportMatchAsOvs(project: MatchProject): void {
  const { fileName, bytes } = exportMatchToOvsBundle(project);
  downloadOvsBundleFile(fileName, bytes);
}
