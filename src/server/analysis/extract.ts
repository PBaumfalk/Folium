import { parseDocument } from 'htmlparser2';
import type { AnyNode, Element } from 'domhandler';
import { FONTS, type BundledFontId } from '../../shared/theme.js';

/**
 * Deterministische Merkmalsanalyse einer Website. Alles hier ist tatsächlich ausgelesen
 * (HTML, CSS, im Browser berechnete Stile). Jede Angabe trägt eine ID, auf die sich die
 * KI beziehen muss, wenn sie etwas als „erkannt“ ausgibt.
 */

export interface ColorFeature {
  id: string;
  hex: string;
  source: string;
  weight: number;
  role?: 'background' | 'text' | 'accent' | 'button' | 'link' | 'heading';
}
export interface FontFeature {
  id: string;
  family: string;
  source: string;
  usedFor: ('heading' | 'body' | 'button')[];
  bundled: BundledFontId | null;
}
export interface ButtonFeature {
  id: string;
  selector: string;
  background: string | null;
  color: string | null;
  radius: string | null;
  border: string | null;
  padding: string | null;
  fontWeight: string | null;
  source: 'css' | 'computed';
}
export interface LogoFeature {
  id: string;
  url: string;
  kind: 'svg' | 'img' | 'og' | 'icon';
  alt: string;
}
export interface ComputedSnapshot {
  body: { bg: string; color: string; fontFamily: string; fontSize: string };
  headings: { tag: string; color: string; fontFamily: string; fontWeight: string; fontSize: string }[];
  link: { color: string } | null;
  buttons: { selector: string; text: string; bg: string; color: string; radius: string; border: string; padding: string; fontWeight: string; fontFamily: string }[];
  areas: { color: string; area: number }[];
  imageArea: number;
  viewportArea: number;
  textChars: number;
}
export interface Features {
  url: string;
  title: string;
  description: string;
  colors: ColorFeature[];
  fonts: FontFeature[];
  buttons: ButtonFeature[];
  radii: string[];
  shadows: string[];
  logo: LogoFeature[];
  images: { count: number; areaShare: number | null };
  density: 'luftig' | 'mittel' | 'dicht' | 'unbekannt';
  textSample: string;
  notes: string[];
}

// ── Farben ────────────────────────────────────────────────────────────

const NAMED: Record<string, string> = { white: '#FFFFFF', black: '#000000' };
const hex2 = (n: number) => Math.max(0, Math.min(255, Math.round(n))).toString(16).padStart(2, '0').toUpperCase();

export function normalizeColor(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const v = raw.trim().toLowerCase();
  if (NAMED[v]) return NAMED[v];
  let m = /^#([0-9a-f]{3,4})$/.exec(v);
  if (m) {
    if (m[1].length === 4 && parseInt(m[1][3], 16) < 8) return null;
    return `#${m[1].slice(0, 3).split('').map((c) => c + c).join('')}`.toUpperCase();
  }
  m = /^#([0-9a-f]{6})([0-9a-f]{2})?$/.exec(v);
  if (m) {
    if (m[2] && parseInt(m[2], 16) < 128) return null;
    return `#${m[1]}`.toUpperCase();
  }
  m = /^rgba?\(\s*([\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)(?:\s*[,/]\s*([\d.]+%?))?\s*\)$/.exec(v);
  if (m) {
    if (m[4] !== undefined) {
      const a = m[4].endsWith('%') ? parseFloat(m[4]) / 100 : parseFloat(m[4]);
      if (a < 0.5) return null;
    }
    return `#${hex2(+m[1])}${hex2(+m[2])}${hex2(+m[3])}`;
  }
  m = /^hsla?\(\s*([\d.]+)(?:deg)?[\s,]+([\d.]+)%[\s,]+([\d.]+)%(?:\s*[,/]\s*([\d.]+%?))?\s*\)$/.exec(v);
  if (m) {
    if (m[4] !== undefined && (m[4].endsWith('%') ? parseFloat(m[4]) / 100 : parseFloat(m[4])) < 0.5) return null;
    const h = (+m[1] % 360) / 360;
    const s = +m[2] / 100;
    const l = +m[3] / 100;
    const f = (n: number) => {
      const k = (n + h * 12) % 12;
      const a = s * Math.min(l, 1 - l);
      return l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1));
    };
    return `#${hex2(f(0) * 255)}${hex2(f(8) * 255)}${hex2(f(4) * 255)}`;
  }
  return null;
}

// ── CSS (einfacher, toleranter Zerleger) ─────────────────────────────

interface Rule {
  selector: string;
  decls: [string, string][];
  atRule: string | null;
}

function parseCss(text: string): Rule[] {
  const css = text.replace(/\/\*[\s\S]*?\*\//g, '');
  const rules: Rule[] = [];
  const walk = (src: string, at: string | null) => {
    let i = 0;
    while (i < src.length) {
      const open = src.indexOf('{', i);
      if (open < 0) break;
      const head = src.slice(i, open).trim();
      let depth = 1;
      let j = open + 1;
      while (j < src.length && depth) {
        if (src[j] === '{') depth++;
        else if (src[j] === '}') depth--;
        j++;
      }
      const body = src.slice(open + 1, j - 1);
      const headClean = head.replace(/^[^@]*;/, '').trim();
      if (headClean.startsWith('@media') || headClean.startsWith('@supports') || headClean.startsWith('@layer')) walk(body, headClean);
      else if (!headClean.startsWith('@keyframes')) {
        const decls: [string, string][] = [];
        for (const d of body.split(';')) {
          const k = d.indexOf(':');
          if (k > 0) decls.push([d.slice(0, k).trim().toLowerCase(), d.slice(k + 1).trim().replace(/\s*!important$/, '')]);
        }
        rules.push({ selector: headClean, decls, atRule: at });
      }
      i = j;
    }
  };
  walk(css, null);
  return rules;
}

const firstFamily = (v: string) => v.split(',')[0].trim().replace(/^["']|["']$/g, '');
const GENERIC = new Set(['serif', 'sans-serif', 'monospace', 'system-ui', 'inherit', 'initial', 'cursive', '-apple-system', 'ui-sans-serif', 'ui-serif']);

function bundledFor(family: string): BundledFontId | null {
  const f = family.toLowerCase();
  for (const [id, def] of Object.entries(FONTS)) if (def.family.toLowerCase() === f) return id as BundledFontId;
  return null;
}

function textOf(n: AnyNode, out: string[], skip = new Set(['script', 'style', 'noscript', 'svg', 'template', 'head'])) {
  if (n.type === 'text') out.push((n as unknown as { data: string }).data);
  const el = n as Element;
  if (el.children && !(el.name && skip.has(el.name))) for (const c of el.children) textOf(c, out, skip);
}
function findAll(n: AnyNode, pred: (e: Element) => boolean, out: Element[] = [], ancestors: Element[] = [], withAnc?: Map<Element, Element[]>): Element[] {
  const el = n as Element;
  if (el.type === 'tag' || el.type === 'script' || el.type === 'style') {
    if (pred(el)) {
      out.push(el);
      withAnc?.set(el, ancestors);
    }
  }
  if (el.children) for (const c of el.children) findAll(c, pred, out, el.type === 'tag' ? [...ancestors, el] : ancestors, withAnc);
  return out;
}

const abs = (u: string, base: string) => {
  try {
    return new URL(u, base).toString();
  } catch {
    return null;
  }
};

/** Verweise auf Stylesheets in einem Dokument (für den Abruf). */
export function stylesheetUrls(html: string, base: string): string[] {
  const doc = parseDocument(html);
  return findAll(doc, (e) => e.name === 'link' && /\bstylesheet\b/i.test(e.attribs.rel ?? '') && !!e.attribs.href)
    .map((e) => abs(e.attribs.href, base))
    .filter((u): u is string => !!u && /^https?:/.test(u));
}

export function extractFeatures(input: { url: string; html: string; css: { url: string; text: string }[]; computed?: ComputedSnapshot | null }): Features {
  const doc = parseDocument(input.html);
  const notes: string[] = [];
  const inlineCss = findAll(doc, (e) => e.name === 'style').map((e) => {
    const t: string[] = [];
    textOf(e, t, new Set());
    return t.join('');
  });
  const rules = [...input.css.flatMap((c) => parseCss(c.text)), ...inlineCss.flatMap((t) => parseCss(t))];

  // Benutzerdefinierte Eigenschaften (erste Definition an :root/html ohne Medienabfrage gewinnt)
  const vars = new Map<string, string>();
  for (const r of rules) {
    if (r.atRule || !/(^|,)\s*(:root|html)\s*(,|$)/.test(r.selector)) continue;
    for (const [k, v] of r.decls) if (k.startsWith('--') && !vars.has(k)) vars.set(k, v);
  }
  const resolve = (v: string, depth = 0): string => (depth > 5 ? v : v.replace(/var\(\s*(--[\w-]+)\s*(?:,\s*([^)]+))?\)/g, (_, n: string, fb?: string) => resolve(vars.get(n) ?? fb ?? '', depth + 1)));

  // Farben sammeln
  const colorMap = new Map<string, { sources: Set<string>; weight: number; role?: ColorFeature['role'] }>();
  const addColor = (raw: string, source: string, weight: number, role?: ColorFeature['role']) => {
    const hex = normalizeColor(raw);
    if (!hex) return;
    const e = colorMap.get(hex) ?? { sources: new Set<string>(), weight: 0 };
    e.sources.add(source);
    e.weight += weight;
    if (role && !e.role) e.role = role;
    colorMap.set(hex, e);
  };
  const varUse = new Map<string, number>();
  for (const r of rules) for (const [, v] of r.decls) for (const m of v.matchAll(/var\(\s*(--[\w-]+)/g)) varUse.set(m[1], (varUse.get(m[1]) ?? 0) + 1);
  for (const [k, v] of vars) {
    const hex = normalizeColor(resolve(v));
    if (hex) addColor(hex, `CSS-Variable ${k}`, 4 + (varUse.get(k) ?? 0) * 2);
  }
  const COLOR_PROPS = new Set(['color', 'background', 'background-color', 'border-color', 'fill', 'stroke', 'border', 'border-top', 'border-bottom', 'outline-color']);
  for (const r of rules) {
    for (const [k, v] of r.decls) {
      if (!COLOR_PROPS.has(k)) continue;
      const val = resolve(v);
      for (const m of val.matchAll(/#[0-9a-fA-F]{3,8}\b|rgba?\([^)]*\)|hsla?\([^)]*\)|\b(?:white|black)\b/g)) {
        addColor(m[0], `CSS ${r.selector.slice(0, 60)} { ${k} }`, r.atRule ? 0.5 : 1);
      }
    }
  }
  // Berechnete Stile (Browser) sind am aussagekräftigsten
  const c = input.computed;
  if (c) {
    addColor(c.body.bg, 'Berechneter Stil: Seitenhintergrund (body)', 40, 'background');
    addColor(c.body.color, 'Berechneter Stil: Textfarbe (body)', 30, 'text');
    for (const h of c.headings.slice(0, 2)) addColor(h.color, `Berechneter Stil: Überschrift ${h.tag}`, 15, 'heading');
    if (c.link) addColor(c.link.color, 'Berechneter Stil: Link', 8, 'link');
    for (const b of c.buttons.slice(0, 4)) {
      addColor(b.bg, `Berechneter Stil: Knopf „${b.text.slice(0, 30)}“`, 20, 'button');
      addColor(b.color, `Berechneter Stil: Knopftext „${b.text.slice(0, 30)}“`, 5);
    }
    const total = c.viewportArea || 1;
    for (const a of c.areas.slice(0, 10)) addColor(a.color, `Flächenanteil ${Math.round((a.area / total) * 100)} %`, Math.round((a.area / total) * 60));
  } else {
    notes.push('Ohne Browser analysiert: Es liegen keine berechneten Stile und keine Screenshots vor; Farben und Schriften stammen nur aus dem CSS.');
    const body = rules.filter((r) => /^(html|body)$/.test(r.selector.trim()) && !r.atRule);
    for (const r of body)
      for (const [k, v] of r.decls) {
        if (k === 'background' || k === 'background-color') addColor(resolve(v), `CSS ${r.selector} { ${k} }`, 20, 'background');
        if (k === 'color') addColor(resolve(v), `CSS ${r.selector} { color }`, 15, 'text');
      }
  }
  const colors: ColorFeature[] = [...colorMap]
    .sort((a, b) => b[1].weight - a[1].weight)
    .slice(0, 16)
    .map(([hex, e], i) => ({ id: `c${i + 1}`, hex, source: [...e.sources].slice(0, 3).join('; '), weight: Math.round(e.weight * 10) / 10, ...(e.role ? { role: e.role } : {}) }));

  // Schriften
  const fontMap = new Map<string, { sources: Set<string>; usedFor: Set<'heading' | 'body' | 'button'> }>();
  const addFont = (family: string, source: string, use?: 'heading' | 'body' | 'button') => {
    if (!family || GENERIC.has(family.toLowerCase()) || family.length > 60) return;
    const e = fontMap.get(family) ?? { sources: new Set(), usedFor: new Set() };
    e.sources.add(source);
    if (use) e.usedFor.add(use);
    fontMap.set(family, e);
  };
  for (const r of rules) {
    const isFace = r.selector.startsWith('@font-face');
    for (const [k, v] of r.decls) {
      if (k !== 'font-family' && k !== 'font') continue;
      const val = resolve(v);
      const fam = k === 'font' ? (/(?:^|\s)(["']?[A-Z][^,]*?)["']?\s*(,|$)/.exec(val)?.[1] ?? '') : firstFamily(val);
      if (!fam) continue;
      if (isFace) {
        addFont(firstFamily(fam), '@font-face');
        continue;
      }
      const sel = r.selector.toLowerCase();
      const use = /(^|[\s,])h[1-3]\b|heading|title|headline/.test(sel) ? 'heading' : /^(html|body)$|(^|[\s,])(body|p)\b/.test(sel) ? 'body' : /btn|button|knopf/.test(sel) ? 'button' : undefined;
      addFont(firstFamily(fam), `CSS ${r.selector.slice(0, 60)}`, use);
    }
  }
  if (c) {
    addFont(firstFamily(c.body.fontFamily), 'Berechneter Stil: Fließtext', 'body');
    for (const h of c.headings.slice(0, 2)) addFont(firstFamily(h.fontFamily), `Berechneter Stil: ${h.tag}`, 'heading');
    for (const b of c.buttons.slice(0, 2)) addFont(firstFamily(b.fontFamily), 'Berechneter Stil: Knopf', 'button');
  }
  // Schriften ohne erkannte Verwendung, aber am body definiert, erben die Rolle
  const fonts: FontFeature[] = [...fontMap].slice(0, 8).map(([family, e], i) => ({
    id: `f${i + 1}`,
    family,
    source: [...e.sources].slice(0, 3).join('; '),
    usedFor: [...e.usedFor],
    bundled: bundledFor(family),
  }));
  // Überschriften erben die Schrift des body, wenn nichts anderes gesetzt ist
  if (fonts.length && !fonts.some((f) => f.usedFor.includes('heading'))) {
    const body = fonts.find((f) => f.usedFor.includes('body'));
    if (body) body.usedFor.push('heading');
  }

  // Knöpfe
  const buttons: ButtonFeature[] = [];
  if (c) {
    for (const b of c.buttons.slice(0, 4))
      buttons.push({ id: `b${buttons.length + 1}`, selector: b.selector, background: normalizeColor(b.bg), color: normalizeColor(b.color), radius: b.radius, border: b.border, padding: b.padding, fontWeight: b.fontWeight, source: 'computed' });
  }
  for (const r of rules) {
    if (r.atRule || !/(^|[\s,.])(btn|button|knopf|cta)\b|\.button|\.btn/i.test(r.selector) || /:hover|:focus|::/.test(r.selector)) continue;
    const get = (k: string) => {
      const d = r.decls.find(([n]) => n === k);
      return d ? resolve(d[1]) : null;
    };
    const bg = get('background-color') ?? get('background');
    const radius = get('border-radius');
    if (!bg && !radius) continue;
    buttons.push({ id: `b${buttons.length + 1}`, selector: r.selector.slice(0, 80), background: bg ? normalizeColor(bg.split(' ')[0]) : null, color: normalizeColor(get('color') ?? ''), radius, border: get('border'), padding: get('padding'), fontWeight: get('font-weight'), source: 'css' });
    if (buttons.length >= 6) break;
  }

  // Rundungen und Schatten
  const radiusCount = new Map<string, number>();
  const shadows = new Set<string>();
  for (const r of rules) {
    for (const [k, v] of r.decls) {
      if (k === 'border-radius' && /^\d+(\.\d+)?(px|rem)$/.test(v.trim())) radiusCount.set(v.trim(), (radiusCount.get(v.trim()) ?? 0) + 1);
      if (k === 'box-shadow' && v !== 'none' && shadows.size < 3) shadows.add(resolve(v).slice(0, 120));
    }
  }
  const radii = [...radiusCount].sort((a, b) => b[1] - a[1]).slice(0, 4).map(([r]) => r);

  // Logo
  const logos: LogoFeature[] = [];
  const pushLogo = (url: string | null, kind: LogoFeature['kind'], alt: string) => {
    if (!url || logos.some((l) => l.url === url)) return;
    logos.push({ id: `l${logos.length + 1}`, url, kind, alt: alt.slice(0, 120) });
  };
  for (const img of findAll(doc, (e) => e.name === 'img' && !!e.attribs.src)) {
    const a = img.attribs;
    if (/logo/i.test(`${a.src} ${a.alt ?? ''} ${a.class ?? ''} ${a.id ?? ''}`)) pushLogo(abs(a.src, input.url), /\.svg(\?|$)/i.test(a.src) ? 'svg' : 'img', a.alt ?? '');
  }
  for (const m of findAll(doc, (e) => e.name === 'meta' && /og:image/i.test(e.attribs.property ?? ''))) pushLogo(abs(m.attribs.content ?? '', input.url), 'og', 'Vorschaubild (og:image)');
  for (const l of findAll(doc, (e) => e.name === 'link' && /icon/i.test(e.attribs.rel ?? '') && !!e.attribs.href)) pushLogo(abs(l.attribs.href, input.url), 'icon', `Symbol (${l.attribs.rel})`);

  // Text, Titel
  const titleEl = findAll(doc, (e) => e.name === 'title')[0];
  const tt: string[] = [];
  if (titleEl) textOf(titleEl, tt, new Set());
  const descEl = findAll(doc, (e) => e.name === 'meta' && (e.attribs.name ?? '').toLowerCase() === 'description')[0];
  const bodyEl = findAll(doc, (e) => e.name === 'body')[0] ?? doc;
  const txt: string[] = [];
  textOf(bodyEl, txt);
  const textSample = txt.join(' ').replace(/\s+/g, ' ').trim().slice(0, 4000);
  const imgCount = findAll(doc, (e) => e.name === 'img').length;

  let density: Features['density'] = 'unbekannt';
  let areaShare: number | null = null;
  if (c) {
    areaShare = c.viewportArea ? Math.round((c.imageArea / c.viewportArea) * 100) / 100 : null;
    const charsPerScreen = c.textChars / Math.max(1, c.viewportArea / (1440 * 900));
    density = charsPerScreen > 2500 ? 'dicht' : charsPerScreen < 900 ? 'luftig' : 'mittel';
  }
  if (!input.css.length && !inlineCss.length) notes.push('Es konnten keine Stylesheets gelesen werden.');
  if (!logos.length) notes.push('Kein Logo im HTML gefunden.');

  return {
    url: input.url,
    title: tt.join('').trim().slice(0, 200),
    description: (descEl?.attribs.content ?? '').slice(0, 300),
    colors,
    fonts,
    buttons,
    radii,
    shadows: [...shadows],
    logo: logos.slice(0, 5),
    images: { count: imgCount, areaShare },
    density,
    textSample,
    notes,
  };
}
