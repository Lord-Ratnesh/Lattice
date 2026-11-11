import './styles/main.css';
import * as d3 from 'd3';
import { $, clip, fmtDate } from './core/utils.js';
import { REDUCED, TYPE_ORDER } from './core/constants.js';
import { buildSampleVault } from './core/sampleVault.js';
import {
  clearUndo,
  D,
  DOCN,
  dropDocs,
  getVault,
  hydrate,
  IDX,
  mergeNodesInVault,
  nodeById,
  popUndo,
  pushUndo,
  reindex,
  derive,
  serialize,
  setUndoListener,
  setVault,
  TEXTS,
} from './core/state.js';
import { matchNodes } from './core/retrieval.js';
import {
  G,
  persistPrefs,
  rebuild,
  setEngineListeners,
  sim,
  tlBounds,
} from './graph/engine.js';
import { resizeCanvas, startRenderLoop } from './graph/renderer.js';
import { setupInteraction } from './graph/interaction.js';
import { createIngestRunner, ING } from './services/ingest.js';
import {
  loadVaultStorage,
  resetTextSig,
  saveVaultStorage,
  saveVaultSyncBackup,
} from './services/storage.js';
import { getAIProviderLabel, isAIConfigured, onAIConfigChange } from './services/ai.js';
import { onTtsState } from './services/speech.js';
import { closeModal, confirmModal, hydrateIcons, isModalOpen, log, picker, seg, toast } from './ui/components.js';
import {
  renderBanner,
  renderControls,
  renderDocs,
  renderLegend,
  renderTop,
  renderTypeChips,
  setSync,
  updateAIStatusUI,
  updateEmpty,
  updateIngestUI,
  updateReadout,
  updateTimelineLabel,
  updateUndo,
} from './ui/chrome.js';
import { renderInspector, updateSpeakButtons } from './ui/inspector.js';
import { initAskForm, renderAskIntro } from './ui/ask.js';
import { clearPath, renderPathPane, renderPathResult, setPathEnd } from './ui/path.js';
import { renderInsights } from './ui/insights.js';
import {
  openAddNode,
  openAISettings,
  openExport,
  openHelp,
  openLinkModal,
  openMergeModal,
  openPaste,
} from './ui/modals.js';

hydrateIcons();

const stage = $('#stage');
const cv = $('#cv');
const mini = $('#mini');
const tip = $('#tip');
const ctxEl = $('#ctxmenu');
const searchIn = $('#search');

/* ---------- persistence ---------- */
let saveTimer = null;
let saving = false;
let saveAgain = false;

async function saveNow() {
  const S = getVault();
  if (!S || S.pristine) return;
  if (saving) {
    saveAgain = true;
    return;
  }
  saving = true;
  try {
    do {
      saveAgain = false;
      const data = serialize();
      setSync('saving');
      const backend = await saveVaultStorage(data, TEXTS);
      setSync(backend);
    } while (saveAgain);
  } catch {
    setSync('local');
  } finally {
    saving = false;
  }
}

function scheduleSave() {
  const S = getVault();
  if (!S || S.pristine) return;
  clearTimeout(saveTimer);
  saveTimer = setTimeout(saveNow, 1300);
}

window.addEventListener('pagehide', () => {
  const S = getVault();
  if (S && !S.pristine) saveVaultSyncBackup(serialize(), TEXTS);
});

/* ---------- navigation & actions ---------- */
const TABS = ['inspect', 'ask', 'path', 'insights'];
let interaction = null;

function showTab(name) {
  for (const t of TABS) {
    $('#tab-' + t).setAttribute('aria-selected', String(t === name));
    $('#pane-' + t).hidden = t !== name;
  }
  if (name === 'insights') renderInsights(actions);
  if (name === 'path') renderPathPane(interaction.fitView);
  if (name === 'ask') renderAskIntro(interaction.fitView);
}

document.querySelectorAll('.tab').forEach((b) =>
  b.addEventListener('click', () => showTab(b.dataset.tab))
);

function select(n, opts = {}) {
  G.sel = n || null;
  G.dirty = true;
  if (n && opts.tab !== false) showTab('inspect');
  renderInspector(actions);
  if (n && opts.zoom) interaction.zoomToNode(n);
}

function renderHopSeg() {
  seg(
    $('#hopSeg'),
    [[1, '1 hop'], [2, '2 hops']],
    () => G.focusHops,
    (v) => {
      G.focusHops = v;
      rebuild(0.6);
      setTimeout(() => interaction.fitView(G.nodes, 80), 400);
    }
  );
}

function enterFocus(n, hops) {
  G.focus = n;
  G.focusHops = hops || G.focusHops || 1;
  G.sel = n;
  $('#focusName').textContent = n.label;
  $('#focusbar').hidden = false;
  renderHopSeg();
  rebuild(0.7);
  renderInspector(actions);
  showTab('inspect');
  setTimeout(() => interaction.fitView(G.nodes, 80), REDUCED ? 0 : 450);
}

function exitFocus() {
  if (!G.focus) return;
  G.focus = null;
  $('#focusbar').hidden = true;
  rebuild(0.4);
  setTimeout(() => interaction.fitView(), REDUCED ? 0 : 400);
}

$('#focusExit').onclick = exitFocus;

function togglePin(n) {
  const S = getVault();
  n.pinned = !n.pinned;
  if (n.pinned) {
    n.fx = n.x;
    n.fy = n.y;
  } else {
    n.fx = null;
    n.fy = null;
  }
  S.pristine = false;
  scheduleSave();
  renderInspector(actions);
  G.dirty = true;
  toast(n.pinned ? `Pinned ${n.label}` : `Unpinned ${n.label}`);
}

function deleteNode(n) {
  const S = getVault();
  const deg = D.deg.get(n.id) || 0;
  confirmModal(
    `Delete “${n.label}”?`,
    `This removes the node and its ${deg} link${deg === 1 ? '' : 's'}. You can undo with Ctrl+Z.`,
    'Delete',
    () => {
      pushUndo('Delete ' + n.label);
      S.nodes = S.nodes.filter((x) => x !== n);
      S.edges = S.edges.filter((e) => e.s !== n.id && e.t !== n.id);
      if (G.sel === n) G.sel = null;
      if (G.focus === n) {
        G.focus = null;
        $('#focusbar').hidden = true;
      }
      structureChanged();
      toast('Deleted ' + n.label);
    }
  );
}

function mergeNodes(a, b) {
  pushUndo(`Merge ${a.label} into ${b.label}`);
  mergeNodesInVault(a, b);
  G.sel = b;
  if (G.focus === a) G.focus = b;
  structureChanged();
  toast(`Merged into ${b.label}`, 'ok');
}

function removeDoc(d) {
  if (!d) return;
  const S = getVault();
  const only = S.nodes.filter((n) => n.docs.length === 1 && n.docs[0] === d.id && !n.manual).length;
  confirmModal(
    `Remove “${clip(d.title, 60)}”?`,
    `Nodes found only in this source are removed too (${only}). Nodes shared with other sources stay. You can undo with Ctrl+Z.`,
    'Remove source',
    () => {
      pushUndo('Remove ' + d.title);
      dropDocs(new Set([d.id]));
      structureChanged();
      toast('Removed ' + clip(d.title, 50));
    }
  );
}

function removeSample() {
  const S = getVault();
  pushUndo('Remove sample');
  const ids = new Set(S.docs.filter((d) => d.sample).map((d) => d.id));
  dropDocs(ids);
  S.nodes.forEach((n) => { delete n.sample; });
  S.edges.forEach((e) => { delete e.sample; });
  S.sample = false;
  S.origin = 'mine';
  structureChanged({ reheat: 0.6 });
  setTimeout(() => interaction.fitView(), REDUCED ? 0 : 600);
  toast('Sample removed. Your sources stay.', 'ok');
}

function clearVault(fromSample) {
  const go = () => {
    pushUndo(fromSample ? 'Clear sample' : 'Clear vault');
    TEXTS.clear();
    setVault({ v: 1, sample: false, pristine: false, origin: 'mine', updatedAt: Date.now(), docs: [], nodes: [], edges: [] });
    DOCN.clear();
    G.sel = null;
    G.path = null;
    G.focus = null;
    $('#focusbar').hidden = true;
    structureChanged();
    toast(fromSample ? 'Sample cleared. Drop in your first source.' : 'Vault cleared. Undo with Ctrl+Z.');
  };
  if (fromSample) go();
  else confirmModal('Clear the whole vault?', 'Every node, link and source is removed. You can undo with Ctrl+Z.', 'Clear vault', go);
}

function loadSampleAgain() {
  pushUndo('Load sample');
  TEXTS.clear();
  const s = buildSampleVault(TEXTS);
  s.pristine = false;
  setVault(s);
  DOCN.clear();
  reindex();
  derive();
  rebuild(1);
  sim.tick(160);
  renderAll();
  interaction.fitView(G.nodes, 70, 0);
  scheduleSave();
}

function applyLoaded(data, texts, origin) {
  const S = hydrate(data);
  S.origin = origin || S.origin;
  setVault(S);
  if (texts) {
    TEXTS.clear();
    for (const [k, v] of Object.entries(texts)) {
      if (typeof v === 'string') TEXTS.set(k, v);
    }
  }
  DOCN.clear();
  G.sel = null;
  G.path = null;
  G.focus = null;
  $('#focusbar').hidden = true;
  reindex();
  derive();
  rebuild(0.9);
  const unplaced = S.nodes.filter((n) => n.x == null).length;
  if (unplaced > S.nodes.length * 0.3) sim.tick(180);
  renderAll();
  interaction.fitView(G.nodes, 70, 0);
}

function undo() {
  if (ING.running) {
    toast('Wait for the current import to finish, then undo.');
    return;
  }
  const u = popUndo();
  if (!u) {
    toast('Nothing to undo');
    return;
  }
  const S = getVault();
  const data = JSON.parse(u.snap);
  const origin = S.origin;
  const restored = hydrate(data);
  restored.origin = origin;
  setVault(restored);
  if (u.texts) {
    TEXTS.clear();
    for (const [k, v] of Object.entries(u.texts)) TEXTS.set(k, v);
  }
  DOCN.clear();
  G.sel = null;
  G.path = null;
  if (G.focus) {
    G.focus = null;
    $('#focusbar').hidden = true;
  }
  structureChanged({ reheat: 0.3 });
  toast('Undid: ' + u.label);
}

$('#undoBtn').onclick = undo;
setUndoListener(updateUndo);

function renderAll() {
  renderTop();
  renderDocs(actions);
  renderTypeChips();
  renderLegend();
  renderBanner({ onRemoveSample: removeSample, onClearSample: () => clearVault(true) });
  updateEmpty({
    onBrowse: () => $('#fileIn').click(),
    onPaste: () => openPaste((title, text) => ingestRunner.enqueueText(title, text)),
    onLoadSample: loadSampleAgain,
  });
  renderInspector(actions);
  updateTimelineLabel();
  updateUndo();
  if (!$('#pane-insights').hidden) renderInsights(actions);
  if (!$('#pane-path').hidden) renderPathResult();
}

function structureChanged({ reheat = 0.35, save = true } = {}) {
  const S = getVault();
  S.pristine = false;
  S.updatedAt = Date.now();
  reindex();
  derive();
  if (G.sel && !(G.sel.type === 'source' ? IDX.doc.has(G.sel.docId) : IDX.byId.has(G.sel.id))) G.sel = null;
  if (G.focus && !(G.focus.type === 'source' ? IDX.doc.has(G.focus.docId) : IDX.byId.has(G.focus.id))) {
    G.focus = null;
    $('#focusbar').hidden = true;
  }
  if (G.path && G.path.seq.some((id) => !nodeById(id))) G.path = null;
  for (const id of [...DOCN.keys()]) if (!IDX.doc.has(id)) DOCN.delete(id);
  rebuild(reheat);
  renderAll();
  if (save) scheduleSave();
}

const actions = {
  select,
  enterFocus,
  removeDoc,
  setPathEnd: (which, n) => setPathEnd(which, n, showTab, interaction.fitView),
  togglePin,
  openLinkModal: (n) => openLinkModal(n, structureChanged),
  openMergeModal: (n) => openMergeModal(n, mergeNodes),
  deleteNode,
  structureChanged,
  scheduleSave,
  fitView: (...args) => interaction.fitView(...args),
  renderControls: () => renderControls({ onFit: () => interaction.fitView(), renderDocsFn: () => renderDocs(actions) }),
  renderLegend,
  enqueueText: (title, text, replace) => ingestRunner.enqueueText(title, text, replace),
};

/* ---------- ingest runner ---------- */
const ingestRunner = createIngestRunner({
  getDepth: () => G.depth,
  log,
  toast,
  viewCenter: () => G.t.invert([G.w / 2, G.h / 2]),
  ensureSourceVisible: () => {
    if (!G.typeOn.source) G.typeOn.source = true;
  },
  markFresh: (id, ts) => G.fresh.set(id, ts),
  structureChanged,
  renderDocs: () => renderDocs(actions),
  scheduleSave,
  enterFocus,
  updateIngestUI,
  markDirty: () => {
    G.dirty = true;
  },
});

$('#stopIngest').onclick = () => ingestRunner.stop();
$('#browseBtn').onclick = () => $('#fileIn').click();
$('#ingestBtn').onclick = () => $('#fileIn').click();
$('#pasteBtn').onclick = () => openPaste((title, text) => ingestRunner.enqueueText(title, text));
$('#fileIn').onchange = (e) => {
  ingestRunner.enqueueFiles(e.target.files);
  e.target.value = '';
};

const dropEl = $('#drop');
const veil = $('#dropveil');
let dragDepth = 0;
const hasFiles = (e) => e.dataTransfer && [...(e.dataTransfer.types || [])].includes('Files');

window.addEventListener('dragenter', (e) => {
  if (!hasFiles(e)) return;
  e.preventDefault();
  dragDepth++;
  veil.hidden = false;
  dropEl.classList.add('over');
});
window.addEventListener('dragover', (e) => {
  if (!hasFiles(e)) return;
  e.preventDefault();
  e.dataTransfer.dropEffect = 'copy';
});
window.addEventListener('dragleave', (e) => {
  if (!hasFiles(e)) return;
  dragDepth = Math.max(0, dragDepth - 1);
  if (!dragDepth) {
    veil.hidden = true;
    dropEl.classList.remove('over');
  }
});
window.addEventListener('drop', (e) => {
  if (!hasFiles(e)) return;
  e.preventDefault();
  dragDepth = 0;
  veil.hidden = true;
  dropEl.classList.remove('over');
  ingestRunner.enqueueFiles(e.dataTransfer.files);
});

document.addEventListener('paste', (e) => {
  const tg = e.target;
  if (/^(INPUT|TEXTAREA)$/.test(tg.tagName) || tg.isContentEditable) return;
  const files = [...(e.clipboardData?.files || [])];
  if (files.length) {
    e.preventDefault();
    ingestRunner.enqueueFiles(files);
    return;
  }
  const txt = e.clipboardData?.getData('text/plain') || '';
  if (txt.trim().length > 200) {
    e.preventDefault();
    ingestRunner.enqueueText(clip(txt.trim().split('\n')[0], 60), txt);
    toast('Ingesting pasted text');
  }
});

/* ---------- interaction & engine wiring ---------- */
setEngineListeners({
  onEnd: () => {
    const S = getVault();
    if (S && !S.pristine) scheduleSave();
  },
  onReadout: updateReadout,
});

interaction = setupInteraction({
  cv,
  mini,
  tip,
  ctxEl,
  onSelect: select,
  onEnterFocus: enterFocus,
  onRemoveDoc: removeDoc,
  onSetPathEnd: (which, n) => setPathEnd(which, n, showTab, interaction.fitView),
  onTogglePin: togglePin,
  onOpenLinkModal: (n) => openLinkModal(n, structureChanged),
  onOpenMergeModal: (n) => openMergeModal(n, mergeNodes),
  onDeleteNode: deleteNode,
  onSaveMoved: () => {
    const S = getVault();
    if (S && !S.pristine) scheduleSave();
  },
  onReadout: updateReadout,
});

$('#zIn').onclick = () => interaction.zoomBy(1.4);
$('#zOut').onclick = () => interaction.zoomBy(1 / 1.4);
$('#zFit').onclick = () => interaction.fitView();
$('#fitBtn2').onclick = () => interaction.fitView();
$('#legendBtn').onclick = () => $('#legend').classList.toggle('open');

$('#addNodeBtn').onclick = () => openAddNode({ onStructureChanged: structureChanged, onSelect: select });
$('#exportBtn').onclick = () =>
  openExport({
    onImportData: (data) => {
      pushUndo('Import vault');
      const texts = data.texts || {};
      applyLoaded({ ...data, sample: false, origin: 'mine' }, texts, 'mine');
      const S = getVault();
      S.pristine = false;
      S.updatedAt = Date.now();
      resetTextSig();
      scheduleSave();
      toast(`Imported ${data.nodes.length} nodes`, 'ok');
    },
    onClearVault: clearVault,
  });
$('#helpBtn').onclick = openHelp;

const openSettingsModal = () =>
  openAISettings(() => {
    updateAIStatusUI(openSettingsModal);
    if (!$('#pane-insights').hidden) renderInsights(actions);
    renderInspector(actions);
  });
$('#aiSettingsBtn').onclick = openSettingsModal;

onAIConfigChange(() => {
  updateAIStatusUI(openSettingsModal);
});

onTtsState(() => {
  updateSpeakButtons();
});

/* ---------- search + global node chip navigation ---------- */
picker(
  searchIn,
  (n) => {
    select(n, { zoom: true });
    searchIn.blur();
  },
  {
    includeDocs: true,
    onInput: (v) => {
      const q = v.trim();
      if (q.length >= 2) {
        const m = matchNodes(q, 60, true, (d) => nodeById('doc:' + d.id));
        G.qMatch = m.length ? new Set(m.map((x) => x.n.id)) : null;
      } else {
        G.qMatch = null;
      }
      G.dirty = true;
    },
  }
);
searchIn.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    searchIn.value = '';
    G.qMatch = null;
    G.dirty = true;
    searchIn.blur();
  }
});

document.addEventListener('click', (e) => {
  const c = e.target.closest('[data-node]');
  if (!c) return;
  const n = nodeById(c.dataset.node);
  if (n) {
    if (!G.visIds.has(n.id)) {
      if (G.focus) exitFocus();
      G.typeOn[n.type] = true;
      G.minDeg = 0;
      $('#minDeg').value = 0;
      $('#minDegVal').textContent = '0';
      G.timeCut = Infinity;
      $('#tl').value = 1000;
      renderTypeChips();
      rebuild(0.3);
    }
    select(n, {
      zoom: true,
      tab: c.closest('#pane-ask,#pane-path,#pane-insights') ? false : undefined,
    });
  }
});

/* ---------- filters & controls ---------- */
$('#minDeg').addEventListener('input', (e) => {
  G.minDeg = +e.target.value;
  $('#minDegVal').textContent = G.minDeg;
  rebuild(0.3);
});

$('#resetFilters').onclick = () => {
  for (const k of TYPE_ORDER) G.typeOn[k] = true;
  G.minDeg = 0;
  $('#minDeg').value = 0;
  $('#minDegVal').textContent = '0';
  G.timeCut = Infinity;
  $('#tl').value = 1000;
  updateTimelineLabel();
  if (G.focus) {
    G.focus = null;
    $('#focusbar').hidden = true;
  }
  renderTypeChips();
  rebuild(0.4);
};

function toggleFreeze() {
  G.frozen = !G.frozen;
  const b = $('#freezeBtn');
  b.setAttribute('aria-pressed', String(G.frozen));
  if (G.frozen) sim.stop();
  else sim.alpha(0.3).restart();
  updateReadout();
}

$('#freezeBtn').onclick = toggleFreeze;
$('#reheatBtn').onclick = () => {
  if (G.frozen) toggleFreeze();
  for (const n of G.nodes) {
    n.vx = (Math.random() - 0.5) * 6;
    n.vy = (Math.random() - 0.5) * 6;
  }
  sim.alpha(1).restart();
};

/* ---------- timeline + replay ---------- */
function cutFor(v) {
  const b = tlBounds();
  if (!b || v >= 1000) return Infinity;
  return b.min + ((b.max - b.min) * v) / 1000;
}

function applyTimeline(v) {
  const S = getVault();
  const cut = cutFor(v);
  const before = G.timeCut;
  G.timeCut = cut;
  let changed = false;
  for (const n of S.nodes) {
    const a = (n.t || 0) <= before;
    const b = (n.t || 0) <= cut;
    if (a !== b) {
      changed = true;
      if (b) G.fresh.set(n.id, performance.now());
    }
  }
  for (const d of S.docs) {
    const a = (d.addedAt || 0) <= before;
    const b = (d.addedAt || 0) <= cut;
    if (a !== b) changed = true;
  }
  if (changed) rebuild(0.45);
  updateTimelineLabel();
}

$('#tl').addEventListener('input', (e) => {
  if (G.replay) stopReplay();
  applyTimeline(+e.target.value);
});

function stopReplay() {
  G.replay = null;
  $('#replayBtn').innerHTML = '<svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="square" stroke-linejoin="miter" aria-hidden="true"><path d="M4.5 2.5l8 5.5-8 5.5z"/></svg>';
  $('#replayBtn').setAttribute('aria-label', 'Replay growth');
}

function stepReplay(now) {
  const r = G.replay;
  const p = Math.min(1, (now - r.start) / r.dur);
  const v = Math.round(p * 1000);
  $('#tl').value = v;
  applyTimeline(v);
  if (p >= 1) stopReplay();
}

function toggleReplay() {
  const S = getVault();
  if (G.replay) {
    stopReplay();
    return;
  }
  const b = tlBounds();
  if (!b || b.min === b.max) {
    toast('Add sources on different days to replay how your graph grew.');
    return;
  }
  if (G.focus) {
    G.focus = null;
    $('#focusbar').hidden = true;
  }
  G.sel = null;
  G.path = null;
  G.replay = { start: performance.now(), dur: REDUCED ? 1 : 9000 };
  $('#tl').value = 0;
  applyTimeline(0);
  $('#replayBtn').innerHTML = '<svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="square" stroke-linejoin="miter" aria-hidden="true"><path d="M5 3v10M11 3v10"/></svg>';
  $('#replayBtn').setAttribute('aria-label', 'Pause replay');
  setTimeout(
    () => interaction.fitView(S.nodes.length ? [...S.nodes, ...S.docs.map((d) => nodeById('doc:' + d.id))] : G.nodes, 70),
    50
  );
}

$('#replayBtn').onclick = toggleReplay;

/* ---------- keyboard shortcuts ---------- */
document.addEventListener('keydown', (e) => {
  const tg = e.target;
  const typing = /^(INPUT|TEXTAREA|SELECT)$/.test(tg.tagName) || tg.isContentEditable;
  if (e.key === 'Escape') {
    if (isModalOpen()) {
      e.preventDefault();
      closeModal();
      return;
    }
    if (!ctxEl.hidden) {
      e.preventDefault();
      interaction.closeCtx();
      return;
    }
    if (typing) {
      tg.blur();
      return;
    }
    if (G.replay) {
      stopReplay();
      return;
    }
    if (G.path) {
      clearPath();
      return;
    }
    if (G.glow) {
      G.glow = null;
      G.dirty = true;
      return;
    }
    if (G.focus) {
      exitFocus();
      return;
    }
    if (G.sel) {
      select(null, { tab: false });
      return;
    }
    if (G.qMatch) {
      G.qMatch = null;
      searchIn.value = '';
      G.dirty = true;
    }
    return;
  }
  if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
    e.preventDefault();
    searchIn.focus();
    return;
  }
  if ((e.metaKey || e.ctrlKey) && !e.shiftKey && e.key.toLowerCase() === 'z' && !typing) {
    e.preventDefault();
    undo();
    return;
  }
  if (typing || e.metaKey || e.ctrlKey || e.altKey || isModalOpen()) return;
  if (tg.tagName === 'BUTTON' && (e.key === ' ' || e.key === 'Enter')) return;

  switch (e.key) {
    case '/':
      e.preventDefault();
      searchIn.focus();
      break;
    case 'f':
    case 'F':
      interaction.fitView();
      break;
    case 'l':
    case 'L': {
      const o = ['auto', 'all', 'none'];
      G.labels = o[(o.indexOf(G.labels) + 1) % 3];
      renderControls({ onFit: () => interaction.fitView(), renderDocsFn: () => renderDocs(actions) });
      G.dirty = true;
      persistPrefs();
      toast('Labels: ' + { auto: 'auto', all: 'all', none: 'off' }[G.labels]);
      break;
    }
    case 'c':
    case 'C': {
      const o = ['type', 'cluster', 'source'];
      G.colorBy = o[(o.indexOf(G.colorBy) + 1) % 3];
      renderControls({ onFit: () => interaction.fitView(), renderDocsFn: () => renderDocs(actions) });
      renderLegend();
      renderDocs(actions);
      G.dirty = true;
      persistPrefs();
      toast('Color by ' + G.colorBy);
      break;
    }
    case 'd':
    case 'D':
      G.typeOn.source = !G.typeOn.source;
      renderTypeChips();
      rebuild(0.3);
      break;
    case ' ':
      e.preventDefault();
      toggleFreeze();
      break;
    case 'p':
    case 'P':
      if (G.sel && G.sel.type !== 'source') togglePin(G.sel);
      break;
    case 'r':
    case 'R':
      toggleReplay();
      break;
    case '?':
      openHelp();
      break;
    case '1':
    case '2':
    case '3':
    case '4':
      showTab(TABS[+e.key - 1]);
      break;
    case 'Delete':
    case 'Backspace':
      if (G.sel) {
        e.preventDefault();
        if (G.sel.type === 'source') removeDoc(IDX.doc.get(G.sel.docId));
        else deleteNode(G.sel);
      }
      break;
  }
});

/* ---------- boot ---------- */
resizeCanvas(stage, cv);
new ResizeObserver(() => {
  const oldW = G.w;
  const oldH = G.h;
  resizeCanvas(stage, cv);
  if (oldW > 1 && (Math.abs(oldW - G.w) > 1 || Math.abs(oldH - G.h) > 1)) {
    G.t = G.t.translate((G.w - oldW) / 2 / G.t.k, (G.h - oldH) / 2 / G.t.k);
    d3.select(cv).property('__zoom', G.t);
  }
}).observe(stage);

renderControls({ onFit: () => interaction.fitView(), renderDocsFn: () => renderDocs(actions) });
initAskForm((...args) => interaction.fitView(...args));
updateAIStatusUI(openSettingsModal);
updateIngestUI();

// Start immediately with sample vault, then asynchronously upgrade from IndexedDB if stored
const initialSample = buildSampleVault(TEXTS);
setVault(initialSample);
reindex();
derive();
rebuild(1);
sim.tick(220);
renderAll();
interaction.centerOrigin();
interaction.fitView(G.nodes, 60, 0);
setSync('idle');

startRenderLoop(cv, mini, stepReplay);

(async () => {
  setSync('loading');
  const stored = await loadVaultStorage();
  if (stored && stored.data && Array.isArray(stored.data.nodes)) {
    clearUndo();
    applyLoaded(stored.data, stored.texts, stored.data.origin);
    const S = getVault();
    S.pristine = false;
    setSync(stored.backend);
    log(`Restored ${S.nodes.length} nodes from ${stored.backend === 'indexeddb' ? 'IndexedDB' : 'browser storage'}`);
  } else {
    setSync('idle');
    const S = getVault();
    log('Loaded the sample vault: 6 sources, ' + S.nodes.length + ' nodes');
  }
  if (isAIConfigured()) {
    log(`AI provider ready: ${getAIProviderLabel()}`, 'ok');
  } else {
    log('Running in on-device mode (connect an AI key anytime in top bar)', 'warn');
  }
})();
