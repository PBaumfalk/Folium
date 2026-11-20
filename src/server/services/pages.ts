import { missingTarget, pageContentSchema, type PageContent } from '../../shared/content.js';
import { PRESETS, themeSchema, type PresetId, type Theme } from '../../shared/theme.js';
import { zodToAppError } from '../admin/http.js';
import type { DB } from '../db/db.js';
import { AppError, notFound } from '../lib/errors.js';
import { validateSlug } from '../lib/slug.js';
import { now } from '../lib/time.js';
import type { Principal } from './auth.js';
import type { SettingsStore } from './settings.js';
import { templateContent, type TemplateId } from './templates.js';

interface PageRow {
  id: number;
  slug: string;
  name: string;
  draft_content: string;
  draft_theme: string;
  draft_rev: number;
  draft_updated_at: number;
  draft_updated_by: string;
  published_version_id: number | null;
  created_at: number;
  created_by: string;
  deleted_at: number | null;
}
interface VersionRow {
  id: number;
  page_id: number;
  number: number;
  content: string;
  theme: string;
  note: string;
  created_at: number;
  created_by: string;
}

export interface PublishedPage {
  pageId: number;
  slug: string;
  versionId: number;
  number: number;
  content: PageContent;
  theme: Theme;
}

const isoOf = (s: number | null) => (s ? new Date(s * 1000).toISOString() : null);
const by = (p: Principal | null) => p?.label ?? 'System';

export function parseContent(raw: unknown): PageContent {
  const r = pageContentSchema.safeParse(raw);
  if (!r.success) throw zodToAppError(r.error);
  return r.data;
}
export function parseTheme(raw: unknown): Theme {
  const r = themeSchema.safeParse(raw);
  if (!r.success) throw zodToAppError(r.error);
  return r.data;
}

export class Pages {
  private publishListeners: ((pageId: number) => void)[] = [];
  constructor(
    private db: DB,
    private settings: SettingsStore,
    private trashDays = () => settings.get('trashDays'),
  ) {}

  onPublish(cb: (pageId: number) => void) {
    this.publishListeners.push(cb);
  }
  private emit(id: number) {
    for (const l of this.publishListeners) l(id);
  }

  private row(id: number, includeDeleted = false): PageRow {
    const r = this.db.prepare('SELECT * FROM pages WHERE id = ?').get(id) as PageRow | undefined;
    if (!r || (!includeDeleted && r.deleted_at)) throw notFound('Seite');
    return r;
  }
  private version(id: number): VersionRow | undefined {
    return this.db.prepare('SELECT * FROM page_versions WHERE id = ?').get(id) as VersionRow | undefined;
  }

  view(r: PageRow) {
    const v = r.published_version_id ? this.version(r.published_version_id) : undefined;
    const content = JSON.parse(r.draft_content) as PageContent;
    const theme = JSON.parse(r.draft_theme) as Theme;
    return {
      id: r.id,
      slug: r.slug,
      name: r.name,
      draft: { content, theme, rev: r.draft_rev, updatedAt: isoOf(r.draft_updated_at), updatedBy: r.draft_updated_by },
      published: v ? { versionId: v.id, number: v.number, publishedAt: isoOf(v.created_at), publishedBy: v.created_by } : null,
      hasUnpublishedChanges: !v || v.content !== r.draft_content || v.theme !== r.draft_theme,
      createdAt: isoOf(r.created_at),
      deletedAt: isoOf(r.deleted_at),
    };
  }
  get(id: number, includeDeleted = false) {
    return this.view(this.row(id, includeDeleted));
  }
  list(opts: { deleted?: boolean } = {}) {
    const rows = this.db.prepare(`SELECT * FROM pages WHERE deleted_at IS ${opts.deleted ? 'NOT NULL' : 'NULL'} ORDER BY ${opts.deleted ? 'deleted_at DESC' : 'name COLLATE NOCASE'}`).all() as PageRow[];
    return rows.map((r) => this.view(r));
  }

  private assertSlugFree(slug: string, exceptId?: number) {
    const hit = this.db.prepare('SELECT id, deleted_at FROM pages WHERE slug = ?').get(slug) as { id: number; deleted_at: number | null } | undefined;
    if (hit && hit.id !== exceptId) {
      throw new AppError(409, 'slug_taken', hit.deleted_at ? `Die Adresse „${slug}“ gehört zu einer Seite im Papierkorb.` : `Die Adresse „${slug}“ ist schon vergeben.`, 'slug');
    }
  }

  create(input: { name: string; slug: string; preset: PresetId; template?: TemplateId }, p: Principal | null) {
    const slug = validateSlug(input.slug);
    this.assertSlugFree(slug);
    const content = parseContent(templateContent(input.template ?? 'leer', input.name, this.settings.all()));
    const theme = PRESETS[input.preset];
    const t = now();
    const r = this.db
      .prepare('INSERT INTO pages(slug, name, draft_content, draft_theme, draft_rev, draft_updated_at, draft_updated_by, created_at, created_by) VALUES (?,?,?,?,1,?,?,?,?)')
      .run(slug, input.name.trim().slice(0, 120) || slug, JSON.stringify(content), JSON.stringify(theme), t, by(p), t, by(p));
    return this.get(Number(r.lastInsertRowid));
  }

  /** Import: legt eine Seite als Entwurf an; bei belegter Adresse mit Zusatz „-import“. */
  createImported(input: { name: string; slug: string; content: PageContent; theme: Theme }, p: Principal | null) {
    const slug = this.freeSlug(validateSlug(input.slug), 'import');
    const t = now();
    const r = this.db
      .prepare('INSERT INTO pages(slug, name, draft_content, draft_theme, draft_rev, draft_updated_at, draft_updated_by, created_at, created_by) VALUES (?,?,?,?,1,?,?,?,?)')
      .run(slug, input.name, JSON.stringify(input.content), JSON.stringify(input.theme), t, by(p), t, by(p));
    return this.get(Number(r.lastInsertRowid));
  }

  /** Freie Adresse mit Zusatz; kürzt zuerst die Basis, damit der Zusatz nie abgeschnitten wird. */
  private freeSlug(base: string, suffix: string, alwaysSuffix = false): string {
    const taken = (s: string) => Boolean(this.db.prepare('SELECT 1 FROM pages WHERE slug = ?').get(s));
    if (!alwaysSuffix && !taken(base)) return base;
    for (let i = 1; i < 1000; i++) {
      const tail = `-${suffix}${i > 1 ? `-${i}` : ''}`;
      const cand = `${base.slice(0, 60 - tail.length).replace(/-+$/, '')}${tail}`;
      if (!taken(cand)) return cand;
    }
    throw new AppError(409, 'slug_taken', 'Es konnte keine freie Adresse gefunden werden.');
  }

  private checkRev(r: PageRow, rev: number | undefined) {
    if (rev !== undefined && rev !== r.draft_rev) throw new AppError(409, 'stale', `Diese Seite wurde inzwischen an anderer Stelle geändert (von ${r.draft_updated_by || 'jemand anderem'}). Bitte neu laden und erneut prüfen.`, undefined, { rev: r.draft_rev });
  }

  rename(id: number, patch: { name?: string; slug?: string }) {
    const r = this.row(id);
    let slug = r.slug;
    if (patch.slug !== undefined && patch.slug !== r.slug) {
      slug = validateSlug(patch.slug);
      this.assertSlugFree(slug, id);
    }
    this.db.prepare('UPDATE pages SET name = ?, slug = ? WHERE id = ?').run((patch.name ?? r.name).trim().slice(0, 120) || r.name, slug, id);
    if (slug !== r.slug) this.emit(id);
    return this.get(id);
  }

  saveDraft(id: number, input: { content?: unknown; theme?: unknown; rev: number }, p: Principal | null) {
    const r = this.row(id);
    if (input.rev !== r.draft_rev) {
      throw new AppError(409, 'stale', `Diese Seite wurde inzwischen an anderer Stelle geändert (von ${r.draft_updated_by || 'jemand anderem'}). Bitte neu laden.`, undefined, { rev: r.draft_rev });
    }
    const content = input.content !== undefined ? JSON.stringify(parseContent(input.content)) : r.draft_content;
    const theme = input.theme !== undefined ? JSON.stringify(parseTheme(input.theme)) : r.draft_theme;
    if (input.theme !== undefined && theme !== r.draft_theme) this.pushHistory(id, r.draft_theme, 'manual', p);
    const res = this.db
      .prepare('UPDATE pages SET draft_content = ?, draft_theme = ?, draft_rev = draft_rev + 1, draft_updated_at = ?, draft_updated_by = ? WHERE id = ? AND draft_rev = ?')
      .run(content, theme, now(), by(p), id, input.rev);
    if (res.changes === 0) throw new AppError(409, 'stale', 'Diese Seite wurde inzwischen an anderer Stelle geändert. Bitte neu laden.');
    return this.get(id);
  }

  private pushHistory(id: number, themeJson: string, source: string, p: Principal | null) {
    this.db.prepare('INSERT INTO theme_history(page_id, theme, source, created_at, created_by) VALUES (?,?,?,?,?)').run(id, themeJson, source, now(), by(p));
    // Höchstens 50 Einträge je Seite behalten
    this.db.prepare('DELETE FROM theme_history WHERE page_id = ? AND id NOT IN (SELECT id FROM theme_history WHERE page_id = ? ORDER BY id DESC LIMIT 50)').run(id, id);
  }

  /** Setzt das Entwurfsdesign (ohne Revisionsprüfung, eigener Vorgang) und merkt sich das vorherige. */
  setTheme(id: number, rawTheme: unknown, source: 'manual' | 'preset' | 'ai' | 'history', p: Principal | null, rev?: number) {
    const r = this.row(id);
    this.checkRev(r, rev);
    const theme = JSON.stringify(parseTheme(rawTheme));
    if (theme === r.draft_theme) return this.get(id);
    this.pushHistory(id, r.draft_theme, source, p);
    this.db.prepare('UPDATE pages SET draft_theme = ?, draft_rev = draft_rev + 1, draft_updated_at = ?, draft_updated_by = ? WHERE id = ?').run(theme, now(), by(p), id);
    return this.get(id);
  }

  themeHistory(id: number) {
    this.row(id);
    return (this.db.prepare('SELECT * FROM theme_history WHERE page_id = ? ORDER BY id DESC').all(id) as { id: number; theme: string; source: string; created_at: number; created_by: string }[]).map((h) => ({
      id: h.id,
      theme: JSON.parse(h.theme) as Theme,
      source: h.source,
      createdAt: isoOf(h.created_at),
      createdBy: h.created_by,
    }));
  }
  applyHistory(id: number, historyId: number, p: Principal | null) {
    const h = this.db.prepare('SELECT theme FROM theme_history WHERE id = ? AND page_id = ?').get(historyId, id) as { theme: string } | undefined;
    if (!h) throw notFound('Früheres Design');
    return this.setTheme(id, JSON.parse(h.theme), 'history', p);
  }

  /** Prüfungen vor dem Veröffentlichen (blockierend) */
  private assertPublishable(content: PageContent) {
    if (!content.legal.imprintUrl || !content.legal.privacyUrl) {
      throw new AppError(422, 'legal_missing', 'Vor dem Veröffentlichen bitte die Links zu Impressum und Datenschutzerklärung eintragen (Bereich „Seite“).');
    }
    if (!content.profile.name.trim()) throw new AppError(422, 'name_missing', 'Bitte einen Namen im Kopf der Seite eintragen.');
    const open = content.blocks.filter((b) => b.enabled && missingTarget(b));
    if (open.length) {
      const names = open.map((b) => `„${b.type === 'link' ? b.title : b.type === 'action' ? b.label : ''}“`).join(', ');
      throw new AppError(422, 'target_missing', `Bei ${names} fehlt noch das Ziel. Bitte ergänzen oder den Eintrag ausblenden.`);
    }
  }

  publish(id: number, note: string, p: Principal | null, rev?: number) {
    const r = this.row(id);
    this.checkRev(r, rev);
    const content = JSON.parse(r.draft_content) as PageContent;
    this.assertPublishable(content);
    const v = this.insertVersion(id, r.draft_content, r.draft_theme, note, p);
    this.emit(id);
    return { page: this.get(id), version: v };
  }

  private insertVersion(id: number, content: string, theme: string, note: string, p: Principal | null) {
    return this.db.transaction(() => {
      const next = ((this.db.prepare('SELECT MAX(number) AS n FROM page_versions WHERE page_id = ?').get(id) as { n: number | null }).n ?? 0) + 1;
      const res = this.db.prepare('INSERT INTO page_versions(page_id, number, content, theme, note, created_at, created_by) VALUES (?,?,?,?,?,?,?)').run(id, next, content, theme, note.slice(0, 300), now(), by(p));
      const vid = Number(res.lastInsertRowid);
      this.db.prepare('UPDATE pages SET published_version_id = ? WHERE id = ?').run(vid, id);
      return { id: vid, number: next };
    })();
  }

  discardDraft(id: number, p: Principal | null, rev?: number) {
    const r = this.row(id);
    this.checkRev(r, rev);
    if (!r.published_version_id) throw new AppError(409, 'never_published', 'Diese Seite wurde noch nie veröffentlicht; es gibt nichts zum Zurücksetzen.');
    const v = this.version(r.published_version_id)!;
    if (v.theme !== r.draft_theme) this.pushHistory(id, r.draft_theme, 'manual', p);
    this.db.prepare('UPDATE pages SET draft_content = ?, draft_theme = ?, draft_rev = draft_rev + 1, draft_updated_at = ?, draft_updated_by = ? WHERE id = ?').run(v.content, v.theme, now(), by(p), id);
    return this.get(id);
  }

  versions(id: number) {
    const r = this.row(id, true);
    return (this.db.prepare('SELECT * FROM page_versions WHERE page_id = ? ORDER BY number DESC').all(id) as VersionRow[]).map((v) => ({
      id: v.id,
      number: v.number,
      note: v.note,
      publishedAt: isoOf(v.created_at),
      publishedBy: v.created_by,
      current: v.id === r.published_version_id,
    }));
  }
  versionContent(id: number, versionId: number) {
    const v = this.version(versionId);
    if (!v || v.page_id !== id) throw notFound('Version');
    return { content: JSON.parse(v.content) as PageContent, theme: JSON.parse(v.theme) as Theme, number: v.number };
  }

  restoreVersion(id: number, versionId: number, mode: 'publish' | 'draft', p: Principal | null, rev?: number) {
    const r = this.row(id);
    if (mode === 'draft') this.checkRev(r, rev);
    const v = this.version(versionId);
    if (!v || v.page_id !== id) throw notFound('Version');
    if (mode === 'publish') {
      this.insertVersion(id, v.content, v.theme, `Wiederhergestellt aus Version ${v.number}`, p);
      this.emit(id);
    } else {
      if (v.theme !== r.draft_theme) this.pushHistory(id, r.draft_theme, 'manual', p);
      this.db.prepare('UPDATE pages SET draft_content = ?, draft_theme = ?, draft_rev = draft_rev + 1, draft_updated_at = ?, draft_updated_by = ? WHERE id = ?').run(v.content, v.theme, now(), by(p), id);
    }
    return this.get(id);
  }

  duplicate(id: number, p: Principal | null) {
    const r = this.row(id);
    const slug = this.freeSlug(r.slug, 'kopie', true);
    const t = now();
    const res = this.db
      .prepare('INSERT INTO pages(slug, name, draft_content, draft_theme, draft_rev, draft_updated_at, draft_updated_by, created_at, created_by) VALUES (?,?,?,?,1,?,?,?,?)')
      .run(slug, `${r.name} (Kopie)`.slice(0, 120), r.draft_content, r.draft_theme, t, by(p), t, by(p));
    return this.get(Number(res.lastInsertRowid));
  }

  softDelete(id: number) {
    this.row(id);
    this.db.prepare('UPDATE pages SET deleted_at = ? WHERE id = ?').run(now(), id);
    this.emit(id);
  }
  restore(id: number) {
    const r = this.row(id, true);
    if (!r.deleted_at) return this.get(id);
    this.db.prepare('UPDATE pages SET deleted_at = NULL WHERE id = ?').run(id);
    this.emit(id);
    return this.get(id);
  }
  /** Löscht Seiten endgültig, die länger als die Aufbewahrungsfrist im Papierkorb liegen. */
  purgeExpired(at = now()): number {
    const limit = at - this.trashDays() * 86400;
    const ids = (this.db.prepare('SELECT id FROM pages WHERE deleted_at IS NOT NULL AND deleted_at < ?').all(limit) as { id: number }[]).map((x) => x.id);
    for (const pid of ids) {
      this.db.prepare('DELETE FROM pages WHERE id = ?').run(pid);
      this.db.prepare('UPDATE domains SET page_id = NULL WHERE page_id = ?').run(pid);
    }
    return ids.length;
  }

  getPublishedBySlug(slug: string): PublishedPage | null {
    const r = this.db.prepare('SELECT * FROM pages WHERE slug = ? AND deleted_at IS NULL AND published_version_id IS NOT NULL').get(slug) as PageRow | undefined;
    return r ? this.published(r) : null;
  }
  getPublishedById(id: number): PublishedPage | null {
    const r = this.db.prepare('SELECT * FROM pages WHERE id = ? AND deleted_at IS NULL AND published_version_id IS NOT NULL').get(id) as PageRow | undefined;
    return r ? this.published(r) : null;
  }
  private published(r: PageRow): PublishedPage {
    const v = this.version(r.published_version_id!)!;
    return { pageId: r.id, slug: r.slug, versionId: v.id, number: v.number, content: JSON.parse(v.content), theme: JSON.parse(v.theme) };
  }
  /** Rohzugriff für Vorschau und Export */
  draftOf(id: number): { content: PageContent; theme: Theme; slug: string; name: string } {
    const r = this.row(id);
    return { content: JSON.parse(r.draft_content), theme: JSON.parse(r.draft_theme), slug: r.slug, name: r.name };
  }
}
