import type { Theme } from '../../shared/theme.js';
import type { Features } from '../analysis/extract.js';
import { AppError } from '../lib/errors.js';

/** Eingabe für einen Gestaltungsvorschlag. */
export interface AiInput {
  url: string;
  features: Features;
  screenshots: { mobile: Buffer; desktop: Buffer } | null;
  /** festgehaltene Werte als Pfade, z. B. „colors.accent“ */
  locked: string[];
  current: Theme;
  /** Kurzbeschreibung der eigenen Seite (Namen, Art der Einträge) */
  contentSummary: string;
}

export interface AiRawResult {
  raw: unknown;
  model: string;
  usage: { input_tokens: number; output_tokens: number };
  simulated: boolean;
  fallbackModel?: string | null;
}

/** Austauschbarer KI-Anbieter. Weitere Anbieter implementieren nur diese Schnittstelle. */
export interface DesignAiProvider {
  readonly id: string;
  readonly model: string;
  analyze(input: AiInput, signal: AbortSignal): Promise<AiRawResult>;
  testConnection(): Promise<{ ok: boolean; message: string; model: string }>;
}

export type AiErrorCode = 'ai_auth' | 'ai_rate' | 'ai_overloaded' | 'ai_timeout' | 'ai_refusal' | 'ai_truncated' | 'ai_bad_request' | 'ai_network' | 'ai_error';

export class AiError extends AppError {
  constructor(code: AiErrorCode, message: string, status = 502) {
    super(status, code, message);
  }
}
