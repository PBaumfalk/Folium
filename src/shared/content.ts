import { z } from 'zod';

/** Gemeinsames Inhaltsschema für Server und Oberfläche. Inhalte sind reine Daten, nie HTML. */

export const ICONS = [
  'phone', 'mail', 'calendar', 'map-pin', 'scale', 'gavel', 'briefcase', 'file-text', 'book-open', 'globe', 'users',
  'message-circle', 'download', 'info', 'shield-check', 'link', 'star', 'video', 'newspaper', 'clock', 'building', 'euro',
] as const;
export type IconName = (typeof ICONS)[number];

export const SOCIAL_NETWORKS = ['linkedin', 'instagram', 'facebook', 'xing', 'youtube', 'x', 'tiktok', 'mastodon', 'whatsapp', 'website'] as const;
export type SocialNetwork = (typeof SOCIAL_NETWORKS)[number];
export const SOCIAL_LABELS: Record<SocialNetwork, string> = {
  linkedin: 'LinkedIn', instagram: 'Instagram', facebook: 'Facebook', xing: 'XING', youtube: 'YouTube', x: 'X', tiktok: 'TikTok', mastodon: 'Mastodon', whatsapp: 'WhatsApp', website: 'Website',
};

export type Scheme = 'http' | 'https' | 'tel' | 'mailto';

export class UrlError extends Error {}

/** Prüft und normalisiert eine Zieladresse. Erlaubt nur die angegebenen Schemata. */
export function validateUrl(raw: string, allowed: Scheme[]): string {
  const v = String(raw ?? '').trim().replace(/[\u0000-\u001F\u007F]/g, '');
  if (!v) throw new UrlError('Bitte eine Adresse angeben.');
  if (v.length > 2000) throw new UrlError('Die Adresse ist zu lang.');
  const lower = v.toLowerCase();
  if (lower.startsWith('tel:')) {
    if (!allowed.includes('tel')) throw new UrlError('Telefonlinks sind hier nicht erlaubt.');
    const num = v.slice(4).replace(/[\s()/.-]/g, '');
    if (!/^\+?[0-9]{3,20}$/.test(num)) throw new UrlError('Bitte eine gültige Telefonnummer angeben.');
    return `tel:${num}`;
  }
  if (lower.startsWith('mailto:')) {
    if (!allowed.includes('mailto')) throw new UrlError('E-Mail-Links sind hier nicht erlaubt.');
    const addr = v.slice(7).split('?')[0];
    if (!/^[^\s@<>"]+@[^\s@<>"]+\.[^\s@<>"]+$/.test(addr)) throw new UrlError('Bitte eine gültige E-Mail-Adresse angeben.');
    return `mailto:${addr}`;
  }
  let u: URL;
  try {
    u = new URL(v);
  } catch {
    throw new UrlError('Bitte eine vollständige Adresse mit https:// angeben.');
  }
  const scheme = u.protocol.replace(':', '') as Scheme;
  if (!['http', 'https'].includes(scheme) || !allowed.includes(scheme)) throw new UrlError('Nur Adressen mit https:// (oder http://) sind erlaubt.');
  if (u.username || u.password) throw new UrlError('Adressen mit Zugangsdaten sind nicht erlaubt.');
  return u.toString();
}

/** Telefonnummer → tel:-Link, E-Mail → mailto:-Link, sonst URL. */
export function actionHref(kind: 'call' | 'email' | 'booking' | 'contact', value: string): string {
  if (kind === 'call') return validateUrl(value.startsWith('tel:') ? value : `tel:${value}`, ['tel']);
  if (kind === 'email') return validateUrl(value.startsWith('mailto:') ? value : `mailto:${value}`, ['mailto']);
  return validateUrl(value, ['http', 'https', 'tel', 'mailto']);
}

/** Ziel-Adresse. Leer ist im Entwurf erlaubt (noch nicht ausgefüllt); veröffentlicht wird so ein Eintrag nicht. */
const url = (allowed: Scheme[]) =>
  z.string().max(2000).transform((v, c) => {
    if (!v.trim()) return '';
    try {
      return validateUrl(v, allowed);
    } catch (e) {
      c.addIssue({ code: 'custom', message: (e as Error).message });
      return z.NEVER;
    }
  });
const optUrl = (allowed: Scheme[]) => z.union([z.null(), z.literal('').transform(() => null), url(allowed).transform((v) => v || null)]);

/** Einträge, deren Ziel noch fehlt (im Entwurf erlaubt, werden nicht angezeigt und verhindern das Veröffentlichen). */
export function missingTarget(b: Block): boolean {
  if (b.type === 'link') return !b.url;
  if (b.type === 'action') return !b.value.trim();
  return false;
}
const text = (max: number) => z.string().max(max).transform((s) => s.replace(/\r\n/g, '\n'));
const localDateTime = z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/, 'Bitte Datum und Uhrzeit im Format JJJJ-MM-TTTHH:MM angeben.');
const assetId = z.string().regex(/^[a-f0-9]{16,64}$/);

const common = {
  id: z.string().regex(/^[a-z0-9]{6,16}$/),
  enabled: z.boolean(),
  visibleFrom: localDateTime.nullable(),
  visibleUntil: localDateTime.nullable(),
};

export const blockSchema = z.discriminatedUnion('type', [
  z.object({ ...common, type: z.literal('action'), kind: z.enum(['call', 'email', 'booking', 'contact']), label: text(60), value: z.string().max(2000) })
    .strict()
    .superRefine((b, c) => {
      if (!b.value.trim()) return;
      try {
        actionHref(b.kind, b.value);
      } catch (e) {
        c.addIssue({ code: 'custom', message: (e as Error).message, path: ['value'] });
      }
    }),
  z.object({ ...common, type: z.literal('link'), title: text(120), description: text(240), url: url(['http', 'https', 'tel', 'mailto']), icon: z.enum(ICONS).nullable(), imageAssetId: assetId.nullable() }).strict(),
  z.object({ ...common, type: z.literal('heading'), text: text(80) }).strict(),
  z.object({ ...common, type: z.literal('location'), name: text(80), role: text(120), address: text(300), routeUrl: optUrl(['https']), note: text(240) }).strict(),
  z.object({ ...common, type: z.literal('contact'), phone: text(40).nullable(), email: text(200).nullable(), hours: text(200).nullable() }).strict(),
  z.object({ ...common, type: z.literal('social'), items: z.array(z.object({ network: z.enum(SOCIAL_NETWORKS), url: url(['https', 'http']) }).strict()).max(10) }).strict(),
  z.object({ ...common, type: z.literal('text'), text: text(1000) }).strict(),
]);

export type Block = z.infer<typeof blockSchema>;
export type BlockType = Block['type'];

export const pageContentSchema = z
  .object({
    profile: z
      .object({
        name: text(80),
        tagline: text(200),
        details: z.array(text(120)).max(5),
        logoAssetId: assetId.nullable(),
        avatarAssetId: assetId.nullable(),
        coverAssetId: assetId.nullable(),
      })
      .strict(),
    blocks: z.array(blockSchema).max(100, 'Eine Seite kann höchstens 100 Einträge haben.'),
    legal: z.object({ imprintUrl: optUrl(['https', 'http']), privacyUrl: optUrl(['https', 'http']) }).strict(),
    meta: z.object({ title: text(120), description: text(300), noindex: z.boolean(), lang: z.literal('de') }).strict(),
  })
  .strict()
  .superRefine((c, ctx) => {
    const seen = new Set<string>();
    c.blocks.forEach((b, i) => {
      if (seen.has(b.id)) ctx.addIssue({ code: 'custom', message: 'Doppelte Block-ID.', path: ['blocks', i, 'id'] });
      seen.add(b.id);
    });
  });

export type PageContent = z.infer<typeof pageContentSchema>;

export function newBlockId(): string {
  const alphabet = 'abcdefghijkmnpqrstuvwxyz23456789';
  const bytes = new Uint8Array(10);
  globalThis.crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => alphabet[b % alphabet.length]).join('');
}

export const BLOCK_LABELS: Record<BlockType, string> = {
  action: 'Hauptaktion',
  link: 'Link',
  heading: 'Überschrift',
  location: 'Standort',
  contact: 'Kontakt',
  social: 'Social Media',
  text: 'Text',
};
