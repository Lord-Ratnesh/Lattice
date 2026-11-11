import * as d3 from 'd3';
import { clamp, hash } from '../core/utils.js';
import { C, pal, TYPE_ORDER } from '../core/constants.js';
import { D, degOf, docNode, getVault, IDX } from '../core/state.js';
import { loadPrefs, savePrefs } from '../services/storage.js';

const prefs = loadPrefs();

export const G = {
  w: 1,
  h: 1,
  dpr: 1,
  t: d3.zoomIdentity,
  nodes: [],
  links: [],
  visIds: new Set(),
  lc: new Map(),
  hover: null,
  sel: null,
  path: null,
  focus: null,
  focusHops: 1,
  glow: null,
  qMatch: null,
  fresh: new Map(),
  labels: prefs.labels || 'auto',
  colorBy: prefs.colorBy || 'type',
  layout: prefs.layout || 'force',
  minDeg: 0,
  typeOn: Object.fromEntries(TYPE_ORDER.map((k) => [k, true])),
  timeCut: Infinity,
  frozen: false,
  dirty: true,
  dragging: false,
  dragMoved: false,
  replay: null,
  depth: prefs.depth || 'fast',
  miniMap: null,
  zoom: null,
};

export function persistPrefs() {
  savePrefs({
    depth: G.depth,
    labels: G.labels,
    colorBy: G.colorBy,
    layout: G.layout,
  });
}

export function nodeR(n) {
  if (n.type === 'source') return 10;
  return 4.5 + Math.min(13, Math.sqrt(D.deg.get(n.id) || 0) * 2.5) + (n.type === 'field' ? 2 : 0);
}

export function colorOf(n) {
  if (G.colorBy === 'cluster' && n.type !== 'source') {
    const c = D.commList[D.comm.get(n.id)];
    return c ? c.color : C.mute;
  }
  if (G.colorBy === 'source') {
    if (n.type === 'source') return pal(D.docIndex.get(n.docId) ?? 0);
    const d = n.docs && n.docs[0];
    return d != null && D.docIndex.has(d) ? pal(D.docIndex.get(d)) : C.mute;
  }
  const map = {
    concept: C.ice,
    method: C.amber,
    person: C.rose,
    artifact: C.mint,
    field: C.violet,
    gap: C.steel,
    source: C.paper,
  };
  return map[n.type] || C.ink;
}

export function tlBounds() {
  const S = getVault();
  let min = Infinity;
  let max = -Infinity;
  for (const d of S.docs) {
    if (d.addedAt) {
      min = Math.min(min, d.addedAt);
      max = Math.max(max, d.addedAt);
    }
  }
  for (const n of S.nodes) {
    if (n.t) {
      min = Math.min(min, n.t);
      max = Math.max(max, n.t);
    }
  }
  return isFinite(min) ? { min, max } : null;
}

function timeX(t) {
  const b = tlBounds();
  if (!b || b.max === b.min) return 0;
  return -440 + (880 * ((t || b.min) - b.min)) / (b.max - b.min);
}

const RING = {
  field: 70,
  concept: 180,
  method: 260,
  artifact: 330,
  person: 400,
  gap: 450,
  source: 540,
};

let onSimEnd = null;
let onReadoutUpdate = null;

export function setEngineListeners({ onEnd, onReadout }) {
  onSimEnd = onEnd;
  onReadoutUpdate = onReadout;
}

export const sim = d3
  .forceSimulation()
  .alphaDecay(0.026)
  .velocityDecay(0.4)
  .force('link', d3.forceLink().id((d) => d.id))
  .force('charge', d3.forceManyBody().distanceMax(560).theta(0.85))
  .force('collide', d3.forceCollide())
  .force('x', d3.forceX(0).strength(0.035))
  .force('y', d3.forceY(0).strength(0.035))
  .on('tick', () => {
    G.dirty = true;
  })
  .on('end', () => {
    onSimEnd?.();
  });

export function applyForces() {
  const S = getVault();
  const lc = G.lc;
  sim
    .force('link')
    .links(G.links)
    .distance((l) => (l.mention ? 95 : 36 + 8 * Math.sqrt(Math.min(degOf(l.source), degOf(l.target)))))
    .strength((l) =>
      l.mention ? 0.03 : 0.7 / Math.max(1, Math.min(lc.get(l.source.id) || 1, lc.get(l.target.id) || 1))
    );

  const L = G.layout;
  sim
    .force('charge')
    .strength((n) => (n.type === 'source' ? -300 : -(100 + 28 * Math.sqrt(D.deg.get(n.id) || 0)) * (L === 'radial' ? 0.5 : 1)));
  sim.force('collide').radius((n) => nodeR(n) + 7).strength(0.85);
  sim.force('radial', null);

  if (L === 'clusters') {
    const big = D.commList.filter((c) => c.big);
    const R = 90 + 42 * Math.sqrt(big.length) * Math.sqrt(Math.max(1, S.nodes.length / 40));
    const anchors = new Map();
    big.forEach((c, i) => {
      const a = (i / big.length) * Math.PI * 2 - Math.PI / 2;
      const r = big.length === 1 ? 0 : R * (i % 2 ? 0.78 : 1);
      anchors.set(c.i, { x: Math.cos(a) * r, y: Math.sin(a) * r });
    });
    const outer = R + 180;
    const anchorOf = (n) => {
      if (n.type === 'source') {
        const counts = new Map();
        for (const m of S.nodes) {
          if (m.docs.includes(n.docId)) {
            const c = D.comm.get(m.id);
            counts.set(c, (counts.get(c) || 0) + 1);
          }
        }
        let best = null;
        let bv = -1;
        for (const [c, v] of counts) {
          if (v > bv && anchors.has(c)) {
            bv = v;
            best = c;
          }
        }
        const a = anchors.get(best) || { x: 0, y: 0 };
        const len = Math.hypot(a.x, a.y) || 1;
        return { x: (a.x / len) * (len + 150), y: (a.y / len) * (len + 150) };
      }
      const c = D.comm.get(n.id);
      if (anchors.has(c)) return anchors.get(c);
      const a = ((hash(n.id) % 360) * Math.PI) / 180;
      return { x: Math.cos(a) * outer, y: Math.sin(a) * outer };
    };
    const cache = new Map();
    const get = (n) => {
      let v = cache.get(n.id);
      if (!v) {
        v = anchorOf(n);
        cache.set(n.id, v);
      }
      return v;
    };
    sim.force('x').x((n) => get(n).x).strength(0.16);
    sim.force('y').y((n) => get(n).y).strength(0.16);
  } else if (L === 'radial') {
    sim.force('x').x(0).strength(0.01);
    sim.force('y').y(0).strength(0.01);
    sim.force('radial', d3.forceRadial((n) => RING[n.type] || 300, 0, 0).strength(0.75));
  } else if (L === 'timeline') {
    sim.force('x').x((n) => timeX(n.t)).strength(0.55);
    sim.force('y').y(0).strength(0.04);
  } else {
    sim.force('x').x(0).strength(0.035);
    sim.force('y').y(0).strength(0.035);
  }
}

export function focusSet(n, hops) {
  const S = getVault();
  const set = new Set([n.id]);
  if (n.type === 'source') {
    for (const m of S.nodes) if (m.docs.includes(n.docId)) set.add(m.id);
    return set;
  }
  let frontier = [n.id];
  for (let i = 0; i < hops; i++) {
    const nx = [];
    for (const id of frontier) {
      for (const a of D.adj.get(id) || []) {
        if (!set.has(a.o)) {
          set.add(a.o);
          nx.push(a.o);
        }
      }
    }
    frontier = nx;
  }
  for (const d of n.docs || []) set.add('doc:' + d);
  return set;
}

export function computeVisible() {
  const S = getVault();
  const out = [];
  const cut = G.timeCut;
  const fs = G.focus ? focusSet(G.focus, G.focusHops) : null;
  for (const n of S.nodes) {
    if (!G.typeOn[n.type]) continue;
    if ((D.deg.get(n.id) || 0) < G.minDeg) continue;
    if ((n.t || 0) > cut) continue;
    if (fs && !fs.has(n.id)) continue;
    out.push(n);
  }
  if (G.typeOn.source) {
    for (const d of S.docs) {
      if ((d.addedAt || 0) > cut) continue;
      const dn = docNode(d);
      if (fs && !fs.has(dn.id)) continue;
      out.push(dn);
    }
  }
  return out;
}

export function rebuild(reheat = 0.5) {
  const S = getVault();
  const vis = computeVisible();
  const ids = new Set(vis.map((n) => n.id));
  const links = [];
  const lc = new Map();
  const inc = (id) => lc.set(id, (lc.get(id) || 0) + 1);

  for (const e of S.edges) {
    if (ids.has(e.s) && ids.has(e.t)) {
      links.push({ source: IDX.byId.get(e.s), target: IDX.byId.get(e.t), e });
      inc(e.s);
      inc(e.t);
    }
  }
  if (G.typeOn.source) {
    for (const n of vis) {
      if (n.type === 'source' || !n.docs) continue;
      for (const did of n.docs) {
        const dn = docNode(IDX.doc.get(did));
        if (dn && ids.has(dn.id)) links.push({ source: dn, target: n, e: null, mention: true });
      }
    }
  }

  G.nodes = vis;
  G.links = links;
  G.visIds = ids;
  G.lc = lc;
  sim.force('link').links([]);
  sim.nodes(vis);
  applyForces();
  if (G.frozen) sim.stop();
  else sim.alpha(Math.max(sim.alpha(), reheat)).restart();
  if (G.hover && !ids.has(G.hover.id)) G.hover = null;
  G.dirty = true;
  onReadoutUpdate?.();
}

export function calcFitTransform(nodes = G.nodes, pad = 70) {
  const ns = nodes.filter((n) => isFinite(n.x));
  if (!ns.length) return null;
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  for (const n of ns) {
    x0 = Math.min(x0, n.x);
    y0 = Math.min(y0, n.y);
    x1 = Math.max(x1, n.x);
    y1 = Math.max(y1, n.y);
  }
  const padX = Math.min(pad, G.w / 5);
  const padY = Math.min(pad, G.h / 5);
  const lab = G.w > 520 ? 110 : 40;
  const k = clamp(
    Math.min((G.w - padX * 2 - lab) / Math.max(1, x1 - x0), (G.h - padY * 2) / Math.max(1, y1 - y0)),
    0.08,
    2
  );
  return { x: G.w / 2 - lab / 2 - ((x0 + x1) / 2) * k, y: G.h / 2 - ((y0 + y1) / 2) * k, k };
}
