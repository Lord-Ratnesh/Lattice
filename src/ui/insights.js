import { $, clamp, clip, esc, normKey, rid, uniq } from '../core/utils.js';
import { ico, pal, shapeSvg } from '../core/constants.js';
import { addEdge, betweenness, D, getVault, IDX, indexNode, lbl, pairKey, pushUndo } from '../core/state.js';
import { md, plain } from '../core/retrieval.js';
import { G } from '../graph/engine.js';
import { aiComplete, aiErr, aiJson, isAIConfigured } from '../services/ai.js';
import { localDiscoverLinks, localFindGaps, localStudyBrief } from '../services/localFallback.js';
import { copyText, downloadBlob } from '../services/export.js';
import { isTtsSupported, speakToggle } from '../services/speech.js';
import { updateSpeakButtons } from './inspector.js';
import { toast } from './components.js';

export const INS = { links: null, gaps: null, brief: '', busy: null, err: '', ctl: null };

function vaultDigest(maxNodes = 150) {
  const S = getVault();
  const ns = [...S.nodes]
    .sort((a, b) => (D.deg.get(b.id) || 0) - (D.deg.get(a.id) || 0))
    .slice(0, maxNodes);
  return ns
    .map((n) => `${n.label} | ${n.type} | cluster ${D.comm.get(n.id)} | ${clip(n.summary, 90)}`)
    .join('\n');
}

async function insRun(kind, actions, fn, localFn) {
  const S = getVault();
  if (S.nodes.length < 4) {
    toast('Add a few more nodes first.');
    return;
  }
  if (!isAIConfigured()) {
    INS.err = '';
    localFn();
    renderInsAI(actions);
    return;
  }

  INS.busy = kind;
  INS.err = '';
  INS.ctl = new AbortController();
  renderInsAI(actions);
  try {
    await fn(INS.ctl.signal);
  } catch (e) {
    if (e && e.code !== 'cancelled') INS.err = aiErr(e);
  }
  INS.busy = null;
  INS.ctl = null;
  renderInsAI(actions);
}

function discoverLinks(actions) {
  const S = getVault();
  return insRun(
    'links',
    actions,
    async (signal) => {
      const existing =
        S.edges.length <= 320
          ? '\nAlready linked pairs (do not suggest these):\n' +
            S.edges.map((e) => `${lbl(e.s)} — ${lbl(e.t)}`).join('; ')
          : '';
      const res = await aiJson(
        `Here are nodes from a reader's personal knowledge graph, one per line as "name | type | cluster | summary". Suggest up to 8 non-obvious but defensible relationships between nodes that are NOT already directly linked. Favor pairs from different clusters, since those reveal connections the reader has not made yet.
${existing}

Nodes:
${vaultDigest()}

Reply with only a JSON array: [{"source":"exact node name","target":"exact node name","label":"1-3 word lowercase verb phrase","why":"one sentence, max 25 words","confidence":0.7}]`,
        { modelTier: 'default', signal }
      );
      const arr = Array.isArray(res) ? res : res && Array.isArray(res.links) ? res.links : [];
      INS.links = arr
        .map((x) => {
          const s = IDX.byKey.get(normKey(x.source));
          const t = IDX.byKey.get(normKey(x.target));
          return {
            s,
            t,
            label: clip(String(x.label || 'related to').toLowerCase(), 36),
            why: clip(String(x.why || ''), 220),
            conf: clamp(Number(x.confidence) || 0.5, 0, 1),
          };
        })
        .filter((x) => x.s && x.t && x.s !== x.t && !IDX.pair.has(pairKey(x.s, x.t)))
        .slice(0, 8);
    },
    () => {
      INS.links = localDiscoverLinks();
    }
  );
}

function findGaps(actions) {
  const S = getVault();
  return insRun(
    'gaps',
    actions,
    async (signal) => {
      const cl = D.commList
        .filter((c) => c.big)
        .slice(0, 10)
        .map((c) => `- ${c.name}: ${c.members.slice(0, 14).map(lbl).join(', ')}`)
        .join('\n');
      const res = await aiJson(
        `A reader's personal knowledge graph has these themes (cluster name: members):
${cl}
Sources: ${S.docs.map((d) => d.title).join('; ')}

Identify 5 important topics that are missing and would most strengthen their understanding: prerequisites they skipped, natural next steps, or concepts that would connect two themes. Each must be absent from the graph.

Reply with only a JSON array: [{"topic":"Title Case name","why":"one sentence, max 25 words","connects_to":["exact existing node name"],"search":"a short search query to learn it"}]`,
        { modelTier: 'default', signal }
      );
      const arr = Array.isArray(res) ? res : res && Array.isArray(res.gaps) ? res.gaps : [];
      INS.gaps = arr
        .filter((g) => g && g.topic && !IDX.byKey.has(normKey(g.topic)))
        .slice(0, 6)
        .map((g) => ({
          topic: clip(String(g.topic), 60),
          why: clip(String(g.why || ''), 220),
          search: clip(String(g.search || ''), 90),
          near: uniq(
            (Array.isArray(g.connects_to) ? g.connects_to : [])
              .map((x) => IDX.byKey.get(normKey(x)))
              .filter(Boolean)
          ).slice(0, 4),
        }));
    },
    () => {
      INS.gaps = localFindGaps();
    }
  );
}

function addGap(g, actions) {
  const S = getVault();
  if (!g || g.done) return;
  if (IDX.byKey.has(normKey(g.topic))) {
    toast('That topic is already in your graph.');
    g.done = true;
    renderInsAI(actions);
    return;
  }
  pushUndo('Add gap ' + g.topic);
  const anchor = g.near.map((id) => IDX.byId.get(id)).find(Boolean);
  const n = {
    id: rid('n'),
    label: g.topic,
    type: 'gap',
    summary: g.why,
    aliases: [],
    docs: [],
    t: Date.now(),
    mentions: 1,
    note: g.search ? 'To learn: search “' + g.search + '”' : '',
    pinned: false,
    manual: true,
    x: (anchor?.x || 0) + 30,
    y: (anchor?.y || 0) + 30,
  };
  S.nodes.push(n);
  indexNode(n);
  for (const id of g.near) addEdge(n.id, id, 'would connect to', null, 1, { manual: true });
  g.done = true;
  G.fresh.set(n.id, performance.now());
  actions.structureChanged({ reheat: 0.4 });
  renderInsAI(actions);
  toast('Added gap node “' + g.topic + '”', 'ok');
}

function studyBrief(actions) {
  const S = getVault();
  return insRun(
    'brief',
    actions,
    async (signal) => {
      INS.brief = '';
      const cl = D.commList
        .filter((c) => c.big)
        .slice(0, 10)
        .map((c) => `- ${c.name}: ${c.members.slice(0, 12).map(lbl).join(', ')}`)
        .join('\n');
      const rel = [...S.edges]
        .sort((a, b) => (b.w || 1) - (a.w || 1))
        .slice(0, 60)
        .map((e) => `${lbl(e.s)} —${e.label}→ ${lbl(e.t)}`)
        .join('\n');
      const prompt = `Write a study brief of the reader's knowledge vault. Markdown, max 350 words, these sections:
### Big picture
2 to 3 sentences.
### Themes
One "- " bullet per theme: **theme name**: what it covers, naming key nodes exactly as [[Exact Name]].
### Bridges
2 to 3 "- " bullets on ideas that connect themes.
### Test yourself
Five "- " bullets, each a question.

Sources: ${S.docs.map((d) => `${d.title} (${d.kind})`).join('; ')}
Themes:
${cl}
Key relations:
${rel}`;
      const { text } = await aiComplete(prompt, {
        signal,
        onText: ({ text: t }) => {
          INS.brief = t;
          const o = $('#briefOut');
          if (o) o.innerHTML = md(t);
          else renderInsAI(actions);
        },
      });
      INS.brief = text;
    },
    () => {
      INS.brief = localStudyBrief();
    }
  );
}

export function renderInsAI(actions) {
  const box = $('#insAI');
  if (!box) return;
  const busy = INS.busy;
  const modeLabel = isAIConfigured() ? 'AI analysis' : 'Graph analysis';
  let html = `<div class="kicker">${ico('spark', 11)}<span>${modeLabel}</span></div><h2 class="i-title" style="font-size:19px">What your graph is telling you</h2>
  <div class="ai-tools" style="margin-top:12px">
    <button class="btn ai" type="button" data-ins="links" ${busy ? 'disabled' : ''}>${ico(
    'link',
    13
  )}Discover hidden links<small>${busy === 'links' ? 'working…' : 'cross-cluster'}</small></button>
    <button class="btn ai" type="button" data-ins="gaps" ${busy ? 'disabled' : ''}>${ico(
    'focus',
    13
  )}Find knowledge gaps<small>${busy === 'gaps' ? 'working…' : 'what to read next'}</small></button>
    <button class="btn ai" type="button" data-ins="brief" ${busy ? 'disabled' : ''}>${ico(
    'doc',
    13
  )}Write a study brief<small>${busy === 'brief' ? 'working…' : 'whole vault'}</small></button>
  </div>`;
  if (busy) {
    html +=
      '<div class="row" style="margin-top:8px"><span class="thinking"><i></i><i></i><i></i> Thinking</span><button class="link" type="button" data-ins="stop">Stop</button></div>';
  }
  if (INS.err) html += `<p class="msg err" style="margin-top:8px">${esc(INS.err)}</p>`;
  if (INS.links) {
    html += `<div style="margin-top:14px"><div class="sub-h"><span>Suggested links</span><span>${
      INS.links.length
    }</span></div><div style="display:flex;flex-direction:column;gap:6px">${
      INS.links
        .map(
          (l, i) =>
            `<div class="card"><div class="t"><button class="nchip" type="button" data-node="${esc(
              l.s
            )}">${shapeSvg(IDX.byId.get(l.s)?.type, 9)}${esc(
              lbl(l.s)
            )}</button><span class="rel" style="min-width:0">${esc(
              l.label
            )} →</span><button class="nchip" type="button" data-node="${esc(l.t)}">${shapeSvg(
              IDX.byId.get(l.t)?.type,
              9
            )}${esc(lbl(l.t))}</button></div><div class="why">${esc(
              l.why
            )}</div><div class="row"><span class="conf">${Math.round(
              (l.conf || 0) * 100
            )}% confidence</span><span style="flex:1"></span>${
              l.done
                ? '<span class="chip ok">Added</span>'
                : `<button class="btn sm" type="button" data-show="${i}">Show</button><button class="btn sm" type="button" data-add="${i}">${ico(
                    'plus',
                    11
                  )}Add link</button>`
            }</div></div>`
        )
        .join('') || '<p class="muted">No new links suggested.</p>'
    }</div></div>`;
  }
  if (INS.gaps) {
    html += `<div style="margin-top:14px"><div class="sub-h"><span>Knowledge gaps</span><span>${
      INS.gaps.length
    }</span></div><div style="display:flex;flex-direction:column;gap:6px">${INS.gaps
      .map(
        (g, i) =>
          `<div class="card"><div class="t">${shapeSvg('gap', 11)}<b>${esc(g.topic)}</b></div><div class="why">${esc(
            g.why
          )}</div>${
            g.near.length
              ? `<div class="chips">${g.near
                  .map(
                    (id) =>
                      `<button class="nchip" type="button" data-node="${esc(id)}">${shapeSvg(
                        IDX.byId.get(id)?.type,
                        9
                      )}${esc(lbl(id))}</button>`
                  )
                  .join('')}</div>`
              : ''
          }${g.search ? `<div class="conf">Search: ${esc(g.search)}</div>` : ''}<div class="row"><span style="flex:1"></span>${
            g.done
              ? '<span class="chip ok">Added</span>'
              : `<button class="btn sm" type="button" data-gap="${i}">${ico('plus', 11)}Add as gap node</button>`
          }</div></div>`
      )
      .join('')}</div></div>`;
  }
  if (INS.brief) {
    html += `<div style="margin-top:14px" class="ai-out"><div class="ai-h"><span>${ico(
      'doc',
      11
    )} Study brief</span><span class="row">${
      isTtsSupported()
        ? '<button class="link speak" type="button" data-ins="speak"><span>Read aloud</span></button>'
        : ''
    }<button class="link" type="button" data-ins="dlbrief">Save .md</button><button class="link" type="button" data-ins="copybrief">Copy</button></span></div><div class="md" id="briefOut">${md(
      INS.brief
    )}</div></div>`;
  }
  box.innerHTML = html;
  box.onclick = (e) => {
    const b = e.target.closest('button');
    if (!b || b.disabled) return;
    if (b.dataset.ins === 'links') discoverLinks(actions);
    else if (b.dataset.ins === 'gaps') findGaps(actions);
    else if (b.dataset.ins === 'brief') studyBrief(actions);
    else if (b.dataset.ins === 'stop') INS.ctl?.abort();
    else if (b.dataset.ins === 'speak') speakToggle(plain(INS.brief));
    else if (b.dataset.ins === 'dlbrief') {
      downloadBlob('lattice-study-brief.md', INS.brief, 'text/markdown;charset=utf-8');
      toast('Saved lattice-study-brief.md', 'ok');
    } else if (b.dataset.ins === 'copybrief') copyText(INS.brief, null, toast);
    else if (b.dataset.add != null) {
      const l = INS.links[+b.dataset.add];
      if (!l || !IDX.byId.has(l.s) || !IDX.byId.has(l.t)) return;
      pushUndo('Add suggested link');
      addEdge(l.s, l.t, l.label, null, 1, { inferred: true, why: l.why });
      l.done = true;
      actions.structureChanged({ reheat: 0.4 });
      toast('Link added (dashed = suggested)', 'ok');
    } else if (b.dataset.show != null) {
      const l = INS.links[+b.dataset.show];
      const a = IDX.byId.get(l.s);
      const c = IDX.byId.get(l.t);
      if (a && c) {
        G.path = { seq: [l.s, l.t], set: new Set([l.s, l.t]) };
        G.dirty = true;
        actions.fitView([a, c], 120);
        toast('Showing the pair. Press Esc to clear.');
      }
    } else if (b.dataset.gap != null) {
      addGap(INS.gaps[+b.dataset.gap], actions);
    }
  };
  updateSpeakButtons();
}

export function renderInsStats(actions) {
  const S = getVault();
  const box = $('#insStats');
  if (!box) return;
  const big = D.commList.filter((c) => c.big);
  const btw = S.nodes.length <= 1500 ? betweenness() : new Map();
  const bridges = [...S.nodes]
    .map((n) => {
      const cs = new Set();
      for (const a of D.adj.get(n.id) || []) cs.add(D.comm.get(a.o));
      cs.delete(D.comm.get(n.id));
      return { n, b: btw.get(n.id) || 0, c: cs.size };
    })
    .filter((x) => x.c >= 1 && x.b > 0)
    .sort((a, b) => b.b - a.b)
    .slice(0, 5);
  const loose = S.nodes
    .filter((n) => (D.deg.get(n.id) || 0) <= 1)
    .sort((a, b) => (D.deg.get(a.id) || 0) - (D.deg.get(b.id) || 0));
  const maxB = bridges[0]?.b || 1;
  const maxDoc = Math.max(1, ...S.docs.map((d) => D.docDeg.get('doc:' + d.id) || 0));

  box.innerHTML = `
  <div><div class="sub-h"><span>Clusters</span><span>${big.length} themes</span></div>${
    big.length
      ? `<ul class="clist">${big
          .slice(0, 10)
          .map(
            (c) =>
              `<li><button type="button" data-cl="${c.i}"><i style="background:${
                c.color
              }"></i><span><span class="nm">${esc(
                c.name
              )}</span><span class="mem" style="display:block">${c.members
                .slice(1, 6)
                .map((id) => esc(lbl(id)))
                .join(' · ')}${c.members.length > 6 ? ' …' : ''}</span></span><span class="n">${
                c.members.length
              }</span></button></li>`
          )
          .join('')}</ul>`
      : '<p class="muted" style="margin:0;font-size:12.5px">No clusters yet. They appear once nodes start linking up.</p>'
  }</div>
  <div><div class="sub-h"><span>Bridge ideas</span><span>betweenness</span></div>${
    bridges.length
      ? `<ol class="hubs">${bridges
          .map(
            (x) =>
              `<li><button type="button" data-node="${esc(x.n.id)}">${shapeSvg(
                x.n.type,
                11
              )}<span class="nm">${esc(x.n.label)}</span><span class="bar"><i style="width:${Math.round(
                (x.b / maxB) * 100
              )}%;background:var(--violet)"></i></span><span class="n">${x.c + 1}c</span></button></li>`
          )
          .join(
            ''
          )}</ol><p class="muted" style="margin:6px 0 0;font-size:11.5px">These sit on the most shortest paths. Removing one would split your graph the most.</p>`
      : '<p class="muted" style="margin:0;font-size:12.5px">No bridges yet.</p>'
  }</div>
  <div><div class="sub-h"><span>Loose ends</span><span>${loose.length}</span></div>${
    loose.length
      ? `<div class="chips">${loose
          .slice(0, 14)
          .map(
            (n) =>
              `<button class="nchip" type="button" data-node="${esc(n.id)}">${shapeSvg(n.type, 9)}${esc(
                n.label
              )}</button>`
          )
          .join('')}${
          loose.length > 14 ? `<span class="conf">+${loose.length - 14} more</span>` : ''
        }</div><p class="muted" style="margin:6px 0 0;font-size:11.5px">Ideas with one link or none. Good candidates to read more about or link by hand.</p>`
      : '<p class="muted" style="margin:0;font-size:12.5px">Every idea has at least two links.</p>'
  }</div>
  <div><div class="sub-h"><span>Source coverage</span><span>nodes</span></div><div class="cov">${
    S.docs
      .map((d, i) => {
        const v = D.docDeg.get('doc:' + d.id) || 0;
        return `<div><span title="${esc(d.title)}">${esc(d.title)}</span><b>${v}</b><span class="bar"><i style="width:${Math.round(
          (v / maxDoc) * 100
        )}%;background:${pal(i)}"></i></span></div>`;
      })
      .join('') || '<p class="muted" style="margin:0;font-size:12.5px">No sources yet.</p>'
  }</div></div>`;

  box.onclick = (e) => {
    const b = e.target.closest('[data-cl]');
    if (!b) return;
    const c = D.commList[+b.dataset.cl];
    if (!c) return;
    if (G.colorBy !== 'cluster') {
      G.colorBy = 'cluster';
      actions.renderControls();
      actions.renderLegend();
    }
    G.sel = null;
    G.path = null;
    G.glow = new Set(c.members);
    G.dirty = true;
    actions.fitView(
      c.members.map((id) => IDX.byId.get(id)).filter((n) => n && G.visIds.has(n.id)),
      90
    );
    toast(`Highlighting cluster “${clip(c.name, 30)}”. Press Esc to clear.`);
  };
}

export function renderInsights(actions) {
  const p = $('#pane-insights');
  if (!p) return;
  if (!p.querySelector('#insAI')) {
    p.innerHTML = '<div id="insAI"></div><div id="insStats" style="display:flex;flex-direction:column;gap:16px"></div>';
  }
  renderInsAI(actions);
  renderInsStats(actions);
}
