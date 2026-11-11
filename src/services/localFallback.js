import { clip } from '../core/utils.js';
import { TYPES } from '../core/constants.js';
import { suggestTopologyLinks } from '../core/graphAlgo.js';
import { D, docTitle, getVault, IDX, lbl, pairKey } from '../core/state.js';
import { searchPassages, tokenize } from '../core/retrieval.js';

/**
 * On-device heuristic fallbacks so every analysis tab (Deep Dive, Ask, Path Explain,
 * Hidden Links, Gaps, Study Brief) remains genuinely useful even without an API key.
 */

export function localDeepDive(node) {
  const adj = D.adj.get(node.id) || [];
  const typeName = TYPES[node.type]?.name || 'Concept';
  const summaryLine = node.summary
    ? node.summary
    : `${node.label} is a ${typeName.toLowerCase()} appearing across ${(node.docs || []).length || 1} source(s) in your vault.`;

  const connBullets = adj.slice(0, 5).map((a) => {
    const other = IDX.byId.get(a.o);
    if (!other) return '';
    return a.out
      ? `- ${a.e.label} → [[${other.label}]] (${clip(other.summary || TYPES[other.type]?.name, 70)})`
      : `- [[${other.label}]] ${a.e.label} this node`;
  }).filter(Boolean);

  const passages = searchPassages(tokenize(node.label + ' ' + (node.aliases || []).join(' ')), 3);
  const topPassage = passages[0];
  const insight = topPassage
    ? `Grounded in {{${docTitle(topPassage.docId)}}}: ${clip(topPassage.text, 150)}`
    : `Connected to ${adj.length} neighboring idea(s) across ${(node.docs || []).length} source(s) (on-device summary; connect an AI provider for deeper synthesis).`;

  const cl = D.commList[D.comm.get(node.id)];
  const sibling = cl?.members.find((id) => id !== node.id && !adj.some((a) => a.o === id));
  const openQuestions = [
    sibling
      ? `- How does [[${node.label}]] interact with [[${lbl(sibling)}]] in the same cluster?`
      : `- Which external benchmarks or primary sources expand on [[${node.label}]]?`,
    `- What limitations or failure modes of [[${node.label}]] appear in your notes?`,
  ];

  return [
    '### What it is',
    summaryLine,
    '',
    '### How it connects',
    connBullets.length ? connBullets.join('\n') : '- Not yet linked to other entities.',
    '',
    '### Key insight',
    insight,
    '',
    '### Open questions',
    openQuestions.join('\n'),
  ].join('\n');
}

export function localAskAnswer(question, ctx) {
  const { nodes, edges, passages } = ctx;
  if (!nodes.length && !passages.length) {
    return 'Your vault has no matching nodes or passages for this question yet. Drop in a note or paper to start mapping.';
  }

  const topNodes = nodes.slice(0, 5);
  const nodeLine = topNodes.length
    ? `Relevant ideas in your graph: ${topNodes.map((n) => `[[${n.label}]]`).join(', ')}.`
    : '';

  const relBullets = edges.slice(0, 5).map(
    (e) => `- [[${lbl(e.s)}]] **${e.label}** [[${lbl(e.t)}]]`
  );

  const excerptBullets = passages.slice(0, 3).map(
    (p) => `- {{${docTitle(p.docId)}}}: ${clip(p.text, 200)}`
  );

  const parts = [
    `**On-device retrieval** for *"${clip(question, 90)}"*:`,
    nodeLine,
  ];
  if (relBullets.length) {
    parts.push('#### Graph links', relBullets.join('\n'));
  }
  if (excerptBullets.length) {
    parts.push('#### Source passages', excerptBullets.join('\n'));
  }
  parts.push('*Tip: Connect an AI provider in the top bar for synthesized natural-language answers.*');
  return parts.filter(Boolean).join('\n\n');
}

export function localExplainPath(seq) {
  if (!seq || seq.length < 2) return '';
  const steps = [];
  for (let i = 0; i < seq.length - 1; i++) {
    const a = IDX.byId.get(seq[i]);
    const b = IDX.byId.get(seq[i + 1]);
    const e = IDX.pair.get(pairKey(seq[i], seq[i + 1]));
    if (!a || !b) continue;
    const rel = e ? e.label : 'links to';
    if (!e || e.s === a.id) {
      steps.push(`[[${a.label}]] **${rel}** [[${b.label}]]`);
    } else {
      steps.push(`[[${b.label}]] **${rel}** [[${a.label}]]`);
    }
  }
  const first = IDX.byId.get(seq[0]);
  const last = IDX.byId.get(seq[seq.length - 1]);
  return `Starting from [[${first.label}]], the chain traces ${seq.length - 1} step(s): ${steps.join('; then ')}. Together, this path links ${TYPES[first.type]?.name.toLowerCase() || 'idea'} [[${first.label}]] to [[${last.label}]] across your sources.`;
}

export function localDiscoverLinks() {
  const S = getVault();
  const suggestions = suggestTopologyLinks({
    nodes: S.nodes,
    adjMap: D.adj,
    degMap: D.deg,
    commMap: D.comm,
    pairMap: IDX.pair,
    pairKeyFn: pairKey,
    limit: 8,
  });

  return suggestions.map((item) => {
    let why = '';
    if (item.sharedIds.length) {
      const via = item.sharedIds.slice(0, 2).map(lbl).join(' and ');
      why = `${item.crossCluster ? 'Cross-cluster bridge: b' : 'B'}oth connect to ${via}.`;
    } else {
      const viaDocs = item.sharedDocs.slice(0, 2).map(docTitle).join(', ');
      why = `Both appear together in ${viaDocs}.`;
    }
    return {
      s: item.s,
      t: item.t,
      label: item.label,
      why,
      conf: item.conf,
    };
  });
}

export function localFindGaps() {
  const S = getVault();
  const big = D.commList.filter((c) => c.big);
  const gaps = [];

  // Suggest bridge gaps between the largest disconnected/weakly connected clusters
  for (let i = 0; i < Math.min(3, big.length - 1); i++) {
    const cA = big[i];
    const cB = big[i + 1];
    const repA = IDX.byId.get(cA.members[0]);
    const repB = IDX.byId.get(cB.members[0]);
    if (!repA || !repB) continue;
    const topic = `${repA.label} × ${repB.label} Bridge`;
    if (IDX.byKey.has(topic.toLowerCase())) continue;
    gaps.push({
      topic: clip(topic, 60),
      why: `Connects cluster "${cA.name}" and cluster "${cB.name}", which currently have sparse direct overlap.`,
      search: `${repA.label} ${repB.label}`,
      near: [repA.id, repB.id],
    });
  }

  // Suggest expanding high-importance leaf nodes (degree === 1)
  const leaves = S.nodes
    .filter((n) => (D.deg.get(n.id) || 0) === 1)
    .sort((a, b) => (b.docs?.length || 0) - (a.docs?.length || 0));

  for (const leaf of leaves.slice(0, 2)) {
    const topic = `Deepening: ${leaf.label}`;
    gaps.push({
      topic: clip(topic, 60),
      why: `${leaf.label} only has 1 connection in your graph—adding a dedicated source would anchor it better.`,
      search: leaf.label,
      near: [leaf.id],
    });
  }

  return gaps.slice(0, 5);
}

export function localStudyBrief() {
  const S = getVault();
  const big = D.commList.filter((c) => c.big).slice(0, 6);
  const hubs = [...S.nodes]
    .sort((a, b) => (D.deg.get(b.id) || 0) - (D.deg.get(a.id) || 0))
    .slice(0, 6);

  const themes = big.map((c) => {
    const top = c.members.slice(0, 4).map((id) => `[[${lbl(id)}]]`).join(', ');
    return `- **${c.name}**: ${c.members.length} linked ideas including ${top}.`;
  });

  const bridges = hubs.slice(0, 3).map(
    (n) => `- [[${n.label}]] (${D.deg.get(n.id) || 0} links) anchors ${(n.docs || []).length} source(s).`
  );

  const questions = hubs.slice(0, 5).map((n) => {
    const adj = D.adj.get(n.id)?.[0];
    if (adj) {
      return `- How does [[${n.label}]] ${adj.out ? adj.e.label : 'relate to'} [[${lbl(adj.o)}]]?`;
    }
    return `- What role does [[${n.label}]] play across your notes?`;
  });

  return [
    '### Big picture',
    `Your vault maps **${S.nodes.length} entities** and **${S.edges.length} relationships** extracted from **${S.docs.length} source(s)** across **${big.length} thematic clusters**.`,
    '',
    '### Themes',
    themes.length ? themes.join('\n') : '- Add more interconnected notes to form clusters.',
    '',
    '### Bridges',
    bridges.length ? bridges.join('\n') : '- No major hub nodes yet.',
    '',
    '### Test yourself',
    questions.length ? questions.join('\n') : '- Ingest a source to generate study questions.',
  ].join('\n');
}
