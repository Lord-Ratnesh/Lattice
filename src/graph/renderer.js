import { clip, hash, rgba } from '../core/utils.js';
import { BODY, C, MONO, REDUCED, TYPES } from '../core/constants.js';
import { D, degOf, getVault, IDX, nodeById, pairKey } from '../core/state.js';
import { colorOf, G, nodeR } from './engine.js';
import { ING } from '../services/ingest.js';

export function resizeCanvas(stageEl, cvEl) {
  const r = stageEl.getBoundingClientRect();
  G.w = Math.max(1, r.width);
  G.h = Math.max(1, r.height);
  G.dpr = Math.min(2.5, window.devicePixelRatio || 1);
  cvEl.width = Math.round(G.w * G.dpr);
  cvEl.height = Math.round(G.h * G.dpr);
  cvEl.style.width = G.w + 'px';
  cvEl.style.height = G.h + 'px';
  G.dirty = true;
}

function shapePath(c, shape, x, y, r) {
  c.beginPath();
  switch (shape) {
    case 'diamond': {
      const q = r * 1.25;
      c.moveTo(x, y - q);
      c.lineTo(x + q, y);
      c.lineTo(x, y + q);
      c.lineTo(x - q, y);
      c.closePath();
      break;
    }
    case 'triangle': {
      const q = r * 1.3;
      c.moveTo(x, y - q);
      c.lineTo(x + q * 0.98, y + q * 0.72);
      c.lineTo(x - q * 0.98, y + q * 0.72);
      c.closePath();
      break;
    }
    case 'hex': {
      const q = r * 1.12;
      for (let i = 0; i < 6; i++) {
        const a = (Math.PI / 3) * i;
        const px = x + q * Math.cos(a);
        const py = y + q * Math.sin(a);
        if (i) c.lineTo(px, py);
        else c.moveTo(px, py);
      }
      c.closePath();
      break;
    }
    case 'page': {
      const w = r * 1.5;
      const hh = r * 1.95;
      const f = r * 0.55;
      c.moveTo(x - w / 2, y - hh / 2);
      c.lineTo(x + w / 2 - f, y - hh / 2);
      c.lineTo(x + w / 2, y - hh / 2 + f);
      c.lineTo(x + w / 2, y + hh / 2);
      c.lineTo(x - w / 2, y + hh / 2);
      c.closePath();
      break;
    }
    default: {
      const q = r * 0.92;
      c.rect(x - q, y - q, q * 2, q * 2);
    }
  }
}

function emphasis() {
  const S = getVault();
  if (G.path) return { mode: 'path', nodes: G.path.set };
  const f = G.hover || G.sel;
  if (f) {
    const set = new Set([f.id]);
    if (f.type === 'source') {
      for (const n of S.nodes) if (n.docs.includes(f.docId)) set.add(n.id);
    } else {
      for (const a of D.adj.get(f.id) || []) set.add(a.o);
      for (const d of f.docs || []) set.add('doc:' + d);
    }
    return { mode: 'focus', nodes: set, f };
  }
  if (G.glow) return { mode: 'glow', nodes: G.glow };
  if (G.qMatch) return { mode: 'query', nodes: G.qMatch };
  return { mode: null, nodes: null };
}

function drawGrid(c, w, h, t) {
  let step = 40 * t.k;
  while (step < 20) step *= 4;
  while (step > 80) step /= 4;
  const ox = ((t.x % step) + step) % step;
  const oy = ((t.y % step) + step) % step;
  c.lineWidth = 1;
  c.strokeStyle = 'rgba(120,150,190,0.05)';
  c.beginPath();
  for (let x = ox; x < w; x += step) {
    const X = Math.round(x) + 0.5;
    c.moveTo(X, 0);
    c.lineTo(X, h);
  }
  for (let y = oy; y < h; y += step) {
    const Y = Math.round(y) + 0.5;
    c.moveTo(0, Y);
    c.lineTo(w, Y);
  }
  c.stroke();

  const big = step * 4;
  const bx = ((t.x % big) + big) % big;
  const by = ((t.y % big) + big) % big;
  c.strokeStyle = 'rgba(127,216,255,0.2)';
  c.beginPath();
  for (let x = bx; x < w; x += big) {
    for (let y = by; y < h; y += big) {
      const X = Math.round(x) + 0.5;
      const Y = Math.round(y) + 0.5;
      c.moveTo(X - 3, Y);
      c.lineTo(X + 4, Y);
      c.moveTo(X, Y - 3);
      c.lineTo(X, Y + 4);
    }
  }
  c.stroke();
}

function arrow(c, l, col, k) {
  const s = l.source;
  const t = l.target;
  const dx = t.x - s.x;
  const dy = t.y - s.y;
  const len = Math.hypot(dx, dy) || 1;
  const r = nodeR(t) + 3 / k;
  const ux = dx / len;
  const uy = dy / len;
  const ax = t.x - ux * r;
  const ay = t.y - uy * r;
  const sz = 5 / k;
  c.beginPath();
  c.moveTo(ax, ay);
  c.lineTo(ax - ux * sz * 1.6 - uy * sz, ay - uy * sz * 1.6 + ux * sz);
  c.lineTo(ax - ux * sz * 1.6 + uy * sz, ay - uy * sz * 1.6 - ux * sz);
  c.closePath();
  c.fillStyle = col;
  c.fill();
}

function drawLabels(c, em, hot) {
  const t = G.t;
  const k = t.k;
  const E = em.nodes;
  const cand = [];
  const pathIds = G.path ? G.path.set : null;

  for (const n of G.nodes) {
    const isE = E && E.has(n.id);
    const important = n === G.sel || n === G.hover || (pathIds && pathIds.has(n.id));
    let show;
    if (important) show = true;
    else if (G.labels === 'none') show = false;
    else if (G.labels === 'all') show = !E || isE;
    else {
      const d = D.deg.get(n.id) || 0;
      show = E ? isE : n.type === 'source' ? k > 0.5 : (d >= D.labelDeg && k > 0.42) || k > 1.2;
    }
    if (!show) continue;
    const p = t.apply([n.x, n.y]);
    if (p[0] < -120 || p[1] < -30 || p[0] > G.w + 40 || p[1] > G.h + 30) continue;
    cand.push({
      n,
      x: p[0],
      y: p[1],
      pri: important ? 1e6 : degOf(n) + (isE ? 1000 : 0) + (n.type === 'source' ? 40 : 0),
    });
  }

  cand.sort((a, b) => b.pri - a.pri);
  const placed = [];
  c.textBaseline = 'middle';
  c.lineJoin = 'round';

  for (const cd of cand.slice(0, 420)) {
    const n = cd.n;
    const big = cd.pri >= 1000 || degOf(n) >= D.labelDeg * 1.6;
    const text = n.type === 'source' ? clip(n.label, 40).toUpperCase() : n.label;
    c.font = n.type === 'source' ? `600 9.5px ${MONO}` : big ? `600 12px ${BODY}` : `500 11px ${BODY}`;
    const tw = c.measureText(text).width;
    const r = nodeR(n) * k * (n.type === 'source' ? 1 : 1.15);
    const x = cd.x + r + 6;
    const y = cd.y;
    const box = { x: x - 2, y: y - 8, w: tw + 4, h: 16 };
    if (cd.pri < 1e6 && placed.some((b) => b.x < box.x + box.w && box.x < b.x + b.w && b.y < box.y + box.h && box.y < b.y + b.h)) {
      continue;
    }
    placed.push(box);
    c.lineWidth = 3.5;
    c.strokeStyle = C.void;
    c.strokeText(text, x, y);
    c.fillStyle = n.type === 'source' ? C.ink2 : cd.pri >= 1e6 ? '#FFFFFF' : C.ink;
    c.fillText(text, x, y);
  }

  const showEdgeLabels = (em.mode === 'focus' && (em.f === G.sel || k > 0.8)) || em.mode === 'path';
  if (showEdgeLabels) {
    c.font = `500 9.5px ${MONO}`;
    let count = 0;
    const items = [];
    if (em.mode === 'path') {
      const seq = G.path.seq;
      for (let i = 0; i < seq.length - 1; i++) {
        const e = IDX.pair.get(pairKey(seq[i], seq[i + 1]));
        const a = nodeById(seq[i]);
        const b = nodeById(seq[i + 1]);
        if (e && a && b && G.visIds.has(a.id) && G.visIds.has(b.id)) items.push([a, b, e.label]);
      }
    } else {
      for (const l of hot) if (!l.mention && l.e) items.push([l.source, l.target, l.e.label]);
    }
    for (const [a, b, label] of items) {
      if (count++ > 28) break;
      const pa = t.apply([a.x, a.y]);
      const pb = t.apply([b.x, b.y]);
      const mx = (pa[0] + pb[0]) / 2;
      const my = (pa[1] + pb[1]) / 2;
      if (Math.hypot(pa[0] - pb[0], pa[1] - pb[1]) < 70) continue;
      const tw = c.measureText(label).width;
      const box = { x: mx - tw / 2 - 4, y: my - 8, w: tw + 8, h: 16 };
      if (placed.some((q) => q.x < box.x + box.w && box.x < q.x + q.w && q.y < box.y + box.h && box.y < q.y + q.h)) {
        continue;
      }
      placed.push(box);
      c.fillStyle = 'rgba(5,7,11,0.9)';
      c.fillRect(box.x, box.y, box.w, box.h);
      c.strokeStyle = C.ruleHi;
      c.lineWidth = 1;
      c.strokeRect(box.x + 0.5, box.y + 0.5, box.w - 1, box.h - 1);
      c.fillStyle = C.ink2;
      c.fillText(label, mx - tw / 2, my);
    }
  }
}

export function drawScene(c, now, opt = {}) {
  const { w, h, dpr, t } = G;
  const k = t.k;
  const scale = opt.scale || dpr;
  c.setTransform(scale, 0, 0, scale, 0, 0);
  c.fillStyle = C.void;
  c.fillRect(0, 0, w, h);
  drawGrid(c, w, h, t);

  const em = emphasis();
  const E = em.nodes;
  c.setTransform(scale * k, 0, 0, scale * k, scale * t.x, scale * t.y);
  const lw = 1 / k;
  const hot = [];
  const inferred = [];

  c.lineWidth = lw;
  c.strokeStyle = E ? 'rgba(124,146,178,0.06)' : 'rgba(124,146,178,0.3)';
  c.beginPath();
  for (const l of G.links) {
    if (l.mention) continue;
    const isHot =
      E &&
      (em.mode === 'focus'
        ? l.source.id === em.f.id || l.target.id === em.f.id
        : em.mode !== 'path' && E.has(l.source.id) && E.has(l.target.id));
    if (isHot) {
      hot.push(l);
      continue;
    }
    if (l.e.inferred) {
      inferred.push(l);
      continue;
    }
    c.moveTo(l.source.x, l.source.y);
    c.lineTo(l.target.x, l.target.y);
  }
  c.stroke();

  c.strokeStyle = E ? 'rgba(217,226,238,0.025)' : 'rgba(217,226,238,0.075)';
  c.setLineDash([2 * lw, 4 * lw]);
  c.beginPath();
  for (const l of G.links) {
    if (!l.mention) continue;
    if (em.mode === 'focus' && (l.source.id === em.f.id || l.target.id === em.f.id)) {
      hot.push(l);
      continue;
    }
    c.moveTo(l.source.x, l.source.y);
    c.lineTo(l.target.x, l.target.y);
  }
  c.stroke();

  if (inferred.length) {
    c.strokeStyle = E ? 'rgba(179,155,255,0.12)' : 'rgba(179,155,255,0.6)';
    c.setLineDash([5 * lw, 4 * lw]);
    c.beginPath();
    for (const l of inferred) {
      c.moveTo(l.source.x, l.source.y);
      c.lineTo(l.target.x, l.target.y);
    }
    c.stroke();
  }
  c.setLineDash([]);

  for (const l of hot) {
    const col = l.mention ? C.paper : colorOf(l.source === em.f ? l.target : l.source);
    c.strokeStyle = rgba(col, l.mention ? 0.35 : 0.75);
    c.lineWidth = (l.mention ? 1 : 1.6) / k;
    if (l.mention || l.e.inferred) c.setLineDash([4 / k, 3 / k]);
    c.beginPath();
    c.moveTo(l.source.x, l.source.y);
    c.lineTo(l.target.x, l.target.y);
    c.stroke();
    c.setLineDash([]);
    if (!l.mention) arrow(c, l, rgba(col, 0.9), k);
  }

  if (G.path) {
    const seq = G.path.seq;
    c.save();
    c.shadowColor = C.ice;
    c.shadowBlur = 10;
    c.strokeStyle = '#FFFFFF';
    c.lineWidth = 2.4 / k;
    c.beginPath();
    for (let i = 0; i < seq.length - 1; i++) {
      const a = nodeById(seq[i]);
      const b = nodeById(seq[i + 1]);
      if (!a || !b || !G.visIds.has(a.id) || !G.visIds.has(b.id)) continue;
      c.moveTo(a.x, a.y);
      c.lineTo(b.x, b.y);
    }
    c.stroke();
    c.restore();
  }

  if (!REDUCED && !opt.still) {
    const flows = [];
    if (G.sel && em.mode === 'focus') {
      for (const l of hot) {
        if (!l.mention) flows.push([l.source, l.target, colorOf(l.source === G.sel ? l.target : l.source)]);
      }
    }
    if (G.path) {
      const seq = G.path.seq;
      for (let i = 0; i < seq.length - 1; i++) {
        const a = nodeById(seq[i]);
        const b = nodeById(seq[i + 1]);
        if (a && b) flows.push([a, b, '#FFFFFF']);
      }
    }
    for (const [a, b, col] of flows) {
      for (let j = 0; j < 2; j++) {
        const p = (now / 1700 + j * 0.5 + (hash(a.id + b.id) % 100) / 100) % 1;
        const x = a.x + (b.x - a.x) * p;
        const y = a.y + (b.y - a.y) * p;
        const s = 2.6 / k;
        c.fillStyle = col;
        c.fillRect(x - s / 2, y - s / 2, s, s);
      }
    }
  }

  const nowP = performance.now();
  for (const n of G.nodes) {
    const on = !E || E.has(n.id);
    const col = colorOf(n);
    const r = nodeR(n);
    const shape = TYPES[n.type]?.shape || 'square';
    c.globalAlpha = on ? 1 : 0.12;
    shapePath(c, shape === 'double' || shape === 'dashed' ? 'square' : shape, n.x, n.y, shape === 'double' ? r * 1.05 : r);
    c.fillStyle = n.type === 'source' ? rgba(col, 0.08) : rgba(col, on && E ? 0.34 : 0.2);
    c.fill();
    c.lineWidth = (n === G.sel ? 2.2 : 1.3) / k;
    c.strokeStyle = col;
    if (shape === 'dashed') c.setLineDash([3 / k, 2.4 / k]);
    c.stroke();
    c.setLineDash([]);

    if (shape === 'double') {
      const q = r * 0.42;
      c.fillStyle = col;
      c.fillRect(n.x - q, n.y - q, q * 2, q * 2);
    }
    if (shape === 'page') {
      const w2 = r * 1.5;
      const hh = r * 1.95;
      const f = r * 0.55;
      c.beginPath();
      c.moveTo(n.x + w2 / 2 - f, n.y - hh / 2);
      c.lineTo(n.x + w2 / 2 - f, n.y - hh / 2 + f);
      c.lineTo(n.x + w2 / 2, n.y - hh / 2 + f);
      c.stroke();
      const d = IDX.doc.get(n.docId);
      if (d && (d.status === 'reading' || d.status === 'extracting')) {
        c.save();
        c.strokeStyle = C.ice;
        c.lineWidth = 1.2 / k;
        c.setLineDash([4 / k, 4 / k]);
        c.lineDashOffset = -nowP / 30;
        const q = r * 1.9;
        c.strokeRect(n.x - q, n.y - q, q * 2, q * 2);
        c.restore();
      }
    }
    if (n.pinned) {
      const s = 3.2 / k;
      c.fillStyle = C.ink;
      c.fillRect(n.x + r * 0.92 - s / 2, n.y - r * 0.92 - s / 2, s, s);
    }
    const ft = G.fresh.get(n.id);
    if (ft != null && !opt.still) {
      const a = (nowP - ft) / 2600;
      if (a >= 1) G.fresh.delete(n.id);
      else {
        const q = r + 4 / k + (a * 26) / k;
        c.strokeStyle = rgba(col, (1 - a) * 0.9);
        c.lineWidth = 1.4 / k;
        c.strokeRect(n.x - q, n.y - q, q * 2, q * 2);
      }
    }
  }

  c.globalAlpha = 1;
  c.setTransform(scale, 0, 0, scale, 0, 0);
  const brackets = (n, col, lwid) => {
    const p = t.apply([n.x, n.y]);
    const R = nodeR(n) * k * 1.3 + 7;
    const L = Math.min(9, R * 0.6);
    c.strokeStyle = col;
    c.lineWidth = lwid;
    c.beginPath();
    for (const [sx, sy] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
      const x = p[0] + sx * R;
      const y = p[1] + sy * R;
      c.moveTo(x - sx * L, y);
      c.lineTo(x, y);
      c.lineTo(x, y - sy * L);
    }
    c.stroke();
  };
  if (G.sel && G.visIds.has(G.sel.id)) brackets(G.sel, colorOf(G.sel), 1.5);
  if (G.hover && G.hover !== G.sel && G.visIds.has(G.hover.id)) brackets(G.hover, rgba(C.ink, 0.55), 1);
  drawLabels(c, em, hot);
}

export function drawMini(miniEl, mctx) {
  if (!miniEl.offsetParent) return;
  const W = miniEl.clientWidth;
  const H = miniEl.clientHeight;
  const dpr = G.dpr;
  if (miniEl.width !== Math.round(W * dpr)) {
    miniEl.width = Math.round(W * dpr);
    miniEl.height = Math.round(H * dpr);
  }
  mctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  mctx.clearRect(0, 0, W, H);
  if (!G.nodes.length) {
    G.miniMap = null;
    return;
  }
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  for (const n of G.nodes) {
    if (!isFinite(n.x)) continue;
    x0 = Math.min(x0, n.x);
    y0 = Math.min(y0, n.y);
    x1 = Math.max(x1, n.x);
    y1 = Math.max(y1, n.y);
  }
  if (!isFinite(x0)) return;
  const pad = 40;
  x0 -= pad;
  y0 -= pad;
  x1 += pad;
  y1 += pad;
  const s = Math.min(W / (x1 - x0), H / (y1 - y0));
  const ox = (W - (x1 - x0) * s) / 2;
  const oy = (H - (y1 - y0) * s) / 2;
  G.miniMap = { x0, y0, s, ox, oy };
  for (const n of G.nodes) {
    const px = ox + (n.x - x0) * s;
    const py = oy + (n.y - y0) * s;
    mctx.fillStyle = colorOf(n);
    const z = n.type === 'source' ? 3 : 2;
    mctx.fillRect(px - z / 2, py - z / 2, z, z);
  }
  const a = G.t.invert([0, 0]);
  const b = G.t.invert([G.w, G.h]);
  mctx.strokeStyle = C.ice;
  mctx.lineWidth = 1;
  mctx.strokeRect(
    ox + (a[0] - x0) * s + 0.5,
    oy + (a[1] - y0) * s + 0.5,
    (b[0] - a[0]) * s,
    (b[1] - a[1]) * s
  );
}

export function startRenderLoop(cvEl, miniEl, stepReplayFn) {
  const ctx = cvEl.getContext('2d');
  const mctx = miniEl.getContext('2d');
  let lastMini = 0;

  function loop(now) {
    requestAnimationFrame(loop);
    if (G.replay) stepReplayFn?.(now);
    if (G.fresh.size) {
      for (const [id, t0] of G.fresh) {
        if (now - t0 > 2700) {
          G.fresh.delete(id);
          G.dirty = true;
        }
      }
    }
    const anim = (!REDUCED && (G.sel || G.path)) || G.fresh.size > 0 || ING.running || G.replay;
    if (!G.dirty && !anim) return;
    G.dirty = false;
    drawScene(ctx, now);
    if (now - lastMini > 90) {
      lastMini = now;
      drawMini(miniEl, mctx);
    }
  }

  requestAnimationFrame(loop);
}
