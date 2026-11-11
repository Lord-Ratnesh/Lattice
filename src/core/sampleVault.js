import { normKey } from './utils.js';

export const SAMPLE = {
  docs: [
    [
      'd1',
      'Attention Is All You Need',
      'paper',
      '2026-10-02',
      'Introduces the Transformer, a translation model built only from attention. It drops recurrence, trains far faster, and set new BLEU records on WMT 2014.',
      `Reading notes. The paper introduces the Transformer, a sequence-to-sequence model that drops recurrence and convolution and relies entirely on attention. The encoder-decoder architecture stacks six identical layers on each side. Each layer combines multi-head attention with a position-wise feed-forward network, wrapped in residual connections and layer normalization.

Scaled dot-product attention computes weights from queries and keys, divided by the square root of the key dimension so the softmax does not saturate. Multi-head attention runs several of these in parallel so the model can attend to different representation subspaces at once.

Because self-attention has no notion of order, the authors add sinusoidal positional encodings to the input embeddings. Compared with recurrent neural networks, every position can attend to every other in a constant number of steps, which makes training far more parallel.

Evaluated on WMT 2014 English-German and English-French machine translation, the model reached state-of-the-art BLEU at a fraction of the training cost. Lead author: Ashish Vaswani.`,
    ],
    [
      'd3',
      'BERT: Pre-training of Deep Bidirectional Transformers',
      'paper',
      '2026-10-09',
      'Shows that an encoder-only Transformer pre-trained with masked language modeling transfers to many language tasks after light fine-tuning.',
      `BERT is an encoder-only Transformer pre-trained on unlabeled text and then fine-tuned for downstream tasks, a clear case of transfer learning in natural language processing.

Two pre-training objectives: masked language modeling, where about 15% of WordPiece tokens are hidden and predicted from both left and right context, and next sentence prediction, which asks whether two segments follow each other. Bidirectional self-attention is the key difference from left-to-right language models.

Fine-tuning adds a small task head and updates all weights. The paper reported large gains on the GLUE benchmark and on question answering. The contextual vector embeddings BERT produces became a default building block for retrieval and classification. First author: Jacob Devlin.`,
    ],
    [
      'd2',
      'Notes — Retrieval-Augmented Generation',
      'notes',
      '2026-10-16',
      'Working notes on grounding language models with retrieved passages: the pipeline, why it reduces hallucination, and where knowledge graphs might help.',
      `Retrieval-augmented generation (RAG) pairs a large language model with a retriever so answers are grounded in external documents instead of only the model's parameters. The original formulation by Patrick Lewis and colleagues used dense passage retrieval with a BERT-based encoder for queries and passages.

Pipeline I keep coming back to: chunk documents, embed each chunk as a vector embedding, store in an index, retrieve top-k with approximate nearest neighbor search, optionally rerank with a cross-encoder, then pass the passages to the generator.

Why it matters: it reduces hallucination and lets the knowledge base change without retraining. Chunking strategy has a surprisingly large effect: chunks too small lose context, too large dilute relevance. Reranking usually beats increasing k.

Open thought: a knowledge graph could complement vector search by giving explicit relations between entities, useful for multi-hop question answering.`,
    ],
    [
      'd4',
      'Lecture notes — Graph Neural Networks',
      'notes',
      '2026-10-23',
      'Lecture notes on message passing, GCNs and GATs, the over-smoothing problem, and how GNNs relate to knowledge graphs.',
      `Graph neural networks learn on graph-structured data through message passing: each node aggregates features from its neighbors and updates its own representation, layer by layer. The output is a node embedding that captures local structure.

Graph convolutional networks (Thomas Kipf) use a normalized neighborhood average. Graph attention networks (Petar Veličković) instead learn attention weights over neighbors, which is self-attention restricted to the graph's edges.

Stacking many layers causes over-smoothing: node representations become indistinguishable. Residual connections and careful depth choices help. Standard benchmark: the Cora citation dataset.

Connection to knowledge graphs: GNNs can model entities and relations directly, which is the backbone of much of graph representation learning.`,
    ],
    [
      'd5',
      'Scaling Laws for Neural Language Models',
      'paper',
      '2026-10-30',
      'Finds that language model loss falls as a smooth power law in parameters, data and compute, which makes training runs plannable.',
      `Jared Kaplan and colleagues found that the cross-entropy loss of Transformer language models falls as a power law in model parameters, dataset size, and training compute, across several orders of magnitude.

Practical upshot: performance is predictable, so you can plan compute-optimal training runs by deciding how to split a fixed budget between model size and data. The paper argued for larger models trained on relatively less data; later work revised the ratio toward more data.

Scaling laws describe smooth improvement in loss. Emergent abilities, by contrast, are capabilities that seem to appear suddenly in large language models above some scale, which is still debated.`,
    ],
    [
      'd6',
      'Reading log — Vector databases',
      'notes',
      '2026-11-06',
      'Notes on how vector databases store embeddings and serve similarity search with HNSW, FAISS and product quantization.',
      `A vector database stores vector embeddings and answers similarity queries quickly. Most rank results by cosine similarity or dot product.

Exact search is too slow at scale, so they use approximate nearest neighbor search. HNSW builds a layered proximity graph and greedily walks it; it gives strong recall with low latency. FAISS, the library from Meta, offers many index types, including product quantization, which compresses vectors into short codes to save memory.

These systems are the storage layer behind most retrieval-augmented generation setups, and they sit inside the broader field of information retrieval.`,
    ],
  ],
  nodes: [
    ['Transformer', 'method', 'Sequence model built only from attention layers, without recurrence or convolution.', 'd1 d3 d2 d5'],
    ['Self-Attention', 'concept', 'Each position weighs every other position in the same sequence to build its representation.', 'd1 d3 d4'],
    ['Multi-Head Attention', 'method', 'Several attention operations run in parallel over different learned projections.', 'd1'],
    ['Scaled Dot-Product Attention', 'method', 'Attention weights from query–key dot products, scaled by the square root of the key dimension.', 'd1'],
    ['Positional Encoding', 'concept', 'Sinusoidal signals added to embeddings so an order-agnostic model can see token position.', 'd1'],
    ['Encoder-Decoder Architecture', 'concept', 'Two stacks: one encodes the input, the other generates the output from that encoding.', 'd1'],
    ['Recurrent Neural Network', 'method', 'Processes a sequence step by step through a hidden state; hard to parallelize.', 'd1', 'RNN'],
    ['WMT 2014 English-German', 'artifact', 'Machine translation benchmark used to evaluate the Transformer.', 'd1'],
    ['BLEU', 'concept', 'N-gram overlap metric for scoring machine translation quality.', 'd1'],
    ['Ashish Vaswani', 'person', 'Lead author of the Transformer paper.', 'd1'],
    ['Layer Normalization', 'method', 'Normalizes activations within a layer to stabilize training of deep networks.', 'd1'],
    ['Residual Connection', 'method', 'Skip path that adds a layer’s input to its output, easing deep training.', 'd1 d4'],
    ['Machine Translation', 'field', 'Automatically translating text between languages.', 'd1'],
    ['Retrieval-Augmented Generation', 'method', 'Grounds a language model’s answers in passages fetched from an external index.', 'd2 d6', 'RAG'],
    ['Dense Passage Retrieval', 'method', 'Retrieves passages by comparing learned dense embeddings of queries and passages.', 'd2', 'DPR'],
    ['Vector Embedding', 'concept', 'Numeric vector representing meaning, so similar items sit close together.', 'd2 d3 d4 d6', 'Embedding'],
    ['Approximate Nearest Neighbor Search', 'method', 'Finds near-closest vectors quickly by trading a little recall for speed.', 'd2 d6', 'ANN'],
    ['Hallucination', 'concept', 'Fluent model output that is unsupported by sources or factually wrong.', 'd2'],
    ['Chunking Strategy', 'concept', 'How documents are split into passages before embedding; strongly affects retrieval quality.', 'd2'],
    ['Reranking', 'method', 'Re-scores retrieved candidates with a stronger model, often a cross-encoder.', 'd2'],
    ['Knowledge Graph', 'concept', 'Entities connected by typed relations, giving explicit structure for reasoning.', 'd2 d4'],
    ['Large Language Model', 'concept', 'Very large Transformer language model trained on broad text.', 'd2 d5', 'LLM'],
    ['Patrick Lewis', 'person', 'First author of the original retrieval-augmented generation paper.', 'd2'],
    ['Question Answering', 'field', 'Producing answers to natural-language questions from text or stored knowledge.', 'd2 d3'],
    ['BERT', 'artifact', 'Encoder-only Transformer pre-trained bidirectionally, then fine-tuned per task.', 'd3 d2'],
    ['Masked Language Modeling', 'method', 'Hides some tokens and trains the model to predict them from context on both sides.', 'd3', 'MLM'],
    ['Next Sentence Prediction', 'method', 'Pre-training task that asks whether segment B follows segment A.', 'd3'],
    ['Pre-training', 'concept', 'Learning general representations from large unlabeled data before task training.', 'd3 d5'],
    ['Fine-tuning', 'concept', 'Adapting a pre-trained model to a specific task with labeled data.', 'd3'],
    ['Transfer Learning', 'concept', 'Reusing knowledge learned on one task to improve another.', 'd3'],
    ['GLUE Benchmark', 'artifact', 'Suite of language understanding tasks used to compare models.', 'd3'],
    ['Jacob Devlin', 'person', 'First author of the BERT paper.', 'd3'],
    ['WordPiece Tokenization', 'method', 'Splits words into frequent subword units to handle rare words.', 'd3'],
    ['Natural Language Processing', 'field', 'Computing with human language: understanding, generating and translating it.', 'd3 d1', 'NLP'],
    ['Graph Neural Network', 'method', 'Neural network that learns over graph structure through message passing.', 'd4', 'GNN'],
    ['Message Passing', 'concept', 'Nodes aggregate neighbor features and update their state, layer by layer.', 'd4'],
    ['Graph Attention Network', 'method', 'GNN that learns attention weights over each node’s neighbors.', 'd4', 'GAT'],
    ['Graph Convolutional Network', 'method', 'GNN that uses normalized neighborhood averaging as its convolution.', 'd4', 'GCN'],
    ['Node Embedding', 'concept', 'Vector representation of a graph node learned from its neighborhood.', 'd4'],
    ['Over-smoothing', 'concept', 'With many GNN layers, node representations converge and lose distinctiveness.', 'd4'],
    ['Cora Dataset', 'artifact', 'Citation graph benchmark for node classification.', 'd4'],
    ['Petar Veličković', 'person', 'Lead author of Graph Attention Networks.', 'd4'],
    ['Thomas Kipf', 'person', 'Lead author of the Graph Convolutional Network paper.', 'd4'],
    ['Graph Representation Learning', 'field', 'Learning vector representations of nodes, edges or whole graphs.', 'd4'],
    ['Scaling Laws', 'concept', 'Loss falls predictably as a power law in parameters, data and compute.', 'd5'],
    ['Power Law', 'concept', 'Relationship where one quantity varies as a power of another.', 'd5'],
    ['Compute-Optimal Training', 'concept', 'Splitting a fixed compute budget between model size and data for the lowest loss.', 'd5'],
    ['Model Parameters', 'concept', 'The learned weights; their count is one main axis of scale.', 'd5'],
    ['Cross-Entropy Loss', 'concept', 'Training objective measuring how well predicted token probabilities match the data.', 'd5'],
    ['Jared Kaplan', 'person', 'Lead author of the neural language model scaling laws paper.', 'd5'],
    ['Emergent Abilities', 'concept', 'Capabilities that appear abruptly in large models beyond some scale.', 'd5'],
    ['Vector Database', 'artifact', 'Database built to store embeddings and serve fast similarity search.', 'd6 d2'],
    ['HNSW', 'method', 'Layered proximity-graph index for approximate nearest neighbor search.', 'd6', 'Hierarchical Navigable Small World'],
    ['FAISS', 'artifact', 'Meta’s library for efficient similarity search and clustering of vectors.', 'd6'],
    ['Cosine Similarity', 'concept', 'Similarity of two vectors measured by the angle between them.', 'd6'],
    ['Product Quantization', 'method', 'Compresses vectors into short codes to cut memory during search.', 'd6'],
    ['Information Retrieval', 'field', 'Finding relevant material within large collections.', 'd6 d2'],
  ],
  edges: [
    ['Transformer', 'built on', 'Self-Attention', 'd1'],
    ['Transformer', 'uses', 'Multi-Head Attention', 'd1'],
    ['Multi-Head Attention', 'composed of', 'Scaled Dot-Product Attention', 'd1'],
    ['Transformer', 'adds', 'Positional Encoding', 'd1'],
    ['Positional Encoding', 'supplies order to', 'Self-Attention', 'd1'],
    ['Transformer', 'follows', 'Encoder-Decoder Architecture', 'd1'],
    ['Transformer', 'replaces', 'Recurrent Neural Network', 'd1'],
    ['Transformer', 'evaluated on', 'WMT 2014 English-German', 'd1'],
    ['WMT 2014 English-German', 'scored with', 'BLEU', 'd1'],
    ['Ashish Vaswani', 'proposed', 'Transformer', 'd1'],
    ['Transformer', 'uses', 'Layer Normalization', 'd1'],
    ['Transformer', 'uses', 'Residual Connection', 'd1'],
    ['Transformer', 'applied to', 'Machine Translation', 'd1'],
    ['Recurrent Neural Network', 'applied to', 'Machine Translation', 'd1'],
    ['Machine Translation', 'part of', 'Natural Language Processing', 'd1'],
    ['BERT', 'based on', 'Transformer', 'd3'],
    ['BERT', 'trained with', 'Masked Language Modeling', 'd3'],
    ['BERT', 'trained with', 'Next Sentence Prediction', 'd3'],
    ['BERT', 'uses', 'WordPiece Tokenization', 'd3'],
    ['BERT', 'evaluated on', 'GLUE Benchmark', 'd3'],
    ['Jacob Devlin', 'proposed', 'BERT', 'd3'],
    ['BERT', 'relies on', 'Pre-training', 'd3'],
    ['Pre-training', 'followed by', 'Fine-tuning', 'd3'],
    ['Fine-tuning', 'form of', 'Transfer Learning', 'd3'],
    ['BERT', 'advanced', 'Natural Language Processing', 'd3'],
    ['Masked Language Modeling', 'uses', 'Self-Attention', 'd3'],
    ['BERT', 'produces', 'Vector Embedding', 'd3'],
    ['BERT', 'applied to', 'Question Answering', 'd3'],
    ['Retrieval-Augmented Generation', 'grounds', 'Large Language Model', 'd2'],
    ['Retrieval-Augmented Generation', 'retrieves with', 'Dense Passage Retrieval', 'd2'],
    ['Dense Passage Retrieval', 'encodes with', 'BERT', 'd2'],
    ['Dense Passage Retrieval', 'produces', 'Vector Embedding', 'd2'],
    ['Dense Passage Retrieval', 'searches with', 'Approximate Nearest Neighbor Search', 'd2'],
    ['Retrieval-Augmented Generation', 'reduces', 'Hallucination', 'd2'],
    ['Large Language Model', 'prone to', 'Hallucination', 'd2'],
    ['Retrieval-Augmented Generation', 'depends on', 'Chunking Strategy', 'd2'],
    ['Retrieval-Augmented Generation', 'improved by', 'Reranking', 'd2'],
    ['Knowledge Graph', 'complements', 'Retrieval-Augmented Generation', 'd2'],
    ['Patrick Lewis', 'proposed', 'Retrieval-Augmented Generation', 'd2'],
    ['Retrieval-Augmented Generation', 'applied to', 'Question Answering', 'd2'],
    ['Question Answering', 'part of', 'Natural Language Processing', 'd2'],
    ['Large Language Model', 'based on', 'Transformer', 'd2'],
    ['Reranking', 'uses', 'BERT', 'd2'],
    ['Knowledge Graph', 'enables', 'Question Answering', 'd2'],
    ['Dense Passage Retrieval', 'advances', 'Information Retrieval', 'd2'],
    ['Graph Neural Network', 'based on', 'Message Passing', 'd4'],
    ['Graph Attention Network', 'type of', 'Graph Neural Network', 'd4'],
    ['Graph Convolutional Network', 'type of', 'Graph Neural Network', 'd4'],
    ['Graph Attention Network', 'adapts', 'Self-Attention', 'd4'],
    ['Graph Neural Network', 'learns', 'Node Embedding', 'd4'],
    ['Graph Neural Network', 'suffers from', 'Over-smoothing', 'd4'],
    ['Graph Convolutional Network', 'benchmarked on', 'Cora Dataset', 'd4'],
    ['Graph Attention Network', 'benchmarked on', 'Cora Dataset', 'd4'],
    ['Petar Veličković', 'proposed', 'Graph Attention Network', 'd4'],
    ['Thomas Kipf', 'proposed', 'Graph Convolutional Network', 'd4'],
    ['Graph Neural Network', 'core of', 'Graph Representation Learning', 'd4'],
    ['Graph Neural Network', 'models', 'Knowledge Graph', 'd4'],
    ['Node Embedding', 'type of', 'Vector Embedding', 'd4'],
    ['Residual Connection', 'mitigates', 'Over-smoothing', 'd4'],
    ['Scaling Laws', 'follow', 'Power Law', 'd5'],
    ['Scaling Laws', 'relate', 'Model Parameters', 'd5'],
    ['Scaling Laws', 'predict', 'Cross-Entropy Loss', 'd5'],
    ['Scaling Laws', 'inform', 'Compute-Optimal Training', 'd5'],
    ['Jared Kaplan', 'proposed', 'Scaling Laws', 'd5'],
    ['Scaling Laws', 'measured on', 'Transformer', 'd5'],
    ['Large Language Model', 'governed by', 'Scaling Laws', 'd5'],
    ['Emergent Abilities', 'appear in', 'Large Language Model', 'd5'],
    ['Emergent Abilities', 'contrast with', 'Scaling Laws', 'd5'],
    ['Compute-Optimal Training', 'guides', 'Pre-training', 'd5'],
    ['Vector Database', 'stores', 'Vector Embedding', 'd6'],
    ['Vector Database', 'indexes with', 'HNSW', 'd6'],
    ['HNSW', 'implements', 'Approximate Nearest Neighbor Search', 'd6'],
    ['FAISS', 'implements', 'Approximate Nearest Neighbor Search', 'd6'],
    ['FAISS', 'supports', 'Product Quantization', 'd6'],
    ['Product Quantization', 'compresses', 'Vector Embedding', 'd6'],
    ['Vector Database', 'ranks by', 'Cosine Similarity', 'd6'],
    ['Cosine Similarity', 'compares', 'Vector Embedding', 'd6'],
    ['Vector Database', 'backs', 'Retrieval-Augmented Generation', 'd6'],
    ['Approximate Nearest Neighbor Search', 'part of', 'Information Retrieval', 'd6'],
  ],
};

/**
 * Construct the initial sample vault and populate a text map.
 * @param {Map<string, string>} textsMap
 */
export function buildSampleVault(textsMap) {
  const docs = SAMPLE.docs.map(([id, title, kind, date, summary, text]) => {
    textsMap.set(id, text);
    return {
      id,
      title,
      file: title,
      kind,
      addedAt: Date.parse(date + 'T09:00:00Z'),
      summary,
      chars: text.length,
      status: 'sample',
      method: 'sample',
      sample: true,
    };
  });
  const dmap = new Map(docs.map((d) => [d.id, d]));
  const byLabel = new Map();
  const nodes = SAMPLE.nodes.map(([label, type, summary, ds, aliases]) => {
    const dl = ds.split(' ');
    const n = {
      id: 's_' + normKey(label).replace(/ /g, '_'),
      label,
      type,
      summary,
      aliases: aliases ? aliases.split('|') : [],
      docs: dl,
      t: Math.min(...dl.map((d) => dmap.get(d).addedAt)),
      mentions: dl.length,
      note: '',
      pinned: false,
      sample: true,
    };
    byLabel.set(label, n);
    return n;
  });
  const edges = [];
  SAMPLE.edges.forEach(([a, label, b, d], i) => {
    const s = byLabel.get(a);
    const t = byLabel.get(b);
    if (!s || !t) return;
    edges.push({
      id: 'se' + i,
      s: s.id,
      t: t.id,
      label,
      docs: [d],
      w: /proposed|built on|based on|type of/.test(label) ? 2 : 1,
      sample: true,
    });
  });
  return { v: 1, sample: true, pristine: true, origin: 'sample', updatedAt: 0, docs, nodes, edges };
}
