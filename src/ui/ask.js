import { $, clip, esc, h } from '../core/utils.js';
import { ico } from '../core/constants.js';
import { D, docTitle, getVault, lbl } from '../core/state.js';
import { md, plain, retrieve } from '../core/retrieval.js';
import { G } from '../graph/engine.js';
import { aiComplete, aiErr, getAIProviderLabel, isAIConfigured } from '../services/ai.js';
import { localAskAnswer } from '../services/localFallback.js';
import { createDictation, isTtsSupported, speakToggle } from '../services/speech.js';
import { updateSpeakButtons } from './inspector.js';
import { toast } from './components.js';

export const ASK = { turns: [], ctl: null, busy: false };

export function renderAskIntro(onFit) {
  const askLog = $('#askLog');
  const S = getVault();
  if (!askLog || ASK.turns.length || askLog.querySelector('.msg')) return;

  const hubs = [...S.nodes].sort((a, b) => (D.deg.get(b.id) || 0) - (D.deg.get(a.id) || 0));
  const a = hubs[0];
  const b = hubs.find((n) => n !== a && D.comm.get(n.id) !== D.comm.get(a?.id)) || hubs[1];
  const c = hubs[2];
  const qs = [];
  if (a && b) qs.push(`How does ${a.label} relate to ${b.label}?`);
  if (c) qs.push(`Summarize what my sources say about ${c.label}.`);
  if (S.nodes.length) qs.push('What are the biggest gaps in what I’ve read so far?');
  if (S.docs.length > 1) qs.push('Which ideas show up across more than one of my sources?');

  askLog.innerHTML = `<div class="ask-intro"><div class="kicker">${ico('spark', 11)}<span>Ask your graph</span></div><h3 style="margin-top:8px">Questions answered from your own sources</h3><p>Each answer pulls the most relevant nodes, links and passages from your vault, then cites them. Click a cited node to jump to it.</p></div>`;
  const sg = h('div', { class: 'sugg' });
  for (const q of qs.slice(0, 4)) {
    const b2 = h('button', {
      type: 'button',
      onclick: () => {
        $('#askIn').value = q;
        submitAsk(onFit);
      },
    });
    b2.innerHTML = ico('send', 12) + '<span>' + esc(q) + '</span>';
    sg.append(b2);
  }
  askLog.append(sg);
}

function addMsg(role, text, whoLabel) {
  const askLog = $('#askLog');
  const wrap = h('div', { class: 'msg ' + role });
  wrap.append(h('div', { class: 'who', text: whoLabel }));
  const body = h('div', { class: 'body' + (role === 'ai' ? ' md' : '') });
  if (role === 'user') body.textContent = text;
  wrap.append(body);
  const foot = h('div', { class: 'foot' });
  wrap.append(foot);
  askLog.append(wrap);
  askLog.scrollTop = askLog.scrollHeight;
  return { wrap, body, foot };
}

function setAskBusy(b) {
  ASK.busy = b;
  const s = $('#askSend');
  if (!s) return;
  s.innerHTML = b ? ico('stop') : ico('send');
  s.setAttribute('aria-label', b ? 'Stop' : 'Ask');
  s.title = b ? 'Stop' : 'Ask';
}

export async function submitAsk(onFit) {
  const askIn = $('#askIn');
  const askLog = $('#askLog');
  if (!askIn || !askLog) return;

  if (ASK.busy) {
    ASK.ctl?.abort();
    return;
  }
  const q = askIn.value.trim();
  if (!q) return;

  askLog.querySelector('.ask-intro')?.remove();
  askLog.querySelector('.sugg')?.remove();
  askIn.value = '';
  addMsg('user', q, 'You');

  const aiOn = isAIConfigured();
  const who = aiOn ? `Lattice · ${getAIProviderLabel()}` : 'Lattice · On-Device Retrieval';
  const m = addMsg('ai', '', who);
  m.body.innerHTML = '<span class="thinking"><i></i><i></i><i></i> Searching your graph</span>';

  const ctxx = retrieve(q, G.sel);
  G.glow = new Set(ctxx.nodes.map((n) => n.id));
  G.dirty = true;

  const foot = () => {
    m.foot.innerHTML = '';
    const ctxBtn = h(
      'button',
      {
        class: 'link',
        type: 'button',
        title: 'Highlight the context on the graph',
        onclick: () => {
          G.glow = new Set(ctxx.nodes.map((n) => n.id));
          G.sel = null;
          G.path = null;
          G.dirty = true;
          onFit(ctxx.nodes.filter((n) => G.visIds.has(n.id)), 90);
        },
      },
      `Context · ${ctxx.nodes.length} nodes · ${ctxx.passages.length} passages`
    );
    m.foot.append(ctxBtn);
    if (isTtsSupported()) {
      const sb = h('button', {
        class: 'btn sm ghost speak',
        type: 'button',
        onclick: () => speakToggle(plain(m.body.textContent)),
      });
      sb.innerHTML = ico('speaker', 12) + '<span>Read aloud</span>';
      m.foot.append(sb);
    }
  };

  if (!aiOn) {
    const text = localAskAnswer(q, ctxx);
    m.body.innerHTML = md(text);
    ASK.turns.push({ role: 'user', content: q }, { role: 'assistant', content: text });
    foot();
    askLog.scrollTop = askLog.scrollHeight;
    updateSpeakButtons();
    return;
  }

  const instr = `You answer questions about the reader's personal knowledge graph, built from their own notes and papers. Ground answers in the context below. If you add general knowledge beyond it, say so briefly. Refer to graph nodes with double brackets exactly as named, e.g. [[${
    ctxx.nodes[0]?.label || 'Node Name'
  }]]. Cite sources as {{Source title}}. Be concise: under 170 words unless the reader asks for more. Use short paragraphs or "- " bullets, and **bold** sparingly.

GRAPH CONTEXT
Nodes:
${ctxx.nodes.map((n) => `- ${n.label} (${n.type}): ${clip(n.summary, 140)}`).join('\n') || '(empty graph)'}
Relations:
${ctxx.edges.map((e) => `- ${lbl(e.s)} —${e.label}→ ${lbl(e.t)}`).join('\n') || '(none)'}
Source passages:
${ctxx.passages.map((p) => `[${docTitle(p.docId)}] ${p.text}`).join('\n\n') || '(none)'}`;

  const turns = [{ role: 'user', content: instr }, ...ASK.turns.slice(-6), { role: 'user', content: q }];
  ASK.ctl = new AbortController();
  setAskBusy(true);

  try {
    const { text, truncated } = await aiComplete(turns, {
      signal: ASK.ctl.signal,
      onText: ({ text: t }) => {
        m.body.innerHTML = md(t);
        askLog.scrollTop = askLog.scrollHeight;
      },
    });
    m.body.innerHTML = md(text);
    ASK.turns.push({ role: 'user', content: q }, { role: 'assistant', content: text });
    foot();
    if (truncated) m.foot.append(h('span', { text: '· cut short, ask for less' }));
  } catch (e) {
    if (e.text) m.body.innerHTML = md(e.text);
    else m.body.innerHTML = '';
    if (e.code !== 'cancelled') m.wrap.append(h('div', { class: 'err', text: aiErr(e) }));
    else m.wrap.append(h('div', { class: 'foot', text: 'Stopped' }));
  } finally {
    setAskBusy(false);
    ASK.ctl = null;
    askLog.scrollTop = askLog.scrollHeight;
    updateSpeakButtons();
  }
}

export function initAskForm(onFit) {
  const form = $('#askForm');
  const askIn = $('#askIn');
  const mic = $('#micBtn');
  const partial = $('#askPartial');

  form?.addEventListener('submit', (e) => {
    e.preventDefault();
    submitAsk(onFit);
  });
  askIn?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      submitAsk(onFit);
    }
  });

  if (mic) {
    const dict = createDictation({
      onPartial: (text) => {
        if (!partial) return;
        partial.textContent = text;
        partial.hidden = !text;
      },
      onFinal: (text) => {
        if (!askIn) return;
        const v = askIn.value;
        askIn.value = (v ? v : '') + (v ? text : text.replace(/^\s+/, ''));
        if (partial) partial.hidden = true;
      },
      onState: (state) => {
        const on = state !== 'idle';
        mic.setAttribute('aria-pressed', String(on));
        mic.title = on ? 'Stop dictation' : 'Dictate';
      },
      onError: () => {
        toast('Dictation isn’t available right now.');
      },
    });

    if (dict) {
      mic.hidden = false;
      mic.onclick = () => dict.toggle();
    } else {
      mic.hidden = true;
    }
  }
}
