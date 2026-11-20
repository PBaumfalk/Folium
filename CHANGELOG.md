# Änderungsprotokoll

## 0.1.1 – 20.11.2026

- **Für alle Branchen:**
  - README und Handbuch stellen Folium als Linktree-Alternative für jede Organisation und Person vor, mit dem neuen Abschnitt „Wofür?“
  - Die Demo zeigt drei verschiedene erfundene Beispiele: Café, Yoga-Studio und Tischlerei, je eine Designrichtung.
- **Vorlagen und Oberfläche:**
  - Die Vorlagen „Organisation“ und „Person“ sind allgemeiner formuliert.
  - Die Designvorschau zeigt „Ihr Name“.
  - Das Feld heißt jetzt „Öffnungs- oder Sprechzeiten“.
- **Testmaterial:** Die Test-Homepage ist die erfundene Homepage des Beispiel-Cafés.

## 0.1.0 – 20.11.2026

Erste öffentliche Version.

- **Linkseiten**:
  - mehrere Seiten mit eigener Adresse oder eigener Domain
  - Vorlagen für Organisation, Person, Standort und Kampagne
  - Hauptaktionen (Anrufen, Termin, E-Mail, Kontakt), Links mit Symbol oder Bild, Standorte mit Routenlink, Sprechzeiten, Social Media
  - Sichtbarkeit nach Zeitplan
- **Entwurf und Versionen**:
  - automatisches Speichern mit Konfliktmeldung
  - Änderungsübersicht vor dem Veröffentlichen, Pflichtlinks zu Impressum und Datenschutz
  - Versionen wiederherstellen, Duplizieren, Papierkorb
  - unfertige Einträge ohne Ziel dürfen im Entwurf bleiben
- **Design**:
  - drei Designrichtungen (Editorial, Modern Boutique, Signature)
  - Editor mit Kontrastprüfung, zehn mitgelieferten Schriften und eigenen Schriften
  - kein eigenes CSS
- **Design aus Homepage übernehmen**:
  - SSRF-geschützte Analyse von HTML und CSS
  - Bildschirmfotos aus einem Browser-Container ohne Internet
  - Anzeige der Übertragung vor dem Senden
  - drei Varianten von Claude als geprüfte strukturierte Ausgabe
  - Kostenbremse je Stunde, Tag und Monat
- **Statistik**:
  - nur Tagessummen, keine Cookies, keine IP-Adressen
  - Bots und Link-Vorschauen getrennt gezählt
  - Quellen über `?src=`, CSV-Export
- **Teilen**: QR-Code als PNG oder SVG, Kurzlink über Filum, Gestaltung in Tessera.
- **Betrieb**:
  - Rollen und Anmeldung über OIDC
  - automatische Sicherungen mit Wiederherstellen per Klick, Export und Import als ZIP
  - zwei getrennte Ports für öffentliche Seiten und Verwaltung
  - Docker-Images für amd64 und arm64
- **Dokumentation**: Handbuch mit 23 Kapiteln für Anwender, Admins und IT.
