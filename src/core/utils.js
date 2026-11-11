/**
 * Core DOM, string, formatting, and math utility functions.
 */

export const $ = (selector, root = document) => root.querySelector(selector);
export const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];

/**
 * Create a DOM element with attributes, event handlers, and children.
 * @param {string} tag
 * @param {Record<string, any>} [attrs]
 * @param {...any} kids
 * @returns {HTMLElement}
 */
export function h(tag, attrs, ...kids) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v == null || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k === 'text') el.textContent = v;
    else if (k === 'html') el.innerHTML = v;
    else if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
    else el.setAttribute(k, v === true ? '' : v);
  }
  for (const kid of kids.flat()) {
    if (kid == null || kid === false) continue;
    el.append(kid.nodeType ? kid : document.createTextNode(String(kid)));
  }
  return el;
}

export const esc = (s) =>
  String(s ?? '').replace(/[&<>"']/g, (c) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  }[c]));

export const unesc = (s) =>
  String(s)
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, '&');

export const rid = (prefix = '') =>
  prefix + Math.random().toString(36).slice(2, 8) + Date.now().toString(36).slice(-4);

export const clip = (s, maxLen) => {
  const str = String(s || '');
  return str.length > maxLen ? str.slice(0, maxLen - 1).trimEnd() + '…' : str;
};

export const uniq = (arr) => [...new Set(arr)];
export const clamp = (v, min, max) => Math.max(min, Math.min(max, v));
export const num = (v) => (typeof v === 'number' && isFinite(v) ? v : undefined);
export const fmtNum = (n) => Number(n || 0).toLocaleString();
export const escRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * Deterministic 32-bit FNV-1a hash.
 * @param {string} s
 * @returns {number}
 */
export function hash(s) {
  let hv = 2166136261;
  for (let i = 0; i < s.length; i++) {
    hv ^= s.charCodeAt(i);
    hv = Math.imul(hv, 16777619);
  }
  return hv >>> 0;
}

/**
 * Convert hex color (#RRGGBB or #RGB) to rgba() CSS string.
 */
export function rgba(hex, alpha) {
  let x = String(hex).replace('#', '');
  if (x.length === 3) x = x.split('').map((c) => c + c).join('');
  const n = parseInt(x, 16) || 0;
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${alpha})`;
}

/**
 * Normalize an entity label or alias for deduplication and lookup.
 */
export function normKey(s) {
  const t = String(s || '')
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/['’`]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
  if (!t) return '';
  return t
    .split(' ')
    .map((w) => (w.length > 3 && w.endsWith('s') && !/(ss|is|us)$/.test(w) ? w.slice(0, -1) : w))
    .join(' ');
}

export function fmtDate(ms) {
  if (!ms) return '—';
  const d = new Date(ms);
  const diffYear = d.getFullYear() !== new Date().getFullYear();
  return d.toLocaleDateString(
    undefined,
    diffYear ? { month: 'short', day: 'numeric', year: 'numeric' } : { month: 'short', day: 'numeric' }
  );
}

export const titleCase = (s) => s.replace(/\b[a-z]/g, (c) => c.toUpperCase());
export const stripExt = (n) => n.replace(/\.[a-z0-9]{1,6}$/i, '').replace(/[_]+/g, ' ').trim() || n;

export function debounce(fn, ms) {
  let timer;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), ms);
  };
}

export const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
