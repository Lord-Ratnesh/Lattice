import { loadAIConfig, PROVIDER_DEFAULTS, saveAIConfig } from './storage.js';

/**
 * Standalone multi-provider AI service supporting:
 * - On-device (no network / no key)
 * - Anthropic Claude (direct browser CORS)
 * - OpenAI / OpenAI-compatible (OpenAI, OpenRouter, Groq, LM Studio, etc.)
 * - Google Gemini REST API
 * - Local Ollama (/v1/chat/completions)
 */

let currentConfig = loadAIConfig();
const listeners = new Set();

export function getAIConfig() {
  return { ...currentConfig };
}

export function updateAIConfig(next) {
  currentConfig = { ...currentConfig, ...next };
  saveAIConfig(currentConfig);
  for (const fn of listeners) fn(currentConfig);
}

export function onAIConfigChange(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function isAIConfigured() {
  const p = currentConfig.provider;
  if (!p || p === 'none') return false;
  if (p === 'ollama') return true;
  return Boolean(currentConfig.apiKey && currentConfig.apiKey.trim());
}

export function getAIProviderLabel() {
  if (!isAIConfigured()) return 'On-Device';
  return PROVIDER_DEFAULTS[currentConfig.provider]?.label || 'AI';
}

export function aiSupportsImages() {
  if (!isAIConfigured()) return false;
  return !!PROVIDER_DEFAULTS[currentConfig.provider]?.supportsImages;
}

function modelForTier(tier = 'default') {
  const p = currentConfig.provider;
  const defs = PROVIDER_DEFAULTS[p] || PROVIDER_DEFAULTS.none;
  if (tier === 'quick') return currentConfig.modelFast || defs.modelFast;
  if (tier === 'complex') return currentConfig.modelComplex || defs.modelComplex;
  return currentConfig.modelDefault || defs.modelDefault;
}

function endpointFor() {
  const p = currentConfig.provider;
  const defs = PROVIDER_DEFAULTS[p] || PROVIDER_DEFAULTS.none;
  return (currentConfig.baseUrl || defs.baseUrl || '').trim();
}

export function aiErr(e) {
  if (!e) return 'The request failed. Try again.';
  switch (e.code) {
    case 'not_configured':
      return 'No AI provider is configured. Click On-Device in the top bar to connect an API key or Ollama.';
    case 'not_granted':
      return 'API key was rejected (401/403). Check your key in AI Settings.';
    case 'rate_limited':
      return 'Rate limit hit. Wait a moment, then try again.';
    case 'prompt_too_large':
      return 'That input is too large for the selected model.';
    case 'invalid_json':
      return 'The extraction came back malformed. Try that source again.';
    case 'image_rejected':
      return 'That image could not be processed. Try a JPG or PNG under 20 MB.';
    case 'images_unavailable':
      return 'Selected provider/model does not support image transcription.';
    case 'cancelled':
      return 'Stopped.';
    default:
      return e.message || 'The request failed. Try again.';
  }
}

function mapHttpError(status, message) {
  if (status === 401 || status === 403) return { code: 'not_granted', message };
  if (status === 429) return { code: 'rate_limited', message };
  if (status === 413 || /context|length|too large|tokens/i.test(message || '')) {
    return { code: 'prompt_too_large', message };
  }
  return { code: 'api_error', message: message || `HTTP ${status}` };
}

function normalizeTurns(input) {
  if (typeof input === 'string') return [{ role: 'user', content: input }];
  if (Array.isArray(input)) return input.map((t) => ({ role: t.role, content: String(t.content || '') }));
  return [{ role: 'user', content: String(input || '') }];
}

function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const res = String(reader.result || '');
      const idx = res.indexOf(',');
      resolve({
        base64: idx >= 0 ? res.slice(idx + 1) : res,
        mime: file.type || 'image/png',
      });
    };
    reader.onerror = () => reject({ code: 'image_rejected' });
    reader.readAsDataURL(file);
  });
}

function stripJsonFences(text) {
  const trimmed = String(text || '').trim();
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
  if (fenced) return fenced[1].trim();
  const firstObj = trimmed.indexOf('{');
  const firstArr = trimmed.indexOf('[');
  let start = -1;
  if (firstObj >= 0 && firstArr >= 0) start = Math.min(firstObj, firstArr);
  else start = Math.max(firstObj, firstArr);
  if (start > 0) return trimmed.slice(start);
  return trimmed;
}

async function readSSE(response, signal, extractDelta, onText) {
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buf = '';
  let fullText = '';
  let truncated = false;

  try {
    while (true) {
      if (signal?.aborted) throw { code: 'cancelled', text: fullText };
      const { value, done } = await reader.read();
      if (done) break;
      buf += decoder.decode(value, { stream: true });
      const lines = buf.split('\n');
      buf = lines.pop() || '';
      for (const rawLine of lines) {
        const line = rawLine.trim();
        if (!line.startsWith('data:')) continue;
        const payload = line.slice(5).trim();
        if (!payload || payload === '[DONE]') continue;
        try {
          const parsed = JSON.parse(payload);
          const { delta, cut } = extractDelta(parsed);
          if (cut) truncated = true;
          if (delta) {
            fullText += delta;
            onText?.({ text: fullText });
          }
        } catch {
          // Ignore partial SSE keepalive lines
        }
      }
    }
  } catch (err) {
    if (err?.name === 'AbortError' || signal?.aborted) {
      throw { code: 'cancelled', text: fullText };
    }
    throw err;
  }
  return { text: fullText, truncated };
}

async function callAnthropic({ turns, model, signal, stream, onText, images }) {
  const url = endpointFor();
  const content = [];
  if (images?.length) {
    for (const img of images) {
      const { base64, mime } = await fileToBase64(img);
      content.push({
        type: 'image',
        source: { type: 'base64', media_type: mime, data: base64 },
      });
    }
  }
  const msgTurns = turns.map((t, i) => {
    if (i === turns.length - 1 && content.length) {
      return { role: t.role, content: [...content, { type: 'text', text: t.content }] };
    }
    return t;
  });

  const res = await fetch(url, {
    method: 'POST',
    signal,
    headers: {
      'content-type': 'application/json',
      'x-api-key': currentConfig.apiKey.trim(),
      'anthropic-version': '2023-06-01',
      'anthropic-dangerous-direct-browser-access': 'true',
    },
    body: JSON.stringify({
      model,
      max_tokens: 2048,
      stream: !!stream,
      messages: msgTurns,
    }),
  });

  if (!res.ok) {
    const errBody = await res.json().catch(() => ({}));
    throw mapHttpError(res.status, errBody?.error?.message || res.statusText);
  }

  if (stream) {
    return readSSE(
      res,
      signal,
      (ev) => ({
        delta: ev.type === 'content_block_delta' ? ev.delta?.text || '' : '',
        cut: ev.type === 'message_delta' && ev.delta?.stop_reason === 'max_tokens',
      }),
      onText
    );
  }

  const data = await res.json();
  const text = (data.content || []).map((c) => c.text || '').join('');
  return { text, truncated: data.stop_reason === 'max_tokens' };
}

async function callOpenAICompat({ turns, model, signal, stream, onText, images, jsonMode }) {
  const url = endpointFor();
  const headers = { 'content-type': 'application/json' };
  if (currentConfig.apiKey?.trim()) {
    headers.authorization = `Bearer ${currentConfig.apiKey.trim()}`;
  }

  let msgTurns = turns;
  if (images?.length) {
    const parts = [];
    for (const img of images) {
      const { base64, mime } = await fileToBase64(img);
      parts.push({ type: 'image_url', image_url: { url: `data:${mime};base64,${base64}` } });
    }
    msgTurns = turns.map((t, i) =>
      i === turns.length - 1
        ? { role: t.role, content: [...parts, { type: 'text', text: t.content }] }
        : t
    );
  }

  const body = { model, messages: msgTurns, stream: !!stream };
  if (jsonMode && currentConfig.provider === 'openai' && !images?.length) {
    // Only apply response_format when prompt doesn't ask for a top-level array
    const lastText = String(turns[turns.length - 1]?.content || '');
    if (!/only a JSON array/i.test(lastText)) {
      body.response_format = { type: 'json_object' };
    }
  }

  const res = await fetch(url, {
    method: 'POST',
    signal,
    headers,
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const errBody = await res.json().catch(() => ({}));
    throw mapHttpError(res.status, errBody?.error?.message || res.statusText);
  }

  if (stream) {
    return readSSE(
      res,
      signal,
      (ev) => {
        const ch = ev.choices?.[0];
        return {
          delta: ch?.delta?.content || '',
          cut: ch?.finish_reason === 'length',
        };
      },
      onText
    );
  }

  const data = await res.json();
  const ch = data.choices?.[0];
  return {
    text: ch?.message?.content || '',
    truncated: ch?.finish_reason === 'length',
  };
}

async function callGemini({ turns, model, signal, stream, onText, images, jsonMode }) {
  const base = endpointFor().replace(/\/+$/, '');
  const action = stream ? 'streamGenerateContent?alt=sse&' : 'generateContent?';
  const url = `${base}/models/${encodeURIComponent(model)}:${action}key=${encodeURIComponent(
    currentConfig.apiKey.trim()
  )}`;

  const contents = [];
  for (let i = 0; i < turns.length; i++) {
    const t = turns[i];
    const parts = [{ text: t.content }];
    if (i === turns.length - 1 && images?.length) {
      for (const img of images) {
        const { base64, mime } = await fileToBase64(img);
        parts.unshift({ inlineData: { mimeType: mime, data: base64 } });
      }
    }
    contents.push({ role: t.role === 'assistant' ? 'model' : 'user', parts });
  }

  const body = { contents };
  if (jsonMode) {
    body.generationConfig = { responseMimeType: 'application/json' };
  }

  const res = await fetch(url, {
    method: 'POST',
    signal,
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const errBody = await res.json().catch(() => ({}));
    throw mapHttpError(res.status, errBody?.error?.message || res.statusText);
  }

  if (stream) {
    return readSSE(
      res,
      signal,
      (ev) => {
        const cand = ev.candidates?.[0];
        const text = (cand?.content?.parts || []).map((p) => p.text || '').join('');
        return { delta: text, cut: cand?.finishReason === 'MAX_TOKENS' };
      },
      onText
    );
  }

  const data = await res.json();
  const cand = data.candidates?.[0];
  const text = (cand?.content?.parts || []).map((p) => p.text || '').join('');
  return { text, truncated: cand?.finishReason === 'MAX_TOKENS' };
}

async function dispatch({ prompt, modelTier = 'default', signal, stream = false, onText, images, jsonMode }) {
  if (!isAIConfigured()) throw { code: 'not_configured' };
  const turns = normalizeTurns(prompt);
  const model = modelForTier(modelTier);
  const p = currentConfig.provider;
  try {
    if (p === 'anthropic') {
      return await callAnthropic({ turns, model, signal, stream, onText, images });
    }
    if (p === 'gemini') {
      return await callGemini({ turns, model, signal, stream, onText, images, jsonMode });
    }
    return await callOpenAICompat({ turns, model, signal, stream, onText, images, jsonMode });
  } catch (err) {
    if (err?.name === 'AbortError' || signal?.aborted) {
      throw { code: 'cancelled', text: err?.text || '' };
    }
    throw err;
  }
}

/**
 * Stream or complete a text response from the configured AI provider.
 */
export async function aiComplete(prompt, opts = {}) {
  return dispatch({
    prompt,
    modelTier: opts.modelTier || 'default',
    signal: opts.signal,
    stream: typeof opts.onText === 'function',
    onText: opts.onText,
    images: opts.images,
    jsonMode: false,
  });
}

/**
 * Request structured JSON output from the configured AI provider.
 */
export async function aiJson(prompt, opts = {}) {
  const { text } = await dispatch({
    prompt,
    modelTier: opts.modelTier || 'default',
    signal: opts.signal,
    stream: false,
    images: opts.images,
    jsonMode: true,
  });
  try {
    return JSON.parse(stripJsonFences(text));
  } catch {
    throw { code: 'invalid_json', text };
  }
}

/**
 * Verify connectivity with the configured provider.
 */
export async function testAIConnection() {
  const { text } = await aiComplete('Reply with the single word: READY', { modelTier: 'quick' });
  return text.trim() || 'READY';
}
