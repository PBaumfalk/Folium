import fs from 'node:fs';
import { describe, expect, it } from 'vitest';
import { newBlockId, pageContentSchema, validateUrl } from '../src/shared/content.js';
import { checkTheme, contrastRatio, FONTS, PRESETS, themeSchema } from '../src/shared/theme.js';

const baseContent = () => ({
  profile: { name: 'Muster', tagline: '', details: [], logoAssetId: null, avatarAssetId: null, coverAssetId: null },
  blocks: [],
  legal: { imprintUrl: 'https://www.example.com/impressum/', privacyUrl: 'https://www.example.com/datenschutz/' },
  meta: { title: '', description: '', noindex: false, lang: 'de' },
});

describe('Inhaltsschema', () => {
  it('rejects javascript: urls', () => {
    expect(() => validateUrl('javascript:alert(1)', ['http', 'https'])).toThrow();
    expect(() => validateUrl(' JaVaScRiPt:alert(1)', ['http', 'https', 'tel', 'mailto'])).toThrow();
    expect(validateUrl('https://www.example.com/', ['https'])).toBe('https://www.example.com/');
    expect(validateUrl('tel:+49 30 12345670', ['tel'])).toBe('tel:+493012345670');
  });

  it('rejects link block with javascript url inside page content', () => {
    const c = baseContent();
    (c.blocks as unknown[]).push({ id: newBlockId(), type: 'link', enabled: true, visibleFrom: null, visibleUntil: null, title: 'x', description: '', url: 'javascript:alert(1)', icon: null, imageAssetId: null });
    expect(pageContentSchema.safeParse(c).success).toBe(false);
  });

  it('accepts all block types', () => {
    const c = baseContent();
    const common = { enabled: true, visibleFrom: null, visibleUntil: null };
    c.blocks = [
      { id: newBlockId(), type: 'action', ...common, kind: 'call', label: 'Anrufen', value: '+49 30 12345670' },
      { id: newBlockId(), type: 'heading', ...common, text: 'Rechtsgebiete' },
      { id: newBlockId(), type: 'link', ...common, title: 'Leistungen', description: '', url: 'https://www.example.com/', icon: 'scale', imageAssetId: null },
      { id: newBlockId(), type: 'location', ...common, name: 'Musterstadt', role: 'Hauptsitz', address: 'Musterstraße 1\n12345 Musterstadt', routeUrl: null, note: '' },
      { id: newBlockId(), type: 'contact', ...common, phone: '030 123 456 70', email: 'info@example.com', hours: 'Mo.–Fr. 8–13 Uhr' },
      { id: newBlockId(), type: 'social', ...common, items: [{ network: 'linkedin', url: 'https://www.linkedin.com/company/x' }] },
      { id: newBlockId(), type: 'text', ...common, text: 'Hinweis' },
    ] as never;
    const r = pageContentSchema.safeParse(c);
    expect(r.success, JSON.stringify(r.error?.issues)).toBe(true);
  });

  it('limits blocks to 100', () => {
    const c = baseContent();
    c.blocks = Array.from({ length: 101 }, () => ({ id: newBlockId(), type: 'text', enabled: true, visibleFrom: null, visibleUntil: null, text: 'x' })) as never;
    expect(pageContentSchema.safeParse(c).success).toBe(false);
  });

  it('rejects invalid schedule format', () => {
    const c = baseContent();
    c.blocks = [{ id: newBlockId(), type: 'text', enabled: true, visibleFrom: 'morgen', visibleUntil: null, text: 'x' }] as never;
    expect(pageContentSchema.safeParse(c).success).toBe(false);
  });
});

describe('Designschema', () => {
  it('normalizes hex case', () => {
    const t = themeSchema.parse({ ...PRESETS.editorial, colors: { ...PRESETS.editorial.colors, accent: '#0b7032' } });
    expect(t.colors.accent).toBe('#0B7032');
  });

  it('rejects css injection in color', () => {
    const r = themeSchema.safeParse({ ...PRESETS.editorial, colors: { ...PRESETS.editorial.colors, accent: 'red;}body{' } });
    expect(r.success).toBe(false);
  });

  it('rejects unknown font id', () => {
    expect(themeSchema.safeParse({ ...PRESETS.editorial, fonts: { heading: 'comic-sans', body: 'hanken-grotesk' } }).success).toBe(false);
    expect(themeSchema.safeParse({ ...PRESETS.editorial, fonts: { heading: 'upload:abcdef0123456789', body: 'hanken-grotesk' } }).success).toBe(true);
  });

  it('presets pass contrast checks', () => {
    for (const [name, t] of Object.entries(PRESETS)) {
      expect(themeSchema.safeParse(t).success, name).toBe(true);
      for (const c of checkTheme(t)) expect(c.ok, `${name} ${c.pair} ${c.ratio}`).toBe(true);
    }
  });

  it('contrastRatio white/black is 21', () => {
    expect(contrastRatio('#FFFFFF', '#000000')).toBeCloseTo(21, 1);
    expect(contrastRatio('#777777', '#FFFFFF')).toBeCloseTo(4.48, 1);
  });

  it('checkTheme flags poor contrast with suggestion', () => {
    const bad = { ...PRESETS.editorial, colors: { ...PRESETS.editorial.colors, text: '#CCCCCC' } };
    const r = checkTheme(bad).find((c) => c.pair === 'text/background')!;
    expect(r.ok).toBe(false);
    expect(r.suggestion).toMatch(/^#[0-9A-F]{6}$/);
    expect(contrastRatio(r.suggestion!, bad.colors.background)).toBeGreaterThanOrEqual(4.5);
  });

  it('every bundled font has at least one file', () => {
    for (const f of Object.values(FONTS)) {
      expect(f.files.length).toBeGreaterThan(0);
      for (const file of f.files) expect(fs.existsSync(`fonts/${file.file}`), file.file).toBe(true);
    }
  });
});
