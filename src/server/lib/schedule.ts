/** Zeitsteuerung von Blöcken. Angaben sind lokale Zeiten („Wanduhr“) in der eingestellten Zeitzone. */

const dtf = new Map<string, Intl.DateTimeFormat>();
function fmt(tz: string) {
  let f = dtf.get(tz);
  if (!f) {
    f = new Intl.DateTimeFormat('en-US', { timeZone: tz, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' });
    dtf.set(tz, f);
  }
  return f;
}

/** Versatz der Zeitzone zu UTC in Millisekunden zum Zeitpunkt `epoch`. */
function offsetAt(epoch: number, tz: string): number {
  const parts = Object.fromEntries(fmt(tz).formatToParts(new Date(epoch)).map((p) => [p.type, p.value]));
  const asUtc = Date.UTC(+parts.year, +parts.month - 1, +parts.day, +parts.hour, +parts.minute, +parts.second);
  return asUtc - Math.floor(epoch / 1000) * 1000;
}

/** 'YYYY-MM-DDTHH:mm' in der Zeitzone → Unix-Millisekunden. */
export function localToEpoch(local: string, tz: string): number {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(local);
  if (!m) return NaN;
  const guess = Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5]);
  let epoch = guess - offsetAt(guess, tz);
  // zweite Runde für Zeitpunkte nahe der Umstellung
  epoch = guess - offsetAt(epoch, tz);
  return epoch;
}

/** Sichtbar, wenn eingeschaltet und innerhalb [ab, bis]; „bis“ schließt die genannte Minute ein. */
export function isVisible(b: { enabled: boolean; visibleFrom: string | null; visibleUntil: string | null }, now: Date, tz: string): boolean {
  if (!b.enabled) return false;
  const t = now.getTime();
  if (b.visibleFrom && t < localToEpoch(b.visibleFrom, tz)) return false;
  if (b.visibleUntil && t >= localToEpoch(b.visibleUntil, tz) + 60_000) return false;
  return true;
}

/** Nächster Zeitpunkt, an dem sich die Sichtbarkeit eines Blocks ändert (für Cache-Ablauf). */
export function nextChange(blocks: { visibleFrom: string | null; visibleUntil: string | null }[], now: Date, tz: string): number | null {
  let next: number | null = null;
  for (const b of blocks) {
    for (const [v, add] of [[b.visibleFrom, 0], [b.visibleUntil, 60_000]] as const) {
      if (!v) continue;
      const e = localToEpoch(v, tz) + add;
      if (e > now.getTime() && (next === null || e < next)) next = e;
    }
  }
  return next;
}
