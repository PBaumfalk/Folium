import { z } from 'zod';

/**
 * Design einer Linkseite: ausschließlich validierte Daten. Der Server rendert daraus
 * CSS-Variablen in festen Vorlagen – eigenes CSS, HTML oder JavaScript ist nicht möglich.
 */

export interface FontFile {
  file: string;
  weight: string; // "400" oder Bereich "200 800"
  style: 'normal' | 'italic';
  format: 'woff2' | 'truetype';
}
export interface FontDef {
  family: string;
  category: 'serif' | 'sans' | 'slab';
  fallback: string;
  files: FontFile[];
  license: string;
  note: string;
}

const w2 = (file: string, weight = '100 900'): FontFile => ({ file, weight, style: 'normal', format: 'woff2' });

/** Mitgelieferte Schriften (alle SIL Open Font License 1.1, lokal ausgeliefert). */
export const FONTS = {
  newsreader: { family: 'Newsreader', category: 'serif', fallback: 'Georgia, "Times New Roman", serif', files: [w2('newsreader-latin-opsz-normal.woff2', '200 800')], license: 'OFL-1.1', note: 'Ruhige Zeitungsserife mit optischen Größen' },
  'source-serif-4': { family: 'Source Serif 4', category: 'serif', fallback: 'Georgia, serif', files: [w2('source-serif-4-latin-opsz-normal.woff2', '200 900')], license: 'OFL-1.1', note: 'Klassische Buchserife' },
  literata: { family: 'Literata', category: 'serif', fallback: 'Georgia, serif', files: [w2('literata-latin-opsz-normal.woff2', '200 900')], license: 'OFL-1.1', note: 'Gut lesbare Leseschrift' },
  aleo: { family: 'Aleo', category: 'slab', fallback: 'Georgia, serif', files: [{ file: 'Aleo-wght.ttf', weight: '100 900', style: 'normal', format: 'truetype' }], license: 'OFL-1.1', note: 'Kräftige, freundliche Slab-Serife' },
  'zilla-slab': { family: 'Zilla Slab', category: 'slab', fallback: 'Georgia, serif', files: [{ file: 'zilla-slab-latin-400-normal.woff2', weight: '400', style: 'normal', format: 'woff2' }, { file: 'zilla-slab-latin-700-normal.woff2', weight: '700', style: 'normal', format: 'woff2' }], license: 'OFL-1.1', note: 'Kräftige Serifenbetonte' },
  'hanken-grotesk': { family: 'Hanken Grotesk', category: 'sans', fallback: 'system-ui, -apple-system, "Segoe UI", sans-serif', files: [w2('hanken-grotesk-latin-wght-normal.woff2')], license: 'OFL-1.1', note: 'Klare, freundliche Grotesk' },
  'instrument-sans': { family: 'Instrument Sans', category: 'sans', fallback: 'system-ui, sans-serif', files: [w2('instrument-sans-latin-wght-normal.woff2', '400 700')], license: 'OFL-1.1', note: 'Moderne, schmale Grotesk' },
  'bricolage-grotesque': { family: 'Bricolage Grotesque', category: 'sans', fallback: 'system-ui, sans-serif', files: [w2('bricolage-grotesque-latin-standard-normal.woff2', '200 800')], license: 'OFL-1.1', note: 'Charaktervolle Überschriftenschrift' },
  'public-sans': { family: 'Public Sans', category: 'sans', fallback: 'system-ui, sans-serif', files: [w2('public-sans-latin-wght-normal.woff2')], license: 'OFL-1.1', note: 'Neutrale Behördengrotesk' },
  'ibm-plex-sans': { family: 'IBM Plex Sans', category: 'sans', fallback: 'system-ui, sans-serif', files: [{ file: 'ibm-plex-sans-latin-400-normal.woff2', weight: '400', style: 'normal', format: 'woff2' }, { file: 'ibm-plex-sans-latin-700-normal.woff2', weight: '700', style: 'normal', format: 'woff2' }], license: 'OFL-1.1', note: 'Technisch-sachliche Grotesk' },
} satisfies Record<string, FontDef>;

export type BundledFontId = keyof typeof FONTS;
export const FONT_IDS = Object.keys(FONTS) as BundledFontId[];
export const isBundledFont = (id: string): id is BundledFontId => Object.prototype.hasOwnProperty.call(FONTS, id);

const hex = z
  .string()
  .regex(/^#[0-9a-fA-F]{6}$/, 'Farben bitte als #RRGGBB angeben.')
  .transform((s) => s.toUpperCase());
const fontId = z.string().refine((v) => isBundledFont(v) || /^upload:[a-f0-9]{16,64}$/.test(v), 'Unbekannte Schrift.');

export const COLOR_KEYS = ['background', 'surface', 'text', 'muted', 'accent', 'onAccent', 'border'] as const;
export type ColorKey = (typeof COLOR_KEYS)[number];
export const COLOR_LABELS: Record<ColorKey, string> = {
  background: 'Hintergrund',
  surface: 'Flächen (Karten)',
  text: 'Text',
  muted: 'Nebentext',
  accent: 'Akzent (Hauptaktion)',
  onAccent: 'Text auf Akzent',
  border: 'Linien',
};

export const themeSchema = z
  .object({
    preset: z.enum(['editorial', 'boutique', 'signature', 'eigenes']),
    colors: z.object(Object.fromEntries(COLOR_KEYS.map((k) => [k, hex])) as Record<ColorKey, typeof hex>).strict(),
    fonts: z.object({ heading: fontId, body: fontId }).strict(),
    buttons: z.object({ shape: z.enum(['square', 'soft', 'round', 'pill']), style: z.enum(['solid', 'outline']) }).strict(),
    cards: z.object({ style: z.enum(['line', 'fill', 'none']), radius: z.number().int().min(0).max(28) }).strict(),
    density: z.enum(['compact', 'normal', 'airy']),
    header: z.object({ layout: z.enum(['text', 'photo-top', 'photo-side']), logoSize: z.enum(['S', 'M', 'L']) }).strict(),
    linkLayout: z.enum(['list', 'cards', 'tiles']),
    primaryAction: z.enum(['button', 'pill-sticky']),
    sectionBand: z.boolean(),
  })
  .strict();

export type Theme = z.infer<typeof themeSchema>;
export type PresetId = 'editorial' | 'boutique' | 'signature';

export const PRESETS: Record<PresetId, Theme> = {
  editorial: {
    preset: 'editorial',
    colors: { background: '#F5F6F3', surface: '#FFFFFF', text: '#17201B', muted: '#5A635E', accent: '#0B7032', onAccent: '#FFFFFF', border: '#D9DED8' },
    fonts: { heading: 'newsreader', body: 'hanken-grotesk' },
    buttons: { shape: 'soft', style: 'solid' },
    cards: { style: 'line', radius: 6 },
    density: 'normal',
    header: { layout: 'text', logoSize: 'M' },
    linkLayout: 'list',
    primaryAction: 'button',
    sectionBand: false,
  },
  boutique: {
    preset: 'boutique',
    colors: { background: '#E7EBE2', surface: '#FBFCF9', text: '#16201A', muted: '#4F5B54', accent: '#D2A867', onAccent: '#16201A', border: '#C9D1C4' },
    fonts: { heading: 'bricolage-grotesque', body: 'instrument-sans' },
    buttons: { shape: 'pill', style: 'solid' },
    cards: { style: 'fill', radius: 22 },
    density: 'airy',
    header: { layout: 'photo-top', logoSize: 'M' },
    linkLayout: 'tiles',
    primaryAction: 'pill-sticky',
    sectionBand: false,
  },
  signature: {
    preset: 'signature',
    colors: { background: '#EEF3EE', surface: '#FFFFFF', text: '#1D1D1B', muted: '#4D5650', accent: '#0B7032', onAccent: '#FFFFFF', border: '#CFDCD1' },
    fonts: { heading: 'aleo', body: 'aleo' },
    buttons: { shape: 'soft', style: 'solid' },
    cards: { style: 'fill', radius: 4 },
    density: 'normal',
    header: { layout: 'photo-side', logoSize: 'L' },
    linkLayout: 'cards',
    primaryAction: 'button',
    sectionBand: true,
  },
};

export const PRESET_LABELS: Record<PresetId, { name: string; description: string }> = {
  editorial: { name: 'Editorial', description: 'Ruhige Serifentypografie, Anrufen zuerst, lädt am schnellsten.' },
  boutique: { name: 'Modern Boutique', description: 'Großes Foto, markante Termin-Pille, Bildkacheln.' },
  signature: { name: 'Signature', description: 'Kräftige Slab-Serife, sattes Grün, farbiges Band – wie eine klassische Firmenwebsite.' },
};

export const DEFAULT_PRESET: PresetId = 'editorial';

// ── Kontrast (WCAG 2.x) ──────────────────────────────────────────────

function channel(c: number): number {
  const s = c / 255;
  return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
}
export function hexToRgb(h: string): [number, number, number] {
  const v = h.replace('#', '');
  return [parseInt(v.slice(0, 2), 16), parseInt(v.slice(2, 4), 16), parseInt(v.slice(4, 6), 16)];
}
export function rgbToHex(r: number, g: number, b: number): string {
  return `#${[r, g, b].map((x) => Math.max(0, Math.min(255, Math.round(x))).toString(16).padStart(2, '0')).join('').toUpperCase()}`;
}
export function luminance(h: string): number {
  const [r, g, b] = hexToRgb(h);
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}
export function contrastRatio(a: string, b: string): number {
  const la = luminance(a);
  const lb = luminance(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

/** Verschiebt die Vordergrundfarbe Richtung Schwarz oder Weiß, bis der Kontrast reicht. */
export function fixContrast(fg: string, bg: string, min = 4.5): string {
  if (contrastRatio(fg, bg) >= min) return fg;
  const towardsDark = luminance(bg) > 0.25;
  const [r, g, b] = hexToRgb(fg);
  const t = towardsDark ? 0 : 255;
  for (let i = 1; i <= 20; i++) {
    const k = i / 20;
    const c = rgbToHex(r + (t - r) * k, g + (t - g) * k, b + (t - b) * k);
    if (contrastRatio(c, bg) >= min) return c;
  }
  return towardsDark ? '#000000' : '#FFFFFF';
}

export interface ContrastCheck {
  pair: string;
  label: string;
  ratio: number;
  ok: boolean;
  fg: ColorKey;
  bg: ColorKey;
  suggestion?: string;
}

const PAIRS: [ColorKey, ColorKey, string][] = [
  ['text', 'background', 'Text auf Hintergrund'],
  ['text', 'surface', 'Text auf Flächen'],
  ['muted', 'background', 'Nebentext auf Hintergrund'],
  ['muted', 'surface', 'Nebentext auf Flächen'],
  ['onAccent', 'accent', 'Text auf Hauptaktion'],
];

export function checkTheme(t: Theme): ContrastCheck[] {
  return PAIRS.map(([fg, bg, label]) => {
    const ratio = Math.round(contrastRatio(t.colors[fg], t.colors[bg]) * 100) / 100;
    const ok = ratio >= 4.5;
    return { pair: `${fg}/${bg}`, label, ratio, ok, fg, bg, ...(ok ? {} : { suggestion: fixContrast(t.colors[fg], t.colors[bg]) }) };
  });
}

/** Erzwingt ausreichenden Kontrast, indem Vordergrundfarben angepasst werden. Gibt Hinweise zurück. */
export function enforceContrast(t: Theme): { theme: Theme; changes: string[] } {
  const next: Theme = { ...t, colors: { ...t.colors } };
  const changes: string[] = [];
  for (const c of checkTheme(next)) {
    if (!c.ok) {
      const fixed = fixContrast(next.colors[c.fg], next.colors[c.bg]);
      changes.push(`${COLOR_LABELS[c.fg]} von ${next.colors[c.fg]} auf ${fixed} angepasst (Kontrast ${c.ratio}:1 war zu gering).`);
      next.colors[c.fg] = fixed;
    }
  }
  return { theme: next, changes };
}
