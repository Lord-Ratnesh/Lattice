import { beforeEach, describe, expect, it } from 'vitest';
import { buildSampleVault } from '../src/core/sampleVault.js';
import { derive, getVault, PASS, reindex, setVault, TEXTS } from '../src/core/state.js';
import { retrieve } from '../src/core/retrieval.js';
import {
  localAskAnswer,
  localDeepDive,
  localDiscoverLinks,
  localExplainPath,
  localFindGaps,
  localStudyBrief,
} from '../src/services/localFallback.js';
import { exportCSV, exportJSON, exportMD } from '../src/services/export.js';

describe('localFallback & exports', () => {
  beforeEach(() => {
    TEXTS.clear();
    PASS.clear();
    const s = buildSampleVault(TEXTS);
    setVault(s);
    reindex();
    derive();
  });

  it('generates structured study cards and Q&A answers locally', () => {
    const S = getVault();
    const transformer = S.nodes.find((n) => n.label === 'Transformer');
    const card = localDeepDive(transformer);
    expect(card).toContain('### What it is');
    expect(card).toContain('### How it connects');
    expect(card).toContain('[[Self-Attention]]');

    const ctx = retrieve('How does RAG reduce hallucination?');
    const ans = localAskAnswer('How does RAG reduce hallucination?', ctx);
    expect(ans).toContain('[[Retrieval-Augmented Generation]]');
    expect(ans).toContain('{{Notes — Retrieval-Augmented Generation}}');
  });

  it('generates path explanation, link suggestions, gap topics, and study brief', () => {
    const exp = localExplainPath(['s_transformer', 's_self_attention', 's_graph_attention_network']);
    expect(exp).toContain('[[Transformer]]');
    expect(exp).toContain('[[Graph Attention Network]]');

    const links = localDiscoverLinks();
    expect(links.length).toBeGreaterThan(0);

    const gaps = localFindGaps();
    expect(gaps.length).toBeGreaterThan(0);

    const brief = localStudyBrief();
    expect(brief).toContain('### Big picture');
    expect(brief).toContain('### Themes');
    expect(brief).toContain('### Test yourself');
  });

  it('exports valid JSON, Markdown, and CSV representations', () => {
    const json = JSON.parse(exportJSON());
    expect(json.app).toBe('Lattice');
    expect(json.nodes.length).toBe(57);
    expect(json.texts.d1).toContain('Transformer');

    const mdOut = exportMD();
    expect(mdOut).toContain('# Lattice vault');
    expect(mdOut).toContain('[[Self-Attention]]');

    const csv = exportCSV();
    expect(csv.split('\n')[0]).toBe('source,relation,target,weight,sources,suggested');
    expect(csv).toContain('"Transformer"');
  });
});
