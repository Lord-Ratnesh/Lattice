import { $, $$, esc, h } from '../core/utils.js';
import { ico, shapeSvg, TYPES } from '../core/constants.js';
import { degOf, docNode } from '../core/state.js';
import { matchNodes } from '../core/retrieval.js';

export function hydrateIcons(root = document) {
  $$('[data-ico]', root).forEach((e) => {
    e.outerHTML = ico(e.dataset.ico);
  });
}

export function seg(el, options, get, set) {
  el.innerHTML = '';
  for (const [val, label] of options) {
    el.append(
      h(
        'button',
        {
          type: 'button',
          'aria-pressed': String(get() === val),
          onclick: () => {
            set(val);
            seg(el, options, get, set);
          },
        },
        label
      )
    );
  }
}

export function toast(msg, kind = 'info', action) {
  const t = h('div', { class: 'toast ' + kind, role: 'status' }, h('span', { text: msg }));
  if (action) {
    t.append(
      h(
        'button',
        {
          class: 'btn sm',
          type: 'button',
          onclick: () => {
            action.fn();
            t.remove();
          },
        },
        action.label
      )
    );
  }
  $('#toasts')?.append(t);
  setTimeout(() => t.remove(), action ? 7000 : 4200);
}

let logCount = 0;
export function log(msg, kind = '') {
  const logEl = $('#log');
  if (!logEl) return;
  const d = new Date();
  const ts = d.toTimeString().slice(0, 8);
  const li = h('li', { class: kind }, h('time', { text: ts }), h('span', { text: msg }));
  logEl.append(li);
  logCount++;
  while (logEl.children.length > 120) logEl.firstChild.remove();
  logEl.scrollTop = logEl.scrollHeight;
  const meta = $('#logMeta');
  if (meta) meta.textContent = logCount + ' events';
}

let modalOnClose = null;

export function isModalOpen() {
  const m = $('#modal');
  return m ? !m.hidden : false;
}

export function closeModal() {
  const modalEl = $('#modal');
  if (!modalEl) return;
  modalEl.hidden = true;
  modalEl.innerHTML = '';
  const f = modalOnClose;
  modalOnClose = null;
  if (f) f();
}

export function openModal(title, body, actions = [], onClose) {
  const modalEl = $('#modal');
  if (!modalEl) return null;
  modalEl.innerHTML = '';
  modalOnClose = onClose || null;
  const dlg = h('div', { class: 'dialog', role: 'dialog', 'aria-modal': 'true', 'aria-label': title });
  const head = h('div', { class: 'dialog-h' }, h('h3', { text: title }));
  const x = h('button', {
    class: 'btn sm icon ghost',
    type: 'button',
    'aria-label': 'Close',
    onclick: closeModal,
  });
  x.innerHTML = ico('close', 13);
  head.append(x);

  const b = h('div', { class: 'dialog-b' });
  if (typeof body === 'string') b.innerHTML = body;
  else b.append(body);
  dlg.append(head, b);

  if (actions.length) {
    const f = h('div', { class: 'dialog-f' });
    for (const a of actions) {
      f.append(
        h(
          'button',
          {
            class: 'btn ' + (a.kind || ''),
            type: 'button',
            onclick: () => {
              const r = a.fn && a.fn();
              if (r !== false) closeModal();
            },
          },
          a.label
        )
      );
    }
    dlg.append(f);
  }

  modalEl.append(dlg);
  modalEl.hidden = false;
  modalEl.onpointerdown = (e) => {
    if (e.target === modalEl) closeModal();
  };
  setTimeout(() => {
    (dlg.querySelector('input,textarea,select') || dlg.querySelector('.dialog-f .btn:last-child') || x).focus();
  }, 20);
  return dlg;
}

export function confirmModal(title, text, okLabel, fn, danger = true) {
  openModal(title, `<p>${esc(text)}</p>`, [
    { label: 'Cancel', kind: 'ghost' },
    { label: okLabel, kind: danger ? 'danger' : 'primary', fn },
  ]);
}

export function picker(input, onPick, { includeDocs = false, onInput } = {}) {
  const dd = h('div', { class: 'dropdown', hidden: true, role: 'listbox' });
  input.parentElement.append(dd);
  let items = [];
  let idx = -1;

  const choose = (i) => {
    const it = items[i];
    if (!it || dd.hidden) return;
    dd.hidden = true;
    onPick(it.n);
  };

  const render = () => {
    dd.innerHTML = '';
    items.forEach((it, i) => {
      const b = h('button', {
        type: 'button',
        class: 'dd-item' + (i === idx ? ' on' : ''),
        role: 'option',
        onmousedown: (e) => e.preventDefault(),
        onclick: () => choose(i),
      });
      b.innerHTML = `${shapeSvg(it.n.type, 11)}<span class="dd-l">${esc(it.n.label)}</span><span class="dd-m">${
        TYPES[it.n.type].name
      } · ${degOf(it.n)}</span>`;
      dd.append(b);
    });
    dd.hidden = !items.length;
  };

  input.addEventListener('input', () => {
    items = matchNodes(input.value, 8, includeDocs, docNode);
    idx = items.length ? 0 : -1;
    render();
    onInput && onInput(input.value);
  });

  input.addEventListener('keydown', (e) => {
    if (dd.hidden) return;
    if (e.key === 'ArrowDown') {
      idx = Math.min(items.length - 1, idx + 1);
      render();
      e.preventDefault();
    } else if (e.key === 'ArrowUp') {
      idx = Math.max(0, idx - 1);
      render();
      e.preventDefault();
    } else if (e.key === 'Enter') {
      if (idx >= 0) {
        e.preventDefault();
        choose(idx);
      }
    } else if (e.key === 'Escape') {
      dd.hidden = true;
      e.preventDefault();
      e.stopPropagation();
    }
  });

  input.addEventListener('blur', () => setTimeout(() => { dd.hidden = true; }, 150));
  input.addEventListener('focus', () => {
    if (input.value.trim()) {
      items = matchNodes(input.value, 8, includeDocs, docNode);
      idx = items.length ? 0 : -1;
      render();
    }
  });

  return {
    close: () => {
      dd.hidden = true;
    },
  };
}
