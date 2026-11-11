import { beforeEach, describe, expect, it } from 'vitest';
import { derive, getVault, reindex, setVault, TEXTS } from '../src/core/state.js';
import { chunkText, cleanName, htmlToText, localExtract, mergeExtraction } from '../src/services/ingest.js';

describe('ingest & extraction', () => {
  beforeEach(() => {
    TEXTS.clear();
    setVault({ v: 1, sample: false, pristine: false, origin: 'mine', updatedAt: 0, docs: [], nodes: [], edges: [] });
    reindex();
    derive();
  });

  it('cleans entity names and extracts parenthetical aliases', () => {
    expect(cleanName('“Retrieval-Augmented Generation (RAG)”')).toEqual({
      name: 'Retrieval-Augmented Generation',
      aliases: ['RAG'],
    });
    expect(cleanName('- Self-Attention.')).toEqual({
      name: 'Self-Attention',
      aliases: [],
    });
  });

  it('chunks long text cleanly and samples evenly when truncated', () => {
    const paras = Array.from({ length: 12 }, (_, i) => `Paragraph ${i} ` + 'word '.repeat(60)).join('\n\n');
    const res = chunkText(paras, 500, 4);
    expect(res.truncated).toBe(true);
    expect(res.chunks.length).toBe(4);
    expect(res.chunks[0]).toContain('Paragraph 0');
    expect(res.chunks[3]).toContain('Paragraph 11');
  });

  it('extracts entities and co-occurrence edges locally from prose', () => {
    const text = `
      Knowledge Graph systems store entities and typed relations for Question Answering.
      In Question Answering pipelines, Retrieval-Augmented Generation pairs a Large Language Model with dense retrieval.
      Large Language Model accuracy improves when Knowledge Graph structure complements Retrieval-Augmented Generation.
    `;
    const res = localExtract(text);
    const names = res.entities.map((e) => e.name);
    expect(names).toContain('Knowledge Graph');
    expect(names).toContain('Large Language Model');
    expect(res.relations.length).toBeGreaterThan(0);
    expect(res.summary.length).toBeGreaterThan(20);
  });

  it('merges extracted entities into existing nodes by normalized key or alias', () => {
    const S = getVault();
    const doc1 = { id: 'doc1', title: 'Doc 1', addedAt: 1000 };
    S.docs.push(doc1);
    reindex();

    mergeExtraction(
      {
        entities: [
          { name: 'Retrieval-Augmented Generation', type: 'method', aliases: ['RAG'], summary: 'Grounds LLMs.' },
          { name: 'Vector Database', type: 'artifact', aliases: [], summary: 'Stores vectors.' },
        ],
        relations: [{ source: 'Retrieval-Augmented Generation', target: 'Vector Database', label: 'queries', weight: 2 }],
      },
      doc1
    );
    expect(S.nodes.length).toBe(2);
    expect(S.edges.length).toBe(1);

    const doc2 = { id: 'doc2', title: 'Doc 2', addedAt: 2000 };
    S.docs.push(doc2);
    reindex();

    // Referencing by alias 'RAG' should merge into the existing node rather than duplicating
    mergeExtraction(
      {
        entities: [{ name: 'RAG', type: 'method', aliases: [], summary: '' }],
        relations: [],
      },
      doc2
    );
    expect(S.nodes.length).toBe(2);
    const ragNode = S.nodes.find((n) => n.label === 'Retrieval-Augmented Generation');
    expect(ragNode.docs).toEqual(['doc1', 'doc2']);
    expect(ragNode.mentions).toBe(2);
  });

  it('strips scripts/styles and extracts readable text from HTML', () => {
    const html = '<html><head><title>Test Page</title><style>body{color:red}</style></head><body><script>evil()</script><h1>Hello World</h1><p>Paragraph one.</p></body></html>';
    const out = htmlToText(html);
    expect(out.title).toBe('Test Page');
    expect(out.text).toContain('Hello World');
    expect(out.text).toContain('Paragraph one.');
    expect(out.text).not.toContain('evil()');
  });
});
