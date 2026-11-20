import { z } from 'zod';
import { FONT_IDS } from '../../shared/theme.js';

/**
 * Ausgabeschema der KI. Das JSON-Schema geht an die API (strukturierte Ausgabe),
 * das zod-Schema prüft die Antwort danach noch einmal – bewusst tolerant bei
 * Farbschreibweisen, die anschließend normalisiert werden.
 */

const str = { type: 'string' } as const;
const obj = (properties: Record<string, unknown>) => ({ type: 'object', properties, required: Object.keys(properties), additionalProperties: false });
const arr = (items: unknown) => ({ type: 'array', items });
const en = (values: readonly string[]) => ({ type: 'string', enum: [...values] });

export const COLOR_ROLES = ['background', 'surface', 'text', 'muted', 'accent', 'onAccent', 'border', 'other'] as const;

const themeJson = obj({
  colors: obj({ background: str, surface: str, text: str, muted: str, accent: str, onAccent: str, border: str }),
  fonts: obj({ heading: en(FONT_IDS), body: en(FONT_IDS) }),
  buttons: obj({ shape: en(['square', 'soft', 'round', 'pill']), style: en(['solid', 'outline']) }),
  cards: obj({ style: en(['line', 'fill', 'none']), radius: { type: 'integer' } }),
  density: en(['compact', 'normal', 'airy']),
  header: obj({ layout: en(['text', 'photo-top', 'photo-side']), logoSize: en(['S', 'M', 'L']) }),
  linkLayout: en(['list', 'cards', 'tiles']),
  primaryAction: en(['button', 'pill-sticky']),
  sectionBand: { type: 'boolean' },
});

export const AI_JSON_SCHEMA = obj({
  identity: obj({ summary: str, character: arr(str) }),
  detected: obj({
    colors: arr(obj({ featureId: str, role: en(COLOR_ROLES), hex: str })),
    fonts: arr(obj({ featureId: str, role: en(['heading', 'body', 'button']) })),
    buttons: arr(obj({ featureId: str, note: str })),
    logoFeatureId: { anyOf: [str, { type: 'null' }] },
  }),
  uncertain: arr(str),
  variants: arr(obj({ name: str, rationale: str, theme: themeJson })),
});

const loose = z.string().max(200);
export const aiThemeSchema = z.object({
  colors: z.object({ background: loose, surface: loose, text: loose, muted: loose, accent: loose, onAccent: loose, border: loose }),
  fonts: z.object({ heading: z.string().max(80), body: z.string().max(80) }),
  buttons: z.object({ shape: z.enum(['square', 'soft', 'round', 'pill']).catch('soft'), style: z.enum(['solid', 'outline']).catch('solid') }),
  cards: z.object({ style: z.enum(['line', 'fill', 'none']).catch('line'), radius: z.number().catch(8) }),
  density: z.enum(['compact', 'normal', 'airy']).catch('normal'),
  header: z.object({ layout: z.enum(['text', 'photo-top', 'photo-side']).catch('text'), logoSize: z.enum(['S', 'M', 'L']).catch('M') }),
  linkLayout: z.enum(['list', 'cards', 'tiles']).catch('list'),
  primaryAction: z.enum(['button', 'pill-sticky']).catch('button'),
  sectionBand: z.boolean().catch(false),
});

export const aiOutputSchema = z.object({
  identity: z.object({ summary: z.string().max(1200), character: z.array(z.string().max(80)).max(8) }),
  detected: z.object({
    colors: z.array(z.object({ featureId: z.string().max(10), role: z.enum(COLOR_ROLES).catch('other'), hex: z.string().max(40) })).max(20),
    fonts: z.array(z.object({ featureId: z.string().max(10), role: z.enum(['heading', 'body', 'button']).catch('body') })).max(10),
    buttons: z.array(z.object({ featureId: z.string().max(10), note: z.string().max(300) })).max(8),
    logoFeatureId: z.string().max(10).nullable(),
  }),
  uncertain: z.array(z.string().max(300)).max(12),
  variants: z.array(z.object({ name: z.string().max(60), rationale: z.string().max(700), theme: aiThemeSchema })).min(1).max(5),
});

export type AiOutput = z.infer<typeof aiOutputSchema>;
