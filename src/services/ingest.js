import { clip, escRe, fmtNum, normKey, rid, stripExt, titleCase, uniq } from '../core/utils.js';
import { ENTITY_TYPES, STOP } from '../core/constants.js';
import { addEdge, D, docNode, getVault, IDX, indexNode, PASS, pushUndo, TEXTS } from '../core/state.js';
import { aiErr, aiJson, aiSupportsImages, isAIConfigured } from './ai.js';

export const MAX_TEXT = 400000;
export const IMG_EXT = ['png', 'jpg', 'jpeg', 'webp', 'gif'];
export const TEXT_EXT = [
  'md', 'markdown', 'txt', 'text', 'csv', 'json', 'tex', 'rst', 'org',
  'log', 'yaml', 'yml', 'bib', 'py', 'js', 'ts', 'ipynb',
];

const SCHEMA =
  '{"title":"","kind":"","summary":"","entities":[{"name":"","type":"concept","summary":"","aliases":[]}],"relations":[{"source":"","target":"","label":"","weight":2}]}';

const RULES = `Rules:
- entities: 6 to 18 items. type is one of concept, method, person, artifact, field.
  concept = idea or phenomenon; method = technique, algorithm, model architecture or process; person = a named individual; artifact = dataset, benchmark, tool, library, product, named model or cited paper; field = discipline or research area.
  Use specific, reusable Title Case names ("Self-Attention", not "the attention idea"). Full names for people. Put acronyms and other spellings in aliases. Skip generic words such as "results", "paper", "approach" or "data".
  summary: one plain sentence (max 22 words) saying what it is, as this text describes it.
- relations: 8 to 24 items linking entity names from your list or from the existing nodes. label is a lowercase verb phrase of 1 to 3 words, such as "uses", "proposed", "evaluated on", "part of", "contrasts with". weight is 1 to 3 for how central the link is.`;

function knownLabels(limit = 140) {
  const S = getVault();
  return [...S.nodes]
    .sort((a, b) => (D.deg.get(b.id) || 0) - (D.deg.get(a.id) || 0))
    .slice(0, limit)
    .map((n) => n.label)
    .join('; ');
}

export function extractPrompt(name, chunk, i, n) {
  return `You are mapping a reader's document into their personal knowledge graph.

Document: ${name}${n > 1 ? ` (section ${i + 1} of ${n})` : ''}
Nodes already in the graph. When the text refers to one of these, reuse the exact name:
${knownLabels() || '(none yet)'}

Extract the important knowledge in the TEXT below.
${RULES}
${
  i === 0
    ? '- title: a short human title for the document (max 10 words). kind: one of paper, notes, article, book, transcript, other. summary: two sentences on what the document covers.'
    : '- title, kind and summary may be left empty.'
}

Reply with only JSON in this shape:
${SCHEMA}

TEXT:
"""
${chunk}
"""`;
}

export function imagePrompt(name) {
  return `You are mapping a reader's notes into their personal knowledge graph. The attached image (${name}) is a photo or scan of notes, a whiteboard, slides or a printed page.

First transcribe its readable text into "transcript" (plain text, max 4000 characters; describe any diagram briefly in [brackets]). Then extract the knowledge it contains.

Nodes already in the graph. When the image refers to one of these, reuse the exact name:
${knownLabels() || '(none yet)'}

${RULES}
- title: a short human title (max 10 words). kind: notes, paper, article, book, transcript or other. summary: two sentences.

Reply with only JSON in this shape:
{"transcript":"",${SCHEMA.slice(1)}`;
}

export function cleanName(s) {
  let n = String(s || '').replace(/["“”]/g, '').replace(/\s+/g, ' ').trim();
  const al = [];
  const m = n.match(/^(.*?)\s*\(([^)]{1,30})\)$/);
  if (m && m[1].length > 1) {
    n = m[1].trim();
    al.push(m[2].trim());
  }
  n = n.replace(/^[\-–•*\s]+|[.,;:\s]+$/g, '');
  return { name: clip(n, 70), aliases: al };
}

export function mergeExtraction(res, doc) {
  const S = getVault();
  const added = [];
  if (!res || typeof res !== 'object') return { added, entities: 0, links: 0 };
  const dn = docNode(doc);
  const map = new Map();
  const t = doc.addedAt || Date.now();
  const ents = Array.isArray(res.entities) ? res.entities.slice(0, 30) : [];

  for (const ent of ents) {
    if (!ent) continue;
    const { name, aliases: al } = cleanName(ent.name);
    if (!name || name.length < 2) continue;
    const type = ENTITY_TYPES.includes(String(ent.type).toLowerCase())
      ? String(ent.type).toLowerCase()
      : 'concept';
    const aliases = uniq([
      ...al,
      ...(Array.isArray(ent.aliases)
        ? ent.aliases.map((a) => clip(String(a).trim(), 60)).filter(Boolean)
        : []),
    ]).slice(0, 6);

    let id = IDX.byKey.get(normKey(name));
    if (!id) {
      for (const a of aliases) {
        id = IDX.byKey.get(normKey(a));
        if (id) break;
      }
    }

    if (id) {
      const n = IDX.byId.get(id);
      if (!n.docs.includes(doc.id)) n.docs.push(doc.id);
      n.mentions = (n.mentions || 1) + 1;
      const sm = clip(String(ent.summary || '').trim(), 240);
      if (sm && (!n.summary || n.summary.length < 24)) n.summary = sm;
      for (const a of aliases) {
        if (normKey(a) !== normKey(n.label) && !n.aliases.some((x) => normKey(x) === normKey(a))) {
          n.aliases.push(a);
          const ak = normKey(a);
          if (ak && !IDX.byKey.has(ak)) IDX.byKey.set(ak, n.id);
        }
      }
      if (n.type === 'gap') n.type = type;
    } else {
      const ang = Math.random() * Math.PI * 2;
      const rr = 30 + Math.random() * 50;
      const n = {
        id: rid('n'),
        label: name,
        type,
        summary: clip(String(ent.summary || '').trim(), 240),
        aliases: aliases.filter((a) => normKey(a) !== normKey(name)),
        docs: [doc.id],
        t,
        mentions: 1,
        note: '',
        pinned: false,
        x: (dn ? dn.x : 0) + Math.cos(ang) * rr,
        y: (dn ? dn.y : 0) + Math.sin(ang) * rr,
      };
      S.nodes.push(n);
      indexNode(n);
      D.deg.set(n.id, 0);
      id = n.id;
      added.push(n.id);
    }
    map.set(normKey(name), id);
    for (const a of aliases) {
      const ak = normKey(a);
      if (ak && !map.has(ak)) map.set(ak, id);
    }
  }

  const rels = Array.isArray(res.relations) ? res.relations.slice(0, 40) : [];
  const look = (x) => {
    const k = normKey(cleanName(x).name);
    return map.get(k) || IDX.byKey.get(k);
  };
  let links = 0;
  for (const r of rels) {
    if (!r) continue;
    const s = look(r.source);
    const tg = look(r.target);
    if (!s || !tg || s === tg) continue;
    const label = clip(
      String(r.label || 'related to')
        .toLowerCase()
        .replace(/[^a-z0-9 \-']/g, '')
        .trim() || 'related to',
      36
    );
    if (addEdge(s, tg, label, doc.id, Number(r.weight) || 1)) links++;
  }
  return { added, entities: ents.length, links };
}

export function guessType(name, text) {
  if (/\b(dataset|benchmark|corpus|library|toolkit|framework|database|api)\b/i.test(name)) return 'artifact';
  if (
    /\b(network|algorithm|method|model|regression|search|training|tokeni[sz]ation|encoding|attention|learning rate|optimi[sz]er|sampling|quantization)\b/i.test(
      name
    )
  ) {
    return 'method';
  }
  if (
    /\b(theory|science|studies|engineering|biology|economics|linguistics|processing|retrieval|vision|history|mathematics|physics|chemistry)$/i.test(
      name
    )
  ) {
    return 'field';
  }
  const w = name.split(' ');
  if (w.length >= 2 && w.length <= 3 && w.every((x) => /^[A-Z][a-zà-ÿ'’\-]+$/.test(x))) {
    const re = new RegExp(
      escRe(name) + '\\s+(et al|and colleagues|\\(\\d{4}|argues|proposed|introduced|showed|found|wrote)|\\bby\\s+' + escRe(name),
      'i'
    );
    if (re.test(text)) return 'person';
  }
  return 'concept';
}

export function localExtract(text, existingNodes = []) {
  const clean = text.replace(/\s+/g, ' ').slice(0, 200000);
  const sents = clean.split(/(?<=[.!?])\s+/).filter((s) => s.length > 20).slice(0, 5000);
  const cand = new Map();
  const add = (name, startOnly) => {
    name = name.trim().replace(/[.,;:]+$/, '');
    if (name.length < 3 || name.length > 60) return;
    const k = normKey(name);
    if (!k) return;
    const w = k.split(' ');
    if (STOP.has(k) || STOP.has(w[0]) || STOP.has(w[w.length - 1])) return;
    let c = cand.get(k);
    if (!c) {
      c = { name, count: 0, mid: 0 };
      cand.set(k, c);
    }
    c.count++;
    if (!startOnly) c.mid++;
  };

  const capRe =
    /\b([A-Z][A-Za-z0-9]*(?:-[A-Za-z0-9]+)*(?:\s+(?:of\s+|for\s+|and\s+)?[A-Z][A-Za-z0-9]*(?:-[A-Za-z0-9]+)*){0,3})/g;
  for (const s of sents) {
    let m;
    capRe.lastIndex = 0;
    while ((m = capRe.exec(s))) {
      add(m[1], m.index === 0 && !m[1].includes(' '));
    }
    const acr = s.match(/\b[A-Z]{2,6}s?\b/g);
    if (acr) acr.forEach((a) => add(a.replace(/s$/, ''), false));
  }

  const bi = new Map();
  for (const s of sents) {
    const ws = s.toLowerCase().match(/[a-z][a-z\-]{2,}/g) || [];
    for (let i = 0; i < ws.length - 1; i++) {
      if (STOP.has(ws[i]) || STOP.has(ws[i + 1])) continue;
      const b = ws[i] + ' ' + ws[i + 1];
      bi.set(b, (bi.get(b) || 0) + 1);
    }
  }
  for (const [b, c] of bi) {
    if (c >= 3) {
      const k = normKey(b);
      const ex = cand.get(k);
      if (ex) ex.count += c;
      else cand.set(k, { name: titleCase(b), count: c, mid: c });
    }
  }

  const lc = clean.toLowerCase();
  for (const n of existingNodes) {
    const l = n.label.toLowerCase();
    if (l.length < 4) continue;
    if (lc.includes(l)) {
      const k = normKey(n.label);
      const ex = cand.get(k);
      if (ex) {
        ex.count += 3;
        ex.name = n.label;
        ex.known = n;
      } else {
        cand.set(k, { name: n.label, count: 3, mid: 3, known: n });
      }
    }
  }

  const list = [...cand.values()]
    .filter((c) => c.mid > 0 && (c.count >= 2 || c.known))
    .map((c) => ({
      ...c,
      score: c.count * (c.name.includes(' ') ? 1.7 : 1) * (c.known ? 1.5 : 1),
    }))
    .sort((a, b) => b.score - a.score)
    .slice(0, 18);

  const ents = list.map((c) => {
    const s = sents.find((x) => x.toLowerCase().includes(c.name.toLowerCase()));
    return {
      name: c.name,
      type: c.known ? c.known.type : guessType(c.name, clean),
      summary: s ? clip(s, 170) : '',
      aliases: [],
    };
  });

  const keys = ents.map((e) => ({ e, re: new RegExp('\\b' + escRe(e.name.toLowerCase()) + '\\b') }));
  const pair = new Map();
  for (const s of sents) {
    const ls = s.toLowerCase();
    const present = keys.filter((k) => k.re.test(ls));
    for (let i = 0; i < present.length; i++) {
      for (let j = i + 1; j < present.length; j++) {
        const a = present[i].e.name;
        const b = present[j].e.name;
        const pk = a < b ? a + '\u0001' + b : b + '\u0001' + a;
        pair.set(pk, (pair.get(pk) || 0) + 1);
      }
    }
  }
  const rels = [...pair.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 26)
    .map(([pk, c]) => {
      const [a, b] = pk.split('\u0001');
      return { source: a, target: b, label: 'co-occurs with', weight: Math.min(3, c) };
    });

  return { entities: ents, relations: rels, summary: clip(sents.slice(0, 2).join(' '), 300) };
}

export function chunkText(text, size, max) {
  const paras = text.split(/\n\s*\n/);
  const chunks = [];
  let cur = '';
  for (const p of paras) {
    if (p.length > size) {
      if (cur) {
        chunks.push(cur);
        cur = '';
      }
      for (let i = 0; i < p.length; i += size) chunks.push(p.slice(i, i + size));
      continue;
    }
    if (cur && cur.length + p.length + 2 > size) {
      chunks.push(cur);
      cur = p;
    } else {
      cur = cur ? cur + '\n\n' + p : p;
    }
  }
  if (cur.trim()) chunks.push(cur);
  const real = chunks.filter((c) => c.trim().length > 60);
  const list = real.length ? real : chunks;
  if (list.length <= max) return { chunks: list, truncated: false, total: list.length };
  const pick = [];
  for (let i = 0; i < max; i++) {
    pick.push(list[Math.round((i * (list.length - 1)) / (max - 1))]);
  }
  return { chunks: pick, truncated: true, total: list.length };
}

export function htmlToText(html) {
  const d = new DOMParser().parseFromString(html, 'text/html');
  d.querySelectorAll('script,style,noscript,svg,nav,footer').forEach((e) => e.remove());
  const title = d.title || '';
  d.querySelectorAll('p,div,li,h1,h2,h3,h4,h5,h6,br,tr,section,article').forEach((e) => e.append('\n'));
  return { title, text: (d.body ? d.body.textContent : '').replace(/\n{3,}/g, '\n\n') };
}

async function readPdf(file, doc, logFn) {
  const [pdfjsLib, workerModule] = await Promise.all([
    import('pdfjs-dist'),
    import('pdfjs-dist/build/pdf.worker.min.js?url'),
  ]);
  const lib = pdfjsLib.default || pdfjsLib;
  if (lib.GlobalWorkerOptions) {
    lib.GlobalWorkerOptions.workerSrc = workerModule.default;
  }
  const pdf = await lib.getDocument({
    data: new Uint8Array(await file.arrayBuffer()),
    isEvalSupported: false,
    disableFontFace: true,
  }).promise;
  const pages = Math.min(pdf.numPages, 160);
  let out = '';
  doc.pages = pdf.numPages;
  for (let i = 1; i <= pages; i++) {
    const pg = await pdf.getPage(i);
    const tc = await pg.getTextContent();
    let s = '';
    for (const it of tc.items) {
      if (!('str' in it)) continue;
      s += it.str + (it.hasEOL ? '\n' : ' ');
    }
    out += s + '\n\n';
    if (i % 20 === 0) logFn?.(`  page ${i}/${pages}`);
    if (out.length > MAX_TEXT) break;
  }
  if (pdf.numPages > pages) logFn?.(`  read the first ${pages} of ${pdf.numPages} pages`, 'warn');
  try {
    pdf.destroy();
  } catch {
    // Ignore destroy errors
  }
  return out.replace(/-\n(?=[a-z])/g, '').replace(/[ \t]+/g, ' ');
}

async function readDocx(file) {
  const mammothMod = await import('mammoth/mammoth.browser');
  const mammoth = mammothMod.default || mammothMod;
  const r = await mammoth.extractRawText({ arrayBuffer: await file.arrayBuffer() });
  return r.value || '';
}

export async function readAny(file, doc, logFn) {
  const ext = (file.name.split('.').pop() || '').toLowerCase();
  const type = file.type || '';
  if (file.size > 80 * 1024 * 1024) {
    throw new Error('This file is larger than 80 MB. Split it into parts and try again.');
  }
  if (type.startsWith('image/') || IMG_EXT.includes(ext)) return { kind: 'photo', image: file, text: '' };
  if (ext === 'pdf' || type === 'application/pdf') return { kind: 'paper', text: await readPdf(file, doc, logFn) };
  if (ext === 'docx') return { kind: 'notes', text: await readDocx(file) };
  if (ext === 'html' || ext === 'htm') {
    const r = htmlToText(await file.text());
    return { kind: 'article', text: r.text, title: r.title };
  }
  if (TEXT_EXT.includes(ext) || type.startsWith('text/') || type === 'application/json') {
    return { kind: 'notes', text: await file.text() };
  }
  throw new Error('This file type isn’t supported. Use PDF, DOCX, Markdown, text, HTML or an image.');
}

export const ING = { queue: [], running: false, ctl: null };

export function createIngestRunner(hooks) {
  const tierFor = () => ({ fast: 'quick', thorough: 'default', deep: 'complex' }[hooks.getDepth()] || 'quick');
  const chunkMax = () => ({ fast: 4, thorough: 6, deep: 8 }[hooks.getDepth()] || 4);

  function applyResult(res, doc, i, n) {
    if (i === 0) {
      if (res.title && String(res.title).trim()) doc.title = clip(String(res.title).trim(), 120);
      if (res.kind && /^(paper|notes|article|book|transcript|other)$/i.test(res.kind)) {
        doc.kind = String(res.kind).toLowerCase();
      }
      if (res.summary) doc.summary = clip(String(res.summary).trim(), 420);
    }
    const r = mergeExtraction(res, doc);
    const now = performance.now();
    r.added.forEach((id) => hooks.markFresh(id, now));
    hooks.log(`  part ${i + 1}/${n}: ${r.entities} entities, ${r.links} links, ${r.added.length} new`);
    hooks.structureChanged({ reheat: 0.55, save: false });
  }

  async function ingest(job) {
    const S = getVault();
    const name = job.file ? job.file.name : job.title || 'Pasted note';
    let doc;

    if (job.replace) {
      doc = IDX.doc.get(job.replace);
      if (!doc) return;
      pushUndo('Re-map ' + doc.title);
      S.nodes.forEach((n) => {
        n.docs = n.docs.filter((x) => x !== doc.id);
      });
      S.nodes = S.nodes.filter((n) => n.docs.length || n.manual || n.type === 'gap');
      S.edges = S.edges.filter((e) => {
        e.docs = e.docs.filter((x) => x !== doc.id);
        return e.docs.length || e.manual || e.inferred;
      });
      doc.status = 'reading';
      hooks.structureChanged({ reheat: 0.2 });
    } else {
      pushUndo('Ingest ' + clip(name, 40));
      doc = {
        id: rid('d'),
        title: stripExt(name),
        file: name,
        kind: 'notes',
        addedAt: Date.now(),
        summary: '',
        chars: 0,
        status: 'reading',
        method: '',
      };
      const c = hooks.viewCenter();
      const ang = Math.random() * Math.PI * 2;
      doc.x = c[0] + Math.cos(ang) * 80;
      doc.y = c[1] + Math.sin(ang) * 80;
      S.docs.push(doc);
      hooks.ensureSourceVisible();
      hooks.structureChanged({ reheat: 0.25 });
      hooks.markFresh('doc:' + doc.id, performance.now());
    }

    hooks.log(`▸ ${name}`);
    let text = '';
    let image = null;
    try {
      if (job.replace) {
        text = TEXTS.get(doc.id) || '';
      } else if (job.file) {
        const r = await readAny(job.file, doc, hooks.log);
        doc.kind = r.kind || doc.kind;
        text = (r.text || '').replace(/\u0000/g, '').trim();
        image = r.image || null;
        if (r.title) doc.title = clip(r.title, 120);
      } else {
        text = String(job.text || '').trim();
        doc.kind = 'notes';
      }
      if (!image && text.length < 40) {
        throw new Error(
          job.file && /pdf$/i.test(job.file.name)
            ? 'No text layer found. If this is a scanned PDF, upload page photos instead.'
            : 'Not enough readable text in this source.'
        );
      }
    } catch (e) {
      doc.status = 'error';
      doc.error = e.message || String(e);
      hooks.log('  ✕ ' + doc.error, 'err');
      hooks.toast(`${clip(name, 40)}: ${doc.error}`, 'error');
      hooks.renderDocs();
      hooks.scheduleSave();
      return;
    }

    if (text) {
      TEXTS.set(doc.id, text.slice(0, MAX_TEXT));
      doc.chars = text.length;
      PASS.delete(doc.id);
      hooks.log(`  read ${fmtNum(text.length)} characters`);
    }

    const useAI = isAIConfigured();
    const canImage = !image || aiSupportsImages();
    const before = S.nodes.length;

    const localPath = () => {
      const res = localExtract(text, S.nodes);
      doc.method = 'local';
      const r = mergeExtraction(res, doc);
      r.added.forEach((id) => hooks.markFresh(id, performance.now()));
      if (!doc.summary) doc.summary = res.summary;
      doc.status = 'local';
      hooks.log(`  local extraction: ${r.entities} terms, ${r.links} co-occurrence links`, 'ok');
      hooks.structureChanged({ reheat: 0.6 });
    };

    if (useAI && canImage) {
      doc.status = 'extracting';
      doc.method = 'ai';
      ING.ctl = new AbortController();
      const signal = ING.ctl.signal;
      try {
        if (image) {
          if (image.size > 20 * 1024 * 1024) throw { code: 'image_rejected' };
          doc.progress = '1/1';
          hooks.renderDocs();
          const res = await aiJson(imagePrompt(name), {
            images: [image],
            modelTier: tierFor() === 'quick' ? 'default' : tierFor(),
            signal,
          });
          if (!res || typeof res !== 'object') throw { code: 'invalid_json' };
          if (res.transcript) {
            const tx = String(res.transcript);
            TEXTS.set(doc.id, tx);
            doc.chars = tx.length;
            PASS.delete(doc.id);
          }
          applyResult(res, doc, 0, 1);
        } else {
          const { chunks, truncated, total } = chunkText(text, 9000, chunkMax());
          if (truncated) {
            hooks.log(`  long source: mapping ${chunks.length} of ${total} sections, evenly spaced`, 'warn');
          }
          for (let i = 0; i < chunks.length; i++) {
            doc.progress = `${i + 1}/${chunks.length}`;
            hooks.renderDocs();
            const res = await aiJson(extractPrompt(name, chunks[i], i, chunks.length), {
              modelTier: tierFor(),
              signal,
            });
            if (!res || typeof res !== 'object' || !Array.isArray(res.entities)) {
              throw { code: 'invalid_json' };
            }
            applyResult(res, doc, i, chunks.length);
          }
        }
        doc.status = 'done';
      } catch (e) {
        if (e && e.code === 'cancelled') {
          doc.status = S.nodes.some((n) => n.docs.includes(doc.id)) ? 'partial' : 'error';
          doc.error = 'Stopped before mapping finished.';
          hooks.log('  stopped', 'warn');
        } else {
          const has = S.nodes.some((n) => n.docs.includes(doc.id));
          doc.status = has ? 'partial' : 'error';
          doc.error = aiErr(e);
          hooks.log('  ✕ ' + doc.error, 'err');
          if (!has && text) {
            hooks.log('  falling back to local extraction', 'warn');
            localPath();
            doc.status = 'local';
          } else {
            hooks.toast(doc.error, 'error');
          }
        }
      } finally {
        ING.ctl = null;
      }
    } else if (image) {
      doc.status = 'error';
      doc.error = useAI
        ? 'Selected AI provider does not support image transcription.'
        : 'Photo notes require a vision-capable AI provider (Claude, OpenAI, or Gemini) in AI Settings.';
      hooks.log('  ✕ ' + doc.error, 'err');
      hooks.toast(doc.error, 'error');
    } else {
      localPath();
    }

    delete doc.progress;
    S.updatedAt = Date.now();
    const made = S.nodes.length - before;
    const total = D.docDeg.get('doc:' + doc.id) || S.nodes.filter((n) => n.docs.includes(doc.id)).length;
    hooks.structureChanged({ reheat: 0.3 });

    if (doc.status !== 'error') {
      hooks.log(`✓ ${clip(doc.title, 48)}: ${total} nodes (${made} new)`, 'ok');
      hooks.toast(`Mapped “${clip(doc.title, 40)}” · ${total} nodes, ${made} new`, 'ok', {
        label: 'Show',
        fn: () => hooks.enterFocus(docNode(doc)),
      });
    }
  }

  async function runQueue() {
    if (ING.running) return;
    ING.running = true;
    hooks.updateIngestUI();
    while (ING.queue.length) {
      const job = ING.queue.shift();
      try {
        await ingest(job);
      } catch (e) {
        console.error(e);
        hooks.log('✕ ' + (e.message || 'Import failed'), 'err');
      }
    }
    ING.running = false;
    hooks.updateIngestUI();
    hooks.renderDocs();
    hooks.markDirty();
  }

  function enqueueFiles(files) {
    const list = [...files];
    if (!list.length) return;
    for (const f of list) ING.queue.push({ file: f });
    hooks.log(`Queued ${list.length} file${list.length > 1 ? 's' : ''}`);
    runQueue();
  }

  function enqueueText(title, text, replace) {
    ING.queue.push({ title, text, replace });
    runQueue();
  }

  function stop() {
    ING.queue.length = 0;
    if (ING.ctl) ING.ctl.abort();
    hooks.log('Stopping import…', 'warn');
  }

  return { enqueueFiles, enqueueText, stop };
}
