# v10 · Deine Leute, dein Spieleabend

Das Update baut auf v9 auf. Bestehende Konten, Freundschaften, Käufe und Spielstände bleiben erhalten. Es werden keine neuen Laufzeitpakete oder Umgebungsvariablen benötigt.

## Oberfläche und Sprache

- Deutsch/English oben rechts, Wechsel ohne Neuladen. Die Auswahl bleibt in diesem Browser gespeichert. Ein lokaler Katalog übersetzt Navigation, Konto, Shop, Spielhilfen, Fragen und Spielanzeigen sowie Systemmeldungen. Firebase verwendet die gewählte Sprache für neu angeforderte Kontomails.
- Namen, Bios, Links, private Nachrichten, eigene Soundnamen und weitergereichte Geschichten bleiben im Original. Der gemeinsame Tipptext bleibt für alle Spieler identisch. Deutsche und englische Begriffe werden in Sketch & Guess akzeptiert.
- Ab 1.200 px erscheint die Freundesliste als eigenständige Spalte links neben den Lobby-Mitgliedern. Darunter bleibt der Zugriff oben in der Leiste, sodass auf dem Handy kein zusätzlicher langer Abschnitt vor den Spielen entsteht. Gäste erhalten eine kurze Erklärung mit Anmeldung/Registrierung.
- Der erste Account-Hinweis nennt Freunde/Einladungen, Avatar/Profil/Garage, Coins/Abzeichen/Fortschritt und eigene Sounds. Die Homepage verlinkt das Open-Source-Repository. Der Verlassen-Button heißt „Lobby verlassen“.
- Avatar-Reaktionen sind über dem Lobby-Soundboard integriert. Die schwebende untere Leiste ist entfernt.

## Glocke und Erstellerneuigkeiten

- Die Glocke sammelt Neuigkeiten, Freundschaftsanfragen/Annahmen, private Nachrichten, Geschenke und offene Lobby-Einladungen bzw. Beitrittsanfragen. Ungelesene Einträge erhalten einen Zähler; Lesen ist pro Eintrag oder gesammelt möglich. Konten speichern den Lesestand serverseitig, Gäste lokal.
- Ein kurzer optionaler Ton berücksichtigt „Nicht stören“, den Audio-Schalter und Browser-Autoplay-Freigaben. Meldungen werden gebündelt, ohne eine Runde zu unterbrechen.
- Nur die in `OWNER_UIDS` hinterlegten Konten sehen „Neuigkeit veröffentlichen“ und dürfen den geschützten Endpunkt verwenden. Lobby-Hosts erhalten dadurch keine Erstellerrechte.
- In der Glocke Titel und Nachricht auf Deutsch und Englisch eingeben, Laufzeit 1–90 Tage wählen und optional 0–500 Coins pro Konto anbieten. Veröffentlichungen können entfernt werden. Die erste Update-Nachricht ist bereits eingebaut.
- „Coins abholen“ braucht ein bestätigtes Konto. Eine Firestore-Transaktion prüft die aktuelle Aktion und schreibt dauerhafte individuelle Belege. Gleichzeitige Klicks, spätere Wiederholungen oder ein anderes Gerät führen zu keiner doppelten Gutschrift. Aktions-Coins erzeugen keine Siege, Rekorde oder erspielten Fortschritte.
- Neue private Admin-Collections: `gigCommunity`, `gigCommunityReaders`, `gigCommunityClaims`. Bestehende `gigSocial`-Dokumente erhalten bei Bedarf die begrenzte Benachrichtigungshistorie. Alle Schreibrechte bleiben beim Server; keine offenen Client-Regeln ergänzen.

## Soundboard, Einladungen und Shop

- „Wartezimmer-Sounds“ heißt überall „Soundboard“. In jedem Spiel und im ESC-Menü öffnet ein kleiner Button das eigene Soundboard. Es gibt weiterhin ausschließlich gekaufte Slots mit eigenen MP3s; keine vorinstallierten Standardsounds.
- Dasselbe Soundboard wird in das Overlay versetzt und beim Schließen zurückgestellt. Mute, eigene Emoji-Buttons, Spielerlautstärken, Entitlements, Lobby-Isolation und 5,5 Sekunden Cooldown bleiben wirksam. Das Öffnen alleine pausiert das Online-Spiel nicht.
- Unter Soundboard lassen sich Slots den Kombinationen Alt + 1–9 zuweisen. Doppelte Belegungen werden abgewiesen; die Spieltasten werden nicht überschrieben. Kürzel werden pro Konto auf dem Gerät gespeichert.
- Einladungen zeigen Spiel, Anzahl und Namen der Mitglieder sowie den aktuellen Rundenstatus. Bei laufendem Spiel erklärt die Vorschau den Zuschauerbeitritt bis zur nächsten Runde. Bestätigte Lobbywechsel und erneute Serverprüfungen bleiben erhalten.
- „Anprobieren“ zeigt das eigene Profil mit kombinierbaren Rahmen, Themes, Avatar-Paketen, Fahrzeug-/Spuren-Vorschau und weiteren optischen Artikeln. Andere Personen sehen diese Vorschau nicht. Erst ein bestätigter Kauf gibt Coins aus; Erfolge bleiben erspielbar.
- Der bereits vorhandene Gast-zu-Konto-Übergang übernimmt den gestalteten Avatar und verknüpft die aktive Lobby nach erfolgreicher Bestätigung. Es gibt keine rückwirkenden Coins für Gast-Runden.

## Preise und Belohnungen

Die meisten kosmetischen Preise steigen auf das Fünffache, auf 50 Coins gerundet. Ausnahmen und Beispiele:

| Artikel                    |                                     Coins |
| -------------------------- | ----------------------------------------: |
| Kleine Titel               |                                       450 |
| Avatar-Pakete              |                                 500–1.100 |
| Rahmen/Fahrzeugspuren      |                                       750 |
| Profil-Themes              |                                 800–1.100 |
| Begleiter                  |                                     1.000 |
| Fahrzeuge                  |                               1.250–2.250 |
| Eigenes Pixelatelier       |                                     2.400 |
| Sound-Slots 1–6            | 500 / 800 / 1.200 / 1.800 / 2.400 / 3.000 |
| Garagen-Upgrade, Stufe 1–5 |         300 / 600 / 1.200 / 2.400 / 4.800 |

Bereits erworbene Artikel und Upgrades bleiben freigeschaltet; der Kontostand wird nicht rückwirkend verändert. Geschenke verwenden dieselben Serverpreise. Slots bleiben nacheinander freizuschalten.

Die bisherigen 20 Teilnahme-Coins plus 30/15/5 für Platz 1/2/3 bleiben die Basis. Golf und Monster Trails geben den dreifachen Betrag; Grand Prix, Dub, Sketch & Guess, Pixel Relay, Sketch Suspect, Pixel Shift und Code Crew den doppelten. Die Einstufung folgt dem Spiel und lässt sich durch längeres Warten nicht erhöhen. Mindestens zwei Identitäten, aktive Teilnahme, mindestens acht Sekunden tatsächliche Spielzeit und die bestehenden Belegprüfungen gelten weiterhin. Pausen zählen nicht zur Mindestspielzeit, Training bringt keine Coins.

## Meme Dub und Golf

- Neue Lobbys starten mit leerem Clip-Pool, ohne automatisch nutzbare Demo-Vorlage. Ohne gültige eigene Audiospur startet Meme Dub nicht: „Bitte lade zuerst MP3-Dateien für die Runde hoch.“ Bei zu wenigen ungespielten Vorlagen wird die Rundenzahl genannt. Explizite Playlists prüfen auch wiederholte Dub-Einträge vor dem Start; Revanchen brauchen ebenfalls verfügbare Vorlagen.
- Golf: maximale Anfangsgeschwindigkeit 1.050 statt 650. Eine progressive Kraftkurve hält kurze Putts dosierbar; voller Zug bringt wesentlich mehr Strecke. Vorschau und Server verwenden dieselbe Simulation, die Vorschau umfasst bis zu sechs Sekunden inklusive Abprallern. Die feinen Kollisionsschritte verhindern auch bei voller Kraft das Durchspringen von Wänden.
- Individuelle Symbole ergänzen Spielerfarben in Lobby, Live-Wertung und Spielfiguren. In beiden 3D-Autospielen sind sie als kleine Marker am Fahrzeug sichtbar; Hitboxen und Fahrwerte bleiben gleich.

## Fehler melden

Im ESC-Menü kann man einen Bericht mit Beschreibung vorbereiten. Spiel, Phase, Version, Verbindung und Sprache werden ergänzt. Der Text ist vor dem Kopieren sichtbar. Es wird nichts automatisch übertragen und kein GitHub-Issue im Namen des Nutzers erstellt.

## Validierung

- 105 Node-Tests einschließlich neuer Community-, Coin-Aktions-, Freundschafts-, MP3-Start-, Soundboard-, Preis-, Upgrade-, Golf- und Sprachfälle.
- Alle 26 Spiele mit drei tatsächlichen Socket.IO-/DOM-/Canvas-Clients, spätem Zuschauer, Countdown, Clock-Sprung und gemeinsamer Pause/Fortsetzung. Relay umfasst erneut die vollständige Satz–Bild–Beschreibung-Kette und remote gerenderte Farb-Pixel.
- Mehrere Testkonten durchlaufen Suche, Zustimmung, Einladung, Chat, Geschenk mit neuem Preis, privates Profil, Reaktionen, Ziele, Steuerung und gemeinsame ESC-Rückkehr ohne spätes Podium.
- Neue UI-Prüfung: Freundespalte, Sprachwechsel und geschützte Nutzerdaten, kombinierte Shop-Vorschau ohne Abbuchung, gelesene Glocke, zweisprachige Ankündigung, einmaliger Bonus mit aktualisiertem Wallet, Soundboard im laufenden Spiel und überprüfbarer Fehlerbericht.
- Alle 26 Ansichten mit acht Spielern für Desktop, Touch-Größe, reduzierte Bewegung und englische Oberfläche. Alle sechs tatsächlichen Three-Szenen einschließlich Fahrzeugmarkierungen geprüft.
- JavaScript-/ES-Modulsyntax, CSS, lokale Assets und Git-Diff geprüft.

Diese Tests nutzen DOM/Canvas und echte Three-Geometrie, aber keinen nativen WebGL-Browser. Reale GPU-Bildrate, physisches Handy, Mikrofon-/Autoplay-Verhalten und Tastenkürzel auf verschiedenen Betriebssystemen sind dadurch nicht bestätigt. Produktionskonten wurden nicht verwendet.

Aktivierung: Pull Request prüfen/mergen und Render den neuen Commit deployen lassen.
