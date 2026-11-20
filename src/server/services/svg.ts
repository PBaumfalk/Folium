/**
 * Strenge Allowlist-Bereinigung für SVG-Logos. Alles, was nicht ausdrücklich erlaubt ist,
 * fällt weg: Skripte, Ereignisattribute, eingebettete fremde Inhalte, externe Verweise.
 */

const ELEMENTS = new Set([
  'svg', 'g', 'path', 'rect', 'circle', 'ellipse', 'line', 'polyline', 'polygon', 'defs', 'lineargradient', 'radialgradient', 'stop',
  'title', 'desc', 'clippath', 'mask', 'use', 'symbol', 'text', 'tspan',
]);

const ATTRS = new Set([
  'xmlns', 'xmlns:xlink', 'version', 'viewbox', 'width', 'height', 'x', 'y', 'x1', 'y1', 'x2', 'y2', 'cx', 'cy', 'r', 'rx', 'ry', 'd', 'points',
  'fill', 'fill-opacity', 'fill-rule', 'stroke', 'stroke-width', 'stroke-opacity', 'stroke-linecap', 'stroke-linejoin', 'stroke-miterlimit', 'stroke-dasharray',
  'stroke-dashoffset', 'opacity', 'transform', 'clip-path', 'clip-rule', 'mask', 'id', 'class', 'offset', 'stop-color', 'stop-opacity', 'gradientunits',
  'gradienttransform', 'spreadmethod', 'fx', 'fy', 'preserveaspectratio', 'role', 'aria-label', 'aria-hidden', 'font-family', 'font-size', 'font-weight',
  'font-style', 'text-anchor', 'letter-spacing', 'dominant-baseline', 'href', 'xlink:href', 'clippathunits', 'maskunits', 'vector-effect', 'shape-rendering',
]);

const escText = (s: string) => s.replace(/&(?!(amp|lt|gt|quot|apos|#\d+|#x[0-9a-f]+);)/gi, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const escAttr = (s: string) => s.replace(/&(?!(amp|lt|gt|quot|apos|#\d+|#x[0-9a-f]+);)/gi, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');

function safeValue(name: string, value: string): boolean {
  const v = value.replace(/&#x?[0-9a-f]+;?/gi, '').toLowerCase();
  if (/javascript:|data:|vbscript:|<|expression\(/.test(v)) return false;
  if (name === 'href' || name === 'xlink:href') return /^#[\w-]+$/.test(value.trim());
  if (v.includes('url(')) return /^\s*url\(\s*#[\w-]+\s*\)\s*$/.test(v);
  return true;
}

export class SvgError extends Error {}

export function sanitizeSvg(input: string): string {
  let s = input.replace(/^﻿/, '');
  s = s.replace(/<!--[\s\S]*?-->/g, '').replace(/<!\[CDATA\[[\s\S]*?\]\]>/g, '').replace(/<\?[\s\S]*?\?>/g, '').replace(/<!DOCTYPE[\s\S]*?>/gi, '');
  if (!/^\s*<svg[\s>]/i.test(s)) throw new SvgError('Die Datei ist kein SVG-Bild.');
  const out: string[] = [];
  const stack: string[] = [];
  let skip = 0; // Tiefe innerhalb verworfener Elemente
  const tagRe = /<(\/?)([a-zA-Z][\w:.-]*)((?:\s+[^\s=/>]+(?:\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+))?)*)\s*(\/?)>/g;
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = tagRe.exec(s))) {
    const textBetween = s.slice(last, m.index);
    last = tagRe.lastIndex;
    const top = stack.at(-1);
    if (!skip && textBetween.trim() && top && ['text', 'tspan', 'title', 'desc'].includes(top)) out.push(escText(textBetween));
    const [, closing, rawName, rawAttrs, selfClose] = m;
    const name = rawName.toLowerCase();
    if (closing) {
      if (skip) {
        if (stack.at(-1) === name) {
          stack.pop();
          skip--;
        }
        continue;
      }
      if (stack.at(-1) === name) {
        stack.pop();
        if (ELEMENTS.has(name)) out.push(`</${rawName}>`);
      }
      continue;
    }
    const allowed = ELEMENTS.has(name) && !skip;
    if (!allowed) {
      if (!selfClose) {
        stack.push(name);
        skip++;
      }
      continue;
    }
    const attrs: string[] = [];
    const attrRe = /([^\s=/>]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+)))?/g;
    let a: RegExpExecArray | null;
    while ((a = attrRe.exec(rawAttrs))) {
      const an = a[1].toLowerCase();
      const val = a[2] ?? a[3] ?? a[4] ?? '';
      if (!ATTRS.has(an) || an.startsWith('on')) continue;
      if (!safeValue(an, val)) continue;
      attrs.push(`${a[1]}="${escAttr(val)}"`);
    }
    out.push(`<${rawName}${attrs.length ? ' ' + attrs.join(' ') : ''}${selfClose ? '/' : ''}>`);
    if (!selfClose) stack.push(name);
  }
  const result = out.join('');
  if (!/^<svg[\s>]/i.test(result)) throw new SvgError('Die Datei ist kein gültiges SVG-Bild.');
  return result.endsWith('</svg>') ? result : `${result}</svg>`;
}
