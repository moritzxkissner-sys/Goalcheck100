# GoalTrack: Videoanalyse und Kalenderkorrekturen, 04.11.2026

## Abgrenzung und Videoergebnisse

Die ZIP enthält neun Videos. Alle wurden anhand zeitlich verteilter Einzelbilder durchgesehen. Die vier GoalTrack-Aufnahmen wurden zusätzlich lokal transkribiert. Die übrigen Aufnahmen zeigen den separaten ARAG-Bestandscheck; auf ausdrücklichen Wunsch des Auftraggebers bleibt dieser außerhalb dieses Updates. Die privaten Videos und Transkripte werden nicht veröffentlicht.

| Aufnahme (Ende des Dateinamens) | Befund / ausdrücklicher Wunsch | Ergebnis |
| --- | --- | --- |
| `10.39.47 (1).mp4` | Steven kann bei der Abwesenheitseingabe nur sich auswählen; andere Optionen sind deaktiviert. Tonspur fordert Eintragen für andere Personen. | Dies entspricht der bisherigen Berechtigung, kein defektes Dropdown. Kalenderdelegation für Steven wurde ausdrücklich beauftragt. Produktionsfreigabe erfolgt separat für das vorhandene Konto. |
| `10.39.47 (2).mp4` | Zeigt das frühere Quiz mit nicht ausgewählter Elementarschutz-Antwort. Keine verwertbare Sprache erkannt. | Keine aus dem Film belegte falsche Auswertung. Aktuelle Akademie bleibt erhalten; Auswahl, Feedback, Ergebnis und Mehrfachauswahl sind durch Tests geprüft. Keine neue Plattform oder neuen Tarifbehauptungen. |
| `10.39.47 (4).mp4` | Alina steht im Kalender, fehlt aber in der Tageswertung. Tonspur verlangt eigenen Zugang. | Kalenderroster enthält einen ausdrücklich nicht beschreibbaren Platzhalter, kein aktives Konto. Konto-/Einladungsprüfung für die angegebene Adresse ergab keinen Treffer. Einladung und Aktivierung sind separate Betriebsschritte; keine Platzhalter-Umsätze oder erfundenen Zugangsdaten. |
| `10.39.47.mp4` | Tonspur fordert 22:00 statt 17:00 Uhr. Stundenzeilen wachsen bisher mit den Karten. | 08:00–22:00 ist bereits vorhanden und bleibt erhalten. Feste gemeinsame Zeitachse, minutengenaue Startposition und nebeneinander angeordnete Überschneidungen umgesetzt und getestet. |

## Tatsächliche Korrekturen

- Follow-up-Kalender: gemeinsame feste Stundenhöhe statt durch Karten vergrößerter Zeilen; Berlin-Minutenposition, lesbare vollständige Namen/Themen und einheitliches Grün. Kurze Termine besitzen eine Mindestkartenhöhe für Text; das Zeitlabel nennt stets den tatsächlichen Beginn und das tatsächliche Ende. Kollisionsberechnung berücksichtigt diese Höhe. Abendtermine und Buchungen außerhalb des Rasters bleiben zulässig.
- Monatswechsel: abgebrochene/veraltete Antworten können neue Kalenderdaten nicht überschreiben. Rückkehr ins sichtbare Fenster lädt ereignisgesteuert neu; keine Intervallabfragen. Kalender bleibt beim Nachladen montiert, damit die Scrollposition erhalten bleibt. Ladehinweis blockiert keine Navigation.
- Follow-up-API: stabile Sortierung nach Zeit und ID; bei mehr als 500 Einträgen werden weitere Seiten gelesen. Fehler führen zu einer vollständigen Fehlermeldung statt einer unbemerkt unvollständigen Liste.
- Teamkalender: neue Serverdaten werden in den passenden Monat übernommen; ein anderer betrachteter Monat wird einmal erneut geladen. Formularentwurf, Auswahl und Scroll bleiben erhalten. Verspätete Antworten nach dem Speichern werden ebenfalls ignoriert.
- Tageswertung: authentifizierte, dauerhaft geöffnete Ansichten aktualisieren sich jetzt auch um Berliner Mitternacht. Keine Änderung an BWS-, Abschluss- oder Stornoregeln.
- Rechte: Dokumenten-/Fragenpflege wird von Kalenderdelegation getrennt. Bisherige Dokumentenverwalter bleiben erhalten; eine neue Kalenderfreigabe verleiht keine zusätzlichen Dokumentenrechte.

## Geänderte Projektdateien

- `components/follow-up-calendar.tsx`, `components/follow-up-calendar.module.css`
- `components/team-calendar.tsx`, `components/dashboard.tsx`
- `app/api/follow-ups/route.ts`
- `lib/calendar-layout.ts`, `lib/read-calendar-pages.ts`
- `lib/academy-documents-server.ts`
- `supabase/migrations/202611040001_document_management_permission.sql`
- `tests/calendar-regressions.test.ts`, `tests/academy-documents.test.ts`
- `tests/e2e/calendar-regressions.spec.ts`, dieser Bericht

## Tests und Grenzen

- 45 Unit-/Datenbanktests bestanden, einschließlich PGlite-Berechtigungen, unveränderter privater Lernstände, BWS/Storno und Kalenderseiten über 500 Datensätze.
- 18 bestehende Browserprüfungen gegen den Produktions-Build bestanden (Desktop/Mobil): Abschlüsse, Ziele, Tageswertung, Teamkalender, Lernbereich, Abendraster.
- 8 neue Komponenten-Browserprüfungen bestanden (Desktop und echte 390px-Mobilbreite): Minutenpositionen, Kollisionen, lange Texte, Abendtermine, verspätete Monatsantwort, Bearbeitung getrennter Datums-/Zeitfelder und Teamdatenaktualisierung bei erhaltenem Formular/Scroll.
- Komponentenprüfungen verwenden den echten Komponenten- und CSS-Code mit isolierten, simulierten Datengrenzen. Sie beweisen keinen Versand oder eine produktive Kundenbuchung. Keine produktiven Testtermine angelegt.
- Produktions-Build einschließlich ESLint/TypeScript erfolgreich. Mitternachtszeitberechnung ist durch bestehende Sommer-/Winter-/Zeitwechseltests abgedeckt; es wurde nicht bis zur realen Mitternacht gewartet.
- Fachunterlagen für sieben Lernmodule fehlen weiterhin wie bereits bekannt. Keine erfundenen Quellen ergänzt.

## Reihenfolge der Bereitstellung

1. Migration zur Trennung der Dokumentenrechte vor jeder zusätzlichen Kalenderfreigabe anwenden; sie übernimmt ausschließlich die bisherigen Verwalter.
2. Steven anhand seines bereits geprüften Kontos für Kalenderdelegation aktivieren; Dokumentenrechte bleiben unverändert.
3. Alina per Einladungslink aufnehmen, vorhandenes Profil korrekt benennen und aktivieren sowie gemäß bestehender Teamwertung zulassen. Passwort vergibt die Empfängerin selbst.
4. Geprüften Code veröffentlichen und Live-Funktionen lesen/prüfen. Keine produktiven Verkäufe, Termine oder Quizstände für Testzwecke verändern.
