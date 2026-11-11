import { hash } from './utils.js';
import { C, pal } from './constants.js';

/**
 * Louvain community detection on the weighted undirected projection of the graph.
 * @param {Array} nodes
 * @param {Array} edges
 * @param {Map<string, number>} degMap
 * @param {Map<string, any>} byIdMap
 * @returns {{ comm: Map<string, number>, commList: Array }}
 */
export function louvainCommunities(nodes, edges, degMap, byIdMap) {
  const ids = nodes.map((n) => n.id);
  const N = ids.length;
  const ix = new Map(ids.map((id, i) => [id, i]));
  let adj = Array.from({ length: N }, () => new Map());
  let kArr = new Array(N).fill(0);
  let m2 = 0;

  for (const e of edges) {
    const a = ix.get(e.s);
    const b = ix.get(e.t);
    if (a == null || b == null || a === b) continue;
    const w = e.w || 1;
    adj[a].set(b, (adj[a].get(b) || 0) + w);
    adj[b].set(a, (adj[b].get(a) || 0) + w);
    kArr[a] += w;
    kArr[b] += w;
    m2 += 2 * w;
  }

  let member = ids.map((_, i) => i);
  if (m2 > 0) {
    for (let level = 0; level < 8; level++) {
      const n = adj.length;
      const comm = Array.from({ length: n }, (_, i) => i);
      const tot = kArr.slice();
      const order = [...Array(n).keys()].sort((a, b) => hash(a + 'x' + level) - hash(b + 'x' + level));
      let movedAny = false;

      for (let pass = 0; pass < 30; pass++) {
        let moved = 0;
        for (const i of order) {
          const ki = kArr[i];
          if (!ki) continue;
          const ci = comm[i];
          const w = new Map();
          for (const [j, wij] of adj[i]) {
            const c = comm[j];
            w.set(c, (w.get(c) || 0) + wij);
          }
          tot[ci] -= ki;
          let best = ci;
          let bg = (w.get(ci) || 0) - (tot[ci] * ki) / m2;
          for (const [c, wc] of w) {
            const g = wc - (tot[c] * ki) / m2;
            if (g > bg + 1e-12) {
              bg = g;
              best = c;
            }
          }
          tot[best] += ki;
          if (best !== ci) {
            comm[i] = best;
            moved++;
          }
        }
        if (!moved) break;
        movedAny = true;
      }

      if (!movedAny) break;
      const remap = new Map();
      comm.forEach((c) => {
        if (!remap.has(c)) remap.set(c, remap.size);
      });
      const nn = remap.size;
      const nadj = Array.from({ length: nn }, () => new Map());
      const nk = new Array(nn).fill(0);
      for (let i = 0; i < n; i++) {
        const ci = remap.get(comm[i]);
        nk[ci] += kArr[i];
        for (const [j, w] of adj[i]) {
          const cj = remap.get(comm[j]);
          if (ci !== cj) nadj[ci].set(cj, (nadj[ci].get(cj) || 0) + w);
        }
      }
      member = member.map((m) => remap.get(comm[m]));
      adj = nadj;
      kArr = nk;
      if (nn === n) break;
    }
  }

  const groups = new Map();
  ids.forEach((id, i) => {
    const c = member[i];
    if (!groups.has(c)) groups.set(c, []);
    groups.get(c).push(id);
  });

  const list = [...groups.values()]
    .map((m) => m.sort((a, b) => (degMap.get(b) || 0) - (degMap.get(a) || 0)))
    .sort((a, b) => b.length - a.length || (degMap.get(b[0]) || 0) - (degMap.get(a[0]) || 0));

  const commMap = new Map();
  const commList = [];
  let ci = 0;
  list.forEach((members, i) => {
    const big = members.length > 1;
    const c = {
      i,
      members,
      name: byIdMap.get(members[0])?.label || '—',
      color: big ? pal(ci++) : C.mute,
      big,
    };
    commList.push(c);
    for (const id of members) commMap.set(id, i);
  });

  return { comm: commMap, commList };
}

/**
 * Brandes betweenness centrality (sampled when node count > 900).
 */
export function computeBetweenness(nodes, adjMap) {
  const ids = nodes.map((n) => n.id);
  const CB = new Map(ids.map((i) => [i, 0]));
  const sources = ids.length > 900 ? ids.filter((_, i) => i % Math.ceil(ids.length / 400) === 0) : ids;

  for (const s of sources) {
    const stack = [];
    const P = new Map();
    const sigma = new Map();
    const dist = new Map();
    sigma.set(s, 1);
    dist.set(s, 0);
    const Q = [s];
    let qi = 0;

    while (qi < Q.length) {
      const v = Q[qi++];
      stack.push(v);
      for (const a of adjMap.get(v) || []) {
        const w = a.o;
        if (!dist.has(w)) {
          dist.set(w, dist.get(v) + 1);
          Q.push(w);
        }
        if (dist.get(w) === dist.get(v) + 1) {
          sigma.set(w, (sigma.get(w) || 0) + sigma.get(v));
          if (!P.has(w)) P.set(w, []);
          P.get(w).push(v);
        }
      }
    }

    const delta = new Map();
    while (stack.length) {
      const w = stack.pop();
      for (const v of P.get(w) || []) {
        delta.set(v, (delta.get(v) || 0) + (sigma.get(v) / sigma.get(w)) * (1 + (delta.get(w) || 0)));
      }
      if (w !== s) CB.set(w, CB.get(w) + (delta.get(w) || 0));
    }
  }
  return CB;
}

/**
 * Unweighted BFS shortest path between node IDs a and b.
 */
export function shortestPath(a, b, adjMap) {
  if (a === b) return [a];
  const prev = new Map([[a, null]]);
  const Q = [a];
  let qi = 0;
  while (qi < Q.length) {
    const v = Q[qi++];
    for (const x of adjMap.get(v) || []) {
      if (prev.has(x.o)) continue;
      prev.set(x.o, v);
      if (x.o === b) {
        const seq = [b];
        let c = v;
        while (c != null) {
          seq.unshift(c);
          c = prev.get(c);
        }
        return seq;
      }
      Q.push(x.o);
    }
  }
  return null;
}

/**
 * Heuristic cross-cluster / common-neighbor hidden link prediction (Adamic-Adar style)
 * for on-device mode when no LLM is connected.
 */
export function suggestTopologyLinks({ nodes, adjMap, degMap, commMap, pairMap, pairKeyFn, limit = 8 }) {
  const candidates = [];
  const nLen = nodes.length;
  for (let i = 0; i < nLen; i++) {
    const a = nodes[i];
    const adjA = new Set((adjMap.get(a.id) || []).map((x) => x.o));
    if (!adjA.size) continue;
    for (let j = i + 1; j < nLen; j++) {
      const b = nodes[j];
      if (pairMap.has(pairKeyFn(a.id, b.id))) continue;
      const adjB = adjMap.get(b.id) || [];
      if (!adjB.length) continue;

      const shared = [];
      let score = 0;
      for (const x of adjB) {
        if (adjA.has(x.o)) {
          shared.push(x.o);
          const d = Math.max(2, degMap.get(x.o) || 2);
          score += 1 / Math.log(d);
        }
      }
      const sharedDocs = (a.docs || []).filter((d) => (b.docs || []).includes(d));
      if (!shared.length && !sharedDocs.length) continue;

      const crossCluster = commMap.get(a.id) !== commMap.get(b.id);
      const totalScore = score * (crossCluster ? 1.35 : 1) + sharedDocs.length * 0.45;
      candidates.push({
        s: a.id,
        t: b.id,
        shared,
        sharedDocs,
        crossCluster,
        score: totalScore,
      });
    }
  }

  candidates.sort((x, y) => y.score - x.score);
  const maxS = candidates[0]?.score || 1;
  return candidates.slice(0, limit).map((c) => {
    const label = c.shared.length ? 'bridges via shared context' : 'co-cited in source';
    return {
      s: c.s,
      t: c.t,
      label,
      sharedIds: c.shared,
      sharedDocs: c.sharedDocs,
      crossCluster: c.crossCluster,
      conf: Math.min(0.92, Math.max(0.35, c.score / (maxS * 1.1))),
    };
  });
}
