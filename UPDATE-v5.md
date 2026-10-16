# MultiplayerGames-GiG v5 einspielen

Dieses Paket enthält das vollständige Projekt. Es baut auf deinem aktuellen
GitHub-Stand auf. Deine Firebase-Konten, Coins, Inventare und Supabase-Dateien
bleiben in den bestehenden Diensten erhalten.

## Was sich ändert

- Dreier-Podium mit Platzierung, Rundenpunkten, Spielstatistik und Lobby-Punktestand.
  Das Party-Finale zeigt die Gesamtwertung und die Anzahl gewonnener Runden.
  Gleichstände werden als geteilte Plätze angezeigt. Im Solo-Training gibt es
  weiterhin keine Multiplayer-Punkte und kein Siegerpodium.
- Pixelavatare atmen auf der Startseite, in der Lobby, in Profilen, im Editor
  und auf dem Podium. Auch hochgeladene Pixelbilder bewegen sich. Nur Platz 1
  jubelt auf dem Podium; die anderen Avatare atmen weiter. Die Einstellung
  „Bewegung reduzieren“ des Geräts wird berücksichtigt.
- „Platz für deine Leute.“ hat auch bei ausgeblendetem Zeilenumbruch ein Leerzeichen.
- Kompakte Kontovorteile im Login- und Registrierungsdialog; Spam-/Junkhinweise
  auch nach erneutem Mailversand und bei Passwort-Reset.
- Größerer Abstand zwischen Crew und Spieleauswahl am Desktop.
- Alle mitgelieferten Soundboard-Sounds sind entfernt. Quick-Chat ist nun stumm.
  Normale Spielsignale und der Siegersound bleiben erhalten.
- Sound-Slots werden im GiG-Shop mit Coins gekauft. Die bestehende ausdrückliche
  Freischaltung deines Erstellerkontos gilt weiterhin. Es werden keine Slots
  durch reine Anmeldung verschenkt.
- Zu jedem eigenen Sound gibt es eine Emoji-Auswahl. Der Lobby-Button zeigt
  nur das Emoji; der volle Name erscheint beim Darüberfahren oder per
  Tastaturfokus als Tooltip. Bestehende Sounds erhalten zunächst 🎵 und können
  ihr Emoji ohne erneuten Datei-Upload ändern.
- Der Benutzername wird bei der Registrierung direkt unter dem Passwort gewählt.
  Er wird vor der E-Mail-Bestätigung privat reserviert und danach automatisch
  ins Profil übernommen. Kontofunktionen bleiben bis zur Bestätigung gesperrt.
  Unbestätigte Namensreservierungen können nach sieben Tagen neu vergeben werden.
  Für alte Konten, die noch keinen Namen haben, bleibt die nachträgliche Namenswahl.
- Veraltete Anmeldenachweise werden nach der Bestätigung aktualisiert, auch
  beim erneuten Öffnen der Seite und bei Rückkehr aus dem Bestätigungstab.
- Die sechs Kontobereiche haben eine feste Dialoggröße mit separatem Scrollbereich.
- Neue Website-Themes im Shop: Mitternacht, Waldlicht, Pflaumenclub, Abendrot
  und eine frei wählbare Farbe. Auswahl unter Konto → Einstellungen →
  „Dein Website-Hintergrund“. Der Hintergrund gilt nur für deine Ansicht und
  wird im Konto gespeichert. Eigene Farben werden für lesbaren Text abgedunkelt.

## Upload auf GitHub

1. ZIP vollständig entpacken. Öffne darin `MultiplayerGames-GiG`.
2. Öffne auf GitHub die **Startseite** von `Jonaz123187/Minigames`.
3. **Add file → Upload files**. Lade die Dateien aus dem Hauptverzeichnis hoch
   und speichere mit **Commit changes**. `server.js`, `accounts.js`,
   `package.json` und `package-lock.json` müssen direkt im Hauptverzeichnis liegen.
4. Öffne auf GitHub **public → Add file → Upload files**. Öffne lokal ebenfalls
   `public` und ziehe **dessen Inhalt** hinein. Unterordner wie `vendor`,
   `previews` und `audio` müssen als ganze Ordner hochgeladen werden.
   Commit speichern.
5. Falls dein Browser beim Hochladen die Ordnerstruktur nicht beibehält:
   Öffne auf GitHub jeweils **public/vendor**, **public/previews** und
   **public/audio** und lade dort die Dateien des gleichnamigen lokalen Ordners hoch.
6. Die Ordner `scripts` und `test` samt Unterordnern kannst du ebenfalls an der
   Startseite des Repositorys als ganze Ordner hochladen. Sie dienen dem Neubau
   des Firebase-Bundles und den Tests; das fertige Bundle ist bereits enthalten.

Keinen zusätzlichen Ordner `MultiplayerGames-GiG` innerhalb des Repositorys anlegen.
Dateien aus `public` gehören nicht ins Hauptverzeichnis. Alte versehentliche
Kopien im Hauptverzeichnis brauchst du für dieses Update nicht zu löschen.
Zugangsdaten und `node_modules` werden nicht hochgeladen.

**Besonders prüfen:**

- `public/accounts-client.js`, `public/accounts.css`, `public/economy.js`
- `public/experience.js`, `public/index.html`, `public/style.css`
- `public/vendor/firebase-auth.js` und `public/vendor/matter.min.js`
- `public/previews/monster.png`
- `server.js`, `accounts.js`, `package.json`, `package-lock.json`

Wer bereits Git oder GitHub Desktop nutzt, kann stattdessen den Projektinhalt
im lokalen Checkout ersetzen und alle Änderungen gemeinsam committen und pushen.

## Render und Datenbanken

Deine bestehenden Environment-Einstellungen bleiben bestehen:
`GOOGLE_APPLICATION_CREDENTIALS` (oder die JSON-Alternative), `SUPABASE_URL`,
`SUPABASE_SECRET_KEY` und deine einzelne UID in `OWNER_UIDS`.

- Build Command bleibt `npm ci`, Start Command bleibt `npm start`.
- Nach dem letzten Upload **Manual Deploy → Deploy latest commit**.
- Wenn Render „Live“ zeigt: Webseite mit **Strg + F5** neu laden.
- Die Firestore-Regeln bleiben unverändert. Der Server legt die neue private
  Sammlung `gigRegistrations` selbst an; du musst keine Sammlung oder Regel öffnen.
- Es sind keine zusätzlichen Supabase-Buckets oder öffentlichen Policies nötig.

## Prüfung

44 automatisierte Tests bestanden. Zusätzliche DOM-Prüfungen mit echten lokalen
HTTP-Endpunkten prüfen Registrierung und Bestätigung, die Erneuerung alter Tokens,
alle sechs Kontobereiche, Emoji-Speicherung und Tooltip, Theme-Speicherung,
Podium einschließlich eigener Bilder, Gleichständen und Solo-Ausnahme.

Chromium lässt sich in der Ausführungsumgebung nicht starten. Die tatsächliche
Darstellung und Animation sollten nach dem Deploy auf PC und Smartphone geprüft
werden. Echte E-Mail-Zustellung und Supabase-Uploads sind nicht mit deinen privaten
Produktionszugängen getestet worden.
