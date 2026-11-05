# GoalTrack – Videoanforderungen vom 05.11.2026

## Grundlage und Abgrenzung

Quelle: `WhatsApp Unknown 2026-11-05 at 13.43.26.zip`, elf Videos mit
insgesamt rund 619 Sekunden. Alle Tonspuren wurden lokal transkribiert;
die Bildinhalte wurden über die gesamte Laufzeit in Drei-Sekunden-Abständen
gesichtet. Das ist keine Prüfung jedes einzelnen Videoframes. Alle Dateien
waren technisch auswertbar. Transkripte, Manifest und Kontaktbögen werden lokal
unter `artifacts/video-review-20261105` wiederverwendet, nicht veröffentlicht.
Gesprochene Namen wurden nicht ungeprüft aus der automatischen Transkription
übernommen.

Dieser Auftrag betrifft GoalTrack. Die separate ARAG-Bestandscheck-App und
Schadensverwaltung bleiben gemäß der bisherigen ausdrücklichen Abgrenzung
außerhalb der Umsetzung. Bestandscheck-Wünsche sind unten vollständig als
Abgrenzung dokumentiert; daraus werden keine GoalTrack-Rechte abgeleitet.

Abgleich: veröffentlichter GoalTrack-Stand nach Update #24
(`80cf082402fd776bea65208bca1062c4937b98ca`) und anschließender
Alina-Kontoaktivierung. Aufnahmen können ältere Zustände zeigen.

## GoalTrack – priorisierte Aufgaben

| ID / Video / Zeit | Sichtbarer Bereich und gesprochener Wunsch | Aktueller Zustand | Zielzustand | Priorität / Abhängigkeiten | Status |
| --- | --- | --- | --- | --- | --- |
| GT-01 · 13.40.41 (2) · 00:02–00:34 | Teamkalender Desktop: andere Personen sind ausgegraut, Termine auch für Alina, Berin, Johannes, Lilli usw. eintragen | Steven und Moritz dürfen bereits für andere aktive Konten eintragen. Platzhalter sind absichtlich nicht beschreibbar. | Berechtigte Verwalter wählen tatsächlich aktive Personen aus. | Hoch; echte aktive Konten statt Platzhalter, bestehende Rechteprüfung erhalten | Für aktive Konten bereits umgesetzt; fehlende Konten unter GT-03 |
| GT-02 · 13.40.41 (3) · 00:02–00:20 | Tageswertung: Alina in Team und Tagesumsatz aufnehmen | Alina wurde nach manueller Registrierung aktiviert; Team und Tages-/Monatswertung live geprüft. | Alina als aktives Mitglied mit tatsächlichen Umsatzwerten anzeigen. | Hoch; keine erfundenen Buchungen | Bereits erledigt; keine erneute Implementierung |
| GT-03 · 13.40.41 (6) · 00:00–00:38 | Team mobil: Delegation funktioniert jetzt, nur Lilli und „Julia“ noch ausgegraut | Lilli Fischer und Yuliia Solianyk sind Kalenderplatzhalter. Nutzer bestätigt am 05.11.: E-Mail-Adressen noch nicht vorhanden. Die korrigierte Schreibweise Yuliia Solianyk bleibt erhalten. | Echte Konten registrieren/zuordnen und nach Freigabe normal aktivieren. | Hoch; E-Mail-Adressen, Registrierung, ausdrückliche Aktivierung der Teamrechte | Bis zur Registrierung zurückgestellt; keine Platzhalterfreischaltung |
| GT-04 · 13.40.41 (7) · 00:00–00:28 | Team/Tageswertung mobil: Vanessas Nachname überall ändern | Nutzer bestätigt am 05.11. exakt Vanessa Schmitt. Bestehendes produktives Profil gezielt umbenannt und Ergebnis geprüft. | Bestätigten neuen Anzeigenamen überall über dasselbe bestehende Profil verwenden. | Mittel; Login-E-Mail und Zugriffsrechte bleiben unverändert. | Produktives Profil erledigt; Demo und Testdaten ebenfalls angepasst |
| GT-05 · 13.40.41 (4) · 00:22–01:33; (8) · 00:00–00:58 | Weiterbildung Desktop/mobil: Fachberater „Recht und Absicherung Privatkunden“, Unterlagen hochladen und daraus Multiple-Choice-Fragen erstellen | Modulstruktur und Quellenverwaltung existieren. Fachunterlagen fehlen in dieser ZIP; manuell geprüfte Entwürfe gehören noch nicht zum spielbaren versionierten Katalog. | Quellen direkt im Lernmodul pflegen; fachlich belegte Fragen erzeugen, prüfen und anschließend im Modul üben. | Hoch; echte PDFs, nachvollziehbare Fundstellen, versionierte Fragensätze und serverseitige Ergebnisprüfung. Bei externem KI-Dienst zusätzlich Anbieter-/Kosten- und Quellenübertragungsfreigabe. | Direkter Modul-Unterlagenzugang implementiert; automatische Fragen/spielbarer Fachkatalog noch offen |

## Technischer erster Umsetzungsschritt

- Wiederverwendung von `TrainingDocuments` direkt in
  `specialist-privatkunden-grundlagen`: ausschließlich Dokumente dieses Moduls,
  Modulzuordnung beim Upload vorausgewählt, bestehende Suche und PDF-Prüfungen.
- Die Upload-/Bearbeitungsrechte bleiben ausschließlich an
  `can_manage_training_documents` gebunden; keine neue Kalenderberechtigung.
- Ein Upload erzeugt noch keine Fragen. Die Oberfläche benennt diese Grenze
  ausdrücklich und bietet keinen funktionslosen Generierungsbutton an.
- Keine externe KI, neue Abhängigkeit, Hintergrundabfrage oder kostenpflichtige
  Schnittstelle aktiviert. Vorhandener benutzerbezogener Dokumentencache bleibt.
- Für später spielbare Fachfragen sind unveränderliche Fragensatz-Versionen
  mit Quellenbezug sowie passende Fortschritts-/Bewertungsregeln erforderlich.
  Bestehende Quizversuche dürfen dadurch nicht umgedeutet werden.

## Aufnahmen der separaten Bestandscheck-App – nicht umgesetzt

Dateinamen beginnen jeweils mit `WhatsApp Video 2026-11-05 at ` und enden auf
`.mp4`. Die oben verwendeten Kurzbezeichnungen beziehen sich auf denselben
Präfix und dieselbe Endung.

| Video / Zeit | Sichtbarer Bereich / gesprochener Wunsch | Ist / Ziel | Priorität / Abhängigkeit / Status |
| --- | --- | --- | --- |
| 13.40.40 · 00:15–00:42 | Bestandscheck: Mobilität entfernen, da Schutzbrief denselben Bereich abdeckt | Doppelter Bereich gezeigt; gewünschte Zusammenführung | Nicht für GoalTrack priorisiert; anderes Repository erforderlich; außerhalb Auftrag |
| 13.40.41 (1) · 00:03–00:11 | Mobilität nochmals entfernen | Wiederholung desselben Wunschs | Wie vorher; keine doppelte Implementierung |
| 13.40.41 (1) · 00:11–01:01 | Hausrat und „Unser Fazit“ an dunklen Stil anderer Schritte angleichen | Helle Bereiche im bestehenden Ablauf; gewünscht dunkel | Anderes Repository; außerhalb Auftrag |
| 13.40.41 (5) · 00:01–00:58 | Kundenliste: Löschen-Button verkleinern, dezentes Rot, letztes Beratungsdatum wieder anzeigen | Großer störender Button; gewünschte kompakte Historienanzeige | Anderes Repository; außerhalb Auftrag |
| 13.40.41 (9) · 00:01–00:45 | Kundentermine mobil: Alina soll für Vanessa Termine anlegen | Rechteauswahl der separaten App gezeigt | Kein Anlass für zusätzliche GoalTrack-Rechte; außerhalb Auftrag |
| 13.40.41 · 00:28–01:18 | Dashboard: „Verträge gesamt“ zu „Recht und Heimverträge“; „Erfasster Vertragsbestand“ zu „Recht und Heim gesamt“, Untertitel „Aktive Verträge im Team“; unteres „Recht und Heim 1“ entfernen | Gezeigte Text-/Kartenänderungen | Anderes Repository; außerhalb Auftrag |

## Prüfung und offene Abhängigkeiten

Prüfung am 05.11.2026: TypeScript erfolgreich; scoped ESLint und vollständiges
Build-Linting erfolgreich; optimierter Next.js-Produktionsbuild erfolgreich.
Alle acht Lernbereich-/Abendkalender-Browsertests auf Desktop und Smartphone
bestanden, einschließlich Modulnavigation, Materialienhinweis und unverändert
gesperrtem Quiz bei fehlenden Fachquellen. Diese Demo-Tests ersetzen keine
Prüfung eines echten PDF-Uploads oder fachlich generierter Fragen.

Abschließend alle zehn Teamkalender-/Lernbereich-Browsertests auf Desktop und
Smartphone bestanden. Nach der bestätigten Namenskorrektur zusätzlich alle 45 bestehenden Unit-/
Datenbank-Regeltests sowie Produktionsbuild erfolgreich. Produktiv wurde
Vanessa Schmitt im Teamkalender, in der Mitarbeiter-Auswahl, Tageswertung und
Monatsübersicht geprüft; die Profilrechte blieben unverändert.

Nutzerantwort vom 05.11.2026: E-Mail-Adressen für Lilli und Yuliia liegen noch
nicht vor. Die Fachberater-PDFs werden ausdrücklich später behandelt; damit
bleibt auch die automatische Fragenbereitstellung zurückgestellt. Die neue ZIP
enthält Videos, keine Fachunterlagen. Zugriff auf ein E-Mail-Postfach liegt nicht
vor. Es werden weder Zugangsdaten noch fachliche Inhalte erfunden.
