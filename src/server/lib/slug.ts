import { AppError } from './errors.js';

/** Pfade, die der öffentliche Server selbst benutzt. */
export const RESERVED_SLUGS = ['c', 'assets', 'fonts', 'healthz', 'robots.txt', 'favicon.ico', 'api', 'vorschau', 'f', 'qr'];

export function normalizeSlug(raw: string): string {
  return String(raw ?? '')
    .trim()
    .toLowerCase()
    .replace(/ä/g, 'ae')
    .replace(/ö/g, 'oe')
    .replace(/ü/g, 'ue')
    .replace(/ß/g, 'ss')
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60)
    .replace(/-+$/g, '');
}

export function validateSlug(raw: string): string {
  const s = normalizeSlug(raw);
  if (s.length < 2) throw new AppError(422, 'invalid', 'Die Adresse braucht mindestens zwei Zeichen (Buchstaben, Ziffern, Bindestrich).', 'slug');
  if (RESERVED_SLUGS.includes(s)) throw new AppError(422, 'reserved', `„${s}“ ist für Folium reserviert. Bitte eine andere Adresse wählen.`, 'slug');
  return s;
}
