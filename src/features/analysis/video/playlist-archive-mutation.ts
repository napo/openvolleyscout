/** Ignore overlapping archive writes, including clicks before React rerenders. */
export function createPlaylistArchiveMutationGuard(onBusyChange: (busy: boolean) => void) {
  let busy = false;
  return async (mutate: () => Promise<void>): Promise<void> => {
    if (busy) return;
    busy = true;
    onBusyChange(true);
    try {
      await mutate();
    } finally {
      busy = false;
      onBusyChange(false);
    }
  };
}
