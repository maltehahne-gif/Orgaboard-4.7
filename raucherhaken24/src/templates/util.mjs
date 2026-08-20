/** Kleine Helfer für die Templates. Keine externen Abhängigkeiten. */

export function esc(value) {
  if (value === null || value === undefined) return '';
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** Für Attribute innerhalb von JSON-LD. */
export function jsonLd(obj) {
  return JSON.stringify(obj, null, 0).replace(/</g, '\\u003c');
}

export function money(value, symbol = '€') {
  if (typeof value !== 'number' || !isFinite(value)) return null;
  return value.toFixed(2).replace('.', ',') + ' ' + symbol;
}

/** Entfernt HTML aus einem String (für Meta-Descriptions). */
export function stripTags(html) {
  return String(html).replace(/<[^>]*>/g, '');
}

export function truncate(text, max = 155) {
  const t = stripTags(text).replace(/\s+/g, ' ').trim();
  if (t.length <= max) return t;
  return t.slice(0, max - 1).replace(/[\s,;:.-]+\S*$/, '') + '…';
}

const ICONS = {
  search: '<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>',
  cart: '<circle cx="9" cy="20" r="1.6"/><circle cx="18" cy="20" r="1.6"/><path d="M2 3h3l2.6 12.4a1.5 1.5 0 0 0 1.5 1.2h8.6a1.5 1.5 0 0 0 1.5-1.2L21 7H6"/>',
  user: '<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/>',
  dealer: '<rect x="3" y="7" width="18" height="13" rx="2"/><path d="M9 7V5a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2M3 12h18"/>',
  menu: '<path d="M4 7h16M4 12h16M4 17h16"/>',
  close: '<path d="M6 6l12 12M18 6L6 18"/>',
  check: '<path d="m5 13 4 4L19 7"/>',
  arrow: '<path d="M5 12h13M13 6l6 6-6 6"/>',
  hook: '<path d="M12 3v7a4 4 0 1 1-4 4"/><path d="M9 3h6"/>',
  fish: '<path d="M15.5 12c0 3.6-3.4 6-7 6-3 0-5.5-2.4-5.5-6s2.5-6 5.5-6c3.6 0 7 2.4 7 6Z"/><path d="m15.5 12 5.5-3.5v7L15.5 12Z"/><path d="M6 10.5h.01"/>',
  meat: '<path d="M7 20a5 5 0 0 1-3-8.6C6 9 7 6 9.5 4.4A6 6 0 0 1 20 8c0 3-2 5-4.5 6.5C13 16 12 18.5 10 20Z"/>',
  wood: '<ellipse cx="12" cy="7" rx="8" ry="3.2"/><path d="M4 7v10c0 1.8 3.6 3.2 8 3.2s8-1.4 8-3.2V7"/>',
  flame: '<path d="M12 22c4 0 6.5-2.6 6.5-6 0-4.5-4.5-6.5-4-11C11 6 9 8.5 9 11c0 1.5-1 2-1.5 1.2C6.5 14 5.5 15.8 5.5 18c0 2.6 2.5 4 6.5 4Z"/>',
  thermometer: '<path d="M14 14.8V4a2 2 0 1 0-4 0v10.8a4 4 0 1 0 4 0Z"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3.5 2"/>',
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 8h.01"/>',
  zoom: '<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5M11 8v6M8 11h6"/>',
  mic: '<rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5 11a7 7 0 0 0 14 0M12 18v3"/>',
  send: '<path d="M4 12 20 4l-6 16-2.5-6.5L4 12Z"/>',
  speaker: '<path d="M11 5 6.5 9H3v6h3.5L11 19V5Z"/><path d="M15.5 9a4 4 0 0 1 0 6"/>',
  chat: '<path d="M21 12a8 8 0 0 1-11.8 7L3.5 20.5 5 14.8A8 8 0 1 1 21 12Z"/>',
  truck: '<path d="M2 6h11v11H2zM13 9h4l4 3.5V17h-8"/><circle cx="6.5" cy="18.5" r="1.8"/><circle cx="17.5" cy="18.5" r="1.8"/>',
  shield: '<path d="M12 3 5 6v6c0 4.4 3 7.6 7 9 4-1.4 7-4.6 7-9V6l-7-3Z"/>',
  book: '<path d="M4 5a2 2 0 0 1 2-2h13v16H6a2 2 0 0 0-2 2V5Z"/><path d="M4 19a2 2 0 0 1 2-2h13"/>',
  phone: '<path d="M6 3h3l2 5-2.4 1.4a12 12 0 0 0 5 5L15 12l5 2v3a2 2 0 0 1-2.2 2A16.5 16.5 0 0 1 4 5.2 2 2 0 0 1 6 3Z"/>',
  mail: '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="m3.5 7 8.5 6 8.5-6"/>',
  link: '<path d="M10 13a4 4 0 0 0 5.7.4l3-3A4 4 0 0 0 13 4.7l-1.7 1.7"/><path d="M14 11a4 4 0 0 0-5.7-.4l-3 3A4 4 0 0 0 11 19.3l1.7-1.7"/>',
  facebook: '<path d="M14 8.5V7c0-.8.5-1 1-1h2V3h-3a4 4 0 0 0-4 4v1.5H8V12h2v9h4v-9h2.5l.5-3.5H14Z"/>',
  instagram: '<rect x="3" y="3" width="18" height="18" rx="5"/><circle cx="12" cy="12" r="4"/><circle cx="17.2" cy="6.8" r="1"/>',
  youtube: '<rect x="2.5" y="5.5" width="19" height="13" rx="4"/><path d="m10 9.5 5 2.5-5 2.5v-5Z"/>',
  pinterest: '<circle cx="12" cy="12" r="9"/><path d="M12 7c-2.2 0-3.5 1.4-3.5 3 0 .8.4 1.6 1 2M12 7c2 0 3.2 1.2 3.2 3 0 2.2-1.3 3.8-3 3.8-.8 0-1.5-.5-1.3-1.2M11 12.5 9.8 18"/>',
  whatsapp: '<path d="M3.5 20.5 5 16.6A8 8 0 1 1 8.2 19l-4.7 1.5Z"/><path d="M9 9.5c0 3 2.5 5.5 5.5 5.5"/>',
  print: '<path d="M7 8V3h10v5"/><rect x="4" y="8" width="16" height="7" rx="2"/><path d="M7 13h10v8H7z"/>',
  box: '<path d="m12 3 8 4.2v9.6L12 21l-8-4.2V7.2L12 3Z"/><path d="m4 7.2 8 4.3 8-4.3M12 21v-9.5"/>',
};

/** Inline-SVG-Icon. Keine Icon-Library, kein zusätzlicher Request. */
export function icon(name, size = 20, extraClass = '') {
  const path = ICONS[name];
  if (!path) return '';
  return `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"${extraClass ? ` class="${extraClass}"` : ''}>${path}</svg>`;
}

export function hasIcon(name) {
  return Boolean(ICONS[name]);
}
