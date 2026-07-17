import assert from 'node:assert';
import { test } from 'vitest';
import { mergeIdKeyedArray } from './id-keyed-array-merge';

interface Item {
  id: string;
  value: string;
}

const getId = (item: Item) => item.id;

test('no changes on either side leaves the array unchanged', () => {
  const base: Item[] = [{ id: 'a', value: '1' }];
  const result = mergeIdKeyedArray(base, base, base, getId);
  assert.deepStrictEqual(result.merged, base);
  assert.deepStrictEqual(result.conflicts, []);
});

test('local-only addition is kept', () => {
  const base: Item[] = [];
  const local: Item[] = [{ id: 'a', value: '1' }];
  const result = mergeIdKeyedArray(base, local, [], getId);
  assert.deepStrictEqual(result.merged, local);
  assert.deepStrictEqual(result.conflicts, []);
});

test('remote-only addition is kept', () => {
  const base: Item[] = [];
  const remote: Item[] = [{ id: 'a', value: '1' }];
  const result = mergeIdKeyedArray(base, [], remote, getId);
  assert.deepStrictEqual(result.merged, remote);
  assert.deepStrictEqual(result.conflicts, []);
});

test('identical change on both sides is not a conflict', () => {
  const base: Item[] = [{ id: 'a', value: '1' }];
  const changed: Item[] = [{ id: 'a', value: '2' }];
  const result = mergeIdKeyedArray(base, changed, changed, getId);
  assert.deepStrictEqual(result.merged, changed);
  assert.deepStrictEqual(result.conflicts, []);
});

test('deletion on one side, unchanged on the other, is honored (item dropped)', () => {
  const base: Item[] = [{ id: 'a', value: '1' }];
  const result = mergeIdKeyedArray(base, [], base, getId);
  assert.deepStrictEqual(result.merged, []);
  assert.deepStrictEqual(result.conflicts, []);
});

test('deleted on one side but changed on the other is an edited_vs_deleted conflict, default keeps the edit', () => {
  const base: Item[] = [{ id: 'a', value: '1' }];
  const remoteChanged: Item[] = [{ id: 'a', value: '2' }];
  const result = mergeIdKeyedArray(base, [], remoteChanged, getId);
  assert.deepStrictEqual(result.merged, remoteChanged);
  assert.strictEqual(result.conflicts.length, 1);
  assert.strictEqual(result.conflicts[0].kind, 'edited_vs_deleted');
});

test('changed differently on both sides is a changed_differently conflict, default keeps local', () => {
  const base: Item[] = [{ id: 'a', value: '1' }];
  const local: Item[] = [{ id: 'a', value: 'local-2' }];
  const remote: Item[] = [{ id: 'a', value: 'remote-2' }];
  const result = mergeIdKeyedArray(base, local, remote, getId);
  assert.deepStrictEqual(result.merged, local);
  assert.strictEqual(result.conflicts.length, 1);
  assert.strictEqual(result.conflicts[0].kind, 'changed_differently');
});

test('deleted independently on both sides is dropped with no conflict', () => {
  const base: Item[] = [{ id: 'a', value: '1' }];
  const result = mergeIdKeyedArray(base, [], [], getId);
  assert.deepStrictEqual(result.merged, []);
  assert.deepStrictEqual(result.conflicts, []);
});
