/**
 * Local-first persistence using IndexedDB for full vault + document texts,
 * with automatic migration from legacy localStorage keys and safe fallback.
 */

const DB_NAME = 'lattice_vault_db';
const DB_VERSION = 1;
const STORE_NAME = 'vault';

const LS_STATE = 'lattice.v1.state';
const LS_TEXT = 'lattice.v1.texts';
const LS_PREFS = 'lattice.prefs';
const LS_AI = 'lattice.ai.config';

let dbPromise = null;

function openDB() {
  if (typeof indexedDB === 'undefined') return Promise.resolve(null);
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve) => {
    try {
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          db.createObjectStore(STORE_NAME);
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
  return dbPromise;
}

async function idbGet(key) {
  const db = await openDB();
  if (!db) return null;
  return new Promise((resolve) => {
    try {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const req = tx.objectStore(STORE_NAME).get(key);
      req.onsuccess = () => resolve(req.result ?? null);
      req.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}

async function idbSet(key, value) {
  const db = await openDB();
  if (!db) return false;
  return new Promise((resolve) => {
    try {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      tx.objectStore(STORE_NAME).put(value, key);
      tx.oncomplete = () => resolve(true);
      tx.onerror = () => resolve(false);
    } catch {
      resolve(false);
    }
  });
}

let lastTextSig = '';

function saveLocalStorageFallback(data, textsMap) {
  try {
    localStorage.setItem(LS_STATE, JSON.stringify(data));
  } catch {
    // Ignore quota errors in fallback storage
  }
  const sig = data.docs.map((d) => d.id + ':' + (textsMap.get(d.id) || '').length).join(',');
  if (sig === lastTextSig) return;
  try {
    const obj = {};
    let total = 0;
    for (const d of data.docs) {
      const t = textsMap.get(d.id);
      if (!t) continue;
      const s = t.slice(0, 150000);
      if (total + s.length > 3500000) break;
      obj[d.id] = s;
      total += s.length;
    }
    localStorage.setItem(LS_TEXT, JSON.stringify(obj));
    lastTextSig = sig;
  } catch {
    // Ignore quota errors in fallback storage
  }
}

export function resetTextSig() {
  lastTextSig = '';
}

/**
 * Save serialized vault state and document texts to IndexedDB (and localStorage mirror).
 */
export async function saveVaultStorage(data, textsMap) {
  const textsObj = {};
  for (const d of data.docs) {
    const t = textsMap.get(d.id);
    if (typeof t === 'string') textsObj[d.id] = t;
  }
  saveLocalStorageFallback(data, textsMap);
  const okState = await idbSet('state', data);
  const okTexts = await idbSet('texts', textsObj);
  return okState && okTexts ? 'indexeddb' : 'local';
}

/**
 * Synchronous pagehide snapshot to localStorage in case IndexedDB write didn't finish.
 */
export function saveVaultSyncBackup(data, textsMap) {
  saveLocalStorageFallback(data, textsMap);
}

/**
 * Load vault from IndexedDB, or migrate legacy localStorage vault if present.
 */
export async function loadVaultStorage() {
  const idbState = await idbGet('state');
  if (idbState && Array.isArray(idbState.nodes)) {
    const idbTexts = (await idbGet('texts')) || {};
    return { data: idbState, texts: idbTexts, backend: 'indexeddb' };
  }
  try {
    const raw = localStorage.getItem(LS_STATE);
    if (!raw) return null;
    const data = JSON.parse(raw);
    let texts = {};
    try {
      texts = JSON.parse(localStorage.getItem(LS_TEXT) || '{}');
    } catch {
      texts = {};
    }
    if (data && Array.isArray(data.nodes)) {
      await idbSet('state', data);
      await idbSet('texts', texts);
      return { data, texts, backend: 'local' };
    }
  } catch {
    return null;
  }
  return null;
}

export function loadPrefs() {
  try {
    return JSON.parse(localStorage.getItem(LS_PREFS) || '{}') || {};
  } catch {
    return {};
  }
}

export function savePrefs(prefs) {
  try {
    localStorage.setItem(LS_PREFS, JSON.stringify(prefs));
  } catch {
    // Ignore storage errors
  }
}

export const DEFAULT_AI_CONFIG = {
  provider: 'none', // 'none' | 'anthropic' | 'openai' | 'gemini' | 'ollama'
  apiKey: '',
  baseUrl: '',
  modelFast: '',
  modelDefault: '',
  modelComplex: '',
};

export const PROVIDER_DEFAULTS = {
  none: {
    label: 'On-Device',
    baseUrl: '',
    modelFast: '',
    modelDefault: '',
    modelComplex: '',
    supportsImages: false,
  },
  anthropic: {
    label: 'Claude',
    baseUrl: 'https://api.anthropic.com/v1/messages',
    modelFast: 'claude-3-5-haiku-latest',
    modelDefault: 'claude-sonnet-4-20250514',
    modelComplex: 'claude-sonnet-4-20250514',
    supportsImages: true,
  },
  openai: {
    label: 'OpenAI',
    baseUrl: 'https://api.openai.com/v1/chat/completions',
    modelFast: 'gpt-4o-mini',
    modelDefault: 'gpt-4o',
    modelComplex: 'gpt-4o',
    supportsImages: true,
  },
  gemini: {
    label: 'Gemini',
    baseUrl: 'https://generativelanguage.googleapis.com/v1beta',
    modelFast: 'gemini-2.0-flash',
    modelDefault: 'gemini-2.5-flash',
    modelComplex: 'gemini-2.5-pro',
    supportsImages: true,
  },
  ollama: {
    label: 'Ollama',
    baseUrl: 'http://localhost:11434/v1/chat/completions',
    modelFast: 'llama3.2',
    modelDefault: 'llama3.1',
    modelComplex: 'qwen2.5:14b',
    supportsImages: false,
  },
};

export function loadAIConfig() {
  try {
    const saved = JSON.parse(localStorage.getItem(LS_AI) || '{}');
    return { ...DEFAULT_AI_CONFIG, ...saved };
  } catch {
    return { ...DEFAULT_AI_CONFIG };
  }
}

export function saveAIConfig(cfg) {
  try {
    localStorage.setItem(LS_AI, JSON.stringify({ ...DEFAULT_AI_CONFIG, ...cfg }));
  } catch {
    // Ignore storage errors
  }
}
