import { clamp, normKey, num, rid, uniq } from './utils.js';
import { TYPES } from './constants.js';
import { computeBetweenness, louvainCommunities } from './graphAlgo.js';

export const TEXTS = new Map();
export const PASS = new Map();
export const DOCN = new Map();

export const IDX = {
  byId: new Map(),
  byKey: new Map(),
  pair: new Map(),
  doc: new Map(),
};

export const D = {
  deg: new Map(),
  adj: new Map(),
  comm: new Map(),
  commList: [],
  docDeg: new Map(),
  docIndex: new Map(),
  ver: 0,
  btw: null,
  btwVer: -1,
  labelDeg: 0,
  maxDeg: 1,
};

let S = { v: 1, sample: false, pristine: true, origin: 'mine', updatedAt: 0, docs: [], nodes: [], edges: [] };

export const getVault = () => S;
export const setVault = (vault) => {
  S = vault;
  return S;
};

export const pairKey = (a, b) => (a < b ? a + '|' + b : b + '|' + a);
export const lbl = (id) => IDX.byId.get(id)?.label || '?';
export const docTitle = (id) => IDX.doc.get(id)?.title || 'source';

export function docNode(d) {
  let n = DOCN.get(d.id);
  if (!n) {
    n = {
      id: 'doc:' + d.id,
      docId: d.id,
      type: 'source',
      x: num(d.x) ?? (Math.random() - 0.5) * 300,
      y: num(d.y) ?? (Math.random() - 0.5) * 300,
    };
    DOCN.set(d.id, n);
  }
  n.label = d.title;
  n.t = d.addedAt;
  return n;
}

export function nodeById(id) {
  if (!id) return null;
  if (id.startsWith('doc:')) {
    const d = IDX.doc.get(id.slice(4));
    return d ? docNode(d) : null;
  }
  return IDX.byId.get(id) || null;
}

export const degOf = (n) => (n.type === 'source' ? D.docDeg.get(n.id) || 0 : D.deg.get(n.id) || 0);

export function indexNode(n) {
  IDX.byId.set(n.id, n);
  const k = normKey(n.label);
  if (k && !IDX.byKey.has(k)) IDX.byKey.set(k, n.id);
  for (const a of n.aliases || []) {
    const ak = normKey(a);
    if (ak && !IDX.byKey.has(ak)) IDX.byKey.set(ak, n.id);
  }
}

export function reindex() {
  IDX.byId.clear();
  IDX.byKey.clear();
  IDX.pair.clear();
  IDX.doc.clear();
  for (const d of S.docs) IDX.doc.set(d.id, d);
  for (const n of S.nodes) indexNode(n);
  S.edges = S.edges.filter((e) => IDX.byId.has(e.s) && IDX.byId.has(e.t) && e.s !== e.t);
  for (const e of S.edges) IDX.pair.set(pairKey(e.s, e.t), e);
}

export function derive() {
  D.ver++;
  D.deg.clear();
  D.adj.clear();
  D.docDeg.clear();
  D.docIndex.clear();
  S.docs.forEach((d, i) => {
    D.docIndex.set(d.id, i);
    D.docDeg.set('doc:' + d.id, 0);
  });
  for (const n of S.nodes) {
    D.deg.set(n.id, 0);
    D.adj.set(n.id, []);
    for (const did of n.docs || []) {
      const k = 'doc:' + did;
      if (D.docDeg.has(k)) D.docDeg.set(k, D.docDeg.get(k) + 1);
    }
  }
  for (const e of S.edges) {
    D.adj.get(e.s).push({ o: e.t, e, out: true });
    D.adj.get(e.t).push({ o: e.s, e, out: false });
    D.deg.set(e.s, D.deg.get(e.s) + 1);
    D.deg.set(e.t, D.deg.get(e.t) + 1);
  }
  const ds = [...D.deg.values()].sort((a, b) => b - a);
  D.maxDeg = Math.max(1, ds[0] || 1);
  D.labelDeg = Math.max(2, ds[Math.floor(ds.length * 0.28)] ?? 0);

  const { comm, commList } = louvainCommunities(S.nodes, S.edges, D.deg, IDX.byId);
  D.comm = comm;
  D.commList = commList;
}

export function betweenness() {
  if (D.btwVer === D.ver && D.btw) return D.btw;
  D.btw = computeBetweenness(S.nodes, D.adj);
  D.btwVer = D.ver;
  return D.btw;
}

export function addEdge(s, t, label, docId, w = 1, extra = {}) {
  if (!s || !t || s === t) return null;
  const k = pairKey(s, t);
  let e = IDX.pair.get(k);
  if (e) {
    e.w = Math.min(6, (e.w || 1) + (docId && !e.docs.includes(docId) ? 1 : 0));
    if (docId && !e.docs.includes(docId)) e.docs.push(docId);
    if (e.inferred && docId) e.inferred = false;
    if (e.label === 'co-occurs with' && label && label !== 'co-occurs with') e.label = label;
    return e;
  }
  e = {
    id: rid('e'),
    s,
    t,
    label: label || 'related to',
    docs: docId ? [docId] : [],
    w: clamp(Math.round(w) || 1, 1, 3),
    ...extra,
  };
  S.edges.push(e);
  IDX.pair.set(k, e);
  return e;
}

export function mergeNodesInVault(a, b) {
  b.aliases = uniq([...(b.aliases || []), a.label, ...(a.aliases || [])]).filter(
    (x) => normKey(x) !== normKey(b.label)
  );
  b.docs = uniq([...(b.docs || []), ...(a.docs || [])]);
  b.mentions = (b.mentions || 1) + (a.mentions || 1);
  if (!b.summary) b.summary = a.summary;
  if (a.note) b.note = [b.note, a.note].filter(Boolean).join('\n\n');
  b.t = Math.min(b.t || Infinity, a.t || Infinity);

  const keep = new Map();
  for (const e of S.edges) {
    if (e.s === a.id) e.s = b.id;
    if (e.t === a.id) e.t = b.id;
    if (e.s === e.t) continue;
    const k = pairKey(e.s, e.t);
    const ex = keep.get(k);
    if (ex) {
      ex.w = Math.min(6, ex.w + e.w);
      ex.docs = uniq([...ex.docs, ...e.docs]);
      if (!e.inferred) ex.inferred = false;
    } else {
      keep.set(k, e);
    }
  }
  S.edges = [...keep.values()];
  S.nodes = S.nodes.filter((x) => x !== a);
}

export function dropDocs(ids) {
  S.docs = S.docs.filter((x) => !ids.has(x.id));
  S.nodes = S.nodes.filter((n) => {
    const had = n.docs.some((x) => ids.has(x));
    n.docs = n.docs.filter((x) => !ids.has(x));
    return !(had && n.docs.length === 0 && !n.manual);
  });
  S.edges = S.edges.filter((e) => {
    const had = e.docs.some((x) => ids.has(x));
    e.docs = e.docs.filter((x) => !ids.has(x));
    return !(had && e.docs.length === 0 && !e.manual && !e.inferred);
  });
  for (const id of ids) {
    DOCN.delete(id);
    PASS.delete(id);
    TEXTS.delete(id);
  }
}

export function serialize() {
  return {
    v: 1,
    sample: !!S.sample,
    origin: S.origin || 'mine',
    updatedAt: S.updatedAt || Date.now(),
    docs: S.docs.map((d) => {
      const dn = DOCN.get(d.id);
      const o = { ...d };
      delete o.progress;
      o.x = dn && isFinite(dn.x) ? Math.round(dn.x) : num(d.x) ?? null;
      o.y = dn && isFinite(dn.y) ? Math.round(dn.y) : num(d.y) ?? null;
      return o;
    }),
    nodes: S.nodes.map((n) => {
      const o = {
        id: n.id,
        label: n.label,
        type: n.type,
        summary: n.summary || '',
        aliases: n.aliases || [],
        docs: n.docs || [],
        t: n.t || 0,
        m: n.mentions || 1,
        x: isFinite(n.x) ? Math.round(n.x) : null,
        y: isFinite(n.y) ? Math.round(n.y) : null,
      };
      if (n.note) o.note = n.note;
      if (n.pinned) o.pinned = 1;
      if (n.sample) o.sample = 1;
      if (n.manual) o.manual = 1;
      return o;
    }),
    edges: S.edges.map((e) => {
      const o = { id: e.id, s: e.s, t: e.t, label: e.label, docs: e.docs || [], w: e.w || 1 };
      if (e.inferred) o.inferred = 1;
      if (e.why) o.why = e.why;
      if (e.sample) o.sample = 1;
      if (e.manual) o.manual = 1;
      return o;
    }),
  };
}

export function hydrate(data) {
  const okStatus = ['done', 'local', 'sample', 'error', 'partial'];
  return {
    v: 1,
    sample: !!data.sample,
    pristine: false,
    origin: data.origin || 'mine',
    updatedAt: data.updatedAt || 0,
    docs: (data.docs || [])
      .filter((d) => d && d.id)
      .map((d) => ({
        ...d,
        title: String(d.title || 'Untitled'),
        status: okStatus.includes(d.status) ? d.status : 'partial',
        x: num(d.x),
        y: num(d.y),
      })),
    nodes: (data.nodes || [])
      .filter((n) => n && n.id && n.label)
      .map((n) => {
        const o = {
          id: n.id,
          label: String(n.label),
          type: TYPES[n.type] && n.type !== 'source' ? n.type : 'concept',
          summary: n.summary || '',
          aliases: Array.isArray(n.aliases) ? n.aliases : [],
          docs: Array.isArray(n.docs) ? n.docs : [],
          t: n.t || 0,
          mentions: n.m || n.mentions || 1,
          note: n.note || '',
          pinned: !!n.pinned,
          sample: !!n.sample,
          manual: !!n.manual,
          x: num(n.x),
          y: num(n.y),
        };
        if (o.pinned && o.x != null) {
          o.fx = o.x;
          o.fy = o.y;
        }
        return o;
      }),
    edges: (data.edges || [])
      .filter((e) => e && e.s && e.t)
      .map((e) => ({
        id: e.id || rid('e'),
        s: e.s,
        t: e.t,
        label: e.label || 'related to',
        docs: Array.isArray(e.docs) ? e.docs : [],
        w: e.w || 1,
        inferred: !!e.inferred,
        why: e.why || '',
        sample: !!e.sample,
        manual: !!e.manual,
      })),
  };
}

const UNDO = [];
let onUndoChange = null;
export function setUndoListener(fn) {
  onUndoChange = fn;
}
export function getUndoStack() {
  return UNDO;
}
export function pushUndo(label) {
  const textsSnap = {};
  for (const d of S.docs) {
    if (TEXTS.has(d.id)) textsSnap[d.id] = TEXTS.get(d.id);
  }
  UNDO.push({ label, snap: JSON.stringify(serialize()), texts: textsSnap });
  if (UNDO.length > 20) UNDO.shift();
  onUndoChange?.();
}
export function popUndo() {
  const item = UNDO.pop();
  onUndoChange?.();
  return item || null;
}
export function clearUndo() {
  UNDO.length = 0;
  onUndoChange?.();
}
