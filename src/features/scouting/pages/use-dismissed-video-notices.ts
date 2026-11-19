// SPDX-License-Identifier: AGPL-3.0-or-later
import { useState } from 'react';
import { readDismissedVideoNotices, writeDismissedVideoNotices, type VideoHiddenReason } from './scouting-page-model';

/** Which "video hidden" notices the scout already dismissed; remembered across sessions. */
export function useDismissedVideoNotices() {
  const [dismissed, setDismissed] = useState<VideoHiddenReason[]>(readDismissedVideoNotices);
  return {
    isDismissed: (reason: VideoHiddenReason) => dismissed.includes(reason),
    dismiss: (reason: VideoHiddenReason) => {
      const next = [...dismissed, reason];
      setDismissed(next);
      writeDismissedVideoNotices(next);
    },
  };
}
