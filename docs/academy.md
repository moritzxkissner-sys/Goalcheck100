# GoalTrack Lernbereich

## Quellen und Verfügbarkeit

`lib/academy.ts` enthält die versionierte Themen- und Modulstruktur. Vier
SalesPower-Grundlagenmodule verwenden die bereits vorhandenen allgemeinen
InsureQuiz-Fragen. Die übrigen sieben Module warten auf Schulungsunterlagen.
Die Übungen stellen keine offizielle Zertifizierung dar.

Interne PDFs bleiben im privaten `training-documents`-Bucket. Bestehende
Kalenderverwalter können Metadaten, Modulzuordnung und Fragenentwürfe pflegen.
Alle aktiven Mitglieder behalten ihren vorhandenen Dokumentenzugriff.
Freigegebene, aktuell gültige Dokumente erscheinen bei ihrem zugeordneten
Lernmodul. Referenzierte Dokumentversionen sind unveränderlich; neue Versionen
werden als neue Dokumente hochgeladen. Metadatenänderungen setzen vorherige
Fragenfreigaben zurück auf Prüfung.

Fragenentwürfe werden manuell mit Fundstelle, Dokumentversion und Begründung
erfasst und geprüft. Eine Freigabe übernimmt sie noch nicht automatisch in den
laufenden Quizkatalog. Es ist keine externe KI oder Dokumentenübertragung
eingerichtet. Nach fachlicher Prüfung müssen neue Inhalte bewusst in den
versionierten Katalog und dessen Speicherregeln übernommen werden.

## Lernstand

`/api/academy` lädt den persönlichen Lernstand, Versuche und Quellen einmal.
Geprüfte Antworten werden vor dem Fortsetzen gespeichert. Der Abschluss nutzt
eine atomare, idempotente Datenbankfunktion; Ergebnisse werden aus Antworten
abgeleitet. Wiederholungen entfernen frühere Abschlüsse nicht. Veraltete
Katalogstände werden nicht als aktuelle Quizrunde fortgesetzt.

Bei Katalogänderungen müssen `academyCatalogVersion`, die Moduldefinitionen und
die entsprechende Validierung in `save_academy_progress` gemeinsam versioniert
werden. Alte Versuche bleiben erhalten. Der frühere manuelle Weiterbildungsstand
in `learning_progress` wird unverändert separat geführt.

## Installation

Vor der App-Veröffentlichung beide Migrationen in dieser Reihenfolge anwenden:

1. `202611030001_academy.sql`
2. `202611030002_academy_documents.sql`

Danach `npm test`, `npm run build` und die Playwright-Prüfungen gegen den
Produktions-Build ausführen. Im Demo-Modus bleiben Änderungen nur im Speicher.

