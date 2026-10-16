# v6 – lebendige Pixelavatare und Kontofortschritt

## Neu

- Baukasten-Avatare bewegen Oberkörper, Kopf, Ober- und Unterarme sowie Beine
  unabhängig. Augen blinzeln, Haare und Accessoires folgen dem Kopf. Die Posen
  wechseln sichtbar in zwölf Schritten. Platz 1 hebt die Arme und hüpft.
- Hochgeladene Bilder bleiben auch auf dem Podium unbewegt. Geräte mit
  „Bewegung reduzieren“ erhalten eine ruhige Darstellung.
- Gäste können ihren Look ausprobieren und direkt aus dem Avatar-Editor
  „Mit Konto deinen Look speichern“ wählen. Der freigegebene Look wird bei
  der Registrierung übernommen; kostenpflichtige Avatarteile bleiben gesperrt.
- Das Anmeldefenster zeigt den eigenen animierten Avatar, eine Profilvorschau
  und ein Beispiel für einen eigenen Sound-Button. Der Beispielbutton spielt
  keinen Sound ab. Sound-Slots werden weiterhin im Shop mit Coins freigeschaltet.
- Bestätigte Konten bekommen einmalig **50 GiG-Coins**. Auch bestehende
  bestätigte Konten erhalten den Bonus beim nächsten Laden ihres Profils.
  Die Vergabe geschieht atomar auf dem Server und bleibt bei parallelen
  Anmeldungen einmalig. Der Bonus erfindet keine Siege, Rekorde oder Spielrunden.
- Aktive, gewertete Multiplayer-Runden speichern persönliche Bestleistungen.
  Profile zeigen bis zu vier Spielrekorde mit der passenden Spielstatistik.
  Solo-Training, kurze oder inaktive Runden erzeugen weiterhin keine Coins.
- „Crew-Bestenliste“ zeigt die angemeldeten Spieler der aktuellen Lobby,
  sortiert nach bisherigen Multiplayer-Siegen und Runden. Es handelt sich
  um gespeicherte Kontostatistiken, nicht um die Punkte des aktuellen Abends.
  Der Zugriff ist an die eigene Lobby gebunden und liefert keine privaten
  E-Mail-Adressen, Guthaben oder Kaufdaten.
- Vier Titel sind ausschließlich erspielbar: Crew-Stammgast (25 Runden),
  Siegertyp (5 Siege), Pixel-Picasso (Sketch-Sieg) und Trail-Legende
  (Monster-Trails-Sieg). Auswahl anschließend unter „Mein Profil“.
  Dein explizit konfiguriertes Erstellerkonto behält alle Freischaltungen.
- Nach einer berechtigten Gästerunde erscheint ein kleiner Hinweis direkt
  am Endscreen: wie viele Coins diese Runde mit Konto gebracht hätte.
  Die Berechnung nutzt dieselben Serverregeln wie die echte Vergabe.
  Es gibt kein neues Pop-up und keine rückwirkende Coin-Gutschrift.
- Ein Gast, der sich inzwischen registriert hat, kann zwischen den Runden
  mit seinem Konto in derselben Lobby weiterspielen. Kontobestätigung und
  eindeutige Kontoidentität werden am Server geprüft; laufende Runden ändern
  ihre Teilnehmeridentitäten nicht.

## Bereitstellung

Den Pull Request in `main` übernehmen, anschließend den Render-Deploy abwarten
oder „Manual Deploy → Deploy latest commit“ wählen. Danach vollständig neu laden.

Bestehende Firebase-, Supabase- und `OWNER_UIDS`-Einstellungen bleiben gültig.
Es werden keine neuen öffentlichen Regeln, Buckets oder Cloud-Dienste benötigt.
Neue Profilfelder werden beim nächsten Gebrauch ergänzt.

`public/avatar-motion.css` ist eine neue benötigte Datei und wird mitgeliefert.
`npm run build:avatars` erzeugt sie aus den Gelenkposen in `public/economy.js`.
Die statischen SVG-Vorschauposen und die Browser-Animation verwenden dieselben
Bewegungsdaten. Das Build Command auf Render bleibt `npm ci`.

## Prüfung

50 automatisierte Tests bestanden, einschließlich gleichzeitiger Bonus-Anfragen,
Übernahme des Gast-Avatars, Rechteprüfung, Rekorden, erspielbaren Titeln,
Gästerunden und Crew-Datenschutz. Zusätzliche lokale API-/DOM-Prüfungen prüfen
die Kontovorschau, die Registrierung mit gewähltem Look, die einmalige Gutschrift,
die Crew-Sortierung und den Endscreen-Hinweis ohne Pop-up.

Eine GIF-Vorschau wurde aus den gleichen Körperposen erzeugt und visuell geprüft.
Der separate Testbrowser erreicht den lokalen Server nicht. Die tatsächliche
Darstellung im Browser und auf Smartphones sowie echte Cloud-Zustellung und
Uploads sollten deshalb nach dem Deploy kontrolliert werden.
