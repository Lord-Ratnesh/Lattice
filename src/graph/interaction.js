import * as d3 from 'd3';
import { clamp, clip, esc, h } from '../core/utils.js';
import { ico, REDUCED, TYPES } from '../core/constants.js';
import { degOf, IDX } from '../core/state.js';
import { calcFitTransform, G, nodeR, sim } from './engine.js';

export function setupInteraction({
  cv,
  mini,
  tip,
  ctxEl,
  onSelect,
  onEnterFocus,
  onRemoveDoc,
  onSetPathEnd,
  onTogglePin,
  onOpenLinkModal,
  onOpenMergeModal,
  onDeleteNode,
  onSaveMoved,
  onReadout,
}) {
  const localXY = (ev) => {
    const r = cv.getBoundingClientRect();
    return [ev.clientX - r.left, ev.clientY - r.top];
  };

  function nodeAt(px, py) {
    const [wx, wy] = G.t.invert([px, py]);
    let best = null;
    let bd = Infinity;
    for (const n of G.nodes) {
      const r = nodeR(n) * 1.25 + 4 / G.t.k;
      const dx = n.x - wx;
      const dy = n.y - wy;
      const d = dx * dx + dy * dy;
      if (d < r * r && d < bd) {
        bd = d;
        best = n;
      }
    }
    return best;
  }

  function showTip(n, x, y) {
    const isDoc = n.type === 'source';
    const d = isDoc ? IDX.doc.get(n.docId) : null;
    tip.innerHTML = `<div class="t">${esc(n.label)}</div><div class="m"><span>${TYPES[n.type].name}</span><span>${degOf(n)} ${
      isDoc ? 'nodes' : 'links'
    }</span>${isDoc ? `<span>${esc(d?.kind || '')}</span>` : `<span>${(n.docs || []).length} src</span>`}</div>${
      (isDoc ? d?.summary : n.summary) ? `<p>${esc(clip(isDoc ? d.summary : n.summary, 150))}</p>` : ''
    }`;
    tip.hidden = false;
    const tw = tip.offsetWidth;
    const th = tip.offsetHeight;
    let lx = x + 16;
    let ly = y + 16;
    if (lx + tw > G.w - 8) lx = x - tw - 16;
    if (ly + th > G.h - 8) ly = y - th - 16;
    tip.style.left = Math.max(8, lx) + 'px';
    tip.style.top = Math.max(8, ly) + 'px';
  }

  function hideTip() {
    tip.hidden = true;
  }

  function closeCtx() {
    ctxEl.hidden = true;
  }

  function openCtx(n, x, y) {
    const isDoc = n.type === 'source';
    const items = isDoc
      ? [
          ['focus', 'Inspect source', () => onSelect(n)],
          ['focus', 'Focus its nodes', () => onEnterFocus(n)],
          ['trash', 'Remove source', () => onRemoveDoc(IDX.doc.get(n.docId)), 'danger'],
        ]
      : [
          ['focus', 'Inspect', () => onSelect(n)],
          ['layers', 'Focus neighborhood', () => onEnterFocus(n)],
          ['path', 'Path from here', () => onSetPathEnd('from', n)],
          ['path', 'Path to here', () => onSetPathEnd('to', n)],
          ['pin', n.pinned ? 'Unpin' : 'Pin in place', () => onTogglePin(n)],
          ['link', 'Link to…', () => onOpenLinkModal(n)],
          ['merge', 'Merge into…', () => onOpenMergeModal(n)],
          ['trash', 'Delete node', () => onDeleteNode(n), 'danger'],
        ];
    ctxEl.innerHTML = '';
    ctxEl.append(h('div', { class: 'head', text: n.label }));
    for (const [ic, label, fn, cls] of items) {
      const b = h('button', {
        type: 'button',
        role: 'menuitem',
        class: cls || '',
        onclick: () => {
          closeCtx();
          fn();
        },
      });
      b.innerHTML = ico(ic, 13) + '<span>' + esc(label) + '</span>';
      ctxEl.append(b);
    }
    ctxEl.hidden = false;
    const mw = ctxEl.offsetWidth;
    const mh = ctxEl.offsetHeight;
    ctxEl.style.left = clamp(x + 6, 8, G.w - mw - 8) + 'px';
    ctxEl.style.top = clamp(y + 6, 8, G.h - mh - 8) + 'px';
    ctxEl.querySelector('button')?.focus();
  }

  G.zoom = d3
    .zoom()
    .scaleExtent([0.05, 6])
    .on('zoom', (ev) => {
      G.t = ev.transform;
      G.dirty = true;
      hideTip();
      onReadout?.();
    });

  const drag = d3
    .drag()
    .container(cv)
    .subject((ev) => {
      const n = nodeAt(ev.x, ev.y);
      return n ? { n, x: ev.x, y: ev.y } : null;
    })
    .on('start', () => {
      G.dragging = true;
      G.dragMoved = false;
      hideTip();
    })
    .on('drag', (ev) => {
      const n = ev.subject.n;
      if (!G.dragMoved) {
        G.dragMoved = true;
        if (!G.frozen) sim.alphaTarget(0.22).restart();
        cv.style.cursor = 'grabbing';
      }
      const [wx, wy] = G.t.invert([ev.x, ev.y]);
      n.fx = wx;
      n.fy = wy;
      if (G.frozen) {
        n.x = wx;
        n.y = wy;
      }
      G.dirty = true;
    })
    .on('end', (ev) => {
      const n = ev.subject.n;
      G.dragging = false;
      if (!G.frozen) sim.alphaTarget(0);
      if (!n.pinned) {
        n.fx = null;
        n.fy = null;
      }
      cv.style.cursor = 'grab';
      if (G.dragMoved) onSaveMoved?.();
    });

  d3.select(cv).call(drag).call(G.zoom).on('dblclick.zoom', null);

  cv.addEventListener('pointermove', (ev) => {
    if (G.dragging) return;
    const [x, y] = localXY(ev);
    const n = nodeAt(x, y);
    if (n !== G.hover) {
      G.hover = n;
      G.dirty = true;
      cv.style.cursor = n ? 'pointer' : 'grab';
    }
    if (n && ev.pointerType === 'mouse') showTip(n, x, y);
    else hideTip();
  });

  cv.addEventListener('pointerleave', () => {
    if (G.hover) {
      G.hover = null;
      G.dirty = true;
    }
    hideTip();
  });

  cv.addEventListener('click', (ev) => {
    closeCtx();
    const [x, y] = localXY(ev);
    const n = nodeAt(x, y);
    if (n) onSelect(n);
    else if (G.sel) onSelect(null);
  });

  cv.addEventListener('dblclick', (ev) => {
    const [x, y] = localXY(ev);
    const n = nodeAt(x, y);
    if (n) onEnterFocus(n);
  });

  cv.addEventListener('contextmenu', (ev) => {
    const [x, y] = localXY(ev);
    const n = nodeAt(x, y);
    if (!n) return;
    ev.preventDefault();
    openCtx(n, x, y);
  });

  document.addEventListener('pointerdown', (e) => {
    if (!ctxEl.hidden && !ctxEl.contains(e.target)) closeCtx();
  });

  function miniJump(ev) {
    const m = G.miniMap;
    if (!m) return;
    const r = mini.getBoundingClientRect();
    const wx = m.x0 + (ev.clientX - r.left - m.ox) / m.s;
    const wy = m.y0 + (ev.clientY - r.top - m.oy) / m.s;
    const k = G.t.k;
    d3.select(cv).call(G.zoom.transform, d3.zoomIdentity.translate(G.w / 2 - wx * k, G.h / 2 - wy * k).scale(k));
  }

  let miniDown = false;
  mini.addEventListener('pointerdown', (ev) => {
    miniDown = true;
    mini.setPointerCapture(ev.pointerId);
    miniJump(ev);
  });
  mini.addEventListener('pointermove', (ev) => {
    if (miniDown) miniJump(ev);
  });
  mini.addEventListener('pointerup', () => {
    miniDown = false;
  });

  function zoomToNode(n, scale) {
    if (!n || !isFinite(n.x)) return;
    const k = scale ?? Math.max(G.t.k, 1.35);
    const tr = d3.zoomIdentity.translate(G.w / 2 - n.x * k, G.h / 2 - n.y * k).scale(k);
    d3.select(cv).transition().duration(REDUCED ? 0 : 650).call(G.zoom.transform, tr);
  }

  function fitView(nodes = G.nodes, pad = 70, dur = 650) {
    const f = calcFitTransform(nodes, pad);
    if (!f) return;
    const tr = d3.zoomIdentity.translate(f.x, f.y).scale(f.k);
    const sel = d3.select(cv);
    if (dur && !REDUCED) sel.transition().duration(dur).call(G.zoom.transform, tr);
    else sel.call(G.zoom.transform, tr);
  }

  function zoomBy(factor) {
    d3.select(cv).transition().duration(250).call(G.zoom.scaleBy, factor);
  }

  function centerOrigin() {
    d3.select(cv).call(G.zoom.transform, d3.zoomIdentity.translate(G.w / 2, G.h / 2));
  }

  return { zoomToNode, fitView, zoomBy, centerOrigin, closeCtx, hideTip };
}
