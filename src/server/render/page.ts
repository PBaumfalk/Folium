import crypto from 'node:crypto';
import { actionHref, SOCIAL_LABELS, type Block, type PageContent } from '../../shared/content.js';
import { FONTS, isBundledFont, type Theme } from '../../shared/theme.js';
import { isVisible } from '../lib/schedule.js';
import { BASE_CSS, fontFaces, themeCss } from './css.js';
import { esc, escLines } from './escape.js';
import { ICON_SVG } from './icons.gen.js';

export { themeCss } from './css.js';

/**
 * Einziges Skript der öffentlichen Seite: meldet Klicks per Beacon (ohne Cookie, ohne Kennung)
 * und blendet bei „Pille“ die Hauptaktion unten ein, sobald sie aus dem Bild scrollt.
 * Links funktionieren ohne dieses Skript vollständig.
 */
export const PAGE_SCRIPT =
  "(function(){var d=document,m=d.querySelector('meta[name=folium]');if(m){var p=m.content.split(':'),s=(location.search.match(/[?&]src=([a-z0-9-]{1,32})/)||[])[1]||'';d.addEventListener('click',function(e){var a=e.target&&e.target.closest?e.target.closest('a[data-b]'):null;if(!a||!navigator.sendBeacon)return;try{navigator.sendBeacon('/c',new Blob([JSON.stringify({p:+p[0],v:+p[1],b:a.getAttribute('data-b'),s:s})],{type:'text/plain'}))}catch(_){}},true)}var h=d.getElementById('haupt'),l=d.getElementById('leiste');if(h&&l&&'IntersectionObserver' in window){new IntersectionObserver(function(es){var e=es[0];l.classList.toggle('an',!e.isIntersecting&&e.boundingClientRect.top<0)}).observe(h)}})();";
export const PAGE_SCRIPT_HASH = `sha256-${crypto.createHash('sha256').update(PAGE_SCRIPT).digest('base64')}`;

export interface RenderInput {
  content: PageContent;
  theme: Theme;
  mode: 'public' | 'preview';
  now: Date;
  pageId: number;
  versionId: number;
  timezone: string;
  /** URL eines hochgeladenen Bildes in gewünschter Breite */
  assetUrl: (id: string, width: number) => string;
  /** URL einer mitgelieferten Schriftdatei */
  fontUrl: (file: string) => string;
  /** URL einer hochgeladenen Schrift */
  uploadFontUrl?: (id: string) => string;
  /** Absolute Adresse der Seite (für Open Graph) */
  canonicalUrl?: string;
  /** Hinweistext oben in der Vorschau */
  banner?: string;
}

const icon = (name: string, cls = 'i') => (ICON_SVG[name] ? `<svg class="${cls}" viewBox="0 0 24 24" aria-hidden="true" focusable="false">${ICON_SVG[name]}</svg>` : '');
const isExternal = (href: string) => /^https?:/.test(href);
const ACTION_ICON = { call: 'phone', email: 'mail', booking: 'calendar', contact: 'send' } as const;

function safeHref(fn: () => string): string | null {
  try {
    return fn();
  } catch {
    return null;
  }
}

function renderActions(actions: Extract<Block, { type: 'action' }>[], theme: Theme, first: boolean): string {
  const items = actions
    .map((a, i) => {
      const href = safeHref(() => actionHref(a.kind, a.value));
      if (!href) return '';
      const haupt = first && i === 0;
      const ic = icon(ACTION_ICON[a.kind]);
      const label = esc(a.label);
      if (haupt && theme.primaryAction === 'pill-sticky') {
        return `<a class="btn btn-haupt" id="haupt" href="${esc(href)}" data-b="${esc(a.id)}">${label}<span class="rund">${ic}</span></a>`;
      }
      return `<a class="btn ${haupt ? 'btn-haupt' : 'btn-neben'}"${haupt ? ' id="haupt"' : ''} href="${esc(href)}" data-b="${esc(a.id)}">${ic}${label}</a>`;
    })
    .join('');
  return items ? `<div class="aktionen">${items}</div>` : '';
}

function renderContact(b: Extract<Block, { type: 'contact' }>): string {
  const rows: string[] = [];
  if (b.phone) {
    const href = safeHref(() => actionHref('call', b.phone!));
    rows.push(`<li>${icon('phone')}${href ? `<a href="${esc(href)}" data-b="${esc(b.id)}">${esc(b.phone)}</a>` : esc(b.phone)}</li>`);
  }
  if (b.email) {
    const href = safeHref(() => actionHref('email', b.email!));
    rows.push(`<li>${icon('mail')}${href ? `<a href="${esc(href)}" data-b="${esc(b.id)}">${esc(b.email)}</a>` : esc(b.email)}</li>`);
  }
  if (b.hours) rows.push(`<li>${icon('clock')}<span>${esc(b.hours)}</span></li>`);
  return rows.length ? `<ul class="kontakt">${rows.join('')}</ul>` : '';
}

function renderLink(b: Extract<Block, { type: 'link' }>, input: RenderInput, asTile: boolean): string {
  const ext = isExternal(b.url);
  if (asTile && b.imageAssetId) {
    return `<li><a class="link kachel" href="${esc(b.url)}" data-b="${esc(b.id)}"><img src="${esc(input.assetUrl(b.imageAssetId, 800))}" alt="" loading="lazy" decoding="async"><span class="k"><span class="t">${esc(b.title)}</span>${b.description ? `<span class="b">${esc(b.description)}</span>` : ''}</span></a></li>`;
  }
  return `<li><a class="link" href="${esc(b.url)}" data-b="${esc(b.id)}"${ext ? '' : ''}><span class="sym">${icon(b.icon ?? (ext ? 'link' : b.url.startsWith('tel:') ? 'phone' : 'mail'))}</span><span class="t">${esc(b.title)}</span>${b.description ? `<span class="b">${esc(b.description)}</span>` : ''}${icon(ext ? 'arrow-up-right' : 'chevron-right', 'i pfeil')}</a></li>`;
}

function renderBlocks(blocks: Block[], input: RenderInput, state: { primaryUsed: boolean }): string {
  const out: string[] = [];
  let i = 0;
  const tiles = input.theme.linkLayout === 'tiles';
  while (i < blocks.length) {
    const b = blocks[i];
    if (b.type === 'link') {
      // Aufeinanderfolgende Links bilden eine Liste; Bildkacheln stehen davor im Raster
      const group: Extract<Block, { type: 'link' }>[] = [];
      while (i < blocks.length && blocks[i].type === 'link') group.push(blocks[i++] as Extract<Block, { type: 'link' }>);
      const withImg = tiles ? group.filter((g) => g.imageAssetId) : [];
      const rest = tiles ? group.filter((g) => !g.imageAssetId) : group;
      if (withImg.length) out.push(`<ul class="kacheln">${withImg.map((g) => renderLink(g, input, true)).join('')}</ul>`);
      if (rest.length) out.push(`<ul class="liste">${rest.map((g) => renderLink(g, input, false)).join('')}</ul>`);
      continue;
    }
    if (b.type === 'location') {
      const group: Extract<Block, { type: 'location' }>[] = [];
      while (i < blocks.length && blocks[i].type === 'location') group.push(blocks[i++] as Extract<Block, { type: 'location' }>);
      out.push(
        `<div class="orte">${group
          .map(
            (l) =>
              `<div class="ort"><h3>${esc(l.name)}</h3>${l.role ? `<p class="rolle">${esc(l.role)}</p>` : ''}<address>${escLines(l.address)}</address>${l.note ? `<p class="notiz">${esc(l.note)}</p>` : ''}${l.routeUrl ? `<a href="${esc(l.routeUrl)}" data-b="${esc(l.id)}">${icon('navigation')}Route planen</a>` : ''}</div>`,
          )
          .join('')}</div>`,
      );
      continue;
    }
    if (b.type === 'action') {
      const group: Extract<Block, { type: 'action' }>[] = [];
      while (i < blocks.length && blocks[i].type === 'action') group.push(blocks[i++] as Extract<Block, { type: 'action' }>);
      out.push(renderActions(group, input.theme, !state.primaryUsed));
      state.primaryUsed = true;
      continue;
    }
    i++;
    if (b.type === 'contact') out.push(renderContact(b));
    else if (b.type === 'text') out.push(`<div class="text">${b.text.split(/\n{2,}/).map((p) => `<p>${escLines(p)}</p>`).join('')}</div>`);
    else if (b.type === 'social') {
      out.push(`<ul class="social">${b.items.map((s) => `<li><a href="${esc(s.url)}" data-b="${esc(b.id)}" rel="me noopener">${icon(s.network === 'website' ? 'globe' : 'link')}${esc(SOCIAL_LABELS[s.network])}</a></li>`).join('')}</ul>`);
    }
  }
  return out.join('');
}

/** Teilt die Blöcke an Überschriften in Abschnitte. */
function sections(blocks: Block[], input: RenderInput, state: { primaryUsed: boolean }): string {
  const groups: { heading: Extract<Block, { type: 'heading' }> | null; blocks: Block[] }[] = [];
  let cur: (typeof groups)[number] = { heading: null, blocks: [] };
  for (const b of blocks) {
    if (b.type === 'heading') {
      if (cur.heading || cur.blocks.length) groups.push(cur);
      cur = { heading: b, blocks: [] };
    } else cur.blocks.push(b);
  }
  if (cur.heading || cur.blocks.length) groups.push(cur);
  let bandUsed = false;
  return groups
    .map((g, gi) => {
      const hid = g.heading ? `h-${esc(g.heading.id)}` : '';
      const band = input.theme.sectionBand && !bandUsed && g.heading && g.blocks.some((b) => b.type === 'link');
      if (band) bandUsed = true;
      const wide = !band && g.blocks.some((b) => b.type === 'location') && g.blocks.filter((b) => b.type === 'location').length > 1;
      const cls = [band ? 'band' : '', wide ? 'breit' : ''].filter(Boolean).join(' ');
      return `<section${cls ? ` class="${cls}"` : ''}${g.heading ? ` aria-labelledby="${hid}"` : gi === 0 ? '' : ''}>${g.heading ? `<h2 id="${hid}">${esc(g.heading.text)}</h2>` : ''}${renderBlocks(g.blocks, input, state)}</section>`;
    })
    .join('');
}

export function renderPage(input: RenderInput): string {
  const { content: c, theme } = input;
  const visible = c.blocks.filter((b) => isVisible(b, input.now, input.timezone));
  const p = c.profile;

  // Führende Hauptaktionen (und eine direkt folgende Kontaktzeile) gehören in den Kopf
  let k = 0;
  const lead: Extract<Block, { type: 'action' }>[] = [];
  while (k < visible.length && visible[k].type === 'action') lead.push(visible[k++] as Extract<Block, { type: 'action' }>);
  const leadContact = lead.length && visible[k]?.type === 'contact' ? (visible[k++] as Extract<Block, { type: 'contact' }>) : null;
  const rest = visible.slice(k);

  const cover = p.coverAssetId;
  const layout = theme.header.layout === 'photo-top' && cover ? 'foto-oben' : theme.header.layout === 'photo-side' && cover ? 'foto-seite' : 'text';
  const bodyCls = [`kopf-${layout}`, `links-${theme.linkLayout}`, `cards-${theme.cards.style}`, theme.buttons.style === 'outline' ? 'btn-outline' : 'btn-solid', theme.primaryAction === 'pill-sticky' ? 'haupt-pill' : 'haupt-knopf'].join(' ');

  const logo = p.logoAssetId ? `<img class="logo ${theme.header.logoSize}" src="${esc(input.assetUrl(p.logoAssetId, 400))}" alt="${esc(p.name)}">` : '';
  const avatar = p.avatarAssetId && layout === 'text' ? `<img class="avatar" src="${esc(input.assetUrl(p.avatarAssetId, 400))}" alt="" width="96" height="96">` : '';
  const longest = Math.max(0, ...p.name.split(/\s+/).map((w) => w.length));
  const title = `<h1${longest > 13 ? ' class="lang"' : ''}>${esc(p.name)}</h1>`;
  const claim = p.tagline ? `<p class="claim">${esc(p.tagline)}</p>` : '';
  const details = p.details.length ? `<ul class="details">${p.details.map((d) => `<li>${esc(d)}</li>`).join('')}</ul>` : '';
  const actions = lead.length ? renderActions(lead, theme, true) : '';
  const contact = leadContact ? renderContact(leadContact) : '';

  let header: string;
  let mainTop = '';
  if (layout === 'foto-oben') {
    header = `<header class="kopf"><img class="cover" src="${esc(input.assetUrl(cover!, 1600))}" alt="" fetchpriority="high">${logo}<div class="ueber">${title}${claim}${details}</div></header>`;
    mainTop = `${actions}${contact}`;
  } else if (layout === 'foto-seite') {
    header = `<header class="kopf"><div class="kopf-text">${logo}${title}${claim}${details}${actions}${contact}</div><div class="kopf-foto"><img src="${esc(input.assetUrl(cover!, 1200))}" alt="" fetchpriority="high"></div></header>`;
  } else {
    header = `<header class="kopf">${logo}${avatar}${title}${claim}${details}${actions}${contact}</header>`;
  }

  const sticky =
    theme.primaryAction === 'pill-sticky' && lead[0]
      ? (() => {
          const href = safeHref(() => actionHref(lead[0].kind, lead[0].value));
          return href ? `<div class="leiste" id="leiste" aria-hidden="true"><a class="btn btn-haupt" href="${esc(href)}" tabindex="-1" data-b="${esc(lead[0].id)}">${esc(lead[0].label)}<span class="rund">${icon(ACTION_ICON[lead[0].kind])}</span></a></div>` : '';
        })()
      : '';

  const legal = [
    c.legal.imprintUrl ? `<a href="${esc(c.legal.imprintUrl)}">Impressum</a>` : '',
    c.legal.privacyUrl ? `<a href="${esc(c.legal.privacyUrl)}">Datenschutz</a>` : '',
  ].join('');
  const docTitle = c.meta.title || p.name;
  const desc = c.meta.description || p.tagline;
  const noindex = c.meta.noindex || input.mode === 'preview';
  const headingFont = theme.fonts.heading;
  const preload = isBundledFont(headingFont) && FONTS[headingFont].files[0].format === 'woff2' ? `<link rel="preload" href="${esc(input.fontUrl(FONTS[headingFont].files[0].file))}" as="font" type="font/woff2" crossorigin>` : '';
  const ogImg = cover ?? p.logoAssetId;
  const og = input.canonicalUrl
    ? `<link rel="canonical" href="${esc(input.canonicalUrl)}"><meta property="og:type" content="website"><meta property="og:url" content="${esc(input.canonicalUrl)}"><meta property="og:title" content="${esc(docTitle)}">${desc ? `<meta property="og:description" content="${esc(desc)}">` : ''}${ogImg ? `<meta property="og:image" content="${esc(new URL(input.assetUrl(ogImg, 1200), input.canonicalUrl).toString())}">` : ''}`
    : '';

  return `<!doctype html>
<html lang="de">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>${esc(docTitle)}</title>
${desc ? `<meta name="description" content="${esc(desc)}">` : ''}
${noindex ? '<meta name="robots" content="noindex, nofollow">' : ''}
<meta name="theme-color" content="${theme.colors.background}">
${input.mode === 'preview' ? '<base target="_blank">' : ''}
${input.mode === 'public' ? `<meta name="folium" content="${input.pageId}:${input.versionId}">` : ''}
${og}
${preload}
<style>${fontFaces(theme, input.fontUrl, input.uploadFontUrl ?? ((id) => input.assetUrl(id, 0)))}${themeCss(theme)}${BASE_CSS}</style>
</head>
<body class="${bodyCls}">
<a class="skip" href="#inhalt">Zum Inhalt springen</a>
${input.mode === 'preview' && input.banner !== '' ? `<div class="vorschau" role="status">${esc(input.banner ?? 'Vorschau – nicht veröffentlicht')}</div>` : ''}
<div class="seite">
${header}
<main id="inhalt" class="inhalt">${mainTop}${sections(rest, input, { primaryUsed: lead.length > 0 })}</main>
<footer><span>© ${esc(p.name)}</span><span class="recht">${legal}</span></footer>
</div>
${sticky}
${input.mode === 'public' ? `<script>${PAGE_SCRIPT}</script>` : ''}
</body>
</html>`;
}
