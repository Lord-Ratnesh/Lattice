import { DISPLAY, MONO, TYPES, C } from '../core/constants.js';
import { fmtDate } from '../core/utils.js';
import { D, docTitle, getVault, lbl, serialize, TEXTS } from '../core/state.js';

/**
 * Download a string or Blob in the browser using an object URL.
 */
export function downloadBlob(filename, data, mime = 'text/plain;charset=utf-8') {
  const blob = data instanceof Blob ? data : new Blob([data], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function copyText(text, textarea, toastFn) {
  if (navigator.clipboard?.writeText) {
    navigator.clipboard
      .writeText(text)
      .then(() => toastFn?.('Copied', 'ok'))
      .catch(() => {
        if (textarea) {
          textarea.focus();
          textarea.select();
          toastFn?.('Press Ctrl+C to copy');
        } else {
          toastFn?.('Could not copy to clipboard.', 'error');
        }
      });
  } else if (textarea) {
    textarea.focus();
    textarea.select();
    toastFn?.('Press Ctrl+C to copy');
  }
}

export function exportJSON() {
  const S = getVault();
  const data = serialize();
  data.texts = Object.fromEntries(
    S.docs.filter((d) => TEXTS.has(d.id)).map((d) => [d.id, TEXTS.get(d.id)])
  );
  data.exportedAt = new Date().toISOString();
  data.app = 'Lattice';
  return JSON.stringify(data, null, 2);
}

export function exportMD() {
  const S = getVault();
  const today = new Date().toISOString().slice(0, 10);
  let out = `# Lattice vault\n\nExported ${today} · ${S.nodes.length} nodes · ${S.edges.length} links · ${S.docs.length} sources\n\n## Sources\n\n`;
  for (const d of S.docs) {
    out += `- **${d.title}** (${d.kind || 'notes'}, added ${fmtDate(d.addedAt)})${
      d.summary ? ' — ' + d.summary : ''
    }\n`;
  }
  out += '\n## Nodes\n';
  for (const n of [...S.nodes].sort((a, b) => a.label.localeCompare(b.label))) {
    const cl = D.commList[D.comm.get(n.id)];
    out += `\n### ${n.label}\n\n*${TYPES[n.type].name}*${
      cl && cl.big ? ` · cluster: ${cl.name}` : ''
    }${n.aliases.length ? ` · aka ${n.aliases.join(', ')}` : ''}\n\n`;
    if (n.summary) out += n.summary + '\n\n';
    for (const a of D.adj.get(n.id) || []) {
      out += a.out
        ? `- ${a.e.label} → [[${lbl(a.o)}]]\n`
        : `- ← ${a.e.label} · [[${lbl(a.o)}]]\n`;
    }
    if (n.docs.length) out += `\nSources: ${n.docs.map(docTitle).join('; ')}\n`;
    if (n.note) out += `\n> ${n.note.replace(/\n/g, '\n> ')}\n`;
  }
  return out;
}

export function exportCSV() {
  const S = getVault();
  const q = (s) => '"' + String(s).replace(/"/g, '""') + '"';
  return (
    'source,relation,target,weight,sources,suggested\n' +
    S.edges
      .map((e) =>
        [
          q(lbl(e.s)),
          q(e.label),
          q(lbl(e.t)),
          e.w || 1,
          q(e.docs.map(docTitle).join('; ')),
          e.inferred ? 'yes' : 'no',
        ].join(',')
      )
      .join('\n')
  );
}

export function exportPNG(drawSceneFn, graphState) {
  const S = getVault();
  return new Promise((resolve) => {
    const sc = 2;
    const c2 = document.createElement('canvas');
    c2.width = Math.round(graphState.w * sc);
    c2.height = Math.round(graphState.h * sc + 44 * sc);
    const x = c2.getContext('2d');
    drawSceneFn(x, performance.now(), { scale: sc, still: true });
    x.setTransform(sc, 0, 0, sc, 0, 0);
    x.fillStyle = C.deck;
    x.fillRect(0, graphState.h, graphState.w, 44);
    x.fillStyle = C.ice;
    x.fillRect(16, graphState.h + 18, 8, 8);
    x.font = `700 14px ${DISPLAY}`;
    x.fillStyle = C.ink;
    x.textBaseline = 'middle';
    x.fillText('LATTICE', 32, graphState.h + 22);
    x.font = `500 11px ${MONO}`;
    x.fillStyle = C.ink2;
    x.fillText(
      `${S.nodes.length} nodes · ${S.edges.length} links · ${S.docs.length} sources · ${new Date()
        .toISOString()
        .slice(0, 10)}`,
      110,
      graphState.h + 22
    );
    c2.toBlob((blob) => resolve(blob), 'image/png');
  });
}
