import { describe, expect, it } from 'vitest';
import {
  computeBetweenness,
  louvainCommunities,
  shortestPath,
  suggestTopologyLinks,
} from '../src/core/graphAlgo.js';

function buildGraph(nodeIds, edgePairs) {
  const nodes = nodeIds.map((id) => ({ id, label: id.toUpperCase() }));
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const adj = new Map(nodeIds.map((id) => [id, []]));
  const deg = new Map(nodeIds.map((id) => [id, 0]));
  const pairMap = new Map();
  const pairKey = (a, b) => (a < b ? `${a}|${b}` : `${b}|${a}`);

  const edges = edgePairs.map(([s, t], i) => {
    const e = { id: 'e' + i, s, t, label: 'links', w: 1 };
    adj.get(s).push({ o: t, e, out: true });
    adj.get(t).push({ o: s, e, out: false });
    deg.set(s, deg.get(s) + 1);
    deg.set(t, deg.get(t) + 1);
    pairMap.set(pairKey(s, t), e);
    return e;
  });

  return { nodes, edges, byId, adj, deg, pairMap, pairKey };
}

describe('graphAlgo', () => {
  it('computes shortestPath with BFS', () => {
    const g = buildGraph(['a', 'b', 'c', 'd', 'e'], [
      ['a', 'b'],
      ['b', 'c'],
      ['c', 'd'],
      ['a', 'e'],
      ['e', 'd'],
    ]);
    const path = shortestPath('a', 'd', g.adj);
    expect(path).toEqual(['a', 'e', 'd']);
    expect(shortestPath('a', 'a', g.adj)).toEqual(['a']);

    const isolated = buildGraph(['x', 'y'], []);
    expect(shortestPath('x', 'y', isolated.adj)).toBeNull();
  });

  it('computes Brandes betweenness centrality with bridge node highest', () => {
    // Two triangles connected via a single bridge node 'm'
    const g = buildGraph(['a1', 'a2', 'm', 'b1', 'b2'], [
      ['a1', 'a2'],
      ['a1', 'm'],
      ['a2', 'm'],
      ['m', 'b1'],
      ['m', 'b2'],
      ['b1', 'b2'],
    ]);
    const cb = computeBetweenness(g.nodes, g.adj);
    expect(cb.get('m')).toBeGreaterThan(cb.get('a1'));
    expect(cb.get('m')).toBeGreaterThan(cb.get('b1'));
    expect(cb.get('a1')).toBe(0);
  });

  it('detects two separate communities with Louvain', () => {
    const g = buildGraph(['a1', 'a2', 'a3', 'b1', 'b2', 'b3'], [
      ['a1', 'a2'],
      ['a2', 'a3'],
      ['a1', 'a3'],
      ['b1', 'b2'],
      ['b2', 'b3'],
      ['b1', 'b3'],
    ]);
    const { comm, commList } = louvainCommunities(g.nodes, g.edges, g.deg, g.byId);
    expect(commList.filter((c) => c.big).length).toBe(2);
    expect(comm.get('a1')).toBe(comm.get('a2'));
    expect(comm.get('b1')).toBe(comm.get('b3'));
    expect(comm.get('a1')).not.toBe(comm.get('b1'));
  });

  it('suggests missing links based on shared neighbors', () => {
    const g = buildGraph(['a', 'b', 'c', 'd'], [
      ['a', 'b'],
      ['a', 'c'],
      ['b', 'd'],
      ['c', 'd'],
    ]);
    const { comm } = louvainCommunities(g.nodes, g.edges, g.deg, g.byId);
    const links = suggestTopologyLinks({
      nodes: g.nodes,
      adjMap: g.adj,
      degMap: g.deg,
      commMap: comm,
      pairMap: g.pairMap,
      pairKeyFn: g.pairKey,
    });
    expect(links.length).toBeGreaterThan(0);
    const pairs = links.map((l) => g.pairKey(l.s, l.t));
    expect(pairs).toContain('a|d');
  });
});
