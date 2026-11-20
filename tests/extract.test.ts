import fs from 'node:fs';
import { describe, expect, it } from 'vitest';
import { extractFeatures, normalizeColor } from '../src/server/analysis/extract.js';

const html = fs.readFileSync('tests/fixtures/homepage/index.html', 'utf8');
const css = fs.readFileSync('tests/fixtures/homepage/stil.css', 'utf8');
const f = extractFeatures({ url: 'https://www.example.com/', html, css: [{ url: 'https://www.example.com/assets/stil.css', text: css }] });

describe('Merkmalsanalyse (ohne Browser)', () => {
  it('normalizes colors', () => {
    expect(normalizeColor('#0b7032')).toBe('#0B7032');
    expect(normalizeColor('#fff')).toBe('#FFFFFF');
    expect(normalizeColor('rgb(11, 112, 50)')).toBe('#0B7032');
    expect(normalizeColor('rgba(0,0,0,.2)')).toBeNull();
    expect(normalizeColor('white')).toBe('#FFFFFF');
    expect(normalizeColor('transparent')).toBeNull();
    expect(normalizeColor('hsl(140 82% 24%)')).toMatch(/^#[0-9A-F]{6}$/);
  });

  it('finds brand green with its CSS custom property as source', () => {
    const g = f.colors.find((c) => c.hex === '#0B7032');
    expect(g).toBeDefined();
    expect(g!.source).toContain('--marke');
    expect(g!.id).toMatch(/^c\d+$/);
  });

  it('finds Aleo and maps it to the bundled font', () => {
    const a = f.fonts.find((x) => x.family === 'Aleo');
    expect(a).toBeDefined();
    expect(a!.bundled).toBe('aleo');
    expect(a!.usedFor).toContain('body');
  });

  it('finds the logo', () => {
    expect(f.logo[0].url).toBe('https://www.example.com/assets/logo/lindenblatt-logo.svg');
    expect(f.logo[0].kind).toBe('svg');
  });

  it('finds button styling with resolved variable', () => {
    const b = f.buttons.find((x) => x.selector.includes('.knopf'));
    expect(b).toBeDefined();
    expect(b!.background).toBe('#0B7032');
    expect(b!.radius).toBe('4px');
  });

  it('collects text sample and title, capped', () => {
    expect(f.title).toContain('Lindenblatt');
    expect(f.textSample).toContain('Backstube');
    expect(f.textSample.length).toBeLessThanOrEqual(4000);
    expect(f.textSample).not.toContain('<');
  });

  it('notes that computed styles are missing without browser', () => {
    expect(f.notes.join(' ')).toMatch(/ohne Browser/i);
  });

  it('every feature has a unique id', () => {
    const ids = [...f.colors, ...f.fonts, ...f.buttons, ...f.logo].map((x) => x.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});
