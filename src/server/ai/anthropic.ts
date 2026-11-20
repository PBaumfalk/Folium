import Anthropic from '@anthropic-ai/sdk';
import type { Config } from '../config.js';
import { FakeProvider, type FakeMode } from './fake.js';
import { buildPrompt, SYSTEM_PROMPT } from './prompt.js';
import { AiError, type AiInput, type AiRawResult, type DesignAiProvider } from './provider.js';
import { AI_JSON_SCHEMA } from './schema.js';

/**
 * Anthropic Claude über die offizielle API (@anthropic-ai/sdk).
 * Strukturierte JSON-Ausgabe, Bildauswertung, serverseitiger Fallback bei Ablehnungen.
 * Der API-Schlüssel bleibt auf dem Server.
 */
export class AnthropicProvider implements DesignAiProvider {
  readonly id = 'anthropic';
  private client: Anthropic;
  constructor(
    apiKey: string,
    readonly model: string,
    private timeoutMs: number,
  ) {
    this.client = new Anthropic({ apiKey, maxRetries: 1, timeout: timeoutMs });
  }

  private mapError(e: unknown): AiError {
    if (e instanceof AiError) return e;
    if (e instanceof Anthropic.AuthenticationError || e instanceof Anthropic.PermissionDeniedError) return new AiError('ai_auth', 'Der API-Schlüssel wurde abgelehnt. Bitte ANTHROPIC_API_KEY prüfen.', 502);
    if (e instanceof Anthropic.RateLimitError) return new AiError('ai_rate', 'Der KI-Anbieter begrenzt gerade die Anfragen. Bitte in einigen Minuten erneut versuchen.', 503);
    if (e instanceof Anthropic.APIConnectionTimeoutError) return new AiError('ai_timeout', `Die KI hat nicht innerhalb von ${Math.round(this.timeoutMs / 1000)} Sekunden geantwortet.`, 504);
    if (e instanceof Anthropic.APIConnectionError) return new AiError('ai_network', 'Der KI-Anbieter ist nicht erreichbar (Netzwerk). Bitte Internetzugang des Servers prüfen.', 502);
    if (e instanceof Anthropic.NotFoundError) return new AiError('ai_bad_request', `Das Modell „${this.model}“ ist nicht verfügbar. Bitte AI_MODEL prüfen.`, 502);
    if (e instanceof Anthropic.BadRequestError) return new AiError('ai_bad_request', `Der KI-Anbieter hat die Anfrage abgelehnt: ${e.message.slice(0, 200)}`, 502);
    if (e instanceof Anthropic.InternalServerError) return new AiError('ai_overloaded', 'Der KI-Anbieter ist gerade überlastet. Bitte später erneut versuchen.', 503);
    if (e instanceof Anthropic.APIError) return new AiError('ai_error', `Fehler beim KI-Anbieter (${e.status ?? '?'}).`, 502);
    if ((e as Error)?.name === 'AbortError') return new AiError('ai_timeout', 'Die Anfrage an die KI wurde abgebrochen.', 504);
    return new AiError('ai_error', `Unerwarteter Fehler bei der KI-Anfrage: ${(e as Error)?.message?.slice(0, 200)}`, 502);
  }

  async analyze(input: AiInput, signal: AbortSignal): Promise<AiRawResult> {
    const { content } = buildPrompt(input);
    let res: Anthropic.Beta.BetaMessage;
    try {
      res = await this.client.beta.messages.create(
        {
          model: this.model,
          max_tokens: 16000,
          betas: ['server-side-fallback-2026-07-01'],
          fallbacks: 'default',
          system: SYSTEM_PROMPT,
          output_config: { effort: 'medium', format: { type: 'json_schema', schema: AI_JSON_SCHEMA } },
          messages: [{ role: 'user', content }],
        },
        { signal },
      );
    } catch (e) {
      throw this.mapError(e);
    }
    if (res.stop_reason === 'refusal') throw new AiError('ai_refusal', 'Die KI hat die Anfrage abgelehnt. Das manuelle Design bleibt nutzbar.');
    if (res.stop_reason === 'max_tokens') throw new AiError('ai_truncated', 'Die Antwort der KI war unvollständig. Bitte erneut versuchen.');
    const text = res.content
      .filter((b): b is Anthropic.Beta.BetaTextBlock => b.type === 'text')
      .map((b) => b.text)
      .join('');
    const fallbackModel = res.model !== this.model ? res.model : null;
    return { raw: text, model: res.model, usage: { input_tokens: res.usage.input_tokens ?? 0, output_tokens: res.usage.output_tokens ?? 0 }, simulated: false, fallbackModel };
  }

  /** Verbindungsprüfung ohne Kosten: Modellabfrage über die Models-API. */
  async testConnection() {
    try {
      const m = await this.client.models.retrieve(this.model);
      return { ok: true, message: `Verbindung in Ordnung. Modell „${m.display_name ?? m.id}“ ist verfügbar.`, model: m.id };
    } catch (e) {
      return { ok: false, message: this.mapError(e).message, model: this.model };
    }
  }
}

export function aiFromConfig(cfg: Config): DesignAiProvider | null {
  if (cfg.ai.provider === 'fake') return new FakeProvider((process.env.AI_FAKE_MODE as FakeMode) || 'valid');
  if (cfg.ai.provider === 'anthropic' && cfg.ai.apiKey) return new AnthropicProvider(cfg.ai.apiKey, cfg.ai.model, cfg.ai.timeoutMs);
  return null;
}
