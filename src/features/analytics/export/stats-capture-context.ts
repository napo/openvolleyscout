// SPDX-License-Identifier: AGPL-3.0-or-later
import { createContext, useContext } from 'react';

/** Capture the final chart geometry while an analysis tab is being exported. */
export const StatsCaptureContext = createContext(false);

export function useStatsChartAnimation(): boolean {
  return !useContext(StatsCaptureContext);
}
