import { beforeEach, describe, expect, it } from 'vitest';
import {
  addEdge,
  clearUndo,
  derive,
  dropDocs,
  getVault,
  hydrate,
  mergeNodesInVault,
  popUndo,
  pushUndo,
  reindex,
  serialize,
  setVault,
  TEXTS,
} from '../src/core/state.js';
import { buildSampleVault } from '../src/core/sampleVault.js';

describe('state, serialization, and mutations', () => {
  beforeEach(() => {
    TEXTS.clear();
    clearUndo();
    const s = buildSampleVault(TEXTS);
    setVault(s);
    reindex();
    derive();
  });

  it('builds the 6-source sample vault cleanly', () => {
    const S = getVault();
    expect(S.docs.length).toBe(6);
    expect(S.nodes.length).toBe(57);
    expect(S.edges.length).toBeGreaterThan(70);
    expect(TEXTS.get('d1')).toContain('Transformer');
  });

  it('round-trips serialize() -> hydrate()', () => {
    const snap = serialize();
    const restored = hydrate(snap);
    expect(restored.docs.length).toBe(6);
    expect(restored.nodes.length).toBe(57);
    expect(restored.edges.length).toBe(snap.edges.length);
  });

  it('merges two nodes and folds aliases, docs, and deduplicated edges', () => {
    const S = getVault();
    const a = S.nodes.find((n) => n.label === 'Self-Attention');
    const b = S.nodes.find((n) => n.label === 'Transformer');
    const beforeEdges = S.edges.length;

    mergeNodesInVault(a, b);
    reindex();
    derive();

    expect(S.nodes.includes(a)).toBe(false);
    expect(b.aliases).toContain('Self-Attention');
    expect(S.edges.length).toBeLessThan(beforeEdges);
    expect(S.edges.some((e) => e.s === e.t)).toBe(false);
  });

  it('removes single-source nodes on dropDocs while keeping shared nodes', () => {
    const S = getVault();
    const transformer = S.nodes.find((n) => n.label === 'Transformer');
    const vaswani = S.nodes.find((n) => n.label === 'Ashish Vaswani');
    expect(transformer.docs).toContain('d1');
    expect(transformer.docs.length).toBeGreaterThan(1);
    expect(vaswani.docs).toEqual(['d1']);

    dropDocs(new Set(['d1']));
    expect(S.docs.some((d) => d.id === 'd1')).toBe(false);
    expect(S.nodes.some((n) => n.id === transformer.id)).toBe(true);
    expect(S.nodes.some((n) => n.id === vaswani.id)).toBe(false);
  });

  it('pushes and pops undo snapshots including document texts', () => {
    pushUndo('Test snapshot');
    addEdge('s_bleu', 's_bert', 'related to', null, 1, { manual: true });
    const item = popUndo();
    expect(item.label).toBe('Test snapshot');
    expect(item.texts.d1).toContain('Transformer');
  });
});
