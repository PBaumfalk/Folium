import { newBlockId, type Block, type PageContent } from '../../shared/content.js';
import type { Settings } from './settings.js';

/**
 * Vorlagen für neue Seiten. Sie enthalten erfundene Beispieldaten („Muster & Partner“), die nach dem
 * Anlegen ersetzt werden. Links zeigen auf die Homepage aus den Einstellungen, sonst auf example.com.
 */
export type TemplateId = 'organisation' | 'person' | 'standort' | 'kampagne' | 'leer';
export const TEMPLATE_IDS = ['organisation', 'person', 'standort', 'kampagne', 'leer'] as const;

const base = { enabled: true, visibleFrom: null, visibleUntil: null };
const b = <T extends Omit<Block, 'id' | 'enabled' | 'visibleFrom' | 'visibleUntil'>>(x: T) => ({ id: newBlockId(), ...base, ...x }) as unknown as Block;

function blocks(t: TemplateId, hp: string): Block[] {
  const u = (p: string) => `${hp}${p}`;
  const call = () => b({ type: 'action', kind: 'call', label: 'Anrufen: 030 123 456 70', value: '+493012345670' });
  const mail = () => b({ type: 'action', kind: 'email', label: 'E-Mail schreiben', value: 'info@example.com' });
  const contactForm = () => b({ type: 'action', kind: 'contact', label: 'Termin anfragen', value: u('/kontakt/') });
  const hours = () => b({ type: 'contact', phone: null, email: null, hours: 'Mo.–Fr. 9–17 Uhr, Termine nach Vereinbarung' });
  const main = () => b({ type: 'location', name: 'Musterstadt', role: 'Hauptsitz', address: 'Musterstraße 1\n12345 Musterstadt', routeUrl: 'https://www.openstreetmap.org/search?query=Musterstra%C3%9Fe%201%2012345%20Musterstadt', note: 'Fünf Minuten zu Fuß vom Bahnhof, Parkplätze im Hof.' });
  const branch = () => b({ type: 'location', name: 'Beispielhausen', role: 'Zweigstelle', address: 'Am Markt 2\n54321 Beispielhausen', routeUrl: 'https://www.openstreetmap.org/search?query=Am%20Markt%202%2054321%20Beispielhausen', note: 'Barrierefreier Zugang über den Hof.' });
  switch (t) {
    case 'organisation':
      return [
        call(),
        contactForm(),
        mail(),
        hours(),
        b({ type: 'heading', text: 'Wobei wir helfen' }),
        b({ type: 'link', title: 'Unsere Leistungen', description: 'Was wir für Sie tun und wie die Zusammenarbeit abläuft.', url: u('/leistungen/'), icon: 'briefcase', imageAssetId: null }),
        b({ type: 'link', title: 'Erstberatung', description: 'Der erste Termin: was Sie mitbringen sollten und was er kostet.', url: u('/erstberatung/'), icon: 'calendar', imageAssetId: null }),
        b({ type: 'link', title: 'Häufige Fragen', description: 'Kurze Antworten auf das, was uns oft gefragt wird.', url: u('/fragen/'), icon: 'message-circle', imageAssetId: null }),
        b({ type: 'link', title: 'Kosten', description: 'Wie sich unsere Preise zusammensetzen.', url: u('/kosten/'), icon: 'euro', imageAssetId: null }),
        b({ type: 'heading', text: 'Standorte' }),
        main(),
        branch(),
        b({ type: 'heading', text: 'Mehr von uns' }),
        b({ type: 'link', title: 'Über uns', description: 'Wer bei uns für Sie arbeitet.', url: u('/ueber-uns/'), icon: 'users', imageAssetId: null }),
        b({ type: 'link', title: 'Aktuelles', description: 'Neuigkeiten und Beiträge.', url: u('/aktuelles/'), icon: 'newspaper', imageAssetId: null }),
      ];
    case 'person':
      return [
        call(),
        mail(),
        b({ type: 'heading', text: 'Schwerpunkte' }),
        b({ type: 'link', title: 'Beratung', description: 'Persönlich, telefonisch oder per Video.', url: u('/leistungen/'), icon: 'briefcase', imageAssetId: null }),
        b({ type: 'link', title: 'Über mich', description: 'Werdegang und Arbeitsweise.', url: u('/ueber-uns/'), icon: 'users', imageAssetId: null }),
        main(),
      ];
    case 'standort':
      return [call(), contactForm(), hours(), branch(), b({ type: 'link', title: 'Alle Standorte', description: '', url: u('/standorte/'), icon: 'map-pin', imageAssetId: null })];
    case 'kampagne':
      return [
        b({ type: 'text', text: 'Kurz erklärt, worum es in dieser Aktion geht.' }),
        contactForm(),
        call(),
        b({ type: 'link', title: 'Mehr erfahren', description: '', url: u('/'), icon: 'info', imageAssetId: null }),
      ];
    default:
      return [];
  }
}

export function templateContent(t: TemplateId, name: string, settings: Settings): PageContent {
  const hp = (settings.homepageUrl || 'https://www.example.com').replace(/\/+$/, '');
  const profile =
    t === 'organisation'
      ? { name: 'Muster & Partner', tagline: 'Beratung für Unternehmen und Privatpersonen in Musterstadt und Beispielhausen.', details: ['Dr. Maria Muster', 'Jonas Beispiel'] }
      : t === 'person'
        ? { name: 'Dr. Maria Muster', tagline: 'Partnerin bei Muster & Partner', details: ['Muster & Partner, Musterstadt'] }
        : t === 'standort'
          ? { name: 'Muster & Partner in Beispielhausen', tagline: 'Unsere Zweigstelle am Markt.', details: [] }
          : { name, tagline: '', details: [] };
  return {
    profile: { ...profile, logoAssetId: null, avatarAssetId: null, coverAssetId: null },
    blocks: blocks(t, hp),
    legal: { imprintUrl: settings.imprintUrl || null, privacyUrl: settings.privacyUrl || null },
    meta: { title: '', description: '', noindex: false, lang: 'de' },
  };
}
