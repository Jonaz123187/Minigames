# GiG v8.0 · Die Arcade überarbeitet

Dieses Update ersetzt die alten Canvas-Spielansichten und überarbeitet alle 26 Spiele bei Darstellung, Zuständen, Rückmeldungen und Bedienung. Die umfangreichsten Änderungen an Spielmechanik und Strecken betreffen Monster Trails und Pocket Golf. Grand Prix bekommt neue Fahrzeugmodelle, Landschaften, Kamera und einen korrigierten Rücksetzablauf.

## Autospiele

**Monster Trails:** Drei längere Strecken mit kontinuierlichem Gelände, sanften Rampen und klar markierten Checkpoints. Ein Überschlag oder Sturz beendet den Versuch nicht mehr sofort: Der Truck kehrt zum letzten Checkpoint zurück; drei Sekunden werden auf die Zielzeit angerechnet. R setzt manuell zurück. Gesammelte Marker bleiben erhalten. Gas und Balance lassen sich unabhängig steuern: W/↑ Gas, S/↓ Bremse und rückwärts, A/← Nase hoch, D/→ Nase runter. Auf Touch-Geräten gibt es entsprechende Pedale und Balance-Tasten. Die Bodenerkennung berücksichtigt den kleinen Abstand, den die Kollisionsauflösung zwischen Reifen und Boden lassen kann. Alle drei Strecken sind mit Basis-Upgrades ohne Rücksetzen fahrbar.

**Grand Prix:** Neue gemeinsame 3D-Modelle für Pickup, Jeep, Sportwagen, Van und Entenexpress; bewegliche Räder, Lenkeinschlag, Bremslichter und gekaufte Fahrzeugspuren. Die Fahrkamera sitzt näher am Auto, erweitert den Blick bei Tempo und springt bei weiten Rücksetzern direkt zum Auto. Küste, Alpen und Hafen erhalten unterschiedliche Landschaften, Beschilderung und Streckenelemente. Asphalt, Himmel und Kontaktschatten werden lokal erzeugt. Beim Rücksetzen vor dem ersten Überqueren der Startlinie steht das Auto wieder hinter der Linie. Kurz nach dem Rücksetzen kann es nicht mit anderen Autos kollidieren.

Fahrzeugaussehen verändert weiterhin keine Hitbox. Monster-Upgrades werden weiterhin für alle Teilnehmer auf dasselbe gemeinsame Profil begrenzt. Beide Autospiele haben gestaltete 2D-Ansichten als Rückfall, wenn WebGL nicht verfügbar ist. Statische Geometrie wird zusammengefasst; beim Neubau einer Szene werden Geometrien, Materialien und Texturen freigegeben.

## Pocket Golf

Sechs Bahnen: Clubgarten, Blaue Lagune, Bandenclub, Dünensprung, Nachtpassage und Finale am Kap. Jede Bahn hat eine eigene Gestaltung und Par-Vorgabe; hinzu kommen Sand, Wasser, Bumper und ein bewegliches Tor. Banden und Hindernisse werden in kleinen Physikschritten aufgelöst, damit ein schneller Ball nicht durch eine dünne Wand springt. Ein Ball innerhalb einer Wand wird zuverlässig nach außen geschoben.

Die Vorschau berechnet ihre Flugbahn mit demselben Physikcode wie der Server. Ein leicht seitlicher Griff neben den Ball verändert die Schlagrichtung nicht. Ein Klick ohne Ziehen löst keinen Schlag aus. Rechtsklick, Pointer-Abbruch und Escape brechen den Zug ab. Alternativ: ←/→ zielen, ↑/↓ Stärke, Leertaste schlagen.

Wasser bringt den Ball zur letzten Schlagposition zurück und zählt einen Strafschlag. Es gibt pro Loch eine Schlagzahl, Par-Rückmeldungen und eine Scorecard. Die Runde läuft bis alle aktiven Teilnehmer fertig sind oder bis 30 Sekunden nach dem ersten Finish; die Gesamtrunde ist auf 210 Sekunden begrenzt. Im Ergebnis werden die Scorecards aller Spieler nebeneinander angezeigt. Fertige Löcher bestimmen die Platzierung zuerst, dann die Schlagzahl und bei unvollständiger Bahn der Abstand zum Loch.

## Alle Spielansichten

| Spiel              | Überarbeitung                                                                                                             |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------- |
| Meme Dub Studio    | Studiobühne, vier Phasen, echte Aufnahmepegel und Wellenform, klarere Aufnahme- und Votingbedienung.                      |
| Sketch & Guess     | Papierfläche, übersichtliche Zeichenwerkzeuge und Chat, Zeichneranzeige und Turn-Uhr.                                     |
| GiG Grand Prix     | Neue 3D-Fahrzeuge, bewegte Räder, Kamera, Landschaften, Spuren und Rennanzeigen.                                          |
| GiG Monster Trails | Gelände und Checkpoints, unabhängige Balance, faire Rücksetzung, Fahrzeugmodelle und Landschaften.                        |
| Pocket Golf        | Sechs Bahnen, neue Physik und Schlagvorschau, Hindernisse und gemeinsame Scorecards.                                      |
| Snake Arena        | Gestaltetes Spielfeld, plastische Schlangensegmente, Augen und klar erkennbare Futterstücke.                              |
| Button Bash        | Großer tatsächlich antippbarer Arcade-Button, Anschläge pro Sekunde und Live-Platzierung.                                 |
| Tipp Turbo         | Persönliche Fortschrittsbahnen und gut unterscheidbare Spielermarker; natürliche deutsche Texte.                          |
| Pocket Pong        | Court-Linien, markierte eigene Bahn, plastischer Ball und Schläger, Ballspur und Trefferfeedback.                         |
| Grünes Licht       | Signalgehäuse, Versuchsfortschritt und Reaktionswerte; das Signal selbst ist jetzt antippbar.                             |
| Meteor Dash        | Sternenfeld, lesbare Flugspuren und plastische Meteore, erkennbare Spieler und Dash-Spuren.                               |
| Gap Runner         | Mehrere Landschaftsebenen, gestaltete Plattformen und Hindernisse, laufende Figuren und Lebensanzeige.                    |
| Memory Pulse       | Tasten mit Tiefenwirkung, klarer Merken-/Eingabe-Zustand und sichtbare Leben im Hochformat.                               |
| Rhythm Rush        | Gestaltete Spuren, markierte Anschlaglinie und Noten, Kombo und Trefferquote; kompakte Werte im Hochformat.               |
| Perfect Stack      | Architekturkulisse, differenzierte Etagen, Ausrichtungshilfen und Platzierungsfeedback; Spielfeld antippbar.              |
| Bomber Arena       | Lesbare Boden-, Wand- und Kistenebenen, Zündring und Explosionsflächen.                                                   |
| Precision Lab      | Laborfläche, deutliche Ziel-/Fehlziel-Symbole, Lebenszeitringe und Fadenkreuz.                                            |
| Hot Potato         | Abgegrenzte Arena, Trägerkennzeichnung, Übergaberadius und gut lesbare Bombenzeit.                                        |
| Code Breaker       | Privates Codeboard mit erkennbarer aktueller Reihe, plastischen Pins und übersichtlichem Feedback.                        |
| Brain Glitch       | Größere Fragen, deutliche Sonderregel, klare Antwortkarten und Auflösungszustände.                                        |
| Pixel Relay        | Gestaltete Auftragskarten, Zeichentafel und Geschichte-Galerie mit Navigations- und Abgabestatus.                         |
| Sketch Suspect     | Rollenkarte, freies Zeichenatelier und übersichtliche Zeichnungsgalerie mit Abstimmung.                                   |
| Guesswork          | Klare Eingabe- und Auflösungskarten, größere Ergebniszahl und Rundenfortschritt.                                          |
| One Tap            | Große Timing-Anzeige, tatsächlicher Startzustand und stabiles persönliches Trefferergebnis statt weiterlaufender Anzeige. |
| Pixel Shift        | Neue Feldtasten, klar getrennte Merken-, Such- und Auflösungszustände sowie sichtbare Auswahl.                            |
| Code Crew          | Eigene Hinweis-Karte, deutliche Codeeingabe und Schlossfortschritt.                                                       |

Gemeinsam: konsistente Spielrahmen und Typografie, farbliche Spielerzuordnung, reduzierte Dekoration bei `prefers-reduced-motion`, größere Aktionsflächen und verständliche Zustände. Die Live-Wertung zeigt die vorhandenen animierten Avatare. Wertänderungen ersetzen deren DOM-Knoten nicht und starten daher ihre Animation nicht ständig neu. Für die sechs neuen Partyspiele erscheinen echte Punkte und Abgabestatus anstelle von „Bereit“.

Spielaktionen werden bei geöffnetem Menü blockiert; neutrale Steuerpakete bleiben möglich. Gemeinsame Pause, Escape-Menü, Vollbild, Bestätigung beim Verlassen und Zuschauerkennzeichnung bleiben erhalten. Spieler im Ziel werden als „im Ziel“ statt „ausgeschieden“ bezeichnet. Spielregeln bleiben im Menü, ohne Bestätigungsdialog vor einer Runde.

## Vorgemerkte Kleinigkeiten

- Ping auf ganze Millisekunden gerundet; keine langen Fließkommazahlen im Header oder Tooltip.
- Weicher Verlauf vom unteren Profilbanner in den Profilhintergrund.

## Prüfung und Grenzen

- `npm test`: 85 Tests, einschließlich erreichbarer Golfbahnen mit tatsächlichen Schlägen, Ballkollisionen, Sand/Wasser, 30-Sekunden-Finishfenster, Vorschau-Abgleich, Monster-Checkpoints und fahrbarer Basisstrecken, Startlinien-Rücksetzung und privatem One-Tap-Ergebnis.
- `scripts/check-gameplay-clients.cjs`: Drei echte Socket.IO-Verbindungen mit getrennten DOM/Canvas-Clients und später Zuschauerverbindung für alle 26 Spiele. Start, Timer, Uhrabweichung, gemeinsame Pause/Fortsetzung; zusätzlich gemeinsame Sketch-Suspect-Galerie, alle sechs One-Tap-Versuche und vom Server übertragene Golf-Scorecards.
- `scripts/check-premium-rendering.cjs`: Alle 26 Spielansichten mit acht Spielern, Desktop, Hochformat-Touch-Logik, reduzierter Bewegung, Zuschaueransichten und weiteren Phasen. Zusätzlich echte Pointer-/Tastaturhandler für Golf, Reaktion, Button Bash und Stack, Eingabesperre im Menü und stabile Avatar-Knoten.
- `scripts/check-premium-3d.cjs`: Alle sechs 3D-Szenen mit den tatsächlichen Three.js-Geometrien und Kameras; endliche Geometrien, begrenzte Mesh-/Dreieckzahlen und CPU-Projektionen für die Bildkontrolle.

Die optionalen UI-Prüfungen benötigen `jsdom` und `@napi-rs/canvas`; sie sind keine Produktionsabhängigkeiten. Mit `GIG_QA_MODULES` lässt sich ein separater Installationspfad für jsdom angeben; `GIG_QA_MODE=desktop|touch|reduced` prüft einen Modus pro Prozess. `GIG_QA_ARTIFACTS` kann einen Ausgabeordner für Bilder festlegen.

Die Tests ersetzen keinen nativen Browser mit echtem WebGL, Mikrofon oder einem physischen Touch-Gerät. GPU-Shader, tatsächliche Bildrate und native Audio-/Vollbildfreigaben wurden hier nicht auf Geräten bestätigt. Bestehende Konten und Rekorde bleiben erhalten; alte Rekorde aus den kürzeren Monster-Strecken und der früheren Golfwertung sind nicht direkt mit v8 vergleichbar.

Keine neuen Umgebungsvariablen, keine zusätzlichen Laufzeitabhängigkeiten und keine Datenmigration. Render: wie bisher `npm ci` und `npm start`.
