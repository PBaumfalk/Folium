import { enforceContrast, FONTS, isBundledFont, themeSchema, type BundledFontId, type ColorKey, type Theme } from '../../shared/theme.js';
import { normalizeColor, type Features } from '../analysis/extract.js';
import { aiOutputSchema, type AiOutput } from './schema.js';

export interface DesignVariant {
  name: string;
  rationale: string;
  theme: Theme;
  /** je Farbe: auf der Homepage gefunden oder vorgeschlagen */
  provenance: Record<ColorKey, 'erkannt' | 'vorgeschlagen'>;
  notes: string[];
}

export interface DesignProposal {
  identity: { summary: string; character: string[] };
  detected: {
    colors: { featureId: string; role: string; hex: string; source: string }[];
    fonts: { featureId: string; role: string; family: string; bundled: BundledFontId | null; source: string }[];
    buttons: { featureId: string; note: string; selector: string }[];
    logo: { featureId: string; url: string } | null;
  };
  uncertain: string[];
  variants: DesignVariant[];
}

const FALLBACK_SANS: BundledFontId = 'hanken-grotesk';
const FALLBACK_SERIF: BundledFontId = 'source-serif-4';

/** Bildet eine Schriftangabe der KI auf eine mitgelieferte Schrift ab. */
function mapFont(raw: string, notes: string[], role: string): BundledFontId {
  const v = raw.trim();
  if (isBundledFont(v)) return v;
  const byFamily = (Object.keys(FONTS) as BundledFontId[]).find((id) => FONTS[id].family.toLowerCase() === v.toLowerCase());
  if (byFamily) return byFamily;
  const serif = /serif|garamond|times|georgia|slab|antiqua|roman/i.test(v) && !/sans/i.test(v);
  const pick = serif ? FALLBACK_SERIF : FALLBACK_SANS;
  notes.push(`Schrift „${v.slice(0, 40)}“ (${role}) ist nicht mitgeliefert; ersetzt durch ${FONTS[pick].family}.`);
  return pick;
}

const get = (o: unknown, path: string) => path.split('.').reduce<unknown>((x, k) => (x as Record<string, unknown>)?.[k], o);
function set(o: Record<string, unknown>, path: string, value: unknown) {
  const keys = path.split('.');
  let cur = o;
  for (const k of keys.slice(0, -1)) cur = cur[k] as Record<string, unknown>;
  cur[keys.at(-1)!] = value;
}

/**
 * Prüft und überführt eine KI-Antwort in das sichere Gestaltungsschema.
 * – nur gültige Hexfarben, nur mitgelieferte Schriften, Werte in erlaubten Bereichen
 * – „erkannt“ nur mit belegter Merkmal-ID und passendem Wert, sonst „unsicher“
 * – festgehaltene Werte werden durchgesetzt, Kontrast wird erzwungen
 */
export function mapAiResult(raw: unknown, features: Features, opts: { current: Theme; locked: string[] }): { ok: true; result: DesignProposal } | { ok: false; error: string } {
  let data: unknown = raw;
  if (typeof raw === 'string') {
    try {
      data = JSON.parse(raw);
    } catch {
      return { ok: false, error: 'Die Antwort der KI war unbrauchbar (kein lesbares JSON). Bitte erneut versuchen oder das Design manuell anpassen.' };
    }
  }
  const parsed = aiOutputSchema.safeParse(data);
  if (!parsed.success) return { ok: false, error: `Die Antwort der KI war unbrauchbar (Feld „${parsed.error.issues[0]?.path.join('.') ?? '?'}“ ungültig). Bitte erneut versuchen oder das Design manuell anpassen.` };
  const out: AiOutput = parsed.data;
  const uncertain = out.uncertain.map((u) => u.trim()).filter(Boolean);

  // Erkannte Merkmale gegen die Analyse prüfen
  const colorsById = new Map(features.colors.map((c) => [c.id, c]));
  const fontsById = new Map(features.fonts.map((f) => [f.id, f]));
  const buttonsById = new Map(features.buttons.map((b) => [b.id, b]));
  const logoById = new Map(features.logo.map((l) => [l.id, l]));
  const detectedColors: DesignProposal['detected']['colors'] = [];
  for (const c of out.detected.colors) {
    const f = colorsById.get(c.featureId);
    const hex = normalizeColor(c.hex);
    if (!f || !hex || hex !== f.hex) {
      uncertain.push(`Nicht belegt und daher nicht als erkannt übernommen: Farbe ${hex ?? c.hex.slice(0, 20)} (${c.role}).`);
      continue;
    }
    if (!detectedColors.some((d) => d.featureId === f.id)) detectedColors.push({ featureId: f.id, role: c.role, hex: f.hex, source: f.source });
  }
  const detectedFonts: DesignProposal['detected']['fonts'] = [];
  for (const x of out.detected.fonts) {
    const f = fontsById.get(x.featureId);
    if (!f) {
      uncertain.push(`Nicht belegt: Schriftangabe ${x.featureId.slice(0, 10)} (${x.role}).`);
      continue;
    }
    detectedFonts.push({ featureId: f.id, role: x.role, family: f.family, bundled: f.bundled, source: f.source });
  }
  const detectedButtons = out.detected.buttons.filter((b) => buttonsById.has(b.featureId)).map((b) => ({ featureId: b.featureId, note: b.note, selector: buttonsById.get(b.featureId)!.selector }));
  const lf = out.detected.logoFeatureId ? logoById.get(out.detected.logoFeatureId) : undefined;
  const knownHex = new Set(features.colors.map((c) => c.hex));

  const variants: DesignVariant[] = [];
  for (const v of out.variants.slice(0, 3)) {
    const notes: string[] = [];
    const colors = {} as Theme['colors'];
    for (const k of Object.keys(v.theme.colors) as ColorKey[]) {
      const hex = normalizeColor(v.theme.colors[k]);
      if (!hex) notes.push(`Ungültige Farbangabe für ${k} ersetzt.`);
      colors[k] = hex ?? opts.current.colors[k];
    }
    const candidate: Theme = {
      preset: 'eigenes',
      colors,
      fonts: { heading: mapFont(v.theme.fonts.heading, notes, 'Überschriften'), body: mapFont(v.theme.fonts.body, notes, 'Fließtext') },
      buttons: v.theme.buttons,
      cards: { style: v.theme.cards.style, radius: Math.max(0, Math.min(28, Math.round(v.theme.cards.radius))) },
      density: v.theme.density,
      header: v.theme.header,
      linkLayout: v.theme.linkLayout,
      primaryAction: v.theme.primaryAction,
      sectionBand: v.theme.sectionBand,
    };
    for (const path of opts.locked) {
      const val = get(opts.current, path);
      if (val !== undefined) set(candidate as unknown as Record<string, unknown>, path, structuredClone(val));
    }
    const { theme: fixed, changes } = enforceContrast(candidate);
    notes.push(...changes);
    const final = themeSchema.safeParse(fixed);
    if (!final.success) continue;
    const provenance = Object.fromEntries((Object.keys(final.data.colors) as ColorKey[]).map((k) => [k, knownHex.has(final.data.colors[k]) ? 'erkannt' : 'vorgeschlagen'])) as DesignVariant['provenance'];
    variants.push({ name: v.name.trim() || `Variante ${variants.length + 1}`, rationale: v.rationale.trim(), theme: final.data, provenance, notes });
  }
  if (!variants.length) return { ok: false, error: 'Die KI hat keine verwendbare Variante geliefert. Bitte erneut versuchen oder das Design manuell anpassen.' };
  return {
    ok: true,
    result: {
      identity: { summary: out.identity.summary.trim(), character: out.identity.character.slice(0, 6) },
      detected: { colors: detectedColors, fonts: detectedFonts, buttons: detectedButtons, logo: lf ? { featureId: lf.id, url: lf.url } : null },
      uncertain: [...new Set(uncertain)].slice(0, 15),
      variants,
    },
  };
}
