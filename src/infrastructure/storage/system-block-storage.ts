// SPDX-License-Identifier: AGPL-3.0-or-later

/**
 * Reception and defense systems in the database, where cloud sync reads and
 * writes them together with the rest of the archive. The system stores keep a
 * copy in localStorage only to start synchronously.
 */

import { matchProjectDb, type SystemBlockRecord } from '../db/match-project-db';
import { forgetDeletion, rememberDeletion, syncKey } from './sync-deletions';

export type SystemKind = SystemBlockRecord['kind'];
type Block = SystemBlockRecord['block'];

/**
 * Saves the full list of systems of one kind: systems missing from `blocks`
 * are deleted and leave a deletion for cloud sync.
 */
export async function persistSystemBlocks(kind: SystemKind, blocks: readonly Block[]): Promise<void> {
  await matchProjectDb.transaction('rw', matchProjectDb.systemBlocks, matchProjectDb.syncDeletions, async () => {
    const existing = await matchProjectDb.systemBlocks.where('kind').equals(kind).toArray();
    const keep = new Set(blocks.map((block) => block.id));
    for (const row of existing) {
      if (!keep.has(row.block.id)) {
        await matchProjectDb.systemBlocks.delete(row.key);
        await rememberDeletion(kind, row.block.id);
      }
    }
    const byKey = new Map(existing.map((row) => [row.key, JSON.stringify(row.block)]));
    for (const block of blocks) {
      const key = syncKey(kind, block.id);
      const plain = JSON.parse(JSON.stringify(block)) as Block;
      if (byKey.get(key) === JSON.stringify(plain)) continue;
      await matchProjectDb.systemBlocks.put({ key, kind, block: plain });
      await forgetDeletion(kind, block.id);
    }
  });
}

export async function loadSystemBlocks(kind: SystemKind): Promise<Block[] | null> {
  const rows = await matchProjectDb.systemBlocks.where('kind').equals(kind).toArray();
  return rows.length > 0 ? rows.map((row) => row.block) : null;
}
