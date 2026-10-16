# MultiplayerGames-GiG · Version 4

Entwickelt von Jonas N. Node.js, Express, Socket.IO und Vanilla JavaScript. 20 Spiele, jetzt mit Firebase-Konten, Pixelart-Profilen, GiG-Coins, privaten Uploads und **GiG Monster Trails**. Alle bisherigen Spiele einschließlich Meme Dub Studio, Sketch & Guess und GiG Grand Prix bleiben erhalten. Grand-Prix-Lenkung: A/← links, D/→ rechts.

**Wichtig:** Das Update läuft auch ohne Cloud-Zugangsdaten im Gastmodus. Ein sichtbarer Firebase-Web-Konfigurationsblock ist kein Server-Schlüssel und reicht allein nicht zum Speichern. Anmeldung und Uploads werden erst mit den nachfolgenden Schritten verfügbar. Zugangsdaten gehören weder ins Repository noch in Chats.

Für ein Update einer bereits eingerichteten v4 siehe **[UPDATE-v5.md](UPDATE-v5.md)**.

## 1. Firebase vorbereiten

1. Öffne https://console.firebase.google.com/ und dein bestehendes Projekt `multiplayergames-gig`. Spark genügt für den Einstieg. Analytics und Firebase Storage werden nicht benötigt.
2. Unter **Authentication → Sign-in method / Anmeldemethode** aktiviere **E-Mail/Passwort**. E-Mail-Link-Anmeldung ist nicht notwendig.
3. Unter **Authentication → Settings / Einstellungen → Authorized domains / Autorisierte Domains** ergänze `multiplayergames-gig.onrender.com`, ohne Protokoll und Pfad. Für lokale Entwicklung kannst du zusätzlich `localhost` eintragen.
4. Unter **Firestore Database → Datenbank erstellen** wähle **Standard**, die Datenbank-ID **(default)** und **Produktionsmodus**. Wähle möglichst eine europäische Region; dieser Standort lässt sich später nicht einfach ändern. Keine Sammlungen von Hand anlegen.
5. Unter **Firestore → Rules / Regeln** veröffentliche den Inhalt von `firestore.rules`. Browser dürfen Daten nicht direkt verändern. Der vertrauenswürdige Node-Server prüft Firebase-Tokens, vergibt Coins und schreibt über das Admin SDK.
6. Unter **Projekteinstellungen → Dienstkonten → Firebase Admin SDK → Neuen privaten Schlüssel generieren** lade eine Dienstkonto-JSON herunter. Bewahre sie privat auf. Lade sie **nicht** auf GitHub oder in den Chat.
7. Optional unter **Authentication → Templates / Vorlagen** Absendername und Sprache der Bestätigungs- und Passwort-Reset-E-Mails prüfen. Der Code setzt Deutsch und fordert eine Bestätigung an. Ein Konto ohne bestätigte Adresse erhält keine Coins und kann keine Käufe oder Uploads durchführen.

Die bereits mitgeteilte öffentliche Web-Konfiguration ist in `accounts.js` enthalten. Analytics wird nicht geladen. Das öffentliche `storageBucket`-Feld aktiviert oder verwendet keinen Firebase-Dateispeicher.

## 2. Supabase vorbereiten

1. Öffne https://supabase.com/dashboard und dein Projekt `goycxzibucgklomlgyij` im Free-Tarif.
2. Bei der Meldung zu fehlenden Rechten: deine eigene Organisation auswählen bzw. selbst erstellen. Zum Einrichten des Speichers benötigst du die entsprechenden Projektberechtigungen.
3. Unter **Settings → API Keys** einen **Secret key** (`sb_secret_…`) für deinen Server anlegen bzw. kopieren. Kein `publishable`-Key: Der Server benötigt Schreibrechte. Der Schlüssel wird ausschließlich in Render hinterlegt.
4. Du musst keine SQL-Tabellen und keine Supabase-Spielerkonten anlegen. Konten und Fortschritt liegen in Firebase.
5. Der Server legt bei der ersten Datei-Anfrage den **privaten** Bucket `gig-media` an, wenn er noch nicht existiert: maximal 500.000 Bytes je Datei, erlaubte Typen `image/png` und `audio/mpeg`. Du kannst ihn alternativ selbst mit genau diesen Werten erstellen. Einen bereits existierenden öffentlichen Bucket dieses Namens lehnt der Code ab; stelle ihn dann ausdrücklich auf privat.
6. Keine öffentlichen Upload-Policies anlegen. Der Server entscheidet anhand des bestätigten Firebase-Kontos und der gekauften Freischaltungen, wer etwas hochladen darf. Downloads nutzen kurzzeitig signierte Links. Eigene Profilbilder werden wie gewünscht öffentlich auf den Profilen angezeigt; Sounds werden mit der aktuellen Lobby geteilt.

**Limits:** MP3 bis 500.000 Bytes (500 KB), maximal fünf Sekunden und echtes MPEG Layer III. PNG quadratisch, 16 bis 64 Pixel, maximal 20 KB. Der Server prüft zusätzlich zum Browser. Ein erneuter Upload ersetzt die Datei desselben Slots, sodass sich keine Versionssammlung aufbaut. Sechs Slots pro Konto ergeben bei zehn Spielern höchstens ca. 30 MB MP3-Nutzdaten. Speicher- und Download-Kontingente der Anbieter gelten trotzdem; dauerndes Abspielen erzeugt Traffic.

## 3. Render konfigurieren

Öffne https://dashboard.render.com/ → deinen bestehenden Web Service.

- **Build Command:** `npm ci`
- **Start Command:** `npm start`
- Node.js **22 oder neuer**; im Repository wird `>=22` verlangt.
- Optional **Health Check Path:** `/health`.

Unter **Environment → Secret Files → Add Secret File**:

- Dateiname: `firebase-admin.json`
- Inhalt: der vollständige Inhalt der privat heruntergeladenen Firebase-Dienstkonto-JSON.

Unter **Environment → Environment Variables**:

| Name                             | Wert                                                        |
| -------------------------------- | ----------------------------------------------------------- |
| `GOOGLE_APPLICATION_CREDENTIALS` | `/etc/secrets/firebase-admin.json`                          |
| `SUPABASE_URL`                   | `https://goycxzibucgklomlgyij.supabase.co`                  |
| `SUPABASE_SECRET_KEY`            | dein privater Supabase-Secret-Key                           |
| `OWNER_UIDS`                     | zunächst leer; nach deiner Registrierung deine Firebase-UID |

Alternative zum Secret File: den vollständigen Dienstkonto-JSON-Inhalt in `FIREBASE_SERVICE_ACCOUNT_JSON` hinterlegen. Nutze eine der beiden Methoden. Die JSON-Variante hat Vorrang. Setze niemals einen privaten Schlüssel in `public/`, HTML oder Frontend-JavaScript.

Speichern und neu deployen. Die Web-Konfiguration ist bereits enthalten; es sind keine `VITE_*`-Variablen nötig. Render Free bleibt möglich. Bei Inaktivität kann der Dienst einschlafen; beim Aufwachen kann die erste Verbindung dauern. Ein Render-Neustart beendet Lobbys, Session-Punkte und vorübergehende Dub-Aufnahmen. Gespeicherte Konten, Coins und Uploads bleiben in den externen Diensten erhalten.

## 4. Dein Besitzerkonto freischalten

1. Öffne die aktualisierte Webseite und registriere dich mit deiner E-Mail-Adresse.
2. Bestätige deine E-Mail über den Link. Danach einen eindeutigen Benutzernamen festlegen: 3–20 Buchstaben, Zahlen oder `_`; `Gast` am Anfang ist für Gäste reserviert.
3. Öffne oben rechts dein Konto → **Einstellungen → Konto-ID kopieren**. Alternativ findest du die UID unter Firebase **Authentication → Users**.
4. Hinterlege exakt diese UID in Render als `OWNER_UIDS`, speichern und neu deployen. Bei mehreren Besitzern UIDs mit Kommas trennen.
5. Danach neu einloggen bzw. die Seite neu laden. Alle Avatar-Sets, das Pixelatelier, sechs Sound-Slots, Fahrzeugmodelle, Profil-Themen, Rahmen, Begleiter, Titel, Vitrinen und Siegereffekte sind freigeschaltet. Deine eigenen Solo-Upgrades gelten als Stufe 5. Der Code erfindet keine Siege oder Rekorde und setzt dein Coin-Guthaben nicht künstlich hoch.

Du musst dafür weder deine E-Mail-Adresse noch dein Passwort weitergeben. Benutzername und E-Mail können dich nicht zum Besitzer machen; nur die serverseitig gesetzte UID.

## 5. Was neu ist

- Anmeldung mit bleibender Browser-Sitzung, E-Mail-Bestätigung, erneutem Versand und Passwort-Reset. Ein leicht schließbarer Kontohinweis erscheint für Gäste, bis er verworfen wurde. Login bleibt oben rechts erreichbar.
- Öffentliche Profile über `/profile?u=FIREBASE_UID`, mit Banner, Bio, Lieblingsspiel, Statistik, Level, Abzeichen-Vitrine, Rahmen und Pixel-Begleiter. Öffentliche APIs geben keine E-Mail, Coin-Bilanz, Kaufhistorie oder Sound-Metadaten heraus.
- Originaler 32×32-Pixel-Baukasten mit neun kombinierbaren Kategorien, Menschen, Tieren, Robotern, Monstern, Frisuren, Outfits und Quatsch-Accessoires. Große Vorschau und größere Lobby-Avatare. Ein Starter-Set ist frei, weitere Sets werden erspielt.
- Das kaufbare Pixelatelier enthält einen Touch-Zeicheneditor und PNG-Uploads. Bilder anderer Formate bitte vorher als kleines Pixel-PNG exportieren.
- GiG-Shop mit festen Preisen, ohne Zufallsboxen: Themen, Titel, Avatarrahmen, Begleiter, Siegereffekte, Fahrzeugmodelle, Fahrzeugspuren, größere Vitrine und Sound-Slots.
- Standard-Soundboard mit gezielter Freigabe des Audiokontexts; eigene MP3-Sounds in der Lobby. Alle 5,5 Sekunden ein eigener Sound. Soundboards lassen sich unabhängig von anderen Spieleffekten stummschalten. Im aktiven Dub-Spiel sind Soundboard-Effekte gesperrt.
- Host kann andere Spieler während Lobby oder Runde kicken. Beim erneuten Beitrittsversuch fragt eine Meldung den Host: zulassen oder bis zur Auflösung dieser Lobby sperren. Wiederholte Versuche derselben Identität erzeugen keine Meldungsflut. Konten werden an der UID erkannt; Gäste an einem signierten Browser-Cookie. Löschen von Browserdaten oder ein anderer Browser lässt sich bei anonymen Gästen nicht zuverlässig zuordnen.
- Raumcode standardmäßig `••••••`. Klick kopiert ihn, ohne ihn in einer Meldung preiszugeben. Separater Anzeigen-/Verbergen-Button. Einladungslinks enthalten den Code weiterhin, weil sie zum Beitreten benötigt werden.

## 6. GiG-Coins und Fairness

Nur bestätigte Konten können Coins sammeln. Gäste spielen mit `Gast-` vor ihrem gewählten Namen und haben kein Cloud-Profil.

Eine abgeschlossene Multiplayer-Runde mit mindestens zwei unterschiedlichen Teilnehmer-Identitäten bringt bei aktiver Teilnahme **20 GiG-Coins**, dazu **30 / 15 / 5** für Platz 1 / 2 / 3. Gleichstände erhalten denselben Platzbonus. Die Runde muss mindestens acht Sekunden nach dem Countdown dauern. Reines Warten, Abbruch, Verlassen oder Solo-Training bringt keine Coins. Der Server berechnet die Wertung; ein Round-ID-Beleg verhindert doppelte Gutschriften. Bei Datenbankfehlern erscheint eine Meldung, statt einen nur vorübergehend gespeicherten Kontostand vorzutäuschen. Eine beim Serverabsturz noch nicht abgeschlossene Speicherung kann nicht garantiert werden.

Erfolgs-Abzeichen werden unabhängig von Käufen vergeben: erste gewertete Runde, fünf Siege, 25 Runden, ein Sieg in Sketch & Guess und ein Sieg in Monster Trails. Sie lassen sich in der Profilvitrine auswählen.

## 7. GiG Monster Trails

Eigenständiges, an Monster Tracks von Fancade angelehntes Spiel mit eigenen Strecken und Modellen. Kein Originalcode und keine Originalgrafiken wurden übernommen. Es ist keine identische Nachbildung aller Original-Level.

- Drei blockige 3D-Strecken: Wiese, Canyon und Frost. Echte Matter.js-Rad-/Chassisphysik mit Federung, Rampen, Lücken, Holz-Hindernissen und einer beweglichen Brücke. Ohne WebGL gibt es eine Canvas-Ersatzansicht.
- **D / → / W / ↑:** Gas; **A / ← / S / ↓:** Bremse und rückwärts. In der Luft drehen diese Eingaben das Fahrzeug; Gas kurz lösen oder gegensteuern. Auf Touchgeräten erscheinen zwei große Pedale. Dauer-Vollgas allein endet auf den getesteten Basis-Strecken vor dem Ziel.
- Gleiche Strecke und getrennte Physikwelten: Mitspieler erscheinen durchsichtig als Geister und können dich nicht wegschieben. Nach einem Ausfall folgt die Kamera einem noch aktiven führenden Spieler.
- Alle fahren online mit dem Upgrade-Profil des Teilnehmers mit der niedrigsten **Summe** aus Motor-, Grip- und Gewichts-Stufen. Bei Gleichstand wird deterministisch nach Motor und Grip ausgewählt. Alle nutzen genau dieses gemeinsame Profil. Ein Gast bringt Basiswerte mit. Werte werden beim Start eingefroren; Käufe wirken erst in einer späteren Runde.
- Fünf kosmetische Modelle: Monstertruck, Trail Jeep, Rally Sport, Party-Bus und Entenexpress. Ihre Kollisionsform bleibt im Wettbewerb gleich. Kosmetische Fahrzeugspuren sind ebenfalls sichtbar.
- Solo-Training nutzt deine eigenen gespeicherten Upgrades, verdient aber keine Coins. Fahrzeuge und Leistungs-Upgrades werden mit vorher online verdienten GiG-Coins gekauft. Streckenmarker sind Match-Statistik, keine zweite Coin-Währung.
- Nach dem ersten Zieleinlauf verbleiben 15 Sekunden, danach zählen Zieleinlaufzeit und erreichte Distanz. Highlights zeigen längste Airtime und weiteste Strecke.

## Lokal starten und prüfen

```bash
npm ci
npm start
```

Öffne http://localhost:3000. Für Konten lokal eigene Zugangsdaten als Umgebungsvariablen setzen; `.env.example` beschreibt sie. Node kann mit `node --env-file=.env server.js` gestartet werden, wenn du eine private lokale `.env` angelegt hast. Trage `localhost` in Firebase ein. HTTPS ist online insbesondere für Mikrofon und Zwischenablage erforderlich.

```bash
npm test
npm run build:auth
```

Der zweite Befehl erzeugt das bereits mitgelieferte, lokal ausgelieferte Firebase-Auth-Bundle neu. Firebase ist ein SDK, kein zusätzliches UI-Framework. Tests prüfen Spielregeln, Socket-Lebenszyklen, Rechte, Coin-Transaktionen, Profil-Datenschutz und Upload-Validierung. Reale Firebase-/Supabase-Verbindungen und E-Mail-Zustellung müssen mit deinen privaten Zugangsdaten nach der Einrichtung zusätzlich geprüft werden.

Offizielle Einrichtungshilfen: https://firebase.google.com/docs/admin/setup · https://firebase.google.com/docs/auth/web/manage-users · https://firebase.google.com/docs/firestore/quickstart · https://supabase.com/docs/guides/storage · https://render.com/docs/configure-environment-variables

## Update manuell auf GitHub übernehmen

Die GitHub-Verbindung dieser Arbeitssitzung konnte dein Repository lesen, hat Schreibzugriffe aber mit HTTP 403 abgelehnt. Es wurde deshalb kein Remote-Branch oder Pull Request erstellt und `main` nicht verändert.

1. Die gelieferte ZIP entpacken. Im enthaltenen Ordner `MultiplayerGames-GiG` liegen `server.js`, `package.json`, `public/` usw.
2. Öffne https://github.com/Jonaz123187/Minigames und wähle **Add file → Upload files**.
3. Ziehe **den Inhalt** von `MultiplayerGames-GiG` in die Upload-Fläche, also die Dateien und Unterordner. Lade nicht die ZIP selbst und nicht den übergeordneten Ordner hoch. `server.js` und `package.json` müssen weiterhin direkt im Repository-Hauptverzeichnis liegen. `node_modules` und Zugangsdaten gehören nicht hinein; sie sind auch nicht in der ZIP enthalten.
4. Wähle unten **Create a new branch for this commit and start a pull request** und einen Namen wie `gig-v4-update`. Änderungen vorschlagen und den Pull Request prüfen.
5. Die Firebase-/Supabase-Zugangsdaten in Render vorbereiten und den Pull Request zusammenführen, sobald du das Update veröffentlichen möchtest. Wenn Render mit Auto-Deploy auf `main` eingestellt ist, startet danach die Bereitstellung. Sonst im Render-Dashboard **Manual Deploy → Deploy latest commit** wählen.
6. Nach der Bereitstellung: Browser vollständig neu laden, registrieren, Bestätigungs-E-Mail testen, Benutzernamen festlegen und die UID wie oben als `OWNER_UIDS` eintragen. Anschließend mit einem Freund eine Runde und einen kleinen MP3-Upload prüfen.

## Prüfung dieses Updates

- 40 automatisierte Tests bestanden: bisherige Spielregeln, 20 Socket-Spielzyklen, private Zustände, Host-Rechte, eindeutige Kontonamen, Coin-Transaktionen, Besitzer-Freischaltungen und Datei-Grenzen.
- Zusätzliche DOM-Prüfung: verdeckter Raumcode, Kick-Schaltflächen, Avatar-Auswahl, Anmeldeformulare, alle sechs Kontoseiten sowie Tastatur- und Touch-Pedale.
- Alle drei Monster-Trails-Basisstrecken sind in der Simulation mit dosierter Steuerung erreichbar. Dauer-Vollgas scheitert; auch vollständig ausgebaute Fahrzeuge können die Strecken abschließen.
- Die neuen Avatare und die aus der tatsächlichen Three.js-Szene erzeugte Spielvorschau wurden visuell geprüft.
- Reale Firebase-/Supabase-Verbindungen, E-Mail-Zustellung sowie ein vollständiger WebGL-/Mobilgeräte-Test stehen nach der Einrichtung noch aus. Diese Arbeitsumgebung konnte keinen vollständigen Browser mit WebGL starten.
