# Gemeinsame Abschlüsse, Underwriting und Sale-Bestätigung

## Gemeinsame Abschlüsse

Ein Vertrag bleibt eine Zeile in `sales_entries`. `amount` enthält immer die
Gesamt-BWS, `partner_id` optional den zweiten aktiven Partner und `owner_percent`
den ganzzahligen Erstelleranteil (1–99 %, ohne Partner 100 %).
Die Gegenquote ergibt sich zwingend aus 100 minus Erstellerquote. Der Erstelleranteil
wird auf Cent gerundet, der Partner erhält den Rest. Die Summe bleibt exakt erhalten.
Bestehende Abschlüsse erhalten keine zweite Person und behalten ihre ursprünglichen
Felder. Nur der Ersteller darf ändern/löschen; der beteiligte Partner kann den
gemeinsamen Abschluss einschließlich Kundenname und vorhandener Notiz lesen.

Die interne, nicht direkt freigegebene View `sale_contributions` verteilt BWS für
die bestehenden Tages- und Monatsranglisten. Die Vertragszählung erfolgt einmal
beim Ersteller. Vorhandene Filter für aktive/sichtbare Teamkonten bleiben bestehen.
Persönliche Einträge werden beim Laden auf den jeweiligen Anteil abgebildet;
`total_amount` bewahrt den Gesamtwert zur Anzeige und Bearbeitung. Dashboard,
Monatsauswertung und Ziele rechnen mit dem persönlichen Anteil. Der bislang nicht
eingerichtete Provisionsbereich zeigt die persönliche BWS-Grundlage; es werden
keine Provisionssätze oder Euro-Auszahlungen erfunden.

## Underwriting

Der Menüpunkt liegt zwischen Angebotsmanager und Kündigungen. Die Anfragen sind
intern in GoalTrack gespeichert; es wird keine externe Nachricht an eine
Fachabteilung versendet. Rechtsschutz und SHU (Sach/Haftpflicht/Unfall) sind getrennt
filterbar. Kennzahlen beruhen auf den zugänglichen gespeicherten Anfragen;
Erledigungen und mittlere Bearbeitungsdauer beziehen sich auf die letzten 30 Tage.
Eingangs-Datumsfilter verwenden Europe/Berlin.

`underwriting_requests` speichert Inhalt, Ersteller, Status und Zeitpunkte.
`underwriting_attachments` ordnet Dateien zu; `underwriting_events` bewahrt
Änderungshistorie und Rückmeldungen. Das eigene Recht `can_manage_underwriting`
wird ausschließlich Steven (bekannte Profil-ID) zugewiesen, wie vom Auftraggeber
ausdrücklich angefordert. Sonstige Partner verwalten nur eigene Anfragen. Kalender-
und Dokumentenrechte werden nicht verändert. Serveraktionen und RLS schützen
Anfragen, Rückmeldungen und Anhänge unabhängig von der Oberfläche.

Dateien: PDF/JPG/PNG, höchstens fünf Anhänge und 10 MB je Datei. Direkter Upload
mit signierter Upload-Adresse in den privaten Storage-Bucket `underwriting`;
keine großen Binärdateien durch eine Server Action oder einen Vercel-Endpunkt.
Die Datei-Metadaten werden vorab geprüft. Die transaktionale Anfrage-Erstellung
prüft auch tatsächlich gespeicherte Objektgröße, MIME-Typ und Eigentümerpfad.
Erst danach wird die Anfrage bestätigt. Wiederholungen verwenden dieselbe ID,
um Doppelanlagen zu verhindern. Downloads laufen über kurzlebige signierte URLs.
Nach einem abgebrochenen Entwurf können nicht zugeordnete private Uploads übrig
bleiben; diese sind nicht über die Anfragen lesbar und können vom Betreiber nach
Ablauf der Upload-Tokens bereinigt werden. Es gibt keine automatische Löschroutine.

Kundenoptionen stammen aus zugänglichen Abschlüssen und vorhandenen Anfragen,
auch außerhalb des ausgewählten Monats. Manuelle Eingabe bleibt möglich. Die
Suche und Filter arbeiten nach dem paginierten Laden lokal, ohne Polling oder
dauerhaften Kundendaten-Cache im Browser.

## Glückwunschfenster

`SaleSuccessModal` erscheint erst nach bestätigter Neuanlage. Änderungen,
Validierungs-/Speicherfehler und erkannte ID-Wiederholungen lösen es nicht aus.
Personalisierung erfolgt aus dem angemeldeten Profil. Der Dialog besitzt
Fokusbegrenzung, X, Escape und Weiter; CSS-Animationen respektieren reduzierte
Bewegung. Das Popup im Kalender bei Ergebnis „Sale“ ist kein neuer Abschluss
und löst dieses Fenster nicht aus.

## Einrichtung und Prüfung

Vor Freigabe des neuen Codes beide Migrationen anwenden:

1. `202611160001_shared_sales.sql`
2. `202611160002_underwriting.sql`

Alternativ einmal `supabase/setup-sales-underwriting.sql` ausführen. Dieses
geprüfte Gesamtskript enthält beide Migrationen in einer Transaktion und vergleicht
Anzahl, BWS-Summe und Prüfsumme aller bisherigen Abschlussfelder vor/nach der
Einrichtung. Bei Abweichung wird alles zurückgerollt. Nicht zusätzlich zu bereits
ausgeführten Einzelmigrationen starten.

Die neue Startseite benötigt die Split-Spalten und `sale_partners()`; daher den
Code erst nach erfolgreicher Datenbankeinrichtung produktiv schalten.

Prüfungen: `tests/sales-underwriting.test.ts` für Cent-Erhalt, Eingaben,
Bestandsdaten, Ranglisten, RLS, Anhänge, Verlauf und Rechte; die neue Browserdatei
`tests/e2e/sales-underwriting.spec.ts` prüft gemeinsame Abschlüsse, Bearbeitung,
Dialogschließen, reduzierte Animationen und Underwriting auf Desktop/Smartphone.
Der vorhandene Dashboard-Test schließt das neue Glückwunschfenster ausdrücklich.

## Dateien des Auftrags

Geändert: `app/actions.ts`, `app/page.tsx`, `components/dashboard.tsx`,
`lib/metrics.ts`, `lib/validation.ts`, `tests/e2e/dashboard.spec.ts`.

Neue Komponenten: `goaltrack-dialog.tsx`, `sale-success-modal.tsx`,
`sale-split-fields.tsx`, `underwriting.tsx`, jeweils in `components/`; gemeinsame
Gestaltung in `components/sales-underwriting.module.css`.

Neue Logik: `lib/sale-sharing.ts`, `lib/underwriting.ts`,
`app/underwriting-actions.ts`. Neue Prüfungen: `tests/sales-underwriting.test.ts`
und `tests/e2e/sales-underwriting.spec.ts`. Datenbankdateien siehe Einrichtung.

Noch erforderlicher Veröffentlichungsschritt: produktive Datenbankeinrichtung,
danach Code-Freigabe. Weder eine produktive Anfrage noch ein echter gemeinsamer
Abschluss wurde zu Testzwecken angelegt. Die endgültige Upload-/Downloadprüfung
im Cloud-Bucket folgt nach dessen Einrichtung. Die isolierten Datenbanktests
prüfen bereits Zuordnung, Dateimetadaten, atomare Speicherung und Zugriffsregeln.
