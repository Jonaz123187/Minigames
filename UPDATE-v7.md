# v7 – Dein Charakter, deine Crew

## Spielen und gemeinsame Abläufe

26 Spiele: Neu sind **Pixel-Flüsterpost**, **Finde den Faker**, **Schätz mal!**, **Eine Taste reicht**, **Pixel-Detektiv** und **Gemeinsam gegen die Uhr**. GiG-Arena wurde nicht hinzugefügt. Alle Aufgaben, Spielphasen, geheimen Hinweise, Abgaben, Fristen und Wertungen liegen auf dem Server. Später beigetretene Zuschauer erhalten keine persönlichen Geheimnisse.

- Pixel-Flüsterpost (2–8): Jeder beginnt eine Geschichte; anschließend wandern Text und Pixelzeichnung abwechselnd weiter. Eine gültige Abgabe zählt 100 Kreativpunkte. Am Ende gibt es eine Galerie; eine Stimme für eine fremde Geschichte zählt 50 Punkte für deren Starter. Keine eigene oder doppelte Stimme.
- Finde den Faker (3–8): Zwei Durchgänge mit Zeichnen, Diskussion und Abstimmung. Der Faker kennt nur die Kategorie. Eindeutige Stimmenmehrheit entlarvt ihn; Gleichstand zählt als entkommen. Zeichnung: 25 Punkte für normale Zeichner, richtige Verdächtigung: 50; entkommener Faker: 100.
- Schätz mal! (1–8): Sechs exakt lösbare Zahlenfragen, pro Frage bis 100 Punkte nach relativer Nähe. Antworten bleiben bis zur Auflösung verborgen.
- Eine Taste reicht (1–8): Sechs Aufgaben mit Zielzeit, Landung oder geheimem Grünsignal. Ein verbindlicher Versuch pro Aufgabe, maximal 100 Punkte; Frühstart gibt null. Serverzeit und Verbindungslatenz beeinflussen Reaktionsergebnisse.
- Pixel-Detektiv (1–8): Vier Tafeln mit je einer Veränderung. Merken, kurze Abdeckung, Suchen, Auflösen. Eine Auswahl pro Tafel; schnelle richtige Treffer zählen mehr.
- Gemeinsam gegen die Uhr (2–8): Jeder sieht eine andere Code-Ziffer. Alle verbundenen Spieler müssen den gemeinsamen Code bestätigen. Alle erhalten dieselben Kooperationspunkte. Verlässt jemand die Runde, werden Hinweise für die verbleibende Gruppe neu verteilt.

**Escape / Menübutton** öffnet Lautstärke, Soundboard-Lautstärke pro Spieler, Vollbild, Steuerung und „Wie spielt man das?“. Erklärungen werden nicht automatisch eingeblendet und verlangen keine Bestätigung. Das bisherige Kreuz zum sofortigen Abbruch entfällt. Eigenes Aufgeben und Host-Abbruch für alle sind getrennt und verlangen jeweils eine zweite Bestätigung. Aufgeben gibt keine Rundenpunkte; die Person kann in der Lobby warten oder weiter zuschauen.

Die Runde läuft weiter, solange einzelne Spieler ihr Menü öffnen. Haben alle noch aktiven, verbundenen Teilnehmer das Menü offen, friert der Server die gemeinsame Spielzeit ein: inklusive Countdown, Antwortfristen, Reaktionssignalen und Rennzeiten. Ausgeschiedene und Zuschauer verhindern die Pause nicht. Beim Fortsetzen bleibt die Spielzeit während eines dreisekündigen Countdowns eingefroren. Auch die Aufnahmezeit in Dub Studio berücksichtigt die eingefrorene Spielzeit; Browser-Audio wird während gemeinsamer Pause angehalten.

Der Vollbildmodus umfasst das aktuelle Spiel. Browser können Escape zunächst zum Beenden von Vollbild verwenden; dann öffnet sich das Spielmenü. Auf Mobilgeräten bleiben Menü- und Vollbildbutton verfügbar, soweit die Browser-API unterstützt wird.

Bereitschaft wird über großen „Jetzt bereit machen“-Button, bestätigten Zustand, Text und Markierung in der Spielerliste deutlich. Zuschauer sehen dauerhaft, wem die Kamera folgt; die eigene Steuerung ist deaktiviert.

## Spieleabend

- Eigene Party-Reihenfolge mit bis zu zehn verschiedenen Spielen, zufälliger Mix und Voreinstellungen. Konten speichern bis zu vier Zusammenstellungen.
- Zwei Teams mit Zufallsaufteilung oder Host-Zuweisung. Der Start verlangt besetzte, möglichst gleich große Teams. Persönliche Platzierungen und Coin-Regeln bleiben erhalten; Session-Punkte zählen zusätzlich für das Team. Party-Endscreen zeigt Team-Gesamtsummen.
- Revanche wird vom Host vorbereitet und verlangt erneut die normale Bereitschaft. Eine laufende Playlist wird dadurch nicht übersprungen.
- Messbare Auszeichnungen: richtige Antworten, geöffnete Schlösser, knapper Sieg und ein tatsächlich erfasster Aufstieg seit der Rundenmitte.
- Crew-Rekord für das ausgewählte Spiel neben der bestehenden Crew-Bestenliste.
- Host kann erspielte Lobby-Deko im GiG-Shop kaufen und auswählen; visuelle Reaktionen erscheinen auch am jeweiligen Spieler. Keine neuen Standard-Sounds.
- Transport-Wiederverbindung bis 60 Sekunden mit derselben Spieler-ID, soweit Lobby und Sitzung noch existieren. Der Host wechselt bei Abbruch. Ein bereits ausgeschiedener Spieler wird durch Wiederverbindung nicht wiederbelebt. Neue Teilnehmer können während einer Runde zuschauen und bei der nächsten Runde mitspielen. Ein Serverneustart kann weiterhin keine aktive RAM-Lobby wiederherstellen.

## Pixelatelier und Profil

- Drei Animationsplätze, jeweils ein bis vier selbst gezeichnete 32×32-Bilder und optional ein bis vier Siegerbilder. Bilder duplizieren/entfernen, Radierer, vorheriges Bild durchscheinen lassen, Live-Vorschau, drei Tempi, vorwärts oder vor/zurück. Keine schnellen Blitzanimationen.
- Selbst gemalte Animationen laufen in Profil, Lobby und Podium. Sieger können die eigene Siegersequenz nutzen. Hochgeladene PNG-Profilbilder bleiben statisch. „Bewegung reduzieren“ wird respektiert.
- Acht gespeicherte Looks, gespeicherte Farbpaletten, Bio, bis zu drei HTTP(S)-Links mit Beschriftung, fünf Bannerstile und eigene Profil-Akzentfarbe.
- Profil-Unterbereiche „Profil bearbeiten“, „Aussehen“, „Vitrine & Sammlung“ im unveränderten Dialograhmen. Website-Themes befinden sich unter **Mein Profil → Aussehen**, nicht in den Kontoeinstellungen.
- Fünf private Sammlungsplätze für Flüsterpost und Zeichnungen. Bis zu drei Sammlungen können bewusst in der öffentlichen Vitrine ausgewählt werden. Sketch-Zeichnungen werden als kompakte Pixel-Miniaturen archiviert. Profile lassen sich weiterhin per Link teilen.

## Bereitstellung und Daten

Pull Request prüfen und in `main` übernehmen, Render-Deploy abwarten, Browser vollständig neu laden. Bestehende Firebase-, Supabase- und OWNER_UIDS-Konfiguration bleibt bestehen; keine zusätzliche Umgebungsvariable oder manuelle Datenmigration nötig. Die bisherigen Firestore-Regeln (nur Admin SDK) gelten auch für die neue private Sammlung `gigAnimations`. Der private Supabase-Bucket `gig-media` speichert Animationsstreifen als `avatar-1.png` bis `avatar-3.png`; normale Uploads nutzen weiterhin `avatar.png`. API validiert Pixelanzahl, Slot, Bildanzahl, Links und Freischaltungen. Kontofelder für Guthaben, Käufe oder Besitzerstatus bleiben serverseitig.

Neue Dateien `party-games.js`, `public/crew-update.js`, `public/crew-update.css` und die sechs SVG-Spielvorschauen gehören zum Deploy. Keine neuen npm-Abhängigkeiten. `npm ci` und `npm start` bleiben gleich.

## Validierung und Grenzen

65 automatisierte Tests bestehen und prüfen alle 26 Spiel-Lebenszyklen sowie geheime Aufgaben, Abgaben, Abstimmungen, Pausen, Countdown, Eingaben während Menüs, Zuschauer, Aufgeben, Revanche, Team- und Playlistwertung, Transport-Wiederverbindung, Profilgrenzen, sichere Links und Animationsplätze. Zusätzliche lokale DOM-/Canvas-Prüfungen prüfen alle Spiele und deren Zuschaueransicht, neue Phasen, Spielmenü, Bestätigung und Profil-/Atelieroberflächen.

Der lokale Chromium-Prozess startet in dieser Umgebung nicht zuverlässig (SIGTRAP). Echtes Browserlayout, native Vollbildwechsel, Touch-Bedienung, tatsächliche CSS-Animation und reale Mikrofon-/Firebase-/Supabase-Abläufe sind daher nach dem Deploy zusätzlich zu prüfen. Die neuen Browseroberflächen sind kein Ersatz für einen gemeinsamen Spieltest mit echten Geräten. Keine Aussage über rückwirkende Speicherung aktiver Runden bei Serverneustart.
