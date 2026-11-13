# Follow-up-Kalender

Der vorhandene Kalender im Angebotsmanager bleibt unabhängig von Angeboten nutzbar.
Terminkarten bieten zusätzlich die unabhängig gespeicherten Ergebnisse
„Nicht erschienen“, „Verschiebung gewünscht“ und „Sale“. Es ist jeweils genau ein
Ergebnis möglich; erneutes Anklicken entfernt es. Der partielle PATCH überträgt
nur `outcome_status`, niemals Terminzeiten oder den bisherigen Bearbeitungsstatus.
Eine Verschiebungsanfrage verschiebt keinen Termin und Sale bucht keine BWS.
Die Aktionsfläche ist in der Kollisionsberechnung der Wochenansicht berücksichtigt.
Die Wochenübersicht bezieht sich auf Montag bis Sonntag der ausgewählten Woche
(Europe/Berlin). Sie zählt sämtliche zugänglichen Termine, unabhängig von Suche
und Terminartfilter. Follow-ups sind grün, Telefontermine gelb; bestehende Termine
ohne ausdrücklich zugewiesene Art bleiben neutral und zählen zur Gesamtzahl.
Neue Termine erhalten die im Formular sichtbare, änderbare Art.

`FollowUpSearch` durchsucht über `/api/follow-ups/search` alle zeitlich zugänglichen
Termine, einschließlich Vergangenheit und Zukunft. Kundenname, Bezeichnung,
Angebot/Sparte, Kontakte, Notizen und Terminart sind suchbar. Suchbegriff,
Terminart und inklusive Datumsgrenzen sind kombinierbar. Ein Treffer öffnet die
betreffende Woche und das bestehende Bearbeitungsformular, ohne Daten zu ändern.

Die Suche verwendet die bestehende Anmeldung und Row Level Security. Es werden
höchstens 50 Ergebnisse je Seite plus ein weiterer Datensatz zur Ermittlung von
`hasMore` geladen. Stabile Sortierung: Beginn und ID. Literale, korrekt gequotete
Suchmuster verhindern die Interpretation von Nutzereingaben als Filterausdruck.
Datumsgrenzen werden an Berliner Mitternacht umgerechnet, auch beim Zeitwechsel.

Clientseitig: 300 ms Suchverzögerung, Abbruch veralteter Anfragen, höchstens 30
zwischengespeicherte Ergebnisseiten im Speicher der Komponente, 60 Sekunden
Gültigkeit. Speichern/Löschen und ausdrückliches Suchen verwerfen den Cache;
Rückkehr zum Fenster aktualisiert aktive Suchen ereignisgesteuert. Kein Polling
und keine dauerhafte Ablage von Kundendaten im Browser-Speicher.

Vor Veröffentlichung `202611110001_follow_up_appointment_types.sql` anwenden.
Für die Ergebnisaktionen anschließend `202611130001_follow_up_outcome.sql` anwenden.
Die Migration ergänzt ausschließlich eine nullable, eingeschränkte Textspalte.
Sie klassifiziert keine Bestandsdaten und ändert keine Rechte oder Policies.

Prüfung: `tests/follow-ups.test.ts` (Validierung, Suchmaskierung, Datumsgrenzen,
Migration und Rechte) sowie `tests/e2e/calendar-regressions.spec.ts` (Desktop und
Smartphone: Ansichten, Typfilter, globale Suche, Terminänderungen, bestehende
Zeitdarstellung und Anfrage-Reihenfolge).
