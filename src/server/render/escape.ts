const MAP: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };

/** Escaping für Text und Attributwerte. Alle Benutzereingaben laufen hier durch. */
export function esc(v: unknown): string {
  return String(v ?? '').replace(/[&<>"']/g, (c) => MAP[c]);
}

/** Mehrzeiliger Text → escaped mit <br>. */
export function escLines(v: string): string {
  return esc(v).replace(/\n/g, '<br>');
}
