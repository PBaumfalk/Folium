import type { Config } from '../config.js';
import type { DB } from '../db/db.js';
import { AppError } from '../lib/errors.js';

/** Preise je Million Token in US-Dollar (Stand 11/2026, Anthropic). Unbekannte Modelle: wie Opus. */
export const PRICES_USD: Record<string, { input: number; output: number }> = {
  'claude-opus-5-5': { input: 4, output: 20 },
  'claude-opus-5': { input: 5, output: 25 },
  'claude-sonnet-5-5': { input: 2, output: 10 },
  'claude-haiku-5-5': { input: 0.1, output: 0.5 },
  'claude-fable-5-2': { input: 8, output: 40 },
};
/** Fester Umrechnungskurs für die Kostenbremse (Schätzung, kein Buchungswert). */
export const USD_TO_EUR = 0.92;

export function estimateCostEur(model: string, usage: { input_tokens: number; output_tokens: number }): number {
  const p = PRICES_USD[model] ?? PRICES_USD['claude-opus-5-5'];
  return ((usage.input_tokens * p.input + usage.output_tokens * p.output) / 1_000_000) * USD_TO_EUR;
}

/** Grobe Vorabschätzung für die Übertragungsübersicht. */
export function estimateRequest(model: string, textChars: number, images: { width: number; height: number }[]): { inputTokens: number; costEur: number } {
  const imgTokens = images.reduce((s, i) => s + Math.min(1600, Math.ceil((i.width * i.height) / 750)), 0);
  const inputTokens = Math.ceil(textChars / 3.2) + imgTokens + 900;
  return { inputTokens, costEur: estimateCostEur(model, { input_tokens: inputTokens, output_tokens: 6000 }) };
}

export interface AiRun {
  userId: number;
  url: string;
  model: string;
  status: 'ok' | 'error' | 'invalid';
  inputTokens: number;
  outputTokens: number;
  costEur: number;
  ms: number;
  error: string | null;
  simulated: boolean;
}

/** Kostenbremse: je Person und Stunde, je Tag und je Monat. Gezählt wird jeder Aufruf, auch fehlgeschlagene. */
export class AiBudget {
  constructor(
    private db: DB,
    private cfg: Config['ai'],
  ) {}

  private since(sec: number, userId?: number) {
    const t = Math.floor(Date.now() / 1000) - sec;
    return (this.db.prepare(`SELECT COUNT(*) AS n FROM ai_runs WHERE at >= ? AND simulated = 0 ${userId !== undefined ? 'AND user_id = ?' : ''}`).get(...(userId !== undefined ? [t, userId] : [t])) as { n: number }).n;
  }

  usage() {
    const d = new Date();
    const monthStart = Math.floor(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1) / 1000);
    const dayStart = Math.floor(new Date(d.toISOString().slice(0, 10)).getTime() / 1000);
    const m = this.db.prepare('SELECT COALESCE(SUM(cost_eur),0) AS c, COUNT(*) AS n FROM ai_runs WHERE at >= ? AND simulated = 0').get(monthStart) as { c: number; n: number };
    const today = (this.db.prepare('SELECT COUNT(*) AS n FROM ai_runs WHERE at >= ? AND simulated = 0').get(dayStart) as { n: number }).n;
    return { monthEur: Math.round(m.c * 100) / 100, monthRuns: m.n, todayRuns: today, dailyLimit: this.cfg.dailyLimit, hourlyPerUser: this.cfg.hourlyPerUser, monthlyBudgetEur: this.cfg.monthlyBudgetEur };
  }

  check(userId: number): void {
    if (this.since(3600, userId) >= this.cfg.hourlyPerUser) throw new AppError(429, 'ai_limit_hour', `Sie haben in der letzten Stunde schon ${this.cfg.hourlyPerUser} Analysen gestartet. Bitte später erneut versuchen.`);
    const u = this.usage();
    if (u.todayRuns >= this.cfg.dailyLimit) throw new AppError(429, 'ai_limit_day', `Das Tageslimit von ${this.cfg.dailyLimit} KI-Analysen ist erreicht. Morgen geht es weiter; das manuelle Design bleibt nutzbar.`);
    if (u.monthEur >= this.cfg.monthlyBudgetEur) throw new AppError(429, 'ai_limit_month', `Das Monatsbudget von ${this.cfg.monthlyBudgetEur} € für die KI ist ausgeschöpft (verbraucht: ${u.monthEur} €).`);
  }

  record(r: AiRun) {
    this.db
      .prepare('INSERT INTO ai_runs(at, user_id, url, model, status, input_tokens, output_tokens, cost_eur, ms, error, simulated) VALUES (?,?,?,?,?,?,?,?,?,?,?)')
      .run(Math.floor(Date.now() / 1000), r.userId, r.url.slice(0, 500), r.model, r.status, r.inputTokens, r.outputTokens, r.costEur, r.ms, r.error?.slice(0, 500) ?? null, r.simulated ? 1 : 0);
  }

  recent(limit = 20) {
    return (this.db.prepare('SELECT * FROM ai_runs ORDER BY id DESC LIMIT ?').all(limit) as Record<string, unknown>[]).map((r) => ({ ...r, at: new Date((r.at as number) * 1000).toISOString(), simulated: Boolean(r.simulated) }));
  }
}
