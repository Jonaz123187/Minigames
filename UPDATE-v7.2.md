# GiG v7.2 · Garage, Profile und Spielcover

## Garage

Fahrzeug und Spur lassen sich direkt in der Garage auswählen und gemeinsam speichern. Alle fünf Modelle sind als Bild sichtbar, mit Auswahlmarkierung und Hinweis für gesperrte Modelle. Pickup mit Ladefläche, Jeep mit Dachscheinwerfern und Reserverad, flacher Sportwagen mit Spoiler, hoher Party-Bus und Entenexpress haben eigene Karosserien. Die Vorschaubilder und die 3D-Modelle verwenden dieselben geometrischen Bauteile. Monster Trails zeigt sie auch in der 2D-Ersatzansicht; Grand Prix nutzt die neuen 3D-Karosserien mit einem zusätzlichen Streifen in Spielerfarbe.

Es gibt keine neuen Käufe: vorhandene Fahrzeug- und Spur-Freischaltungen gelten weiter. Die Spur ist weiterhin auch unter Profil → Aussehen erreichbar. Die bestehenden Spureffekte werden in Monster Trails verwendet. Physik, Kollisionskörper, Federung, Radpositionen und Upgrade-Regeln wurden nicht geändert.

## Profil

Avatar und Name, Beschreibung, Links, Statistik, Rekorde und Sammlung haben deutlich getrennte Bereiche. Bio und Links erhalten mehr Abstand, Links bleiben beschriftete Buttons. Ein optionaler Status mit Emoji und ein hervorgehobenes bereits verdientes Abzeichen ergänzen das Profil. Änderungen an Bio, Status, Links, Lieblingsspiel und Abzeichen aktualisieren die Vorschau während der Eingabe.

Unter Profil → Aussehen kann ein eigenes Bild als Banner hochgeladen und der vertikale Ausschnitt angepasst werden. PNG, JPEG und WebP bis 8 MB werden im Browser in ein PNG mit 960 × 480 Pixeln umgewandelt. Der Server prüft Abmessungen, PNG-Signatur und CRC, dekodiert das Bild neu und begrenzt die Datei auf 480.000 Bytes. Zu detailreiche Motive werden mit einer Meldung abgelehnt. Der Banner wird im bestehenden privaten Supabase-Bucket unter dem Konto des angemeldeten Nutzers gespeichert. Eine öffentliche Profilroute liefert nur für einen tatsächlich ausgewählten Banner einen kurz gültigen signierten Link. Entfernen blendet das eigene Bild aus und deaktiviert diese Route; die Datei verbleibt als nicht mehr veröffentlichte Datei im privaten Bucket bis zum nächsten Überschreiben. Eingebaute Banner funktionieren auch ohne Upload-Dienst.

Öffentliche Profile enthalten nur die gewählten neuen Profilfelder. E-Mail, Coins und private Zeichnungen bleiben privat. Status und Position werden serverseitig bereinigt/begrenzt, gesperrte Abzeichen und Fahrzeuge lassen sich nicht durch Profil-Anfragen freischalten.

## Lobby und Cover

Teammodus steht als standardmäßig geschlossener Abschnitt in der linken Lobby-Leiste. Checkboxen und Beschriftungen in Lobby und Kontoeinstellungen sind nebeneinander ausgerichtet. Der Teamabschnitt behält seinen aufgeklappten Zustand bei Lobby-Aktualisierungen.

Alle 26 Spiele verwenden die zusammengehörigen Cover unter `public/previews/covers/`. Die 18 älteren Spiele haben neue Motive; die acht Cover aus v7.1 bleiben erhalten. Auch die beiden Bilder auf der Startseite wurden umgestellt. Insgesamt benötigen die 26 WebP-Dateien etwa 1,22 MB. Spielnamen sind größer, kräftiger und kontrastreicher, kurze Beschreibungen bleiben darunter erhalten. [Prompt-Satz und Dateipfade](docs/thumbnail-prompts.md).

Die zuvor noch offene Änderung aus PR #4 ist enthalten: Meme Dub Studio, Sketch & Guess, Grand Prix und Monster Trails stehen zuerst. Die linke Desktop-Leiste scrollt vollständig ins Bild und bleibt dann stehen; Größenänderungen und Inhalte werden berücksichtigt. Mobil bleibt normaler Seitenfluss. PR #4 wird durch dieses Update ersetzt.

## Validierung und Aktivierung

- `npm test`: alle 70 Tests bestanden, einschließlich Freischaltungen, Profilfelder, Banner-Upload, Entfernung und aller 26 Spiel-Lebenszyklen samt WebP-Auslieferung.
- Ergänzende lokale DOM-/Canvas-Prüfungen: Garage-Vorschauen und Speichern von Fahrzeug/Spur, Checkbox-Ausrichtung, Teamabschnitt, Profil-Live-Vorschau, Banner-Steuerung, sämtliche Spiele und Zuschauermenü bestanden.
- Alle fünf Fahrzeugmodelle wurden mit der tatsächlichen Three.js-Geometrie aufgebaut; Höhe und Form unterscheiden sich. Grand-Prix-Modelle behalten ihren Boost-Effekt.
- Syntaxprüfung und `git diff --check` bestanden. Keine neuen Abhängigkeiten; die Lockdatei ändert nur die Projektversion.

Nach dem Merge auf Render deployen und die Seite neu laden. Keine neuen Umgebungsvariablen oder Datenmigrationen. Banner verwenden die vorhandene Supabase-Konfiguration. Native Browser-/WebGL-Darstellung konnte in dieser Umgebung nicht geprüft werden; nach dem Deploy insbesondere ein schmales Handy, die geöffnete Teamleiste, einen eigenen Banner und beide Fahrspiele ansehen.
