# Änderungsprotokoll

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
