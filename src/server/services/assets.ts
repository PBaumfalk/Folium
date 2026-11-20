import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';
import type { DB } from '../db/db.js';
import { AppError, notFound } from '../lib/errors.js';
import { now } from '../lib/time.js';
import type { Principal } from './auth.js';
import { sanitizeSvg, SvgError } from './svg.js';

export type AssetKind = 'image' | 'svg' | 'font';
export const MAX_UPLOAD = 5 * 1024 * 1024;
const WIDTHS = [400, 800, 1200, 1600];

export interface AssetRow {
  id: string;
  kind: AssetKind;
  ext: string;
  width: number | null;
  height: number | null;
  widths: string; // JSON-Liste erzeugter Breiten
  bytes: number;
  label: string;
  created_at: number;
  created_by: string;
}

/** Dateityp anhand der ersten Bytes erkennen – Dateiname und angegebener Typ zählen nicht. */
export function sniff(buf: Buffer): { kind: AssetKind; ext: string } | null {
  if (buf.length < 12) return null;
  const h = buf.subarray(0, 16);
  if (h[0] === 0x89 && h.toString('ascii', 1, 4) === 'PNG') return { kind: 'image', ext: 'png' };
  if (h[0] === 0xff && h[1] === 0xd8 && h[2] === 0xff) return { kind: 'image', ext: 'jpg' };
  if (h.toString('ascii', 0, 4) === 'RIFF' && h.toString('ascii', 8, 12) === 'WEBP') return { kind: 'image', ext: 'webp' };
  if (h.toString('ascii', 4, 12) === 'ftypavif' || h.toString('ascii', 4, 12) === 'ftypavis') return { kind: 'image', ext: 'avif' };
  if (h.toString('ascii', 0, 6) === 'GIF87a' || h.toString('ascii', 0, 6) === 'GIF89a') return { kind: 'image', ext: 'gif' };
  if (h.toString('ascii', 0, 4) === 'wOF2') return { kind: 'font', ext: 'woff2' };
  if (h.readUInt32BE(0) === 0x00010000 || h.toString('ascii', 0, 4) === 'true') return { kind: 'font', ext: 'ttf' };
  if (h.toString('ascii', 0, 4) === 'OTTO') return { kind: 'font', ext: 'otf' };
  const head = buf.subarray(0, 1024).toString('utf8').replace(/^﻿/, '').trimStart();
  if (/^(<\?xml[\s\S]*?\?>\s*)?(<!--[\s\S]*?-->\s*)*(<!DOCTYPE[^>]*>\s*)?<svg[\s>]/i.test(head)) return { kind: 'svg', ext: 'svg' };
  return null;
}

export const ASSET_TYPES: Record<string, string> = { webp: 'image/webp', svg: 'image/svg+xml', woff2: 'font/woff2', ttf: 'font/ttf', otf: 'font/otf' };

export class Assets {
  private cache = new Map<string, AssetRow>();
  constructor(
    private db: DB,
    private dir: string,
  ) {
    fs.mkdirSync(dir, { recursive: true });
  }

  get(id: string): AssetRow | undefined {
    let r = this.cache.get(id);
    if (!r) {
      r = this.db.prepare('SELECT * FROM assets WHERE id = ?').get(id) as AssetRow | undefined;
      if (r) this.cache.set(id, r);
    }
    return r;
  }

  list() {
    return (this.db.prepare('SELECT * FROM assets ORDER BY created_at DESC').all() as AssetRow[]).map((r) => this.view(r));
  }

  view(r: AssetRow) {
    return { id: r.id, kind: r.kind, width: r.width, height: r.height, bytes: r.bytes, label: r.label, createdAt: new Date(r.created_at * 1000).toISOString(), url: this.adminUrl(r.id, 400) };
  }

  async store(buf: Buffer, label: string, p: Principal | null): Promise<AssetRow> {
    if (buf.length > MAX_UPLOAD) throw new AppError(413, 'too_large', 'Die Datei ist größer als 5 MB.');
    const type = sniff(buf);
    if (!type) throw new AppError(415, 'unsupported', 'Dieser Dateityp wird nicht unterstützt. Erlaubt sind JPEG, PNG, WebP, AVIF, GIF, SVG sowie Schriften (WOFF2, TTF, OTF).');
    const id = crypto.createHash('sha256').update(buf).digest('hex').slice(0, 32);
    const existing = this.get(id);
    if (existing) return existing;
    const cleanLabel = label.replace(/[^\p{L}\p{N} ._-]/gu, '').slice(0, 80) || 'Datei';
    let width: number | null = null;
    let height: number | null = null;
    let widths: number[] = [];
    let ext = type.ext;
    let bytes = buf.length;

    if (type.kind === 'image') {
      try {
        const img = sharp(buf, { limitInputPixels: 40_000_000, animated: false }).rotate();
        const meta = await img.metadata();
        const oriented = meta.orientation && meta.orientation >= 5;
        width = (oriented ? meta.height : meta.width) ?? null;
        height = (oriented ? meta.width : meta.height) ?? null;
        if (!width || !height) throw new Error('keine Maße');
        widths = WIDTHS.filter((w) => w < width!);
        widths.push(Math.min(width, 2400));
        widths = [...new Set(widths)];
        bytes = 0;
        for (const w of widths) {
          const out = await sharp(buf, { limitInputPixels: 40_000_000 }).rotate().resize({ width: w, withoutEnlargement: true }).webp({ quality: 82 }).toBuffer();
          fs.writeFileSync(path.join(this.dir, `${id}-${w}.webp`), out);
          bytes += out.length;
        }
        ext = 'webp';
      } catch {
        throw new AppError(415, 'broken_image', 'Das Bild ließ sich nicht lesen. Bitte als JPEG, PNG oder WebP speichern und erneut hochladen.');
      }
    } else if (type.kind === 'svg') {
      let clean: string;
      try {
        clean = sanitizeSvg(buf.toString('utf8'));
      } catch (e) {
        throw new AppError(415, 'bad_svg', e instanceof SvgError ? e.message : 'Das SVG-Bild ist ungültig.');
      }
      const vb = /viewBox="[\d.\s-]*?\s([\d.]+)\s+([\d.]+)"/i.exec(clean);
      if (vb) {
        width = Math.round(Number(vb[1]));
        height = Math.round(Number(vb[2]));
      }
      fs.writeFileSync(path.join(this.dir, `${id}.svg`), clean);
      bytes = Buffer.byteLength(clean);
    } else {
      fs.writeFileSync(path.join(this.dir, `${id}.${ext}`), buf);
    }

    this.db
      .prepare('INSERT INTO assets(id, kind, ext, width, height, widths, bytes, label, created_at, created_by) VALUES (?,?,?,?,?,?,?,?,?,?)')
      .run(id, type.kind, ext, width, height, JSON.stringify(widths), bytes, cleanLabel, now(), p?.label ?? 'System');
    return this.get(id)!;
  }

  /** Dateiname (ohne Verzeichnis) der passenden Variante */
  fileFor(id: string, width: number): string | null {
    const r = this.get(id);
    if (!r) return null;
    if (r.kind !== 'image') return `${id}.${r.ext}`;
    const ws = (JSON.parse(r.widths) as number[]).sort((a, b) => a - b);
    const w = ws.find((x) => x >= width) ?? ws.at(-1)!;
    return `${id}-${w}.webp`;
  }
  publicUrl(id: string, width: number): string {
    const f = this.fileFor(id, width);
    return f ? `/assets/${f}` : `/assets/${id}`;
  }
  adminUrl(id: string, width: number): string {
    const f = this.fileFor(id, width);
    return f ? `/api/v1/files/${f}` : '';
  }

  /** Liefert Pfad und Inhaltstyp einer gespeicherten Datei, nur für gültige Namen. */
  resolve(file: string): { path: string; type: string } | null {
    const m = /^([a-f0-9]{32})(?:-(\d{2,4}))?\.(webp|svg|woff2|ttf|otf)$/.exec(file);
    if (!m || !this.get(m[1])) return null;
    const full = path.join(this.dir, file);
    if (!fs.existsSync(full)) return null;
    return { path: full, type: ASSET_TYPES[m[3]] };
  }

  remove(id: string, inUse: (id: string) => boolean): void {
    const r = this.get(id);
    if (!r) throw notFound('Datei');
    if (inUse(id)) throw new AppError(409, 'in_use', 'Die Datei wird noch auf einer Seite oder in einer veröffentlichten Version verwendet.');
    for (const f of fs.readdirSync(this.dir)) if (f.startsWith(id)) fs.rmSync(path.join(this.dir, f), { force: true });
    this.db.prepare('DELETE FROM assets WHERE id = ?').run(id);
    this.cache.delete(id);
  }
}
