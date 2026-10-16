# GiG v7.3 · Profil, Bedienung und persönliche Arcade

## Korrekturen

- Die Lobby verwendet für klickbare Spielernamen eine eigene Klasse statt der Profil-Link-Buttons. Avatar, Name/Status, Ping, Punkte und Kick stehen in eigenen Grid-Spalten. Der Teamhinweis erhält eine eigene Zeile.
- „Mein Highlight“ hat oben und unten Abstand sowie Trennlinien zur übrigen Sammlung.
- Die Garage zeigt vier Spurauswahlen einschließlich „Keine Spur“ mit Fahrzeug und animierten Partikeln. Modelle und Farben entsprechen der aktuellen Auswahl. Gesperrte Spuren bleiben sichtbar, aber nicht auswählbar. Reduzierte Bewegung wird berücksichtigt.
- Alle nativen Dialoge sperren das Scrollen der Hintergrundseite. Die vorherige Position und vorhandene Inline-Styles werden nach dem letzten geschlossenen Dialog wiederhergestellt. Mehrere geöffnete Dialoge bleiben berücksichtigt. Ein Außenklick schließt erst ab mehr als 32 Pixeln Abstand, wenn Zeigerstart und -ende außerhalb liegen und die Bewegung höchstens 12 Pixel beträgt. Ein Drag aus dem Fenster oder ein Klick direkt am Rand schließt nicht. Das Spielmenü verwendet weiterhin seinen bestehenden Cancel-/Fortsetzen-Ablauf.
- „Bereit“ ist bei nur einer Person deaktiviert. Der Server lehnt entsprechende Ready-Anfragen ebenfalls ab. Solo-Training bleibt direkt startbar.

## Banner-Upload

Der Upload hat eine klare dreistufige Bedienung: Bild wählen, Ausschnitt einstellen, Banner speichern. Status und Fehler stehen direkt im Dialog. Auch andere Fehler beim Speichern im Konto werden dort angezeigt.

Ein sehr detailreiches Testbild überschritt trotz der bisherigen Aufbereitung das Upload-Limit. Kleine PNGs werden unverändert in voller Farbtiefe hochgeladen. Bei Bildern über 420.000 Bytes verwendet der Browser einen eingebauten 256-Farben-PNG-Encoder als Ersatz. Sein Ergebnis ist bei 960 × 480 Pixeln garantiert 462.163 Bytes groß und liegt damit unter dem bestehenden Limit von 480.000 Bytes. Große Motive können dadurch sichtbar weniger Farbabstufungen haben. Die Bildgröße und das private Supabase-Speichermodell bleiben gleich.

Der Server validiert die PNG-Datei vollständig einschließlich CRC und entfernt anschließend Zusatz-Metadaten. Die gültige Palette und die Kompression bleiben erhalten, damit das Bild beim erneuten Kodieren nicht wieder über das Limit wächst. Position und Banner werden mit derselben Upload-Anfrage gespeichert. Keine zusätzliche Abhängigkeit oder Bucket-Konfiguration erforderlich.

## Erstellerprofil

Nur die in `OWNER_UIDS` hinterlegten Konten erhalten die Anzeige „♛ LEVEL MAX · ∞“, eine goldene Gründer-Plakette, einen goldenen Avatarrahmen und die besondere Gründervitrine. API-Level wird für diese Anzeige auf `Number.MAX_SAFE_INTEGER` abgeleitet. Das wird nicht als verdientes Level gespeichert. Echte Runden, Siege, Coins und Rekorde bleiben unverändert. Entfernen einer UID aus der Konfiguration hebt die besondere Darstellung wieder auf. Der Lobby-Host erhält dadurch keine Erstellerrechte.

## Meine Arcade

Unter Mein Profil → Meine Arcade stehen:

- Private Favoriten: über einen eigenen Stern an jeder Spielkarte auswählen, im Katalog filtern und im Profil verwalten. Stern und Spielkarte sind getrennte Buttons. Die Liste wird am Konto gespeichert und nicht im öffentlichen Profil ausgegeben.
- Bis zu vier benennbare Spieleabende mit ein bis zehn Spielen: anlegen, bearbeiten, Reihenfolge durch die Auswahl bestimmen, löschen und als Host in die Lobby laden. Die Lobby kann die aktuelle Zusammenstellung ebenfalls unter einem Namen speichern. Vorhandene Abende werden nicht automatisch überschrieben.
- Persönlicher Rückblick aus echten Multiplayer-Runden: am häufigsten gespieltes Spiel, größte prozentuale Verbesserung eines bestehenden Spielscore-Rekords und knappster Sieg pro unterstütztem Klick-/Wort-/Punktespiel. Neue Messwerte beginnen mit diesem Update. Trainings-, inaktive und doppelt belohnte Runden erzeugen keine Rückblick-Einträge. Die Rückblickdaten bleiben privat.

Bio, Status, Links, hervorgehobene Abzeichen und Aussehensauswahl werden als Entwurf je Konto im Browser gespeichert. Schließen oder Wechseln des Dialogs verliert diese Angaben nicht. Explizites Speichern löscht den jeweiligen Entwurf. Ausgewählte, noch nicht hochgeladene Bilddateien werden nicht dauerhaft im Browser gespeichert.

## Logo

Website-Kopfzeile und Browser-Icon verwenden dieselbe SVG-Datei: weißes abgerundetes Quadrat, dunkles G und blaugrauer Punkt. Die Favicon-URL trägt eine neue Versionskennung gegen einen alten Browser-Cache.

## Validierung

- Alle 72 Tests bestanden, einschließlich neuer Prüfungen für UID-gebundenes Maximum, private Favoriten/Rückblicke, Palette-PNG-Upload mit Ausschnitt und Solo-Ready-Sperre.
- Ergänzende lokale DOM-/Canvas-Prüfungen bestanden: alle 26 Spiele, Profilentwürfe über Tabwechsel, Erstelleranzeige, Spurbilder, benannte Playlist anlegen/bearbeiten, Favoritenfilter, verschachtelte Scroll-Sperren, Klickschutz und Upload eines detailreichen echten Testbilds samt sichtbarer Fehlermeldung bei fehlendem Upload-Dienst.
- SVG bei 16, 32, 38 und 64 Pixeln visuell geprüft; Syntax und `git diff --check` bestanden. Keine neuen Abhängigkeiten; Lockdatei ändert nur die Projektversion.

Nach dem Merge Render deployen lassen und neu laden. Keine Datenmigration oder neue Umgebungsvariable nötig. Native Browser-/WebGL-Darstellung und die privaten produktiven Firebase-/Supabase-Dienste wurden hier nicht geprüft. Insbesondere auf iOS die Hintergrund-Scrollsperre und den Banner-Upload nach dem Deploy ansehen.
