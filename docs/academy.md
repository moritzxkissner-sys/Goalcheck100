# GoalTrack Lernbereich

## Quellen und Verfügbarkeit

`lib/academy.ts` enthält die versionierte Themen- und Modulstruktur. Vier
SalesPower-Grundlagenmodule verwenden die bereits vorhandenen allgemeinen
InsureQuiz-Fragen. Der Privatkunden-Fachberaterbereich enthält zusätzlich 36
quellengeprüfte Übungsfragen aus den sechs am 06.11.2026 bereitgestellten PDFs
(29 Einfachauswahl, sieben Mehrfachauswahl). Die übrigen sechs Module warten
auf Schulungsunterlagen.
Die Übungen stellen keine offizielle Zertifizierung dar.

Interne PDFs bleiben im privaten `training-documents`-Bucket. Bestehende
Dokumentenverwalter (`can_manage_training_documents`) können Metadaten,
Modulzuordnung und Fragenentwürfe pflegen. Kalenderrechte allein reichen nicht.
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

Im Privatkunden-Grundlagenmodul ist die bestehende Dokumentenverwaltung direkt
eingebunden. Sie zeigt nur zugeordnete Modulunterlagen und wählt beim Upload
die Modulzuordnung vor. Die Uploadrechte und Quellenprüfung bleiben unverändert.
Die Oberfläche weist ausdrücklich darauf hin, dass ein Upload kein Quiz erzeugt.

`lib/academy-private-customers.ts` enthält den unveränderlichen ersten
Privatkunden-Fragensatz mit Erklärungen und Fundstellen (Dokument, Stand,
PDF-Seite, Abschnitt). Die dokumentierten SHA-256-Werte identifizieren die
Originaldateien. Die Original-PDFs liegen lokal in den bereitgestellten Quellen;
sie werden nicht ins Git-Repository oder an einen externen KI-Dienst übertragen.
Die lokale Ausgabe `output/quiz/Privatkunden-Multiple-Choice.md` enthält den
lesbaren Gesamtkatalog mit Lösungsschlüssel. Ein späterer PDF-Upload ins private
Dokumentencenter ist unabhängig von der Freigabe dieser kuratierten Quizversion.

## Lernstand

`/api/academy` lädt den persönlichen Lernstand, Versuche und Quellen einmal.
Geprüfte Antworten werden vor dem Fortsetzen gespeichert. Der Abschluss nutzt
eine atomare, idempotente Datenbankfunktion; Ergebnisse werden aus Antworten
abgeleitet. Wiederholungen entfernen frühere Abschlüsse nicht. Veraltete
Katalogstände werden nicht als aktuelle Quizrunde fortgesetzt.

`getAcademyModuleVersion` liefert die Version pro Modul. Die vier bisherigen
SalesPower-Module behalten `2026-11-03-v1`; das neue Privatkunden-Modul verwendet
`2026-11-06-privatkunden-v1`. Neue Versionen müssen mit der entsprechenden
Validierung in `save_academy_progress` abgestimmt werden. Bestehende Fragenreihen,
Antwortschlüssel und Versionen dürfen nicht rückwirkend verändert werden.
Alte Versuche bleiben erhalten. Der frühere manuelle Weiterbildungsstand
in `learning_progress` wird unverändert separat geführt.

## Installation

Vor der App-Veröffentlichung diese Migrationen in dieser Reihenfolge anwenden:

1. `202611030001_academy.sql`
2. `202611030002_academy_documents.sql`
3. `202611040001_document_management_permission.sql`
4. `202611060001_academy_private_customers.sql`

Danach `npm test`, `npm run build` und die Playwright-Prüfungen gegen den
Produktions-Build ausführen. Im Demo-Modus bleiben Änderungen nur im Speicher.
