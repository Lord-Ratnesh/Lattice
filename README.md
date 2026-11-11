# LATTICE — Personal Knowledge Graph

An interactive, local-first personal knowledge graph instrument console that turns notes, research papers, PDFs, DOCX documents, HTML articles, and photos into a live, queryable knowledge map.

Lattice runs **100% standalone in the browser** with no required backend server. It works out of the box in **On-Device mode** (using local phrase/co-occurrence extraction, TF-IDF passage retrieval, and graph topology analysis) and optionally connects directly from your browser to **Claude (Anthropic)**, **OpenAI / OpenAI-compatible endpoints**, **Google Gemini**, or **local Ollama** using your own key/endpoint.

---

## Key Features

- **Multi-Format Source Ingestion**
  - Drag and drop, browse, or paste `.pdf`, `.docx`, `.md`, `.txt`, `.html`, `.csv`, `.json`, `.tex`, `.rst`, `.org`, code files, and images (`.png`, `.jpg`, `.webp`, `.gif`).
  - Browser-native PDF parsing (`pdfjs-dist`), Word `.docx` parsing (`mammoth`), and HTML sanitization/extraction — zero server uploads required.
  - Entity deduplication and alias resolution (e.g., `"RAG"` automatically resolves into `"Retrieval-Augmented Generation"`).
- **Live 2D Canvas Graph Engine (`d3-force`)**
  - **4 Layouts**: Force-directed, Cluster-anchored (Louvain), Radial by entity type, and Chronological Timeline.
  - **3 Color Modes**: Entity Type, Louvain Community Cluster, or Source Document.
  - **Interactive Navigation**: HiDPI canvas rendering, 1-hop / 2-hop neighborhood focus mode, interactive minimap scrubbing, hover tooltips, right-click context menu, node pinning, merging, linking, inline renaming, and 20-step Undo (`Ctrl+Z`).
  - **Time Travel & Growth Replay**: Scrub chronologically across sources or animate how the graph grew over time (`R`).
- **4-Tab Analysis Deck**
  - **Inspect (`1`)**: Vault overview, centrality ranking, node connections, source evidence excerpts with `<mark>` highlights, personal notes, and **Deep Dive** study cards.
  - **Ask (`2`)**: Retrieval-augmented Q&A over your graph and source passages with clickable `[[Node]]` chips, `{{Source}}` citations, optional voice dictation, and Read Aloud (Web Speech API).
  - **Path (`3`)**: BFS shortest-path finder between any two entities, cross-cluster "Surprise me" path discovery, animated path particles, and connection narrative explanations.
  - **Insights (`4`)**: Hidden cross-cluster link discovery, knowledge gap identification (with one-click gap node creation), whole-vault Study Brief generation, Louvain theme clusters, Brandes betweenness bridge nodes, loose ends, and source coverage bars.
- **Local-First Storage & Portable Exports**
  - Automatic persistence in **IndexedDB** (with automatic `localStorage` fallback & migration) so full document texts and graph coordinates survive reloads.
  - Export your vault as **JSON** (full backup + re-import), **Markdown** (`[[wiki-links]]` ready for Obsidian/Notion), **CSV** (edge list), or a **2× PNG snapshot**.

---

## Quick Start

### Prerequisites

- **Node.js** `>= 18` and **npm**

### Install & Run Locally

```bash
# 1. Clone the repository
git clone https://github.com/<your-username>/lattice-knowledge-graph.git
cd lattice-knowledge-graph

# 2. Install dependencies
npm install

# 3. Start the development server
npm run dev
```

Open the local URL printed by Vite (typically `http://localhost:5173`).

### Build for Production

```bash
npm run build
npm run preview
```

The static production bundle is emitted to `dist/` and can be hosted on GitHub Pages, Netlify, Vercel, Cloudflare Pages, or any static file server.

### Run Tests

```bash
npm test
```

---

## AI Provider Configuration (Optional)

By default, Lattice starts in **On-Device** mode with zero external network calls:

| Mode / Provider | Extraction & Q&A | Vision (Photo Notes) | Configuration |
| :--- | :--- | :--- | :--- |
| **On-Device** (default) | Phrase & co-occurrence extraction, TF-IDF retrieval, Adamic-Adar link hints | Not available | Works immediately, no key needed |
| **Anthropic Claude** | Claude Messages API (`claude-sonnet-4-20250514` / `claude-3-5-haiku-latest`) | Supported | Click **On-Device** in the top bar → select **Anthropic Claude** → paste API key |
| **OpenAI / Compatible** | OpenAI, OpenRouter, Groq, LM Studio, etc. (`gpt-4o` / `gpt-4o-mini`) | Supported | Select **OpenAI / OpenAI-Compatible** → enter API key & optional custom endpoint |
| **Google Gemini** | Gemini REST API (`gemini-2.5-flash` / `gemini-2.5-pro`) | Supported | Select **Google Gemini** → paste Gemini API key |
| **Ollama (Local)** | Local LLM server (`http://localhost:11434/v1/chat/completions`) | Model-dependent | Select **Ollama**; ensure `OLLAMA_ORIGINS=*` is enabled for browser access |

> **Privacy Note:** Your API key and vault data never touch a third-party Lattice server. API keys are stored solely in your browser's `localStorage`, and requests go directly from your browser to the provider endpoint you choose.

---

## Keyboard Shortcuts

| Key | Action |
| :--- | :--- |
| `/` or `Ctrl/Cmd + K` | Focus graph search |
| `1` – `4` | Switch Analysis Deck tabs (`Inspect`, `Ask`, `Path`, `Insights`) |
| `F` | Fit visible graph in viewport |
| `L` | Cycle node label mode (`Auto` / `All` / `Off`) |
| `C` | Cycle color mode (`Type` / `Cluster` / `Source`) |
| `D` | Toggle Source document nodes |
| `Space` | Freeze / unfreeze physics simulation |
| `P` | Pin / unpin selected node |
| `R` | Replay graph growth over time |
| `Del` / `Backspace` | Delete selected node or source |
| `Ctrl/Cmd + Z` | Undo last structural edit (up to 20 steps) |
| `Esc` | Close modal/menu or clear path/focus/selection |
| `?` | Open help & shortcuts dialog |

---

## Project Structure

```text
lattice/
├── index.html                  # Application shell
├── package.json                # Dependencies & scripts
├── vite.config.js              # Vite & Vitest configuration
├── LICENSE                     # MIT License
├── README.md                   # Project documentation
├── public/
│   └── favicon.svg             # Lattice brand icon
├── src/
│   ├── main.js                 # App bootstrap, event wiring, keyboard shortcuts
│   ├── styles/
│   │   └── main.css            # Dark HUD instrument-console stylesheet
│   ├── core/
│   │   ├── constants.js        # Palette, typography, entity types, SVG icons
│   │   ├── utils.js            # DOM builder, escaping, FNV-1a hash, normKey
│   │   ├── sampleVault.js      # Built-in 6-source AI research sample vault
│   │   ├── state.js            # Vault state, indexing, undo stack, serialize/hydrate
│   │   ├── graphAlgo.js        # Louvain clustering, Brandes betweenness, BFS path, topology links
│   │   └── retrieval.js        # Sentence-aligned passage chunking, TF-IDF, markdown-lite
│   ├── services/
│   │   ├── storage.js          # IndexedDB + localStorage persistence & preferences
│   │   ├── ai.js               # Multi-provider streaming & JSON AI client
│   │   ├── localFallback.js    # On-device fallbacks for Ask, Deep Dive, Path, and Insights
│   │   ├── ingest.js           # PDF/DOCX/HTML/Text/Image readers & extraction pipeline
│   │   ├── speech.js           # Web Speech API adapters (TTS & Dictation)
│   │   └── export.js           # Browser downloads (.json, .md, .csv, 2x .png)
│   ├── graph/
│   │   ├── engine.js           # d3-force simulation, layouts, visibility filtering
│   │   ├── renderer.js         # Canvas 2D renderer, labels, animations, minimap
│   │   └── interaction.js      # Zoom, drag, context menu, tooltips, minimap scrubbing
│   └── ui/
│       ├── components.js       # Modals, toasts, console log, autocomplete picker
│       ├── chrome.js           # Topbar stats, source rail, filters, legend, timeline
│       ├── modals.js           # Paste, Add Node, Link, Merge, Export, Help, AI Settings
│       ├── inspector.js        # Inspect tab (overview, entity & source inspectors, deep dive)
│       ├── ask.js              # Ask tab (Q&A chat, context highlighting, dictation)
│       ├── path.js             # Path tab (shortest path chain & narrative)
│       └── insights.js         # Insights tab (clusters, bridges, gaps, study brief)
└── tests/
    ├── graphAlgo.test.js       # Unit tests for Louvain, Brandes centrality, BFS, link prediction
    ├── retrieval.test.js       # Unit tests for tokenization, TF-IDF search, markdown-lite
    ├── ingest.test.js          # Unit tests for local extraction, chunking, entity resolution
    └── state.test.js           # Unit tests for serialization, merging, doc removal, undo
```

---

## Algorithms & Technical Details

- **Community Detection**: Multi-pass **Louvain modularity optimization** over the weighted undirected projection of entity edges, coloring thematic clusters and powering the Cluster layout.
- **Centrality & Bridge Detection**: Exact **Brandes betweenness centrality** (with deterministic sampling when graphs exceed 900 nodes) to surface structural bridge concepts.
- **On-Device Retrieval**: Sentences are grouped into ~700-character passages and scored with **TF-IDF**, capped per source for diversity, and paired with 1-hop graph neighborhood expansion.
- **Entity Resolution**: Case-folded, NFKD-normalized, plural-stemmed key indexing (`normKey`) merges new mentions and acronyms across sources without duplicating nodes.

---

## License

MIT — see [LICENSE](./LICENSE).
