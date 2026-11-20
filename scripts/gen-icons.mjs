// Erzeugt src/server/render/icons.gen.ts aus lucide-react (gleiche Symbole wie in der Verwaltung).
import fs from 'node:fs';
const names = ['phone','mail','calendar','map-pin','scale','gavel','briefcase','file-text','book-open','globe','users','message-circle','download','info','shield-check','link','star','video','newspaper','clock','building','euro','arrow-up-right','chevron-right','calendar-check','send','navigation'];
const out = {};
for (const n of names) {
  const mod = await import(`../node_modules/lucide-react/dist/esm/icons/${n}.mjs`).catch(() => null);
  const node = mod?.__iconData?.node;
  if (!node) throw new Error('kein Symbol ' + n);
  out[n] = node.map(([tag, attrs]) => {
    const a = Object.entries(attrs).filter(([k]) => k !== 'key').map(([k, v]) => `${k}="${v}"`).join(' ');
    return `<${tag} ${a}/>`;
  }).join('');
}
fs.writeFileSync('src/server/render/icons.gen.ts', `// Automatisch erzeugt von scripts/gen-icons.mjs aus lucide-react (ISC-Lizenz). Nicht von Hand ändern.\nexport const ICON_SVG: Record<string, string> = ${JSON.stringify(out, null, 1)};\n`);
console.log(Object.keys(out).length, 'Symbole');
