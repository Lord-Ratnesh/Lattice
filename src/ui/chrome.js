import { $, clip, esc, fmtDate, fmtNum, h } from '../core/utils.js';
import { ico, pal, REDUCED, shapeSvg, TYPE_ORDER, TYPES } from '../core/constants.js';
import { D, docNode, getUndoStack, getVault } from '../core/state.js';
import { G, persistPrefs, applyForces, rebuild, sim } from '../graph/engine.js';
import { ING } from '../services/ingest.js';
import { getAIProviderLabel, isAIConfigured } from '../services/ai.js';
import { seg } from './components.js';

export function setSync(s, label) {
  const el = $('#sync');
  if (!el) return;
  el.dataset.s = s;
  el.querySelector('span').textContent =
    label ||
    {
      idle: 'Sample',
      loading: 'Loading',
      saving: 'Saving',
      indexeddb: 'Saved',
      local: 'Browser',
    }[s] ||
    s;
  el.title =
    {
      indexeddb: 'Saved locally in IndexedDB',
      local: 'Saved in browser storage',
      saving: 'Saving changes',
      loading: 'Loading your vault',
      idle: 'Sample vault (changes save automatically)',
    }[s] || '';
}

export function updateAIStatusUI(onOpenSettings) {
  const label = getAIProviderLabel();
  const configured = isAIConfigured();
  const modeSpan = $('#aiModeLabel');
  if (modeSpan) modeSpan.textContent = label;

  const btn = $('#aiSettingsBtn');
  if (btn) {
    btn.title = configured
      ? `AI connected (${label}) — click to configure`
      : 'Running on-device — click to connect Claude, OpenAI, Gemini, or Ollama';
  }

  const note = $('#aiNote');
  if (!note) return;
  if (configured) {
    note.hidden = true;
  } else {
    note.hidden = false;
    note.innerHTML = `<b style="color:var(--amber)">On-device mode active.</b> Sources use local keyword extraction, and Ask/Insights run locally. `;
    const cfgLink = h('button', {
      type: 'button',
      class: 'link',
      onclick: () => onOpenSettings?.(),
    }, 'Connect AI');
    note.append(cfgLink);
  }
}

export function updateUndo() {
  const b = $('#undoBtn');
  if (!b) return;
  const stack = getUndoStack();
  b.disabled = !stack.length;
  b.title = stack.length ? 'Undo: ' + stack[stack.length - 1].label + ' (Ctrl+Z)' : 'Nothing to undo';
}

export function updateIngestUI() {
  const stopBtn = $('#stopIngest');
  if (stopBtn) stopBtn.hidden = !ING.running;
}

export function renderTop() {
  const S = getVault();
  const nC = D.commList.filter((c) => c.big).length;
  $('#topStats').innerHTML = `<span>Nodes<b>${fmtNum(S.nodes.length)}</b></span><span>Links<b>${fmtNum(
    S.edges.length
  )}</b></span><span>Sources<b>${S.docs.length}</b></span><span>Clusters<b>${nC}</b></span>`;
  $('#srcCount').textContent = S.docs.length + ' loaded';
}

function statusChip(d) {
  switch (d.status) {
    case 'sample':
      return '<span class="chip dim">Sample</span>';
    case 'reading':
      return '<span class="chip run">Reading</span>';
    case 'extracting':
      return `<span class="chip run">Mapping ${esc(d.progress || '')}</span>`;
    case 'done':
      return '<span class="chip ok">AI mapped</span>';
    case 'local':
      return '<span class="chip warn">Local</span>';
    case 'partial':
      return '<span class="chip warn">Partial</span>';
    case 'error':
      return `<span class="chip err" title="${esc(d.error || '')}">Failed</span>`;
    default:
      return '';
  }
}

export function renderDocs(actions) {
  const S = getVault();
  const ul = $('#docList');
  if (!ul) return;
  ul.innerHTML = '';
  for (const d of [...S.docs].reverse()) {
    const n = D.docDeg.get('doc:' + d.id) || 0;
    const i = D.docIndex.get(d.id) || 0;
    const li = h('li', { class: 'doc' });
    li.innerHTML = `${shapeSvg('source', 14, G.colorBy === 'source' ? pal(i) : undefined)}<div style="min-width:0"><button class="doc-title" type="button" title="${esc(
      d.title
    )}">${esc(d.title)}</button><div class="doc-meta"><span>${esc(
      (d.kind || 'note').toUpperCase()
    )}</span><span>${d.chars ? fmtNum(d.chars) + ' ch' : '—'}</span><span>${n} nodes</span>${statusChip(
      d
    )}</div>${
      d.status === 'error' && d.error
        ? `<div class="doc-meta" style="color:var(--danger);text-transform:none;letter-spacing:0">${esc(d.error)}</div>`
        : ''
    }</div><div class="doc-acts"></div>`;

    li.querySelector('.doc-title').onclick = () => {
      const dn = docNode(d);
      if (!G.typeOn.source) {
        G.typeOn.source = true;
        renderTypeChips();
        rebuild(0.3);
      }
      actions.select(dn, { zoom: true });
    };
    const acts = li.querySelector('.doc-acts');
    const fb = h('button', {
      class: 'btn sm icon ghost',
      type: 'button',
      title: 'Focus its nodes',
      'aria-label': 'Focus nodes from ' + d.title,
      onclick: () => {
        if (!G.typeOn.source) {
          G.typeOn.source = true;
          renderTypeChips();
        }
        actions.enterFocus(docNode(d));
      },
    });
    fb.innerHTML = ico('focus', 12);
    const xb = h('button', {
      class: 'btn sm icon ghost',
      type: 'button',
      title: 'Remove source',
      'aria-label': 'Remove ' + d.title,
      onclick: () => actions.removeDoc(d),
    });
    xb.innerHTML = ico('trash', 12);
    acts.append(fb, xb);
    ul.append(li);
  }
}

export function renderTypeChips() {
  const S = getVault();
  const box = $('#typeChips');
  if (!box) return;
  box.innerHTML = '';
  for (const k of TYPE_ORDER) {
    const cnt = k === 'source' ? S.docs.length : S.nodes.filter((n) => n.type === k).length;
    if (!cnt && k === 'gap') continue;
    const b = h('button', {
      type: 'button',
      class: 'tchip',
      'aria-pressed': String(G.typeOn[k]),
      title: (G.typeOn[k] ? 'Hide ' : 'Show ') + TYPES[k].name.toLowerCase() + ' nodes',
      onclick: () => {
        G.typeOn[k] = !G.typeOn[k];
        renderTypeChips();
        rebuild(0.3);
      },
    });
    b.innerHTML = `${shapeSvg(k, 11)}<span>${TYPES[k].name}</span><span class="cnt">${cnt}</span>`;
    box.append(b);
  }
}

export function renderLegend() {
  const S = getVault();
  const L = $('#legend');
  if (!L) return;
  let rows = '';
  if (G.colorBy === 'type') {
    for (const k of TYPE_ORDER) {
      const c = k === 'source' ? S.docs.length : S.nodes.filter((n) => n.type === k).length;
      if (!c) continue;
      rows += `<div class="lg">${shapeSvg(k, 11)}<span>${TYPES[k].name}</span><b>${c}</b></div>`;
    }
  } else if (G.colorBy === 'cluster') {
    D.commList
      .filter((c) => c.big)
      .slice(0, 8)
      .forEach((c) => {
        rows += `<div class="lg"><i style="background:${c.color}"></i><span>${esc(c.name)}</span><b>${
          c.members.length
        }</b></div>`;
      });
  } else {
    S.docs.slice(0, 8).forEach((d, i) => {
      rows += `<div class="lg"><i style="background:${pal(i)}"></i><span>${esc(d.title)}</span><b>${
        D.docDeg.get('doc:' + d.id) || 0
      }</b></div>`;
    });
  }
  const hasInf = S.edges.some((e) => e.inferred);
  L.innerHTML = `<div class="lg-h">${{ type: 'Node types', cluster: 'Clusters', source: 'Sources' }[G.colorBy]}</div>${
    rows || '<div class="lg"><span>Nothing yet</span></div>'
  }${
    hasInf
      ? '<div class="lg"><i style="background:transparent;border-top:1px dashed var(--violet);height:1px"></i><span>Suggested link</span><b></b></div>'
      : ''
  }`;
}

export function updateReadout() {
  const el = $('#readout');
  if (!el) return;
  el.innerHTML = `<span>Zoom <b>${Math.round(G.t.k * 100)}%</b></span><span><b>${
    G.nodes.length
  }</b> shown</span><span><b>${
    { force: 'Force', clusters: 'Clusters', radial: 'Radial', timeline: 'Timeline' }[G.layout]
  }</b></span><span class="${G.frozen ? 'frozen' : 'live'}">${G.frozen ? 'Frozen' : 'Live'}</span>`;
}

export function renderBanner({ onRemoveSample, onClearSample }) {
  const S = getVault();
  const b = $('#banner');
  if (!b) return;
  const hasSample = S.docs.some((d) => d.sample) || S.nodes.some((n) => n.sample);
  if (!hasSample) {
    b.hidden = true;
    return;
  }
  const mine = S.docs.some((d) => !d.sample);
  b.innerHTML = `<span class="dot"></span><span>${
    mine ? 'Includes sample sources' : 'Sample vault · 6 example sources'
  }</span>`;
  b.append(
    h(
      'button',
      {
        class: 'btn sm',
        type: 'button',
        onclick: () => (mine ? onRemoveSample() : onClearSample()),
      },
      mine ? 'Remove sample' : 'Clear sample'
    )
  );
  b.hidden = false;
}

export function updateEmpty({ onBrowse, onPaste, onLoadSample }) {
  const S = getVault();
  const e = $('#empty');
  if (!e) return;
  if (S.nodes.length || S.docs.length) {
    e.hidden = true;
    return;
  }
  e.innerHTML = '';
  const box = h('div');
  box.innerHTML = `<div class="kicker">${ico('grid', 12)} Empty vault</div><h2>Feed it what you read</h2><p>Drop notes, PDFs, research papers or photos of handwritten pages. Lattice pulls out the concepts, methods, people and datasets, and wires them into this map. Every new source links to what you already know.</p>`;
  const row = h('div', { class: 'row' });
  const b1 = h('button', { class: 'btn primary', type: 'button', onclick: onBrowse });
  b1.innerHTML = ico('upload') + 'Browse files';
  const b2 = h('button', { class: 'btn', type: 'button', onclick: onPaste });
  b2.innerHTML = ico('paste') + 'Paste text';
  const b3 = h('button', { class: 'btn ghost', type: 'button', onclick: onLoadSample }, 'Load sample vault');
  row.append(b1, b2, b3);
  box.append(row);
  e.append(box);
  e.hidden = false;
}

export function renderControls({ onFit, renderDocsFn }) {
  seg($('#depthSeg'), [['fast', 'Fast'], ['thorough', 'Thorough'], ['deep', 'Deep']], () => G.depth, (v) => {
    G.depth = v;
    persistPrefs();
  });
  seg($('#labelSeg'), [['auto', 'Auto'], ['all', 'All'], ['none', 'Off']], () => G.labels, (v) => {
    G.labels = v;
    G.dirty = true;
    persistPrefs();
  });
  seg($('#colorSeg'), [['type', 'Type'], ['cluster', 'Cluster'], ['source', 'Source']], () => G.colorBy, (v) => {
    G.colorBy = v;
    G.dirty = true;
    renderLegend();
    renderDocsFn();
    persistPrefs();
  });
  seg(
    $('#layoutSeg'),
    [['force', 'Force'], ['clusters', 'Cluster'], ['radial', 'Radial'], ['timeline', 'Time']],
    () => G.layout,
    (v) => {
      G.layout = v;
      applyForces();
      if (!G.frozen) sim.alpha(0.9).restart();
      updateReadout();
      persistPrefs();
      setTimeout(() => onFit(), REDUCED ? 0 : 900);
    }
  );
}

export function updateTimelineLabel() {
  const S = getVault();
  const v = +$('#tl').value;
  const cut = G.timeCut;
  let n = 0;
  for (const x of S.nodes) if ((x.t || 0) <= cut) n++;
  $('#tlLabel').textContent = v >= 1000 || cut === Infinity ? `All · ${n}` : `${fmtDate(cut)} · ${n}`;
}
