import { FONTS, type Theme } from '../../shared/theme';

/** Lädt alle mitgelieferten Schriften in der Verwaltung (für Auswahl und Musterkarten). */
export function FontFaces() {
  const css = Object.values(FONTS)
    .map((f) => f.files.map((file) => `@font-face{font-family:"${f.family}";src:url(/fonts/${file.file}) format("${file.format}");font-weight:${file.weight};font-display:swap}`).join(''))
    .join('');
  return <style>{css}</style>;
}

export const familyOf = (id: string) => (id in FONTS ? `"${FONTS[id as keyof typeof FONTS].family}", ${FONTS[id as keyof typeof FONTS].fallback}` : 'system-ui, sans-serif');

/** Kleine Musterkarte einer Gestaltung (ohne iframe). */
export function ThemeSwatch({ theme, title = 'Muster & Partner', compact }: { theme: Theme; title?: string; compact?: boolean }) {
  const c = theme.colors;
  const r = { square: 0, soft: 6, round: 14, pill: 999 }[theme.buttons.shape];
  return (
    <div aria-hidden="true" style={{ background: c.background, color: c.text, padding: compact ? 12 : 16, borderRadius: 10, border: `1px solid ${c.border}`, display: 'grid', gap: compact ? 6 : 8, minHeight: compact ? 0 : 150 }}>
      <div style={{ fontFamily: familyOf(theme.fonts.heading), fontSize: compact ? 18 : 24, lineHeight: 1.05, fontWeight: theme.fonts.heading === 'aleo' || theme.fonts.heading === 'bricolage-grotesque' ? 700 : 500 }}>{title}</div>
      <div style={{ fontFamily: familyOf(theme.fonts.body), fontSize: 12, color: c.muted }}>Arbeitsrecht, Strafrecht</div>
      <div style={{ background: theme.buttons.style === 'solid' ? c.accent : 'transparent', color: theme.buttons.style === 'solid' ? c.onAccent : c.text, border: `1.5px solid ${c.accent}`, borderRadius: r, padding: '7px 10px', fontFamily: familyOf(theme.fonts.body), fontWeight: 600, fontSize: 12, textAlign: 'center' }}>Anrufen</div>
      {!compact && (
        <div style={{ display: 'grid', gap: 4 }}>
          {[0, 1].map((i) => (
            <div key={i} style={{ background: theme.linkLayout === 'list' ? 'transparent' : c.surface, borderTop: theme.linkLayout === 'list' ? `1px solid ${c.border}` : 0, borderRadius: theme.linkLayout === 'list' ? 0 : theme.cards.radius / 2, padding: '6px 8px', fontSize: 11, fontFamily: familyOf(theme.fonts.body) }}>
              Link {i + 1}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
