import type { DB } from '../db/db.js';
import type { Logger } from '../lib/log.js';
import { dayKey, dayKeyToIso } from '../lib/time.js';
import { isBot } from '../lib/ua.js';
import type { Pages } from './pages.js';
import type { SettingsStore } from './settings.js';

/**
 * Datensparsame Statistik: nur Tagessummen je Seite, Eintrag und Quelle.
 * Keine IP-Adressen, keine User-Agents, keine Cookies, keine Besucherkennungen.
 * Zählungen werden im Arbeitsspeicher gebündelt und alle 3 Sekunden geschrieben.
 */
export class Stats {
  private buf = new Map<string, number>();
  private timer: ReturnType<typeof setInterval> | null = null;

  constructor(
    readonly db: DB,
    private settings: SettingsStore,
    private log: Logger,
    private tz: string,
  ) {}

  start() {
    this.timer = setInterval(() => this.flush(), 3000);
    this.timer.unref?.();
  }
  stop() {
    if (this.timer) clearInterval(this.timer);
    this.flush();
  }

  static source(raw: string | undefined): string {
    const s = String(raw ?? '').toLowerCase();
    return /^[a-z0-9-]{1,32}$/.test(s) ? s : 'direkt';
  }

  private add(pageId: number, blockId: string, kind: 'view' | 'click', src: string, ua: string | undefined, at: Date) {
    if (!this.settings.get('statsEnabled')) return;
    const day = dayKey(Math.floor(at.getTime() / 1000), this.tz);
    const key = `${pageId}|${blockId}|${day}|${Stats.source(src)}|${kind}|${isBot(ua) ? 1 : 0}`;
    this.buf.set(key, (this.buf.get(key) ?? 0) + 1);
    if (this.buf.size > 5000) this.flush();
  }

  view(pageId: number, src: string, ua: string | undefined, at = new Date()) {
    this.add(pageId, '', 'view', src, ua, at);
  }
  click(pageId: number, blockId: string, src: string, ua: string | undefined, at = new Date()) {
    this.add(pageId, blockId, 'click', src, ua, at);
  }

  flush() {
    if (!this.buf.size) return;
    const entries = [...this.buf];
    this.buf.clear();
    try {
      const up = this.db.prepare(
        'INSERT INTO stats_daily(page_id, block_id, day, source, kind, bot, count) VALUES (?,?,?,?,?,?,?) ON CONFLICT(page_id, block_id, day, source, kind, bot) DO UPDATE SET count = count + excluded.count',
      );
      this.db.transaction(() => {
        for (const [k, n] of entries) {
          const [p, b, d, s, kind, bot] = k.split('|');
          up.run(Number(p), b, Number(d), s, kind, Number(bot), n);
        }
      })();
    } catch (e) {
      this.log.warn({ err: e }, 'Statistik konnte nicht gespeichert werden');
    }
  }

  purge(retentionDays: number) {
    const cutoff = dayKey(Math.floor(Date.now() / 1000) - retentionDays * 86400, this.tz);
    this.db.prepare('DELETE FROM stats_daily WHERE day < ?').run(cutoff);
  }

  range(days: number | undefined, from?: string, to?: string): { from: number; to: number } {
    const today = dayKey(Math.floor(Date.now() / 1000), this.tz);
    const toKey = to ? Number(to.replaceAll('-', '')) : today;
    const fromKey = from ? Number(from.replaceAll('-', '')) : dayKey(Math.floor(Date.now() / 1000) - ((days ?? 30) - 1) * 86400, this.tz);
    return { from: fromKey, to: toKey };
  }

  query(opts: { pageId?: number; from: number; to: number }, pages: Pages) {
    const where = `day BETWEEN ? AND ?${opts.pageId ? ' AND page_id = ?' : ''}`;
    const args: (number | string)[] = [opts.from, opts.to, ...(opts.pageId ? [opts.pageId] : [])];
    const daysRows = this.db
      .prepare(`SELECT day, SUM(CASE WHEN kind='view' AND bot=0 THEN count ELSE 0 END) AS views, SUM(CASE WHEN kind='click' AND bot=0 THEN count ELSE 0 END) AS clicks FROM stats_daily WHERE ${where} GROUP BY day ORDER BY day`)
      .all(...args) as { day: number; views: number; clicks: number }[];
    // Lückenlose Tagesreihe
    const byDay = new Map(daysRows.map((r) => [r.day, r]));
    const series: { day: string; views: number; clicks: number }[] = [];
    const start = new Date(`${dayKeyToIso(opts.from)}T12:00:00Z`);
    const end = new Date(`${dayKeyToIso(opts.to)}T12:00:00Z`);
    for (let d = start; d <= end && series.length < 800; d = new Date(d.getTime() + 86400_000)) {
      const k = Number(d.toISOString().slice(0, 10).replaceAll('-', ''));
      const r = byDay.get(k);
      series.push({ day: dayKeyToIso(k), views: r?.views ?? 0, clicks: r?.clicks ?? 0 });
    }
    const totals = this.db
      .prepare(`SELECT SUM(CASE WHEN kind='view' AND bot=0 THEN count ELSE 0 END) AS views, SUM(CASE WHEN kind='click' AND bot=0 THEN count ELSE 0 END) AS clicks, SUM(CASE WHEN bot=1 THEN count ELSE 0 END) AS bots FROM stats_daily WHERE ${where}`)
      .get(...args) as { views: number | null; clicks: number | null; bots: number | null };
    const sources = this.db
      .prepare(`SELECT source, SUM(CASE WHEN kind='view' THEN count ELSE 0 END) AS views, SUM(CASE WHEN kind='click' THEN count ELSE 0 END) AS clicks FROM stats_daily WHERE ${where} AND bot=0 GROUP BY source ORDER BY views DESC`)
      .all(...args) as { source: string; views: number; clicks: number }[];
    const blocks = this.db
      .prepare(`SELECT page_id, block_id, SUM(count) AS clicks FROM stats_daily WHERE ${where} AND kind='click' AND bot=0 GROUP BY page_id, block_id ORDER BY clicks DESC LIMIT 200`)
      .all(...args) as { page_id: number; block_id: string; clicks: number }[];
    const perPage = this.db
      .prepare(`SELECT page_id, SUM(CASE WHEN kind='view' THEN count ELSE 0 END) AS views, SUM(CASE WHEN kind='click' THEN count ELSE 0 END) AS clicks FROM stats_daily WHERE ${where} AND bot=0 GROUP BY page_id ORDER BY views DESC`)
      .all(...args) as { page_id: number; views: number; clicks: number }[];
    const viewsOf = new Map(perPage.map((r) => [r.page_id, r.views]));
    const titles = new Map<string, { title: string; type: string }>();
    const pageNames = new Map<number, string>();
    for (const p of [...pages.list(), ...pages.list({ deleted: true })]) {
      pageNames.set(p.id, p.name);
      for (const b of p.draft.content.blocks) {
        const title = b.type === 'link' ? b.title : b.type === 'action' ? b.label : b.type === 'location' ? `Route ${b.name}` : b.type === 'contact' ? 'Kontaktzeile' : b.type === 'social' ? 'Social Media' : b.type;
        titles.set(`${p.id}|${b.id}`, { title, type: b.type });
      }
    }
    return {
      from: dayKeyToIso(opts.from),
      to: dayKeyToIso(opts.to),
      totals: { views: totals.views ?? 0, clicks: totals.clicks ?? 0, bots: totals.bots ?? 0 },
      days: series,
      sources,
      pages: perPage.map((r) => ({ pageId: r.page_id, name: pageNames.get(r.page_id) ?? 'Gelöschte Seite', views: r.views, clicks: r.clicks })),
      blocks: blocks.map((b) => {
        const t = titles.get(`${b.page_id}|${b.block_id}`);
        const v = viewsOf.get(b.page_id) ?? 0;
        return { pageId: b.page_id, blockId: b.block_id, title: t?.title ?? 'Entfernter Eintrag', type: t?.type ?? null, clicks: b.clicks, ctr: v ? Math.round((b.clicks / v) * 1000) / 10 : null };
      }),
    };
  }
}
