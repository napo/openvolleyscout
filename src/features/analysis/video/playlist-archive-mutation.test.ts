import { describe, expect, it, vi } from 'vitest';
import { createPlaylistArchiveMutationGuard } from './playlist-archive-mutation';

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => { resolve = done; });
  return { promise, resolve };
}

describe('playlist archive mutations', () => {
  it('blocks a second deletion until the first write finishes, then uses the refreshed archive', async () => {
    const busyChanged = vi.fn();
    const run = createPlaylistArchiveMutationGuard(busyChanged);
    const write = deferred();
    let archive = ['A', 'B', 'C'];
    const remove = (id: string) => {
      const snapshot = archive;
      return () => run(async () => {
        await write.promise;
        archive = snapshot.filter((entry) => entry !== id);
      });
    };
    const deleteA = remove('A');
    const deleteB = remove('B');
    const first = deleteA();
    await deleteB();
    expect(busyChanged.mock.calls).toEqual([[true]]);
    write.resolve();
    await first;
    expect(archive).toEqual(['B', 'C']);

    await remove('B')();
    expect(archive).toEqual(['C']);
    expect(busyChanged.mock.calls).toEqual([[true], [false], [true], [false]]);
  });

  it('prevents a save from overlapping a deletion', async () => {
    const run = createPlaylistArchiveMutationGuard(() => {});
    const write = deferred();
    const deleting = run(() => write.promise);
    const save = vi.fn(async () => {});
    await run(save);
    expect(save).not.toHaveBeenCalled();
    write.resolve();
    await deleting;
    await run(save);
    expect(save).toHaveBeenCalledOnce();
  });

  it('allows retrying after a failed write and clears the busy state', async () => {
    const busyChanged = vi.fn();
    const run = createPlaylistArchiveMutationGuard(busyChanged);
    await expect(run(async () => { throw new Error('storage failure'); })).rejects.toThrow('storage failure');
    const retry = vi.fn(async () => {});
    await run(retry);
    expect(retry).toHaveBeenCalledOnce();
    expect(busyChanged.mock.calls).toEqual([[true], [false], [true], [false]]);
  });
});
