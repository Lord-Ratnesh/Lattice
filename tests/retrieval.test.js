import { beforeEach, describe, expect, it } from 'vitest';
import { buildSampleVault } from '../src/core/sampleVault.js';
import { derive, reindex, setVault, TEXTS, PASS } from '../src/core/state.js';
import { md, passagesFor, plain, retrieve, searchPassages, tokenize } from '../src/core/retrieval.js';

describe('retrieval & markdown-lite', () => {
  beforeEach(() => {
    TEXTS.clear();
    PASS.clear();
    const vault = buildSampleVault(TEXTS);
    setVault(vault);
    reindex();
    derive();
  });

  it('tokenizes queries and strips stopwords', () => {
    const terms = tokenize('How does the Transformer use Self-Attention in NLP?');
    expect(terms).toContain('transformer');
    expect(terms).toContain('self-attention');
    expect(terms).toContain('nlp');
    expect(terms).not.toContain('the');
    expect(terms).not.toContain('how');
  });

  it('splits document text into sentence-aligned passages and ranks via TF-IDF', () => {
    const ps = passagesFor('d1');
    expect(ps.length).toBeGreaterThan(0);
    const hits = searchPassages(['bleu', 'translation'], 4);
    expect(hits.length).toBeGreaterThan(0);
    expect(hits[0].docId).toBe('d1');
  });

  it('retrieves relevant subgraph nodes, edges, and passages for a question', () => {
    const ctx = retrieve('How does HNSW speed up vector database search?');
    const labels = ctx.nodes.map((n) => n.label);
    expect(labels).toContain('HNSW');
    expect(labels).toContain('Vector Database');
    expect(ctx.edges.length).toBeGreaterThan(0);
    expect(ctx.passages.length).toBeGreaterThan(0);
  });

  it('renders [[Node]] chips and {{Source}} citations safely in md()', () => {
    const html = md('### Summary\n- [[Transformer]] uses [[Unknown Node]] in {{Attention Is All You Need}} with `code`.');
    expect(html).toContain('<h4>Summary</h4>');
    expect(html).toContain('data-node="s_transformer"');
    expect(html).toContain('class="nchip ghost"');
    expect(html).toContain('<span class="srcref">Attention Is All You Need</span>');
    expect(html).toContain('<code>code</code>');

    expect(plain('**[[Transformer]]** in {{Source}}')).toBe('Transformer in Source');
  });
});
