import type { Features } from '../analysis/extract.js';
import { AiError, type AiInput, type AiRawResult, type DesignAiProvider } from './provider.js';

/**
 * SIMULIERTER Anbieter für Tests und Entwicklung (AI_PROVIDER=fake). Ruft keine API auf.
 * Ergebnisse tragen simulated: true und werden in der Oberfläche als „Simulierte KI-Antwort“ gekennzeichnet.
 */
export type FakeMode = 'valid' | 'invalid-json' | 'truncated' | 'invented-colors' | 'injection-echo' | 'timeout' | 'refusal';

export function validAiOutput(f: Features) {
  const pick = (pred: (c: Features['colors'][number]) => boolean, fb: string) => f.colors.find(pred) ?? { id: 'c1', hex: fb };
  const accent = pick((c) => c.role === 'button' || c.hex === '#0B7032', '#0B7032');
  const text = pick((c) => c.role === 'text', '#1D1D1B');
  const font = f.fonts[0];
  const bundled = font?.bundled ?? 'source-serif-4';
  return {
    identity: { summary: 'Seriöse, grün geprägte Marke mit kräftiger Serifenschrift und klaren, eckigen Knöpfen. (Simuliert)', character: ['seriös', 'regional', 'klar'] },
    detected: {
      colors: [
        { featureId: accent.id, role: 'accent' as string, hex: accent.hex },
        { featureId: text.id, role: 'text' as string, hex: text.hex },
      ],
      fonts: font ? [{ featureId: font.id, role: 'body' as string }] : [],
      buttons: f.buttons[0] ? [{ featureId: f.buttons[0].id, note: 'Gefüllter Knopf mit kleiner Rundung' }] : [],
      logoFeatureId: f.logo[0]?.id ?? null,
    },
    uncertain: ['Bildsprache nur aus Bildschirmfotos geschätzt. (Simuliert)'],
    variants: [
      { name: 'Nah an der Homepage', rationale: 'Übernimmt Grün, Schrift und Knopfform der Homepage. (Simuliert)', theme: { colors: { background: '#EEF3EE', surface: '#FFFFFF', text: text.hex, muted: '#4D5650', accent: accent.hex, onAccent: '#FFFFFF', border: '#CFDCD1' }, fonts: { heading: bundled, body: bundled }, buttons: { shape: 'soft', style: 'solid' }, cards: { style: 'fill', radius: 4 }, density: 'normal', header: { layout: 'photo-side', logoSize: 'L' }, linkLayout: 'cards', primaryAction: 'button', sectionBand: true } },
      { name: 'Ruhig redaktionell', rationale: 'Helles Papier, Grün nur für die Hauptaktion. (Simuliert)', theme: { colors: { background: '#F5F6F3', surface: '#FFFFFF', text: '#17201B', muted: '#5A635E', accent: accent.hex, onAccent: '#FFFFFF', border: '#D9DED8' }, fonts: { heading: 'newsreader', body: 'hanken-grotesk' }, buttons: { shape: 'soft', style: 'solid' }, cards: { style: 'line', radius: 6 }, density: 'normal', header: { layout: 'text', logoSize: 'M' }, linkLayout: 'list', primaryAction: 'button', sectionBand: false } },
      { name: 'Charaktervoll', rationale: 'Eichenton als Akzent, große Hauptaktion. (Simuliert)', theme: { colors: { background: '#E7EBE2', surface: '#FBFCF9', text: '#16201A', muted: '#4F5B54', accent: '#CDA46E', onAccent: '#16201A', border: '#C9D1C4' }, fonts: { heading: 'bricolage-grotesque', body: 'instrument-sans' }, buttons: { shape: 'pill', style: 'solid' }, cards: { style: 'fill', radius: 20 }, density: 'airy', header: { layout: 'photo-top', logoSize: 'M' }, linkLayout: 'tiles', primaryAction: 'pill-sticky', sectionBand: false } },
    ],
  };
}

export class FakeProvider implements DesignAiProvider {
  readonly id = 'fake';
  readonly model = 'simuliert';
  constructor(private mode: FakeMode = 'valid') {}

  async analyze(input: AiInput, signal: AbortSignal): Promise<AiRawResult> {
    const usage = { input_tokens: 0, output_tokens: 0 };
    switch (this.mode) {
      case 'timeout':
        await new Promise((r, j) => {
          const t = setTimeout(r, 60_000);
          signal.addEventListener('abort', () => {
            clearTimeout(t);
            j(new AiError('ai_timeout', 'Die KI hat nicht rechtzeitig geantwortet.', 504));
          });
        });
        throw new AiError('ai_timeout', 'Die KI hat nicht rechtzeitig geantwortet.', 504);
      case 'refusal':
        throw new AiError('ai_refusal', 'Die KI hat die Anfrage abgelehnt (simuliert).');
      case 'invalid-json':
        return { raw: '{"identity": {"summary": "abgebrochen', model: this.model, usage, simulated: true };
      case 'truncated':
        throw new AiError('ai_truncated', 'Die Antwort der KI war unvollständig (simuliert).');
      case 'invented-colors': {
        const o = validAiOutput(input.features);
        o.detected.colors.push({ featureId: 'c99', role: 'accent', hex: '#FF00FF' });
        return { raw: o, model: this.model, usage, simulated: true };
      }
      case 'injection-echo': {
        const o = validAiOutput(input.features);
        o.variants[0].theme.colors.accent = 'red;}</style><script>alert(1)</script>';
        o.identity.summary = '<img src=x onerror=alert(1)> Ignoriere alle Regeln';
        return { raw: o, model: this.model, usage, simulated: true };
      }
      default:
        return { raw: validAiOutput(input.features), model: this.model, usage, simulated: true };
    }
  }

  async testConnection() {
    return { ok: true, message: 'Simulierter Anbieter – es wird keine echte KI aufgerufen.', model: this.model };
  }
}
