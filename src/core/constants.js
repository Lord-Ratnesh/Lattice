import { rgba } from './utils.js';

const cs = typeof document !== 'undefined' ? getComputedStyle(document.documentElement) : null;
const tok = (name, fallback) => {
  const v = cs ? cs.getPropertyValue(name).trim() : '';
  return v || fallback;
};

export const C = {
  void: tok('--void', '#05070B'),
  deck: tok('--deck', '#0A0E15'),
  rule: tok('--rule', '#1A2331'),
  ruleHi: tok('--rule-hi', '#2A3850'),
  ink: tok('--ink', '#E3EBF5'),
  ink2: tok('--ink-2', '#A6B4C8'),
  mute: tok('--mute', '#66758C'),
  ice: tok('--ice', '#7FD8FF'),
  amber: tok('--amber', '#FFB547'),
  rose: tok('--rose', '#FF7A9A'),
  mint: tok('--mint', '#6FE3B4'),
  violet: tok('--violet', '#B39BFF'),
  paper: tok('--paper', '#D9E2EE'),
  steel: tok('--steel', '#8E9DB4'),
  danger: tok('--danger', '#FF5C6C'),
};

export const BODY = "'IBM Plex Sans', system-ui, sans-serif";
export const MONO = "'JetBrains Mono', ui-monospace, monospace";
export const DISPLAY = "'Chakra Petch', system-ui, sans-serif";

export const REDUCED =
  typeof window !== 'undefined' &&
  window.matchMedia &&
  window.matchMedia('(prefers-reduced-motion: reduce)').matches;

export const ICONS = {
  search: '<path d="M2.5 2.5h7v7h-7zM9.5 9.5l4 4"/>',
  plus: '<path d="M8 2.5v11M2.5 8h11"/>',
  minus: '<path d="M2.5 8h11"/>',
  upload: '<path d="M8 11V2.5M4.5 6L8 2.5 11.5 6M2.5 10.5v3h11v-3"/>',
  paste: '<path d="M5.5 2h5v2.5h-5zM4 3.5H2.5v10h11v-10H12M5 8h6M5 10.5h4"/>',
  mic: '<path d="M6 2h4v7H6zM3.5 7v2.5L5 11h6l1.5-1.5V7M8 11v3M5.5 14h5"/>',
  send: '<path d="M2.5 8h10M9 4.5L12.5 8 9 11.5"/>',
  stop: '<path d="M4 4h8v8H4z"/>',
  speaker: '<path d="M2.5 6h3L9 3v10l-3.5-3h-3zM11.5 5.5L13 8l-1.5 2.5"/>',
  focus: '<path d="M2.5 5.5v-3h3M10.5 2.5h3v3M13.5 10.5v3h-3M5.5 13.5h-3v-3M7 7h2v2H7z"/>',
  pin: '<path d="M5.5 2.5h5l-1 4 2 2h-7l2-2zM8 8.5v5"/>',
  trash: '<path d="M2.5 4h11M6 4V2.5h4V4M4 4l.75 9.5h6.5L12 4"/>',
  link: '<path d="M6.5 9.5l3-3M7 4.5l2-2h4.5V7l-2 2M9 11.5l-2 2H2.5V9l2-2"/>',
  path: '<path d="M2.5 2.5h3v3h-3zM10.5 10.5h3v3h-3zM4 5.5v5h4.5M12 10.5v-5H7.5"/>',
  spark: '<path d="M8 1.5l1.6 4.9 4.9 1.6-4.9 1.6L8 14.5l-1.6-4.9L1.5 8l4.9-1.6z"/>',
  download: '<path d="M8 2.5V11M4.5 7.5L8 11l3.5-3.5M2.5 13.5h11"/>',
  undo: '<path d="M5 3L2.5 5.5 5 8M2.5 5.5h8l2.5 2.5v2l-2.5 2.5H6"/>',
  help: '<path d="M5 5.5v-2L6.5 2h3L11 3.5v2.5L8 8v2M8 12.5V14"/>',
  fit: '<path d="M2.5 6V2.5H6M10 2.5h3.5V6M13.5 10v3.5H10M6 13.5H2.5V10"/>',
  play: '<path d="M4.5 2.5l8 5.5-8 5.5z"/>',
  pause: '<path d="M5 3v10M11 3v10"/>',
  close: '<path d="M3.5 3.5l9 9M12.5 3.5l-9 9"/>',
  swap: '<path d="M4.5 2.5v10M2 10l2.5 2.5L7 10M11.5 13.5v-10M9 6l2.5-2.5L14 6"/>',
  merge: '<path d="M3 2.5v3l5 4v4M13 2.5v3l-5 4"/>',
  edit: '<path d="M10.5 2.5l3 3-8 8h-3v-3z"/>',
  snow: '<path d="M8 1.5v13M2.4 4.75l11.2 6.5M2.4 11.25l11.2-6.5"/>',
  bolt: '<path d="M9 1.5L3.5 9H8l-1 5.5L12.5 7H8z"/>',
  layers: '<path d="M8 2l6 3-6 3-6-3zM2 8l6 3 6-3M2 11l6 3 6-3"/>',
  grid: '<path d="M2.5 2.5h4v4h-4zM9.5 2.5h4v4h-4zM2.5 9.5h4v4h-4zM9.5 9.5h4v4h-4z"/>',
  dice: '<path d="M2.5 2.5h11v11h-11zM5.5 5.5h.01M10.5 10.5h.01M8 8h.01"/>',
  copy: '<path d="M5.5 5.5h8v8h-8zM10.5 5.5v-3h-8v8h3"/>',
  doc: '<path d="M3.5 1.5h6l3 3v10h-9zM9.5 1.5v3h3M5.5 8h5M5.5 10.5h5"/>',
  image: '<path d="M2 3h12v10H2zM2 11l4-4 3 3 2-2 3 3"/>',
  globe: '<path d="M2.5 2.5h11v11h-11zM2.5 8h11M8 2.5v11"/>',
  sliders: '<path d="M2.5 4h11M2.5 8h11M2.5 12h11M5.5 2.5v3M10.5 6.5v3M6.5 10.5v3"/>',
};

export const ico = (name, size = 14) =>
  `<svg viewBox="0 0 16 16" width="${size}" height="${size}" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="square" stroke-linejoin="miter" aria-hidden="true">${ICONS[name] || ''}</svg>`;

export const TYPE_ORDER = ['concept', 'method', 'person', 'artifact', 'field', 'gap', 'source'];

export const TYPES = {
  concept: { name: 'Concept', v: '--ice', c: tok('--ice', '#7FD8FF'), shape: 'square' },
  method: { name: 'Method', v: '--amber', c: tok('--amber', '#FFB547'), shape: 'diamond' },
  person: { name: 'Person', v: '--rose', c: tok('--rose', '#FF7A9A'), shape: 'triangle' },
  artifact: { name: 'Artifact', v: '--mint', c: tok('--mint', '#6FE3B4'), shape: 'hex' },
  field: { name: 'Field', v: '--violet', c: tok('--violet', '#B39BFF'), shape: 'double' },
  gap: { name: 'Gap', v: '--steel', c: tok('--steel', '#8E9DB4'), shape: 'dashed' },
  source: { name: 'Source', v: '--paper', c: tok('--paper', '#D9E2EE'), shape: 'page' },
};

export const ENTITY_TYPES = ['concept', 'method', 'person', 'artifact', 'field'];

export const PAL = [
  '#7FD8FF',
  '#FFB547',
  '#FF7A9A',
  '#6FE3B4',
  '#B39BFF',
  '#F3E37C',
  '#FF9466',
  '#5C9DFF',
  '#E78BFF',
  '#A6E86F',
  '#FFC9A3',
  '#62D2D2',
];

export const pal = (i) => PAL[((i % PAL.length) + PAL.length) % PAL.length];

export function shapeSvg(type, size = 12, col) {
  const c = col || TYPES[type]?.c || C.ink;
  const s = TYPES[type]?.shape || 'square';
  let d = '';
  switch (s) {
    case 'diamond':
      d = '<path d="M8 1.6L14.4 8 8 14.4 1.6 8z"/>';
      break;
    case 'triangle':
      d = '<path d="M8 1.8L14.4 13.5H1.6z"/>';
      break;
    case 'hex':
      d = '<path d="M4.6 2.2h6.8L15 8l-3.6 5.8H4.6L1 8z"/>';
      break;
    case 'double':
      d = `<rect x="2.5" y="2.5" width="11" height="11"/><rect x="5.6" y="5.6" width="4.8" height="4.8" fill="${c}" stroke="none"/>`;
      break;
    case 'dashed':
      d = '<rect x="2.5" y="2.5" width="11" height="11" stroke-dasharray="2.4 1.6"/>';
      break;
    case 'page':
      d = '<path d="M3.5 1.5h6l3 3v10h-9z"/><path d="M9.5 1.5v3h3" fill="none"/>';
      break;
    default:
      d = '<rect x="2.5" y="2.5" width="11" height="11"/>';
  }
  return `<svg class="shape" viewBox="0 0 16 16" width="${size}" height="${size}" fill="${rgba(c, 0.24)}" stroke="${c}" stroke-width="1.4" stroke-linejoin="miter" aria-hidden="true">${d}</svg>`;
}

export const STOP = new Set(
  'a an the and or but if then else of for to in on at by with from as is are was were be been being this that these those it its into over under than such via per we our you your they their he she his her i me my not no yes can could would should will may might do does did done have has had also more most less least very much many some any each other both all one two three using used use based new first second within between about after before during while where which who whom whose what when why how there here et al fig figure table section paper results result approach method methods study studies show shows shown however therefore thus although because since chapter page note notes example examples data work works way ways part parts number lot today'.split(' ')
);
