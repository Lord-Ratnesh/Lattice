import { esc, escRe, normKey, unesc, uniq } from './utils.js';
import { shapeSvg, STOP } from './constants.js';
import { D, docTitle, getVault, IDX, PASS, TEXTS } from './state.js';

/**
 * Split a document's text into ~700-char sentence-aligned passages (cached).
 */
export function passagesFor(docId) {
  if (PASS.has(docId)) return PASS.get(docId);
  const t = TEXTS.get(docId) || '';
  const sents = t.replace(/\s+/g, ' ').split(/(?<=[.!?])\s+/);
  const out = [];
  let cur = '';
  for (const s of sents) {
    if (cur && cur.length + s.length > 700) {
      out.push(cur.trim());
      cur = '';
    }
    cur += ' ' + s;
  }
  if (cur.trim()) out.push(cur.trim());
  const res = out.slice(0, 800).map((text, i) => ({ docId, i, text, lc: text.toLowerCase() }));
  PASS.set(docId, res);
  return res;
}

export const tokenize = (q) =>
  uniq((String(q || '').toLowerCase().match(/[a-z0-9][a-z0-9\-]{2,}/g) || []).filter((w) => !STOP.has(w)));

/**
 * TF-IDF passage retrieval capped at 3 passages per document.
 */
export function searchPassages(terms, k = 6) {
  const S = getVault();
  const all = [];
  for (const d of S.docs) all.push(...passagesFor(d.id));
  if (!all.length || !terms.length) return [];

  const df = new Map(terms.map((t) => [t, all.filter((p) => p.lc.includes(t)).length]));
  const scored = [];
  for (const p of all) {
    let s = 0;
    for (const t of terms) {
      if (!df.get(t)) continue;
      let c = 0;
      let i = p.lc.indexOf(t);
      while (i >= 0 && c < 6) {
        c++;
        i = p.lc.indexOf(t, i + t.length);
      }
      if (c) s += (1 + Math.log(c)) * Math.log(1 + all.length / df.get(t));
    }
    if (s > 0) scored.push([s, p]);
  }
  scored.sort((a, b) => b[0] - a[0]);

  const out = [];
  const perDoc = new Map();
  for (const [, p] of scored) {
    if ((perDoc.get(p.docId) || 0) >= 3) continue;
    perDoc.set(p.docId, (perDoc.get(p.docId) || 0) + 1);
    out.push(p);
    if (out.length >= k) break;
  }
  return out;
}

/**
 * Retrieve relevant graph subgraph (nodes + edges) and text passages for a question.
 */
export function retrieve(q, selectedNode = null) {
  const S = getVault();
  const terms = tokenize(q);
  const ql = String(q || '').toLowerCase();
  const scored = [];

  for (const n of S.nodes) {
    const hay = (n.label + ' ' + (n.aliases || []).join(' ')).toLowerCase();
    const sm = (n.summary || '').toLowerCase();
    let s = 0;
    for (const t of terms) {
      if (hay.includes(t)) s += 3;
      else if (sm.includes(t)) s += 1;
    }
    if (ql.includes(n.label.toLowerCase())) s += 8;
    for (const a of n.aliases || []) {
      if (a.length > 1 && new RegExp('\\b' + escRe(a.toLowerCase()) + '\\b').test(ql)) s += 6;
    }
    if (s) scored.push([s + (D.deg.get(n.id) || 0) * 0.05, n]);
  }

  scored.sort((a, b) => b[0] - a[0]);
  let seeds = scored.slice(0, 8).map((x) => x[1]);
  if (!seeds.length) {
    seeds = [...S.nodes].sort((a, b) => (D.deg.get(b.id) || 0) - (D.deg.get(a.id) || 0)).slice(0, 8);
  }
  if (selectedNode && selectedNode.type !== 'source' && !seeds.includes(selectedNode)) {
    seeds.unshift(selectedNode);
  }

  const set = new Set(seeds.map((n) => n.id));
  for (const n of seeds.slice(0, 5)) {
    for (const a of (D.adj.get(n.id) || []).slice(0, 8)) set.add(a.o);
  }

  const nodes = [...set]
    .slice(0, 30)
    .map((id) => IDX.byId.get(id))
    .filter(Boolean);
  const edges = S.edges.filter((e) => set.has(e.s) && set.has(e.t)).slice(0, 70);
  const passages = searchPassages(
    uniq(terms.concat(seeds.slice(0, 3).map((n) => n.label.toLowerCase()))),
    6
  );

  return { nodes, edges, passages };
}

/**
 * Find fuzzy node matches for search and autocomplete pickers.
 */
export function fuzzy(q, s) {
  let i = 0;
  for (const ch of s) {
    if (ch === q[i]) i++;
    if (i === q.length) return true;
  }
  return false;
}

export function matchNodes(q, limit = 8, includeDocs = false, docNodeFn = null) {
  const S = getVault();
  const nq = q.trim().toLowerCase();
  if (!nq) return [];
  const res = [];
  for (const n of S.nodes) {
    const l = n.label.toLowerCase();
    let s = 0;
    if (l === nq) s = 100;
    else if (l.startsWith(nq)) s = 80;
    else if (l.includes(' ' + nq) || l.includes('-' + nq)) s = 70;
    else if (l.includes(nq)) s = 60;
    else if ((n.aliases || []).some((a) => a.toLowerCase().includes(nq))) s = 55;
    else if (nq.length >= 3 && fuzzy(nq, l)) s = 30;
    else if (nq.length >= 3 && (n.summary || '').toLowerCase().includes(nq)) s = 15;
    if (s) res.push({ n, s: s + Math.min(10, D.deg.get(n.id) || 0) });
  }
  if (includeDocs && docNodeFn) {
    for (const d of S.docs) {
      const l = d.title.toLowerCase();
      let s = 0;
      if (l.startsWith(nq)) s = 75;
      else if (l.includes(nq)) s = 50;
      else if (nq.length >= 3 && fuzzy(nq, l)) s = 25;
      if (s) res.push({ n: docNodeFn(d), s });
    }
  }
  return res.sort((a, b) => b.s - a.s).slice(0, limit);
}

/**
 * Markdown-lite renderer with interactive [[Node]] chips and {{Source}} citations.
 */
export function nodeChip(raw) {
  const label = unesc(raw).trim();
  const id = IDX.byKey.get(normKey(label));
  const n = id && IDX.byId.get(id);
  if (n) {
    return `<button class="nchip" type="button" data-node="${esc(n.id)}">${shapeSvg(n.type, 9)}${esc(n.label)}</button>`;
  }
  return `<span class="nchip ghost">${esc(label)}</span>`;
}

function inline(s) {
  return s
    .replace(/\[\[([^\]]+?)\]\]/g, (m, l) => nodeChip(l))
    .replace(/\{\{([^}]+?)\}\}/g, (m, t) => `<span class="srcref">${t}</span>`)
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/`([^`]+)`/g, '<code>$1</code>');
}

export function md(src) {
  const lines = esc(src).split('\n');
  let html = '';
  let list = false;
  for (const line of lines) {
    if (/^\s*[-*•]\s+/.test(line)) {
      if (!list) {
        html += '<ul>';
        list = true;
      }
      html += '<li>' + inline(line.replace(/^\s*[-*•]\s+/, '')) + '</li>';
      continue;
    }
    if (list) {
      html += '</ul>';
      list = false;
    }
    if (/^#{1,6}\s/.test(line)) {
      html += '<h4>' + inline(line.replace(/^#{1,6}\s/, '')) + '</h4>';
      continue;
    }
    if (line.trim()) html += '<p>' + inline(line) + '</p>';
  }
  if (list) html += '</ul>';
  return html;
}

export const plain = (s) =>
  String(s || '')
    .replace(/\[\[([^\]]+)\]\]/g, '$1')
    .replace(/\{\{([^}]+)\}\}/g, '$1')
    .replace(/\*\*/g, '')
    .replace(/^#+\s*/gm, '')
    .replace(/^\s*[-*•]\s+/gm, '')
    .replace(/`/g, '');
