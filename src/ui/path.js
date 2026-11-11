import { $, clip, esc } from '../core/utils.js';
import { ico, REDUCED, shapeSvg } from '../core/constants.js';
import { shortestPath } from '../core/graphAlgo.js';
import { D, getVault, IDX, pairKey } from '../core/state.js';
import { matchNodes, md, plain } from '../core/retrieval.js';
import { G, rebuild } from '../graph/engine.js';
import { aiComplete, aiErr, isAIConfigured } from '../services/ai.js';
import { localExplainPath } from '../services/localFallback.js';
import { isTtsSupported, speakToggle } from '../services/speech.js';
import { updateSpeakButtons } from './inspector.js';
import { picker, toast } from './components.js';
import { renderTypeChips } from './chrome.js';

export const PATH = { from: null, to: null, res: null, explain: '', busy: false, err: '', ctl: null, built: false };

function resolveField(which) {
  const inp = $(which === 'from' ? '#pFrom' : '#pTo');
  if (PATH[which] && PATH[which].label === inp.value) return PATH[which];
  const m = matchNodes(inp.value, 1);
  if (m[0]) {
    PATH[which] = m[0].n;
    inp.value = m[0].n.label;
    return m[0].n;
  }
  return null;
}

export function clearPath() {
  G.path = null;
  PATH.res = null;
  PATH.explain = '';
  PATH.err = '';
  G.dirty = true;
  renderPathResult();
}

export function tracePath(onFit) {
  const a = resolveField('from');
  const b = resolveField('to');
  if (!a || !b) {
    toast('Pick both a start and an end node.', 'error');
    return;
  }
  if (a.type === 'source' || b.type === 'source') {
    toast('Paths run between ideas, not sources.', 'error');
    return;
  }
  const seq = shortestPath(a.id, b.id, D.adj);
  PATH.explain = '';
  PATH.err = '';
  if (!seq) {
    PATH.res = { none: true, a, b };
    G.path = null;
    renderPathResult();
    G.dirty = true;
    return;
  }
  PATH.res = { seq, a, b };
  G.path = { seq, set: new Set(seq) };
  G.sel = null;
  if (seq.some((id) => !G.visIds.has(id))) {
    if (G.focus) {
      G.focus = null;
      $('#focusbar').hidden = true;
    }
    G.minDeg = 0;
    $('#minDeg').value = 0;
    $('#minDegVal').textContent = '0';
    G.timeCut = Infinity;
    $('#tl').value = 1000;
    for (const id of seq) G.typeOn[IDX.byId.get(id).type] = true;
    renderTypeChips();
    rebuild(0.3);
  }
  renderPathResult();
  G.dirty = true;
  setTimeout(
    () => onFit?.(seq.map((id) => IDX.byId.get(id)).filter(Boolean), 90),
    REDUCED ? 0 : 120
  );
}

function surprisePath(onFit) {
  const S = getVault();
  const pool = S.nodes.filter((n) => (D.deg.get(n.id) || 0) > 0);
  if (pool.length < 4) {
    toast('Add more connected nodes first.');
    return;
  }
  for (let i = 0; i < 60; i++) {
    const a = pool[Math.floor(Math.random() * pool.length)];
    const b = pool[Math.floor(Math.random() * pool.length)];
    if (a === b || D.comm.get(a.id) === D.comm.get(b.id)) continue;
    const seq = shortestPath(a.id, b.id, D.adj);
    if (seq && seq.length >= 4 && seq.length <= 7) {
      PATH.from = a;
      PATH.to = b;
      $('#pFrom').value = a.label;
      $('#pTo').value = b.label;
      tracePath(onFit);
      return;
    }
  }
  toast('No long cross-cluster path found. Try picking two nodes.');
}

async function explainPath() {
  const r = PATH.res;
  if (!r || !r.seq) return;

  if (!isAIConfigured()) {
    PATH.explain = localExplainPath(r.seq);
    PATH.busy = false;
    PATH.err = '';
    renderPathResult();
    return;
  }

  PATH.busy = true;
  PATH.explain = '';
  PATH.err = '';
  PATH.ctl = new AbortController();
  renderPathResult();

  const lines = [];
  r.seq.forEach((id, i) => {
    const n = IDX.byId.get(id);
    lines.push(`${i + 1}. ${n.label} (${n.type}): ${clip(n.summary, 140)}`);
    if (i < r.seq.length - 1) {
      const e = IDX.pair.get(pairKey(id, r.seq[i + 1]));
      lines.push(e ? (e.s === id ? `   —${e.label}→` : `   ←${e.label}—`) : '   —linked—');
    }
  });

  const prompt = `Explain, in 4 to 6 sentences, how "${r.a.label}" connects to "${r.b.label}" through this chain from the reader's knowledge graph. Walk the chain in order, say what each link means, and end with one sentence on why the connection matters. Name nodes exactly as [[Exact Name]]. No headings.

Chain:
${lines.join('\n')}`;

  try {
    const { text } = await aiComplete(prompt, {
      signal: PATH.ctl.signal,
      onText: ({ text: t }) => {
        PATH.explain = t;
        const o = $('#pExOut');
        if (o) o.innerHTML = md(t);
      },
    });
    PATH.explain = text;
  } catch (e) {
    if (e.text) PATH.explain = e.text;
    if (e.code !== 'cancelled') PATH.err = aiErr(e);
  }
  PATH.busy = false;
  PATH.ctl = null;
  renderPathResult();
  updateSpeakButtons();
}

export function renderPathResult() {
  const o = $('#pathOut');
  if (!o) return;
  const r = PATH.res;
  if (!r) {
    o.innerHTML = '';
    return;
  }
  if (r.none) {
    o.innerHTML = `<div class="card"><div class="t">No connection yet between <b>${esc(
      r.a.label
    )}</b> and <b>${esc(
      r.b.label
    )}</b>.</div><div class="why">They sit in separate parts of your graph. Ingest a source that touches both, or link them by hand.</div></div>`;
    return;
  }
  const seq = r.seq;
  let html = `<div class="sub-h"><span>${seq.length - 1} hop${seq.length === 2 ? '' : 's'}</span><span>${esc(
    clip(r.a.label, 18)
  )} → ${esc(clip(r.b.label, 18))}</span></div><ol class="chain">`;
  for (let i = 0; i < seq.length; i++) {
    const n = IDX.byId.get(seq[i]);
    if (!n) continue;
    html += `<li class="node"><button type="button" data-node="${esc(n.id)}">${shapeSvg(
      n.type,
      12
    )}<span>${esc(n.label)}</span></button></li>`;
    if (i < seq.length - 1) {
      const e = IDX.pair.get(pairKey(seq[i], seq[i + 1]));
      const fwd = e && e.s === seq[i];
      html += `<li class="hop">${fwd ? '' : '← '}${esc(e ? e.label : 'linked')}${fwd ? ' →' : ''}</li>`;
    }
  }
  html += '</ol>';
  html += `<div class="row" style="margin-top:12px"><button class="btn ai" type="button" id="pExplain" ${
    PATH.busy ? 'disabled' : ''
  }>${ico('spark', 12)}Explain this connection</button>${
    PATH.busy ? '<button class="btn ghost sm" type="button" id="pStop">Stop</button>' : ''
  }</div>`;
  if (PATH.explain || PATH.busy || PATH.err) {
    html += `<div class="ai-out" style="margin-top:10px"><div class="ai-h"><span>${ico(
      'spark',
      11
    )} Connection</span>${
      PATH.explain && isTtsSupported()
        ? '<button class="link speak" type="button" id="pSpeak"><span>Read aloud</span></button>'
        : ''
    }</div><div class="md" id="pExOut">${
      PATH.explain ? md(PATH.explain) : '<span class="thinking"><i></i><i></i><i></i> Thinking</span>'
    }</div>${PATH.err ? `<p class="msg err" style="margin:8px 0 0">${esc(PATH.err)}</p>` : ''}</div>`;
  }
  o.innerHTML = html;
  $('#pExplain').onclick = explainPath;
  const st = $('#pStop');
  if (st) st.onclick = () => PATH.ctl?.abort();
  const sp = $('#pSpeak');
  if (sp) sp.onclick = () => speakToggle(plain(PATH.explain));
}

export function renderPathPane(onFit) {
  const p = $('#pane-path');
  if (!p) return;
  if (!PATH.built) {
    PATH.built = true;
    p.innerHTML = `<div><div class="kicker">${ico(
      'path',
      11
    )}<span>Path finder</span></div><h2 class="i-title" style="font-size:19px">How does one idea lead to another?</h2><p class="summary muted" style="font-size:12.5px;margin-top:6px">Traces the shortest chain of relations between two nodes, then explains the connection.</p></div>
    <div class="field"><label class="lbl" for="pFrom">From</label><div class="pfield"><input class="inp" id="pFrom" placeholder="Start node…" autocomplete="off"></div></div>
    <div class="row" style="justify-content:center"><button class="btn sm icon ghost" type="button" id="pSwap" title="Swap" aria-label="Swap from and to">${ico(
      'swap',
      12
    )}</button></div>
    <div class="field" style="margin-top:-10px"><label class="lbl" for="pTo">To</label><div class="pfield"><input class="inp" id="pTo" placeholder="End node…" autocomplete="off"></div></div>
    <div class="row"><button class="btn primary" type="button" id="pGo">${ico(
      'path'
    )}Trace path</button><button class="btn" type="button" id="pRand">${ico(
      'dice'
    )}Surprise me</button><button class="btn ghost" type="button" id="pClear">Clear</button></div>
    <div id="pathOut"></div>`;

    const fi = $('#pFrom');
    const ti = $('#pTo');
    picker(fi, (n) => {
      PATH.from = n;
      fi.value = n.label;
    });
    picker(ti, (n) => {
      PATH.to = n;
      ti.value = n.label;
    });
    fi.addEventListener('input', () => {
      PATH.from = null;
    });
    ti.addEventListener('input', () => {
      PATH.to = null;
    });
    $('#pSwap').onclick = () => {
      [PATH.from, PATH.to] = [PATH.to, PATH.from];
      fi.value = PATH.from?.label || '';
      ti.value = PATH.to?.label || '';
    };
    $('#pGo').onclick = () => tracePath(onFit);
    $('#pRand').onclick = () => surprisePath(onFit);
    $('#pClear').onclick = () => {
      clearPath();
      PATH.from = PATH.to = null;
      fi.value = ti.value = '';
    };
  }
  $('#pFrom').value = PATH.from?.label || $('#pFrom').value;
  $('#pTo').value = PATH.to?.label || $('#pTo').value;
  renderPathResult();
}

export function setPathEnd(which, n, showTabFn, onFit) {
  PATH[which] = n;
  showTabFn('path');
  if (which === 'from' && !PATH.to) setTimeout(() => $('#pTo')?.focus(), 30);
  if (PATH.from && PATH.to) tracePath(onFit);
}
