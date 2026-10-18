# v11 · Eure Ideen kommen an

Dieses Update baut auf v10 auf. Bestehende Konten, Käufe, Freundschaften und Preise bleiben erhalten. Es braucht keine neuen Pakete, Umgebungsvariablen, Supabase-Buckets oder Firestore-Indizes.

## Pixel Relay: Zeichnungen zuverlässig weitergeben

Bisher kam eine Zeichnung nur mit „Zeichnung abgeben“ beim nächsten Spieler an. Lief die Zeit aus, wurde stattdessen eine leere Pixelzeichnung eingetragen. Jetzt werden freie Zeichnungen während des Malens und beim Loslassen privat auf dem Server gesichert. Der grüne Hinweis bestätigt die Sicherung. Bei Zeitablauf wird der letzte bestätigte Stand automatisch abgegeben und genau einmal gewertet. Der Abgeben-Button funktioniert weiterhin.

Entwürfe sind vor dem Weiterreichen nur für ihren Autor sichtbar. Rundennummer, Schritt und steigende Revisionen verhindern, dass verspätete Pakete einen späteren Schritt überschreiben oder gelöschte Striche wiederherstellen. Rückgängig und Leeren werden ebenfalls gesichert. Farben und Stiftbreite bleiben frei wählbar. Ohne gesicherte Abgabe erscheint eine verständliche Fehlanzeige statt eines leeren Bildes; ein Verbindungsfehler wird als noch nicht gesichert angezeigt und erneut versucht. Gemeinsame Pausen halten die Abgabezeit an.

## Freunde und Benachrichtigungen

- Online-Status mit grüner Schrift und grünem Punkt am Avatar, engere sinnvolle Abstände und kurze, einzeilige Aktionen.
- Die ganze Freundeskachel einschließlich Name, Status und freier Fläche öffnet die Aktionen: in die eigene Lobby einladen, Beitritt anfragen, Nachricht schreiben oder Profil ansehen. Die Auswahl berücksichtigt tatsächliche Präsenz und Lobby-Zugehörigkeit; der Server prüft jeden Vorgang erneut.
- „Mehr …“ bleibt in einer Zeile. Die Glocke zeigt deutlich hervorgehobene Schaltflächen für Freundschaftsanfragen, Einladungen und Beitrittsanfragen. Nachrichten öffnen die richtige Unterhaltung.
- Deutsch und Englisch haben echte lokale Flaggen-SVGs, damit sie auch ohne Emoji-Flaggenunterstützung erkennbar sind. Die Sprache bleibt im Browser gespeichert.
- Die Startseite hat eine eigene große Open-Source-Überschrift, „100 % gratis“, „Keine Werbung“, „Kein Download“, den GitHub-Link und „Idee vorschlagen“.

## Soundboard direkt im Spiel

Eigene freigeschaltete und eingerichtete Emoji-Sounds stehen direkt neben der Spielansicht in allen 26 Spielen. Es öffnet sich kein Soundboard-Overlay mehr. Mausfokus und gehaltene Bewegungstasten bleiben erhalten. Namen erscheinen per Tooltip. Bestehende Tastenkürzel, Lautstärken, Stummschaltung, Slot-Berechtigungen, Lobby-Isolation und Cooldown gelten weiter. Ohne eigene Sounds führt ein kurzer Hinweis zum Shop bzw. Konto.

## Fehler und Verbesserungen melden

**Absender:** Oben „Feedback“, auf der Startseite oder unten „Idee vorschlagen“, im ESC-Menü „Problem melden“. Art, Titel und Beschreibung eingeben, optional einen Screenshot hinzufügen, absenden. Eine Bestätigung mit Kennung erscheint erst nach Speicherung. Unter „Meine Meldungen“ sind Status und die Antwort des Erstellers abrufbar. Die Texte bleiben in ihrer ursprünglichen Sprache.

**Du als Ersteller:** Mit deinem in `OWNER_UIDS` eingetragenen Konto einloggen. Dann **Glocke → Feedback-Postfach** oder **Feedback → Ersteller-Postfach**. Dort erscheinen Probleme und Ideen von Konten und Gästen, inklusive optionalem Screenshot sowie Spiel, Phase, Version, Sprache und Verbindungsstatus. Du kannst den Status auf **Eingegangen / Geplant / Erledigt** setzen und dem Absender eine Antwort hinterlegen. Das Postfach blättert in Seiten mit je 30 Einträgen; der Zähler erfasst alle offenen Meldungen. Lobby-Hosts erhalten keine Erstellerrechte.

Konten sehen ihre letzten 100 Meldungen geräteübergreifend. Gäste behalten einen privaten Zugriffsschlüssel für die letzten 40 Meldungen im jeweiligen Browser. Browserdaten löschen oder ein anderes Gerät verwenden entfernt diesen lokalen Zugriff. Namen, Chats und Raumcodes werden nicht automatisch beigefügt. Screenshots müssen bewusst ausgewählt werden und können vor dem Absenden entfernt werden.

Screenshots werden im Browser verkleinert und als PNG bis 220 KB gespeichert. Der Server prüft Format, Größe und Pixelzahl und entfernt beim Neucodieren Metadaten. Bericht und Bild sind ausschließlich für Absender, gültigen Gastschlüssel und Ersteller abrufbar. Es gibt keine öffentliche Bild-URL. Pro Identität/IP sind fünf neue Meldungen in zehn Minuten möglich; Wiederholungen derselben Übermittlung erzeugen keine Duplikate. Bei Ausfall steht Kopieren als Rückfallebene bereit.

Neue private Firestore-Collections: `gigFeedback`, `gigFeedbackUsers`, `gigFeedbackReceipts`, `gigFeedbackAdmin`. Die vorhandenen Regeln mit gesperrtem Browserzugriff bleiben richtig; der Server nutzt Firebase Admin. Der Zähler wird mit den Meldungen transaktional geändert. Es wird nichts per E-Mail versendet.

## Ein persönliches Sparziel

Im Shop bei einem noch nicht gekauften kosmetischen Artikel „Darauf sparen“ auswählen. In Lobby und Shop erscheint der Gegenstand mit vorhandenem Guthaben, Preis, Fortschritt und fehlenden Coins. Das Ziel wird im Konto gespeichert, bleibt für andere Spieler privat und lässt sich entfernen oder ersetzen. Es reserviert keine Coins und kauft nichts automatisch. Nach dem Kauf verschwindet die Anzeige. Der Server akzeptiert nur gültige, kaufbare und noch nicht besessene Gegenstände; Ersteller- und Erfolgskosmetik sind ausgeschlossen.

## Prüfung

- `npm test`: 115 Tests bestanden, inklusive privater Meldungen, Gastschlüssel, PNG-Prüfung, Rate-Limit, idempotenter Übermittlung, Erstellerrechten, Status/Zähler, privatem Sparziel und Relay-Entwürfen.
- `scripts/check-feedback-clients.cjs`: drei Clients am echten lokalen Server; Gastmeldung, Erstellerantwort, geschütztes Bild, Sprachwechsel, Sparziel, Freunde und direkter Sound während aktiver Steuerung. Pixel Relay zeichnet mit freier RGB-Farbe, ohne Abgeben-Klick, und prüft die tatsächlichen Pixel auf dem Canvas des anderen Clients nach Zeitablauf.
- Alle 26 Spiele mit drei Socket.IO-/DOM-/Canvas-Clients einschließlich Start, Timer, Zeitsprung, gemeinsamer Pause und spätem Zuschauer geprüft. Bestehende Social- und Community-Abläufe bestanden.
- Alle 26 Ansichten in Desktop-, Touch-, Bewegungsreduktions- und Englisch-Konfiguration geprüft. Alle sechs Three-Szenen auf Geometrie und Kamera geprüft.
- Diese Prüfungen verwenden DOM-Simulation und echtes Canvas bzw. Three-Geometrie. Natives Browserlayout, GPU/WebGL, physische Touchgeräte und hörbare Audiowiedergabe sind damit nicht bestätigt. Produktivkonten und produktive Daten wurden nicht verändert.

Nach dem Merge des Pull Requests lädt Render den neuen Stand mit `npm ci` und `npm start`. Anschließend die Seite neu laden. Bei deaktivierten automatischen Deploys in Render „Deploy latest commit“ ausführen.
