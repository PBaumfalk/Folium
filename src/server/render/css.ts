import { FONTS, isBundledFont, type Theme } from '../../shared/theme.js';

const RADIUS = { square: '0px', soft: '6px', round: '14px', pill: '999px' } as const;
const DENSITY = { compact: '0.82', normal: '1', airy: '1.22' } as const;

export function fontFamily(id: string): string {
  if (isBundledFont(id)) return `"${FONTS[id].family}", ${FONTS[id].fallback}`;
  return `"Eigene ${id.slice(7, 15)}", system-ui, sans-serif`;
}

/** @font-face-Regeln für die verwendeten Schriften (nur lokale Dateien). */
export function fontFaces(theme: Theme, fontUrl: (file: string) => string, uploadUrl: (id: string) => string): string {
  const ids = [...new Set([theme.fonts.heading, theme.fonts.body])];
  return ids
    .map((id) => {
      if (isBundledFont(id)) {
        return FONTS[id].files
          .map((f) => `@font-face{font-family:"${FONTS[id].family}";src:url(${fontUrl(f.file)}) format("${f.format}");font-weight:${f.weight};font-style:${f.style};font-display:swap}`)
          .join('');
      }
      const assetId = id.slice(7);
      return `@font-face{font-family:"Eigene ${assetId.slice(0, 8)}";src:url(${uploadUrl(assetId)});font-weight:100 900;font-display:swap}`;
    })
    .join('');
}

/** CSS-Variablen aus dem validierten Theme. Es fließen nur geprüfte Werte ein (Hex, Aufzählungen, Zahlen). */
export function themeCss(t: Theme): string {
  const c = t.colors;
  return `:root{--bg:${c.background};--surface:${c.surface};--text:${c.text};--muted:${c.muted};--accent:${c.accent};--on-accent:${c.onAccent};--border:${c.border};--font-h:${fontFamily(t.fonts.heading)};--font-b:${fontFamily(t.fonts.body)};--r-btn:${RADIUS[t.buttons.shape]};--r-card:${Math.max(0, Math.min(28, t.cards.radius))}px;--d:${DENSITY[t.density]}}`;
}

/** Feste Grundgestaltung aller Linkseiten; Varianten über Klassen am body. */
export const BASE_CSS = `
*,*::before,*::after{box-sizing:border-box}
html{-webkit-text-size-adjust:100%;text-size-adjust:100%}
body{margin:0;background:var(--bg);color:var(--text);font:400 16px/1.55 var(--font-b);-webkit-font-smoothing:antialiased;text-rendering:optimizeLegibility}
img{max-width:100%;display:block}
a{color:inherit}
:focus-visible{outline:3px solid var(--accent);outline-offset:3px;border-radius:4px}
.skip{position:absolute;left:8px;top:-60px;z-index:20;background:var(--text);color:var(--bg);padding:10px 14px;border-radius:6px;font-weight:600}
.skip:focus{top:8px}
.vorschau{position:sticky;top:0;z-index:30;background:#FFF3C4;color:#5C4500;font:600 13px/1.3 system-ui,sans-serif;text-align:center;padding:7px 12px;border-bottom:1px solid #E8D68A}
.i{width:20px;height:20px;flex:none;fill:none;stroke:currentColor;stroke-width:1.8;stroke-linecap:round;stroke-linejoin:round}
.seite{--rand:clamp(20px,5vw,56px);max-width:1180px;margin:0 auto;padding:calc(28px*var(--d)) var(--rand) 32px;display:grid;grid-template-columns:minmax(0,1fr);gap:calc(40px*var(--d))}
h1,h2,h3{font-family:var(--font-h);margin:0;font-weight:600;letter-spacing:-.01em}
.logo{height:auto;margin:0 0 calc(26px*var(--d))}
.logo.S{width:96px}.logo.M{width:132px}.logo.L{width:168px}
.avatar{width:96px;height:96px;border-radius:50%;object-fit:cover;margin:0 0 18px}
.kopf{min-width:0}
.kopf h1{font-size:clamp(32px,8.6vw,58px);line-height:1.04;margin:0 0 14px;font-weight:500;letter-spacing:-.02em;text-wrap:balance;overflow-wrap:break-word}
.kopf h1.lang{font-size:clamp(26px,7.2vw,50px)}
.kopf h1{overflow-wrap:anywhere}
.kopf-foto-seite .kopf h1.lang,.kopf-foto-oben .ueber h1.lang{font-size:clamp(26px,7vw,44px)}
.claim{font-size:18px;line-height:1.45;margin:0 0 8px;max-width:34ch}
.details{list-style:none;margin:0 0 calc(24px*var(--d));padding:0;color:var(--muted);font-size:15px;line-height:1.5}
.aktionen{display:grid;grid-template-columns:1fr 1fr;gap:10px;max-width:440px;margin:0 0 4px}
.btn{display:flex;align-items:center;justify-content:center;gap:10px;min-height:52px;padding:12px 16px;border-radius:var(--r-btn);font:600 16px/1.2 var(--font-b);text-decoration:none;text-align:center;border:1.5px solid var(--text);background:transparent;color:var(--text);transition:background .15s,color .15s,transform .1s}
.btn:active{transform:translateY(1px)}
.btn-neben:hover{background:var(--text);color:var(--bg)}
.btn-haupt{grid-column:1/-1;min-height:58px;font-size:17px;background:var(--accent);border-color:var(--accent);color:var(--on-accent)}
.btn-haupt:hover{filter:brightness(.92)}
.btn-outline .btn-haupt{background:transparent;color:var(--text);border-color:var(--accent);border-width:2px}
.aktionen .btn:only-child{grid-column:1/-1}
.aktionen .btn-neben:last-child:nth-child(even){grid-column:1/-1}
.kontakt{list-style:none;margin:14px 0 0;padding:0;display:grid;gap:8px;font-size:15px;color:var(--muted)}
.kontakt li{display:flex;gap:10px;align-items:flex-start}
.kontakt .i{width:18px;height:18px;margin-top:2px}
.kontakt a{color:var(--text);text-underline-offset:3px}
section{min-width:0}
section+section,.inhalt>.aktionen+section,.inhalt>.kontakt+section{margin-top:calc(36px*var(--d))}
h2{font-size:22px;line-height:1.2;margin:0 0 10px;font-weight:600}
.liste{list-style:none;margin:0;padding:0}
.links-list .liste>li>a.link{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:2px 14px;align-items:center;padding:calc(17px*var(--d)) 2px;text-decoration:none;border-bottom:1px solid var(--border)}
.links-list .liste>li:first-child>a.link{border-top:1px solid var(--border)}
.link .t{font:500 21px/1.22 var(--font-h)}
.link .b{font-size:15px;color:var(--muted);line-height:1.45}
.link .t,.link .b{overflow-wrap:break-word;min-width:0}
.links-list .link .t,.links-list .link .b{grid-column:1}
.links-list .link .sym{display:none}
.links-list .link .pfeil{grid-column:2}
.links-cards .link .t,.links-cards .link .b,.links-tiles .link .t,.links-tiles .link .b{grid-column:2}
.links-cards .link .sym,.links-tiles .link .sym{grid-row:1/span 2;grid-column:1}
.links-cards .link .pfeil,.links-tiles .link .pfeil{grid-column:3}
.link .pfeil{grid-row:1/span 2;color:var(--muted);transition:transform .2s,color .2s}
.link:hover .t{color:var(--accent)}
.link:hover .pfeil{color:var(--accent);transform:translateX(3px)}
.links-cards .liste,.links-tiles .liste{display:grid;gap:10px}
.links-cards a.link,.links-tiles a.link:not(.kachel){display:grid;grid-template-columns:auto minmax(0,1fr) auto;gap:2px 14px;align-items:center;padding:calc(15px*var(--d)) 16px;background:var(--surface);border-radius:var(--r-card);text-decoration:none;border:1px solid transparent}
.links-cards a.link:hover,.links-tiles a.link:not(.kachel):hover{border-color:var(--text)}
.links-cards .link .t,.links-tiles .link .t{font:650 17px/1.25 var(--font-b)}
.links-cards .link .sym,.links-tiles .link .sym{display:grid;place-items:center;width:42px;height:42px;border-radius:calc(var(--r-card)*.6);background:var(--bg);color:var(--text)}
.links-cards .link:hover .t,.links-tiles .link:hover .t{color:inherit}
.kacheln{display:grid;grid-template-columns:1fr 1fr;gap:10px;list-style:none;margin:0 0 10px;padding:0}
.kachel{position:relative;display:block;aspect-ratio:4/5;border-radius:var(--r-card);overflow:hidden;text-decoration:none;color:#fff;background:var(--text)}
.kachel img{width:100%;height:100%;object-fit:cover;transition:transform .5s cubic-bezier(.2,.7,.2,1)}
.kachel::after{content:"";position:absolute;inset:0;background:linear-gradient(180deg,rgba(0,0,0,0) 25%,rgba(0,0,0,.55) 55%,rgba(0,0,0,.86))}
.kachel .k{position:absolute;left:14px;right:14px;bottom:14px;z-index:1}
.kachel .t{display:block;font:700 21px/1.08 var(--font-h);margin-bottom:4px;color:#fff}
.kachel .b{display:-webkit-box;-webkit-line-clamp:3;-webkit-box-orient:vertical;overflow:hidden;font-size:13px;line-height:1.35;color:rgba(255,255,255,.92)}
.kachel:hover img{transform:scale(1.04)}
.orte{display:grid;gap:12px}
.ort{background:var(--surface);border-radius:var(--r-card);padding:calc(20px*var(--d)) 20px 18px}
.cards-line .ort{border:1px solid var(--border)}
.ort h3{font-size:24px;line-height:1.1;margin:0 0 2px;font-weight:600}
.ort .rolle{font-size:14px;color:var(--muted);margin:0 0 12px}
.ort address{font-style:normal;margin:0 0 10px;line-height:1.45}
.ort .notiz{font-size:14px;color:var(--muted);margin:0 0 12px}
.ort a{display:inline-flex;gap:8px;align-items:center;font-weight:600;color:var(--text);text-decoration-color:var(--accent);text-decoration-thickness:2px;text-underline-offset:4px}
.ort a .i{width:17px;height:17px}
.text{max-width:62ch;margin:0 0 10px}
.text p{margin:0 0 .7em}
.social{list-style:none;margin:0;padding:0;display:flex;flex-wrap:wrap;gap:8px}
.social a{display:inline-flex;align-items:center;gap:8px;min-height:44px;padding:8px 16px;border-radius:var(--r-btn);border:1.5px solid var(--border);text-decoration:none;font-weight:600;font-size:15px;background:var(--surface)}
.social a:hover{border-color:var(--text)}
.social .i{width:17px;height:17px}
.band{min-width:0;background:var(--accent);color:var(--on-accent);border-radius:var(--r-card);padding:calc(24px*var(--d)) 20px}
.band h2{color:var(--on-accent)}
.band a.link{background:rgba(0,0,0,.16)!important;color:var(--on-accent)!important;border-bottom:0!important;border-top:0!important;border-radius:var(--r-card);padding:16px!important;margin-bottom:8px}
.band .link .b,.band .link .pfeil{color:var(--on-accent);opacity:.88}
.band .link .sym{background:rgba(255,255,255,.14)!important;color:var(--on-accent)!important}
.band .link:hover .t{color:var(--on-accent)}
footer{display:flex;flex-wrap:wrap;gap:6px 22px;align-items:center;padding-top:22px;border-top:1px solid var(--border);font-size:14px;color:var(--muted)}
footer .recht{display:flex;gap:20px}
footer a{color:var(--text);text-underline-offset:3px;min-height:32px;display:inline-flex;align-items:center}
.leiste{display:none}
/* Kopf: Foto oben */
.kopf-foto-oben .seite{padding-top:0;gap:0}
.kopf-foto-oben .kopf{position:relative;margin:0 calc(-1*var(--rand));height:min(62svh,560px);overflow:hidden;border-radius:0 0 calc(var(--r-card)*1.3) calc(var(--r-card)*1.3);background:var(--text)}
.kopf-foto-oben .kopf .cover{width:100%;height:100%;object-fit:cover;object-position:50% 22%}
.kopf-foto-oben .kopf::after{content:"";position:absolute;inset:0;background:linear-gradient(180deg,rgba(0,0,0,.45) 0%,rgba(0,0,0,0) 26%,rgba(0,0,0,0) 48%,rgba(0,0,0,.82) 100%)}
.kopf-foto-oben .ueber{position:absolute;left:var(--rand);right:var(--rand);bottom:26px;z-index:2;color:#fff}
.kopf-foto-oben .ueber h1{color:#fff;font-weight:700;font-size:clamp(30px,8.4vw,60px);line-height:1;margin-bottom:10px}
.kopf-foto-oben .ueber .claim{color:rgba(255,255,255,.92);margin:0;font-size:16px}
.kopf-foto-oben .ueber .details{color:rgba(255,255,255,.8);margin:6px 0 0}
.kopf-foto-oben .kopf .logo{position:absolute;top:22px;left:var(--rand);z-index:2;filter:brightness(0) invert(1)}
.kopf-foto-oben .inhalt{padding-top:24px;max-width:560px;width:100%;margin:0 auto;display:grid;gap:0}
.kopf-foto-oben .seite>footer{max-width:560px;width:100%;margin:40px auto 0}
.haupt-pill .btn-haupt{justify-content:space-between;border-radius:999px;padding:10px 10px 10px 26px;min-height:68px;font:700 19px/1.1 var(--font-h);box-shadow:0 10px 30px -14px rgba(0,0,0,.45)}
.haupt-pill .btn-haupt .rund{display:grid;place-items:center;width:48px;height:48px;border-radius:50%;background:var(--text);color:var(--accent)}
.haupt-pill .btn-haupt>.i{display:none}
.haupt-pill .aktionen{max-width:none;display:flex;flex-wrap:wrap}
.haupt-pill .aktionen .btn-haupt{flex:1 1 100%}
.haupt-pill .aktionen .btn-neben{flex:1 1 0;min-width:0}
.haupt-pill .aktionen .btn-neben{flex-direction:column;gap:6px;min-height:72px;border:0;background:var(--surface);border-radius:var(--r-card);font-size:14px;grid-column:auto}
.haupt-pill .aktionen .btn-neben:hover{background:var(--surface);box-shadow:inset 0 0 0 1.5px var(--text);color:var(--text)}
.haupt-pill .leiste{display:block;position:fixed;left:12px;right:12px;bottom:max(12px,env(safe-area-inset-bottom));z-index:10;transform:translateY(160%);transition:transform .3s cubic-bezier(.2,.7,.2,1)}
.haupt-pill .leiste.an{transform:none}
.haupt-pill .leiste .btn-haupt{min-height:60px;font-size:17px}
/* Kopf: Foto seitlich */
.kopf-foto-seite .kopf{display:grid;gap:26px;grid-template-columns:minmax(0,1fr)}
.kopf-text{min-width:0}
.kopf-foto-seite .kopf-foto{border-radius:var(--r-card);overflow:hidden;aspect-ratio:3/2;background:var(--border)}
.kopf-foto-seite .kopf-foto img{width:100%;height:100%;object-fit:cover;object-position:60% 25%}
.kopf-foto-seite .kopf h1{font-weight:700;font-size:clamp(30px,8vw,48px);line-height:1.12;letter-spacing:-.01em}
.kopf-foto-seite .aktionen{grid-template-columns:1fr}
.kopf-foto-seite .btn{font-weight:700;border-width:2px}
.kopf-foto-seite .btn-neben{border-color:var(--accent);background:var(--surface);color:var(--text)}
.kopf-foto-seite .btn-neben:hover{background:var(--accent);color:var(--on-accent)}
@media (min-width:920px){
  .kopf-text .seite{grid-template-columns:minmax(0,5fr) minmax(0,6fr);gap:40px clamp(56px,7vw,112px);padding-top:72px;align-items:start}
  .kopf-text .kopf{position:sticky;top:56px}
  .kopf-text .kopf h1{font-size:clamp(42px,4.2vw,62px)}
  .kopf-text .kopf h1.lang{font-size:clamp(36px,3.1vw,48px)}
  .kopf-text .seite>footer{grid-column:1/-1}
  .orte{grid-template-columns:1fr 1fr}
  .kopf-foto-oben .seite{max-width:none;padding:0;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:0}
  .kopf-foto-oben .kopf{position:sticky;top:0;height:100vh;margin:0;border-radius:0 calc(var(--r-card)*1.3) calc(var(--r-card)*1.3) 0;grid-row:1/span 2}
  .kopf-foto-oben .kopf .logo{top:40px;left:44px}
  .kopf-foto-oben .ueber{left:44px;right:44px;bottom:48px}
  .kopf-foto-oben .inhalt{padding:72px 48px 0;align-self:start}
  .kopf-foto-oben .seite>footer{margin:40px 48px 40px;width:auto;max-width:560px;justify-self:center}
  .haupt-pill .leiste{display:none}
  .kopf-foto-seite .kopf{grid-template-columns:minmax(0,1fr) minmax(0,1fr);align-items:center;gap:56px}
  .kopf-foto-seite .kopf-foto{aspect-ratio:4/3.4}
  .kopf-foto-seite .inhalt{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:36px 56px;align-items:start}
  .kopf-foto-seite .inhalt>section{margin:0}
  .kopf-foto-seite .inhalt>section.band,.kopf-foto-seite .inhalt>section.breit{grid-column:1/-1}
  .kopf-foto-seite .band .liste{display:grid;grid-template-columns:1fr 1fr;gap:10px}
  .kopf-foto-seite .band a.link{margin:0}
}
@media (prefers-reduced-motion:reduce){*{transition:none!important;animation:none!important}}
@media print{.leiste,.skip,.vorschau{display:none}}
`;
