import { describe, expect, it } from 'vitest';
import { newBlockId, type Block, type PageContent } from '../src/shared/content.js';
import { PRESETS } from '../src/shared/theme.js';
import { renderPage, themeCss } from '../src/server/render/page.js';
import { isVisible, localToEpoch } from '../src/server/lib/schedule.js';

const blk = (x: Record<string, unknown>): Block => ({ id: newBlockId(), enabled: true, visibleFrom: null, visibleUntil: null, ...x }) as Block;

const content = (blocks: Block[] = []): PageContent => ({
  profile: { name: 'Muster & Partner', tagline: 'Beispiel in Musterstadt', details: ['Maria Muster'], logoAssetId: null, avatarAssetId: null, coverAssetId: null },
  blocks,
  legal: { imprintUrl: 'https://www.example.com/impressum/', privacyUrl: 'https://www.example.com/datenschutz/' },
  meta: { title: '', description: '', noindex: false, lang: 'de' },
});

const render = (c: PageContent, preset: keyof typeof PRESETS = 'editorial', now = new Date()) =>
  renderPage({ content: c, theme: PRESETS[preset], mode: 'public', now, pageId: 1, versionId: 1, assetUrl: (id, w) => `/assets/${id}-${w}.webp`, fontUrl: (f) => `/fonts/${f}`, timezone: 'Europe/Berlin' });

describe('Renderer', () => {
  it('escapes user text', () => {
    const c = content([blk({ type: 'link', title: '<script>alert(1)</script>', description: '"><img src=x onerror=alert(1)>', url: 'https://www.example.com/', icon: null, imageAssetId: null })]);
    c.profile.name = '<b>Kanzlei</b>';
    const html = render(c);
    expect(html).not.toContain('<script>alert(1)');
    expect(html).not.toContain('<img src=x');
    expect(html).toContain('&lt;script&gt;alert(1)&lt;/script&gt;');
    expect(html).toContain('&lt;b&gt;Kanzlei&lt;/b&gt;');
  });

  it('hidden and scheduled blocks are not rendered (incl. DST edge)', () => {
    const c = content([
      blk({ type: 'text', text: 'AUSGESCHALTET', enabled: false }),
      blk({ type: 'text', text: 'BIS-SAMSTAG', visibleUntil: '2027-03-27T23:59' }),
      blk({ type: 'text', text: 'AB-SOMMER', visibleFrom: '2027-07-01T09:00' }),
    ]);
    const before = render(c, 'editorial', new Date('2027-03-27T22:58:00Z'));
    expect(before).not.toContain('AUSGESCHALTET');
    expect(before).toContain('BIS-SAMSTAG');
    expect(before).not.toContain('AB-SOMMER');
    expect(render(c, 'editorial', new Date('2027-03-27T23:00:00Z'))).not.toContain('BIS-SAMSTAG');
    expect(render(c, 'editorial', new Date('2027-07-01T06:59:00Z'))).not.toContain('AB-SOMMER');
    expect(render(c, 'editorial', new Date('2027-07-01T07:00:00Z'))).toContain('AB-SOMMER');
  });

  it('localToEpoch respects Europe/Berlin offsets', () => {
    expect(new Date(localToEpoch('2027-01-15T10:00', 'Europe/Berlin')).toISOString()).toBe('2027-01-15T09:00:00.000Z');
    expect(new Date(localToEpoch('2027-07-15T10:00', 'Europe/Berlin')).toISOString()).toBe('2027-07-15T08:00:00.000Z');
    expect(isVisible({ enabled: true, visibleFrom: null, visibleUntil: null }, new Date(), 'Europe/Berlin')).toBe(true);
  });

  it('links are plain anchors to target', () => {
    const b = blk({ type: 'link', title: 'Homepage', description: '', url: 'https://www.example.com/', icon: 'globe', imageAssetId: null });
    const html = render(content([b]));
    expect(html).toMatch(new RegExp(`<a [^>]*href="https://www.example.com/"[^>]*data-b="${b.id}"`));
  });

  it('call action renders tel link first and prominent', () => {
    const html = render(content([blk({ type: 'action', kind: 'call', label: 'Anrufen', value: '+49 30 12345670' })]));
    expect(html).toMatch(/<a [^>]*class="[^"]*btn-haupt[^"]*"[^>]*href="tel:\+493012345670"|<a [^>]*href="tel:\+493012345670"[^>]*class="[^"]*btn-haupt/);
  });

  it('first action is prominent even after leading text', () => {
    const html = render(content([blk({ type: 'text', text: 'Einleitung' }), blk({ type: 'action', kind: 'booking', label: 'Termin', value: 'https://www.example.com/#kontakt' }), blk({ type: 'action', kind: 'call', label: 'Anrufen', value: '+493012345670' })]));
    expect(html).toMatch(/class="btn btn-haupt"[^>]*href="https:\/\/www.example.com\/#kontakt"/);
    expect(html.match(/class="btn btn-haupt"/g)!.length).toBe(1);
  });

  it('footer always contains imprint and privacy links', () => {
    const html = render(content());
    expect(html).toMatch(/<footer[\s\S]*href="https:\/\/www.example.com\/impressum\/"[\s\S]*Impressum[\s\S]*Datenschutz[\s\S]*<\/footer>/);
  });

  it('has landmarks, skip link, lang and viewport', () => {
    const html = render(content());
    expect(html).toContain('<html lang="de"');
    expect(html).toContain('name="viewport"');
    expect(html).toMatch(/<a class="skip" href="#inhalt">/);
    expect(html).toContain('<main id="inhalt"');
  });

  it('rendered css contains only validated theme values', () => {
    const css = themeCss(PRESETS.signature);
    expect(css).toContain('--accent:#0B7032');
    expect(css).toContain('"Aleo"');
  });

  it('all presets render distinct layout classes', () => {
    const withCover = () => {
      const c = content();
      c.profile.coverAssetId = 'abcdef0123456789';
      return c;
    };
    const body = (p: keyof typeof PRESETS, c = withCover()) => render(c, p).match(/<body class="([^"]+)"/)![1];
    expect(body('boutique', content())).toContain('kopf-text'); // ohne Titelbild Rückfall auf Textkopf
    expect(body('editorial')).toContain('kopf-text');
    expect(body('boutique')).toContain('kopf-foto-oben');
    expect(body('signature')).toContain('kopf-foto-seite');
  });

  it('preview mode adds banner and noindex', () => {
    const html = renderPage({ content: content(), theme: PRESETS.editorial, mode: 'preview', now: new Date(), pageId: 1, versionId: 0, assetUrl: () => '', fontUrl: (f) => f, timezone: 'Europe/Berlin' });
    expect(html).toContain('Vorschau – nicht veröffentlicht');
    expect(html).toContain('noindex');
  });
});
