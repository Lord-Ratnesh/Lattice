import { $, $$, clip, debounce, esc, fmtDate, fmtNum, h, normKey } from '../core/utils.js';
import { ENTITY_TYPES, ico, shapeSvg, TYPES } from '../core/constants.js';
import { betweenness, D, docTitle, getVault, IDX, pushUndo, TEXTS } from '../core/state.js';
import { md, plain, searchPassages, tokenize } from '../core/retrieval.js';
import { G } from '../graph/engine.js';
import { aiComplete, aiErr, isAIConfigured } from '../services/ai.js';
import { localDeepDive } from '../services/localFallback.js';
import { getTtsState, isTtsSupported, speakToggle } from '../services/speech.js';
import { toast } from './components.js';

export const DEEP = { id: null, text: '', busy: false, err: '', ctl: null };

const metric = (v, l) => `<div class="metric"><b>${v}</b><span>${l}</span></div>`;

export function updateSpeakButtons() {
  const supported = isTtsSupported();
  const state = getTtsState();
  $$('.speak').forEach((b) => {
    b.hidden = !supported;
    const s = b.querySelector('span');
    if (s) {
      if (!s.dataset.orig) s.dataset.orig = s.textContent;
      s.textContent = state === 'idle' ? b.dataset.label || s.dataset.orig : 'Stop reading';
    }
  });
}

function rankOf(n) {
  const S = getVault();
  if (S.nodes.length > 1500) return null;
  const b = betweenness();
  const v = b.get(n.id) || 0;
  if (v <= 0) return null;
  let r = 1;
  for (const x of b.values()) if (x > v) r++;
  return r;
}

function deepHTML() {
  const aiOn = isAIConfigured();
  return `<div class="ai-out"><div class="ai-h"><span>${ico('spark', 11)} Deep dive${
    aiOn ? '' : ' · On-device'
  }</span>${DEEP.busy ? '<button class="link" type="button" data-act="stopdeep">Stop</button>' : ''}</div><div class="md" id="deepOut">${
    DEEP.text ? md(DEEP.text) : DEEP.busy ? '<span class="thinking"><i></i><i></i><i></i> Thinking</span>' : ''
  }</div>${DEEP.err ? `<p class="msg err" style="margin:8px 0 0">${esc(DEEP.err)}</p>` : ''}</div>`;
}

function overviewHTML() {
  const S = getVault();
  const nN = S.nodes.length;
  const nE = S.edges.length;
  const nD = S.docs.length;
  const nC = D.commList.filter((c) => c.big).length;
  const avg = nN ? ((2 * nE) / nN).toFixed(1) : '0';
  const dens = nN > 1 ? (((2 * nE) / (nN * (nN - 1))) * 100).toFixed(1) + '%' : '—';
  const hubs = [...S.nodes].sort((a, b) => (D.deg.get(b.id) || 0) - (D.deg.get(a.id) || 0)).slice(0, 7);
  const isSample = S.docs.length && S.docs.every((d) => d.sample);
  const touch = window.matchMedia && matchMedia('(hover:none)').matches;

  return `<div><div class="kicker">${ico('grid', 11)}<span>Vault overview</span></div><h2 class="i-title">${
    isSample ? 'Sample research vault' : nN ? 'Your knowledge vault' : 'Nothing mapped yet'
  }</h2></div>
  <p class="summary muted">${
    isSample
      ? `Six example sources on transformers, retrieval and graph learning, mapped into ${nN} linked ideas. Explore it, then drop in your own notes and papers.`
      : nN
      ? `${nD} sources mapped into ${nN} ideas and ${nE} links.`
      : 'Ingest a source to start building your graph.'
  }</p>
  <div class="metrics m3">${metric(fmtNum(nN), 'Nodes')}${metric(fmtNum(nE), 'Links')}${metric(
    nD,
    'Sources'
  )}${metric(nC, 'Clusters')}${metric(avg, 'Avg links')}${metric(dens, 'Density')}</div>
  ${
    hubs.length
      ? `<div><div class="sub-h"><span>Most connected</span><span>Links</span></div><ol class="hubs">${hubs
          .map((n) => {
            const d = D.deg.get(n.id) || 0;
            return `<li><button type="button" data-node="${esc(n.id)}">${shapeSvg(n.type, 11)}<span class="nm">${esc(
              n.label
            )}</span><span class="bar"><i style="width:${Math.round(
              (d / D.maxDeg) * 100
            )}%;background:${TYPES[n.type].c}"></i></span><span class="n">${d}</span></button></li>`;
          })
          .join('')}</ol></div>`
      : ''
  }
  <div><div class="sub-h"><span>Controls</span></div><dl class="tips">
    <dt>${touch ? 'Tap' : 'Click'}</dt><dd>Inspect a node and its evidence</dd>
    <dt>${touch ? 'Double-tap' : 'Double-click'}</dt><dd>Focus on its neighborhood</dd>
    ${touch ? '' : '<dt>Right-click</dt><dd>Pin, link, merge, trace paths</dd>'}
    <dt>Drag</dt><dd>Move nodes · pan the canvas</dd>
    ${touch ? '' : '<dt>/  ·  F  ·  ?</dt><dd>Search · fit view · all shortcuts</dd>'}
  </dl></div>`;
}

function docInspectorHTML(d) {
  if (!d) return '';
  const S = getVault();
  const nodes = S.nodes
    .filter((n) => n.docs.includes(d.id))
    .sort((a, b) => (D.deg.get(b.id) || 0) - (D.deg.get(a.id) || 0));
  const txt = TEXTS.get(d.id) || '';

  return `<div><div class="kicker">${shapeSvg('source', 11)}<span>Source</span><span class="sep">/</span><span>${esc(
    d.kind || 'notes'
  )}</span><span class="sep">/</span><span>Added ${fmtDate(d.addedAt)}</span></div>
  <h2 class="i-title">${esc(d.title)}</h2>${
    d.file && d.file !== d.title ? `<div class="aliases">${esc(d.file)}</div>` : ''
  }</div>
  <div class="metrics">${metric(nodes.length, 'Nodes')}${metric(
    d.chars ? (d.chars > 9999 ? Math.round(d.chars / 1000) + 'k' : fmtNum(d.chars)) : '—',
    'Chars'
  )}${metric(d.pages || '—', 'Pages')}${metric(
    { ai: 'AI', local: 'Local', sample: 'Demo' }[d.method] || '—',
    'Method'
  )}</div>
  ${d.summary ? `<p class="summary">${esc(d.summary)}</p>` : ''}
  ${d.status === 'error' ? `<p class="msg err">${esc(d.error || 'This source could not be read.')}</p>` : ''}
  <div class="actions">
    <button class="btn sm" type="button" data-act="focus">${ico('layers', 12)}Focus its nodes</button>
    <button class="btn sm speak" type="button" data-act="speak" ${isTtsSupported() ? '' : 'hidden'}>${ico(
    'speaker',
    12
  )}<span>Read summary</span></button>
    ${
      txt && d.method !== 'sample'
        ? `<button class="btn sm ai" type="button" data-act="remap">${ico('spark', 12)}${
            isAIConfigured() ? 'Re-map with AI' : 'Re-map'
          }</button>`
        : ''
    }
    <button class="btn sm danger" type="button" data-act="remove">${ico('trash', 12)}Remove</button>
  </div>
  <div><div class="sub-h"><span>Extracted nodes</span><span>${nodes.length}</span></div><div class="chips">${
    nodes
      .map((n) => `<button class="nchip" type="button" data-node="${esc(n.id)}">${shapeSvg(n.type, 9)}${esc(n.label)}</button>`)
      .join('') || '<span class="muted">None yet.</span>'
  }</div></div>
  ${
    txt
      ? `<div><div class="sub-h"><span>Excerpt</span><span>${fmtNum(
          txt.length
        )} chars stored</span></div><div class="ev"><blockquote>${esc(clip(txt, 700))}</blockquote></div></div>`
      : ''
  }`;
}

function evidenceFor(n, max = 3) {
  const terms = [n.label, ...(n.aliases || [])].filter((t) => t && t.length >= 2).sort((a, b) => b.length - a.length);
  let out = '';
  let c = 0;
  for (const did of n.docs || []) {
    if (c >= max) break;
    const d = IDX.doc.get(did);
    if (!d) continue;
    const txt = TEXTS.get(did);
    if (!txt) {
      if (d.summary) {
        out += `<blockquote><cite>${esc(d.title)}</cite>${esc(clip(d.summary, 240))}</blockquote>`;
        c++;
      }
      continue;
    }
    const lc = txt.toLowerCase();
    let at = -1;
    let term = '';
    for (const t of terms) {
      const i = lc.indexOf(t.toLowerCase());
      if (i >= 0) {
        at = i;
        term = t;
        break;
      }
    }
    if (at < 0) {
      const w = n.label
        .split(/\s+/)
        .filter((x) => x.length > 4)
        .sort((a, b) => b.length - a.length)[0];
      if (w) {
        at = lc.indexOf(w.toLowerCase());
        term = w;
      }
    }
    if (at < 0) continue;
    const s = Math.max(0, txt.lastIndexOf(' ', Math.max(0, at - 150)));
    const e = Math.min(txt.length, at + term.length + 200);
    const pre = txt.slice(s, at);
    const mid = txt.slice(at, at + term.length);
    const post = txt.slice(at + term.length, e);
    out += `<blockquote><cite>${esc(d.title)}</cite>${s > 0 ? '…' : ''}${esc(pre)}<mark>${esc(mid)}</mark>${esc(
      post
    )}${e < txt.length ? '…' : ''}</blockquote>`;
    c++;
  }
  return out;
}

function startRename(n, actions) {
  const t = $('#iTitle');
  if (!t) return;
  const inp = h('input', {
    class: 'inp',
    value: n.label,
    'aria-label': 'Node name',
    style: 'font:600 18px var(--f-display);height:40px;margin-top:6px',
  });
  t.replaceWith(inp);
  inp.focus();
  inp.select();
  let done = false;
  const commit = () => {
    if (done) return;
    done = true;
    const v = inp.value.trim().replace(/\s+/g, ' ');
    if (!v || v === n.label) {
      renderInspector(actions);
      return;
    }
    const other = IDX.byKey.get(normKey(v));
    if (other && other !== n.id) {
      toast('A node with that name already exists. Use Merge to combine them.', 'error');
      renderInspector(actions);
      return;
    }
    pushUndo('Rename ' + n.label);
    if (!n.aliases.includes(n.label)) n.aliases.push(n.label);
    n.label = v;
    n.aliases = n.aliases.filter((a) => normKey(a) !== normKey(v));
    actions.structureChanged({ reheat: 0.05 });
  };
  inp.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      commit();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      done = true;
      renderInspector(actions);
    }
  });
  inp.addEventListener('blur', commit);
}

async function deepDive(n, actions) {
  DEEP.id = n.id;
  DEEP.text = '';
  DEEP.err = '';

  if (!isAIConfigured()) {
    DEEP.busy = false;
    DEEP.text = localDeepDive(n);
    renderInspector(actions);
    return;
  }

  DEEP.busy = true;
  DEEP.ctl = new AbortController();
  renderInspector(actions);

  const conns = (D.adj.get(n.id) || [])
    .slice(0, 24)
    .map((a) => {
      const o = IDX.byId.get(a.o);
      return `- ${a.out ? `${n.label} —${a.e.label}→ ${o.label}` : `${o.label} —${a.e.label}→ ${n.label}`} (${clip(
        o.summary,
        90
      )})`;
    })
    .join('\n');

  const ev = [];
  for (const did of n.docs || []) {
    const ps = searchPassages(tokenize(n.label + ' ' + (n.aliases || []).join(' ')), 12)
      .filter((p) => p.docId === did)
      .slice(0, 1);
    ps.forEach((p) => ev.push(`[${docTitle(p.docId)}] ${clip(p.text, 500)}`));
    if (ev.length >= 4) break;
  }

  const prompt = `Write a compact study card about "${n.label}" for the reader, using their personal knowledge graph.

Node: ${n.label} (${n.type}): ${n.summary || 'no summary yet'}
${n.aliases?.length ? 'Also called: ' + n.aliases.join(', ') + '\n' : ''}${
    n.note ? 'Reader’s note: ' + n.note + '\n' : ''
  }Connections in the graph:
${conns || '(none)'}
Excerpts from the reader's sources:
${ev.join('\n\n') || '(none)'}

Format as Markdown, max 170 words:
### What it is
Two sentences.
### How it connects
3 to 5 "- " bullets. Name connected nodes exactly as [[Exact Name]].
### Key insight
One sentence grounded in their sources; cite a source title as {{Source title}}. If there are no excerpts, use general knowledge and say so.
### Open questions
Two "- " bullets the reader could explore next.`;

  const id = n.id;
  try {
    const { text } = await aiComplete(prompt, {
      signal: DEEP.ctl.signal,
      onText: ({ text: t }) => {
        if (DEEP.id !== id) return;
        DEEP.text = t;
        const o = $('#deepOut');
        if (o) o.innerHTML = md(t);
      },
    });
    DEEP.text = text;
  } catch (e) {
    DEEP.err = e.code === 'cancelled' ? '' : aiErr(e);
    if (e.text) DEEP.text = e.text;
  }
  DEEP.busy = false;
  DEEP.ctl = null;
  if (G.sel && G.sel.id === id) renderInspector(actions);
}

export function renderInspector(actions) {
  const p = $('#pane-inspect');
  if (!p) return;
  const n = G.sel;
  const ae = document.activeElement;
  if (n && p.contains(ae) && p.dataset.node === n.id && (ae.tagName === 'TEXTAREA' || ae.tagName === 'INPUT')) {
    return;
  }
  p.dataset.node = n ? n.id : '';
  if (!n) {
    p.innerHTML = overviewHTML();
    return;
  }
  if (n.type === 'source') {
    const doc = IDX.doc.get(n.docId);
    p.innerHTML = docInspectorHTML(doc);
    p.onclick = (e) => {
      const b = e.target.closest('[data-act]');
      if (!b) return;
      const a = b.dataset.act;
      if (a === 'focus') actions.enterFocus(n);
      else if (a === 'remove') actions.removeDoc(doc);
      else if (a === 'speak') speakToggle(doc.title + '. ' + (doc.summary || ''));
      else if (a === 'remap') {
        const text = TEXTS.get(doc.id);
        if (text) {
          actions.enqueueText(doc.title, text, doc.id);
          toast('Re-mapping “' + clip(doc.title, 40) + '”');
        }
      }
    };
    updateSpeakButtons();
    return;
  }

  const S = getVault();
  const deg = D.deg.get(n.id) || 0;
  const btwRank = rankOf(n);
  const cl = D.commList[D.comm.get(n.id)];
  const adj = [...(D.adj.get(n.id) || [])].sort((a, b) => b.out - a.out || a.e.label.localeCompare(b.e.label));
  const conn = adj
    .map((a) => {
      const o = IDX.byId.get(a.o);
      if (!o) return '';
      return `<li><button type="button" data-node="${esc(o.id)}"><span class="rel ${a.out ? '' : 'in'}">${
        a.out ? esc(a.e.label) + ' →' : '← ' + esc(a.e.label)
      }</span>${shapeSvg(o.type, 11)}<span class="nm">${esc(o.label)}${
        a.e.inferred ? ' <span class="conf">(suggested)</span>' : ''
      }</span></button></li>`;
    })
    .join('');

  const ev = evidenceFor(n, 3);
  const deep = DEEP.id === n.id && (DEEP.text || DEEP.busy || DEEP.err) ? deepHTML() : '';

  p.innerHTML = `
  <div>
    <div class="kicker">${shapeSvg(n.type, 11)}<span>${TYPES[n.type].name}</span>${
    cl && cl.big ? `<span class="sep">/</span><span style="color:${cl.color}">Cluster · ${esc(clip(cl.name, 24))}</span>` : ''
  }${n.pinned ? '<span class="sep">/</span><span>Pinned</span>' : ''}</div>
    <div class="i-title-row"><h2 class="i-title" id="iTitle">${esc(
      n.label
    )}</h2><button class="btn sm icon ghost" type="button" data-act="rename" title="Rename" aria-label="Rename node">${ico(
    'edit',
    12
  )}</button></div>
    ${n.aliases && n.aliases.length ? `<div class="aliases">aka ${n.aliases.map(esc).join(' · ')}</div>` : ''}
  </div>
  <div class="metrics">${metric(deg, 'Links')}${metric((n.docs || []).length, 'Sources')}${metric(
    n.mentions || 1,
    'Mentions'
  )}${metric(btwRank ? '#' + btwRank : '—', 'Centrality')}</div>
  ${
    n.summary
      ? `<p class="summary">${esc(n.summary)}</p>`
      : '<p class="summary muted">No summary yet. Run a deep dive or add a note below.</p>'
  }
  <div class="actions">
    <button class="btn sm ai" type="button" data-act="deep" ${DEEP.busy ? 'disabled' : ''}>${ico('spark', 12)}Deep dive</button>
    <button class="btn sm speak" type="button" data-act="speak" ${isTtsSupported() ? '' : 'hidden'}>${ico(
    'speaker',
    12
  )}<span>Read aloud</span></button>
    <button class="btn sm" type="button" data-act="focus">${ico('layers', 12)}Focus</button>
    <button class="btn sm" type="button" data-act="pathfrom">${ico('path', 12)}Path from</button>
    <button class="btn sm" type="button" data-act="pin" aria-pressed="${!!n.pinned}">${ico('pin', 12)}${
    n.pinned ? 'Pinned' : 'Pin'
  }</button>
    <button class="btn sm" type="button" data-act="link">${ico('link', 12)}Link</button>
    <button class="btn sm" type="button" data-act="merge">${ico('merge', 12)}Merge</button>
    <label class="btn sm" style="padding:0 4px 0 8px">Type <select class="sel" id="typeSel" style="height:22px;width:auto;border:0;background-color:transparent;padding-left:4px">${ENTITY_TYPES.concat(
      'gap'
    )
      .map((t) => `<option value="${t}" ${t === n.type ? 'selected' : ''}>${TYPES[t].name}</option>`)
      .join('')}</select></label>
    <button class="btn sm danger" type="button" data-act="delete">${ico('trash', 12)}Delete</button>
  </div>
  <div id="deepBox">${deep}</div>
  <div><div class="sub-h"><span>Connections</span><span>${deg}</span></div>${
    conn
      ? `<ul class="conn">${conn}</ul>`
      : '<p class="summary muted" style="font-size:12.5px">Not linked yet. Use Link to connect it, or ingest a source that mentions it.</p>'
  }</div>
  <div><div class="sub-h"><span>Evidence from your sources</span><span>${(n.docs || []).length}</span></div><div class="ev">${
    ev || '<p class="summary muted" style="font-size:12.5px">No source passages for this node.</p>'
  }</div></div>
  <div class="field"><label class="sub-h" for="noteIn" style="margin:0"><span>Your note</span><span id="noteSaved"></span></label><textarea class="ta" id="noteIn" rows="3" placeholder="What do you want to remember about this?">${esc(
    n.note || ''
  )}</textarea></div>`;

  p.onclick = (e) => {
    const b = e.target.closest('[data-act]');
    if (!b || b.disabled) return;
    const a = b.dataset.act;
    if (a === 'deep') deepDive(n, actions);
    else if (a === 'speak') speakToggle(plain(n.label + '. ' + (DEEP.id === n.id && DEEP.text ? DEEP.text : n.summary || '')));
    else if (a === 'focus') actions.enterFocus(n);
    else if (a === 'pathfrom') actions.setPathEnd('from', n);
    else if (a === 'pin') actions.togglePin(n);
    else if (a === 'link') actions.openLinkModal(n);
    else if (a === 'merge') actions.openMergeModal(n);
    else if (a === 'delete') actions.deleteNode(n);
    else if (a === 'rename') startRename(n, actions);
    else if (a === 'stopdeep') DEEP.ctl?.abort();
  };

  const ts = $('#typeSel', p);
  ts.onchange = () => {
    pushUndo('Change type of ' + n.label);
    n.type = ts.value;
    actions.structureChanged({ reheat: 0.1 });
  };
  const ni = $('#noteIn', p);
  const saveNote = debounce(() => {
    n.note = ni.value;
    S.pristine = false;
    actions.scheduleSave();
    const s = $('#noteSaved');
    if (s) s.textContent = 'Saved';
  }, 700);
  ni.addEventListener('input', () => {
    const s = $('#noteSaved');
    if (s) s.textContent = 'Editing…';
    saveNote();
  });
  updateSpeakButtons();
}
