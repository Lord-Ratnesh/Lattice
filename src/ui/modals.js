import { $, clip, esc, h, normKey, rid } from '../core/utils.js';
import { ENTITY_TYPES, ico, shapeSvg, TYPES } from '../core/constants.js';
import { addEdge, getVault, IDX, pushUndo } from '../core/state.js';
import { G } from '../graph/engine.js';
import { drawScene } from '../graph/renderer.js';
import { copyText, downloadBlob, exportCSV, exportJSON, exportMD, exportPNG } from '../services/export.js';
import { getAIConfig, testAIConnection, updateAIConfig } from '../services/ai.js';
import { PROVIDER_DEFAULTS } from '../services/storage.js';
import { closeModal, openModal, picker, toast } from './components.js';

export function openPaste(onEnqueueText) {
  const wrap = h('div', { class: 'field' });
  const t = h('input', {
    class: 'inp',
    placeholder: 'Title, e.g. “Lecture 7 — Transformers”',
    'aria-label': 'Title',
  });
  const x = h('textarea', {
    class: 'ta',
    rows: 10,
    placeholder: 'Paste notes, an abstract, a transcript or an article…',
    'aria-label': 'Text to ingest',
  });
  wrap.append(h('label', { class: 'lbl' }, 'Title'), t, h('label', { class: 'lbl' }, 'Text'), x);
  openModal('Paste text', wrap, [
    { label: 'Cancel', kind: 'ghost' },
    {
      label: 'Ingest',
      kind: 'primary',
      fn: () => {
        const v = x.value.trim();
        if (v.length < 40) {
          toast('Paste at least a few sentences.', 'error');
          return false;
        }
        onEnqueueText(t.value.trim() || clip(v.split('\n')[0], 60), v);
      },
    },
  ]);
}

export function openAddNode({ onStructureChanged, onSelect }) {
  const S = getVault();
  const wrap = h('div', { class: 'field' });
  const l = h('input', {
    class: 'inp',
    placeholder: 'Name, e.g. “Contrastive Learning”',
    'aria-label': 'Node name',
  });
  const t = h('select', { class: 'sel', 'aria-label': 'Node type' });
  ENTITY_TYPES.forEach((k) => t.append(h('option', { value: k }, TYPES[k].name)));
  const s = h('textarea', { class: 'ta', rows: 3, placeholder: 'One-line summary (optional)', 'aria-label': 'Summary' });
  wrap.append(
    h('label', { class: 'lbl' }, 'Name'),
    l,
    h('label', { class: 'lbl' }, 'Type'),
    t,
    h('label', { class: 'lbl' }, 'Summary'),
    s
  );
  openModal('Add node', wrap, [
    { label: 'Cancel', kind: 'ghost' },
    {
      label: 'Add node',
      kind: 'primary',
      fn: () => {
        const v = l.value.trim().replace(/\s+/g, ' ');
        if (!v) {
          toast('Give the node a name.', 'error');
          return false;
        }
        const ex = IDX.byKey.get(normKey(v));
        if (ex) {
          toast('That node already exists.', 'error');
          onSelect(IDX.byId.get(ex), { zoom: true });
          return;
        }
        pushUndo('Add ' + v);
        const c = G.t.invert([G.w / 2, G.h / 2]);
        const n = {
          id: rid('n'),
          label: v,
          type: t.value,
          summary: clip(s.value.trim(), 240),
          aliases: [],
          docs: [],
          t: Date.now(),
          mentions: 1,
          note: '',
          pinned: false,
          manual: true,
          x: c[0] + (Math.random() - 0.5) * 40,
          y: c[1] + (Math.random() - 0.5) * 40,
        };
        S.nodes.push(n);
        G.fresh.set(n.id, performance.now());
        onStructureChanged();
        onSelect(n);
        toast('Added ' + v + '. Use Link to connect it.', 'ok');
      },
    },
  ]);
}

export function openLinkModal(a, onStructureChanged) {
  const wrap = h('div', { class: 'field' });
  let target = null;
  wrap.innerHTML = `<p>Connect <b>${esc(a.label)}</b> to another node.</p>`;
  const pf = h('div', { class: 'pfield' });
  const inp = h('input', { class: 'inp', placeholder: 'Search for a node…', 'aria-label': 'Target node' });
  pf.append(inp);
  const lab = h('input', {
    class: 'inp',
    placeholder: 'Relation, e.g. “inspired by”',
    value: 'related to',
    'aria-label': 'Relation label',
  });
  const chosen = h('div', { class: 'muted', style: 'font-size:12px' }, 'No target chosen yet.');
  wrap.append(pf, chosen, h('label', { class: 'lbl' }, 'Relation'), lab);
  openModal('Link nodes', wrap, [
    { label: 'Cancel', kind: 'ghost' },
    {
      label: 'Add link',
      kind: 'primary',
      fn: () => {
        if (!target) {
          toast('Choose a node to link to.', 'error');
          return false;
        }
        pushUndo(`Link ${a.label} → ${target.label}`);
        addEdge(a.id, target.id, clip(lab.value.trim().toLowerCase() || 'related to', 40), null, 2, {
          manual: true,
        });
        onStructureChanged();
        toast('Linked', 'ok');
      },
    },
  ]);
  picker(inp, (b) => {
    if (b === a || b.type === 'source') {
      toast('Pick a different node.', 'error');
      return;
    }
    target = b;
    inp.value = b.label;
    chosen.innerHTML = `Linking to ${shapeSvg(b.type, 10)} <b>${esc(b.label)}</b>`;
    chosen.style.display = 'flex';
    chosen.style.gap = '6px';
    chosen.style.alignItems = 'center';
  });
}

export function openMergeModal(a, onMerge) {
  const wrap = h('div', { class: 'field' });
  wrap.innerHTML = `<p>Fold <b>${esc(
    a.label
  )}</b> into another node. Its links, sources and aliases move over, and its name becomes an alias.</p>`;
  const pf = h('div', { class: 'pfield' });
  const inp = h('input', { class: 'inp', placeholder: 'Search for the node to keep…', 'aria-label': 'Node to merge into' });
  pf.append(inp);
  wrap.append(pf);
  openModal('Merge node', wrap, [{ label: 'Cancel', kind: 'ghost' }]);
  picker(inp, (b) => {
    if (b === a || b.type === 'source') {
      toast('Pick a different node.', 'error');
      return;
    }
    closeModal();
    onMerge(a, b);
  });
}

export function openExport({ onImportData, onClearVault }) {
  const wrap = h('div', { style: 'display:flex;flex-direction:column;gap:8px' });
  const opt = (icon, title, sub, ext, fn) => {
    const b = h('button', { class: 'opt', type: 'button', onclick: fn });
    b.innerHTML = `<span class="oi">${ico(icon, 15)}</span><span><b>${title}</b><span>${sub}</span></span><em>${ext}</em>`;
    return b;
  };
  const stamp = new Date().toISOString().slice(0, 10);
  wrap.append(
    opt('download', 'Full vault backup', 'Every node, link, note and source text. Re-import any time.', '.JSON', () => {
      downloadBlob(`lattice-vault-${stamp}.json`, exportJSON(), 'application/json;charset=utf-8');
      toast('Saved JSON backup', 'ok');
    }),
    opt('doc', 'Linked notes', 'One Markdown file with [[wiki links]], ready for Obsidian or Notion.', '.MD', () => {
      downloadBlob(`lattice-notes-${stamp}.md`, exportMD(), 'text/markdown;charset=utf-8');
      toast('Saved Markdown notes', 'ok');
    }),
    opt('image', 'Graph snapshot', 'The current view at 2× resolution, for a portfolio or slide.', '.PNG', async () => {
      const b = await exportPNG(drawScene, G);
      if (b) {
        downloadBlob(`lattice-graph-${stamp}.png`, b, 'image/png');
        toast('Saved PNG snapshot', 'ok');
      }
    }),
    opt('grid', 'Edge list', 'Source, relation, target and weight for each link.', '.CSV', () => {
      downloadBlob(`lattice-edges-${stamp}.csv`, exportCSV(), 'text/csv;charset=utf-8');
      toast('Saved CSV edge list', 'ok');
    })
  );
  const fin = h('input', {
    type: 'file',
    accept: '.json,application/json',
    hidden: true,
    onchange: async (e) => {
      const f = e.target.files[0];
      if (!f) return;
      try {
        const data = JSON.parse(await f.text());
        if (!data || !Array.isArray(data.nodes) || !Array.isArray(data.edges)) throw new Error('bad');
        onImportData(data);
        closeModal();
      } catch {
        toast('That file isn’t a Lattice vault export.', 'error');
      }
    },
  });
  wrap.append(
    fin,
    opt('upload', 'Import a vault', 'Replace this vault with a Lattice .json export. Undo restores it.', 'IMPORT', () =>
      fin.click()
    )
  );
  openModal('Export & import', wrap, [
    {
      label: 'Clear vault',
      kind: 'danger ghost',
      fn: () => {
        setTimeout(() => onClearVault(false), 0);
      },
    },
    { label: 'Done', kind: '' },
  ]);
}

export function openHelp() {
  openModal(
    'How Lattice works',
    `
  <ol class="steps">
    <li><b>1 · Read</b>PDFs, Word, Markdown, HTML and text are parsed directly in your browser. Photos can be transcribed by vision AI.</li>
    <li><b>2 · Chunk</b>Long sources are split into sections so each one is read closely.</li>
    <li><b>3 · Extract</b>Your configured AI provider (or on-device keyword extractor) pulls out concepts, methods, people, artifacts, fields, and relations.</li>
    <li><b>4 · Resolve</b>New names are matched against your existing nodes and aliases, so “RAG” and “Retrieval-Augmented Generation” become one node.</li>
    <li><b>5 · Link</b>Each source becomes a node wired to the ideas it mentions. Clusters are found with Louvain community detection.</li>
    <li><b>6 · Ask</b>Questions retrieve the closest nodes and passages, and answers cite them back to the graph.</li>
  </ol>
  <div class="sub-h" style="margin:4px 0 0"><span>Keyboard</span></div>
  <div class="keys">
    <div><kbd>/</kbd>Search</div><div><kbd>F</kbd>Fit graph</div>
    <div><kbd>1–4</kbd>Switch panels</div><div><kbd>Esc</kbd>Clear selection or path</div>
    <div><kbd>L</kbd>Cycle labels</div><div><kbd>C</kbd>Cycle colors</div>
    <div><kbd>D</kbd>Show or hide sources</div><div><kbd>Space</kbd>Freeze physics</div>
    <div><kbd>P</kbd>Pin selected</div><div><kbd>R</kbd>Replay growth</div>
    <div><kbd>Del</kbd>Delete selected</div><div><kbd>Ctrl Z</kbd>Undo</div>
  </div>
  <p style="font-size:12px">Your vault is persisted locally in your browser via IndexedDB. Connect Claude, OpenAI, Gemini, or local Ollama anytime in AI Settings for LLM-powered extraction and Q&A.</p>`,
    [{ label: 'Got it', kind: 'primary' }]
  );
}

export function openAISettings(onUpdated) {
  const cfg = getAIConfig();
  const wrap = h('div', { class: 'field', style: 'gap:10px' });

  const provSel = h('select', { class: 'sel', 'aria-label': 'AI Provider' });
  [
    ['none', 'On-Device Only (No API key required)'],
    ['anthropic', 'Anthropic Claude (Messages API)'],
    ['openai', 'OpenAI / OpenAI-Compatible'],
    ['gemini', 'Google Gemini (REST API)'],
    ['ollama', 'Ollama (Local server, no key)'],
  ].forEach(([val, label]) => {
    const opt = h('option', { value: val, selected: cfg.provider === val }, label);
    provSel.append(opt);
  });

  const keyIn = h('input', {
    class: 'inp',
    type: 'password',
    value: cfg.apiKey || '',
    placeholder: 'Paste your API key (stored only in this browser)',
    autocomplete: 'off',
  });
  const urlIn = h('input', {
    class: 'inp',
    value: cfg.baseUrl || '',
    placeholder: 'Custom endpoint URL (leave blank for default)',
  });
  const modelIn = h('input', {
    class: 'inp',
    value: cfg.modelDefault || '',
    placeholder: 'Model name (leave blank for default)',
  });

  const hintEl = h('div', { class: 'ai-hint' });
  const fieldsBox = h('div', { class: 'field', style: 'gap:8px' });
  const testStatus = h('div', { style: 'min-height:18px' });

  const syncFields = () => {
    const p = provSel.value;
    const defs = PROVIDER_DEFAULTS[p];
    fieldsBox.hidden = p === 'none';
    keyIn.parentElement.hidden = p === 'ollama' || p === 'none';
    urlIn.placeholder = defs.baseUrl || '';
    modelIn.placeholder = defs.modelDefault ? `Default: ${defs.modelDefault}` : '';
    if (p === 'none') {
      hintEl.innerHTML =
        '<b>On-Device mode:</b> Zero network requests. Extraction uses phrase & co-occurrence mining, Ask uses BM25 passage retrieval, and Insights use graph topology heuristics.';
    } else if (p === 'anthropic') {
      hintEl.innerHTML =
        'Calls <code>api.anthropic.com</code> directly from your browser. Supports text extraction, streaming Q&A, and photo transcription.';
    } else if (p === 'openai') {
      hintEl.innerHTML =
        'Works with OpenAI, OpenRouter, Groq, or any OpenAI-compatible <code>/v1/chat/completions</code> endpoint. Supports vision models.';
    } else if (p === 'gemini') {
      hintEl.innerHTML =
        'Calls Google Gemini REST API directly using your Gemini API key. Supports text and image note transcription.';
    } else if (p === 'ollama') {
      hintEl.innerHTML =
        'Connects to a local Ollama server (default <code>http://localhost:11434/v1/chat/completions</code>). Ensure <code>OLLAMA_ORIGINS=*</code> is set if running in browser.';
    }
  };

  fieldsBox.append(
    h('div', { class: 'field' }, h('label', { class: 'lbl' }, 'API Key'), keyIn),
    h('div', { class: 'field' }, h('label', { class: 'lbl' }, 'Endpoint URL (optional)'), urlIn),
    h('div', { class: 'field' }, h('label', { class: 'lbl' }, 'Model (optional)'), modelIn)
  );

  const testBtn = h('button', {
    class: 'btn sm',
    type: 'button',
    onclick: async () => {
      updateAIConfig({
        provider: provSel.value,
        apiKey: keyIn.value.trim(),
        baseUrl: urlIn.value.trim(),
        modelDefault: modelIn.value.trim(),
      });
      if (provSel.value === 'none') {
        testStatus.innerHTML = '<span class="ai-status-ok">On-device mode active.</span>';
        return;
      }
      testBtn.disabled = true;
      testStatus.innerHTML = '<span class="muted">Testing connection…</span>';
      try {
        const reply = await testAIConnection();
        testStatus.innerHTML = `<span class="ai-status-ok">Connected · reply: ${esc(clip(reply, 40))}</span>`;
      } catch (err) {
        testStatus.innerHTML = `<span class="ai-status-err">${esc(err?.message || err?.code || 'Connection failed')}</span>`;
      } finally {
        testBtn.disabled = false;
      }
    },
  }, 'Test connection');

  fieldsBox.append(h('div', { class: 'row' }, testBtn, testStatus));
  provSel.addEventListener('change', syncFields);
  wrap.append(h('div', { class: 'field' }, h('label', { class: 'lbl' }, 'Provider'), provSel), hintEl, fieldsBox);
  syncFields();

  openModal('AI Provider Settings', wrap, [
    { label: 'Cancel', kind: 'ghost' },
    {
      label: 'Save settings',
      kind: 'primary',
      fn: () => {
        updateAIConfig({
          provider: provSel.value,
          apiKey: keyIn.value.trim(),
          baseUrl: urlIn.value.trim(),
          modelDefault: modelIn.value.trim(),
        });
        onUpdated?.();
        toast('AI settings saved', 'ok');
      },
    },
  ]);
}

export { copyText };
