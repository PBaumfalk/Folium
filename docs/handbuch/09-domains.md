# 9 — Domains

[← Handbuch](README.md) · [Weiter: 10 — Konten und Rollen](10-konten-und-rollen.md)

> Dieses Kapitel richtet sich an Admins. Ansehen dürfen die Domain-Liste alle Rollen, eintragen und entfernen nur Admins.

Jede veröffentlichte Seite hat eine Adresse unter der **Standardadresse** von Folium. Zusätzlich können Sie **weitere eigene Domains** eintragen, die direkt auf eine bestimmte Seite zeigen, z. B. eine persönliche Domain für die Seite einer Person.

## Die Standardadresse

Die Standardadresse legt die IT einmalig in der Konfiguration fest (`PUBLIC_BASE_URL`, siehe [Kapitel 15](15-konfiguration.md)), z. B. `https://links.example.com`. Jede veröffentlichte Seite ist dort unter ihrer Adresse erreichbar:

```
https://links.example.com/muster
https://links.example.com/maria-muster
```

Die Standardadresse wird in der Oberfläche angezeigt (**Einstellungen → Domains**: „Alle Seiten sind unter … erreichbar“). Sie lässt sich dort nicht ändern.

Gut zu wissen:

- Die **Wurzel** der Standardadresse (`https://links.example.com/` ohne Pfad) zeigt keine Seite, sondern die Hinweisseite „Diese Seite gibt es nicht.“ Soll eine Domain ohne Pfad direkt eine Seite zeigen, tragen Sie dafür eine weitere Domain ein (nächster Abschnitt).
- Entwürfe, nie veröffentlichte Seiten und Seiten im Papierkorb sind unter keiner Adresse erreichbar.
- Der Bereich **Teilen** einer Seite (Adresse kopieren, QR-Code, Filum, Tessera) verwendet immer die Standardadresse, nicht weitere Domains ([Kapitel 7](07-teilen.md)).

## Weitere Domains eintragen

1. **Einstellungen → Domains** öffnen.
2. Unter **Domain** nur den Hostnamen eintragen, ohne `https://` und ohne Pfad, z. B. `links.maria-muster.de`.
3. Unter **Startseite der Domain** die Seite wählen, die beim Aufruf der Domain ohne Pfad erscheinen soll, oder **Keine**.
4. **Domain eintragen**.
5. Die IT richtet DNS-Eintrag, Zertifikat und Reverse Proxy für die Domain ein (siehe unten). Erst dann kommen Anfragen bei Folium an.

Die Tabelle zeigt danach je Domain die Spalten **Domain** und **zeigt auf**. Ohne Startseite steht dort „keine Seite (nur Adressen mit Pfad)“.

Mögliche Meldungen beim Eintragen:

| Meldung | Bedeutung |
| --- | --- |
| „Bitte nur den Hostnamen angeben, z. B. links.example.com (ohne https:// und ohne Pfad).“ | Die Eingabe enthält `https://`, einen Pfad oder ist kein gültiger Hostname. |
| „Das ist bereits die öffentliche Hauptadresse.“ | Der Hostname der Standardadresse kann nicht zusätzlich eingetragen werden. |
| „Diese Domain ist schon eingetragen.“ | Jede Domain kann nur einmal vorkommen. |

## Was unter einer weiteren Domain erreichbar ist

| Aufruf | Ergebnis |
| --- | --- |
| `https://links.maria-muster.de/` | die gewählte Startseite (veröffentlichte Fassung); ohne Startseite die Hinweisseite „Diese Seite gibt es nicht.“ |
| `https://links.maria-muster.de/muster` | jede veröffentlichte Seite unter ihrer Adresse, genau wie unter der Standardadresse |
| eine Domain, die nicht eingetragen ist | Hinweisseite „Diese Seite gibt es nicht.“, auch wenn sie technisch beim Server ankommt |

Gut zu wissen:

- Die Seite auf einer weiteren Domain nennt als kanonische Adresse (für Suchmaschinen) die Wurzel dieser Domain, z. B. `https://links.maria-muster.de/`. Das gilt derzeit auch, wenn eine andere Seite über einen Pfad auf dieser Domain aufgerufen wird. Adressen mit Pfad teilen Sie deshalb am besten über die Standardadresse.
- Liegt die Startseite im Papierkorb oder ist sie nicht veröffentlicht, zeigt die Domain-Wurzel die Hinweisseite. Wird die Seite endgültig gelöscht (nach Ablauf der Papierkorbfrist), entfernt Folium die Zuordnung; die Domain bleibt eingetragen und zeigt auf „keine Seite“.
- Aufrufe und Klicks zählt Folium unabhängig davon, über welche Domain eine Seite aufgerufen wurde. Die Statistik unterscheidet Domains nicht ([Kapitel 8](08-statistik.md)).

## Startseite ändern oder Domain entfernen

Eine eingetragene Domain lässt sich nicht bearbeiten. Um die Startseite zu wechseln, entfernen Sie die Domain und tragen sie mit der neuen Startseite erneut ein.

**Entfernen:** In der Tabelle auf das Papierkorb-Symbol der Domain klicken. Die Domain wird **sofort und ohne Rückfrage** entfernt; ab dann beantwortet Folium Anfragen für diese Domain mit der Hinweisseite. DNS und Proxy-Konfiguration bleiben davon unberührt; die IT sollte sie ebenfalls entfernen.

Eintragen und Entfernen von Domains wird im Protokoll festgehalten (`domain.create`, `domain.delete`, siehe [Kapitel 10](10-konten-und-rollen.md#protokoll)).

## Was die IT für eine Domain einrichten muss

Folium selbst setzt keine DNS-Einträge, stellt keine Zertifikate aus und ändert keine Proxy-Konfiguration. Für jede Domain (Standardadresse und weitere) braucht es:

1. **DNS:** einen A- und/oder AAAA-Eintrag (oder CNAME) auf den Server mit dem Reverse Proxy.
2. **Reverse Proxy:** einen Eintrag, der die Domain per HTTPS an den **öffentlichen Port 8080** von Folium weiterreicht, niemals an den Verwaltungsport 8081.
3. **Hostname unverändert weitergeben:** Folium erkennt die Domain am `Host`-Kopf der Anfrage. Caddy gibt ihn von sich aus weiter; bei nginx ist `proxy_set_header Host $host;` nötig. Fehlt das, zeigt jede Adresse die Hinweisseite.
4. **Zertifikat:** stellt der Proxy aus (bei Caddy automatisch).

Fertige Beispiele für Caddy und nginx stehen in [Kapitel 14](14-reverse-proxy.md#weitere-domains). Die Domain in Folium einzutragen und den Proxy einzurichten ist unabhängig voneinander möglich; die Reihenfolge spielt keine Rolle.

---

[← Handbuch](README.md) · [Weiter: 10 — Konten und Rollen](10-konten-und-rollen.md)
