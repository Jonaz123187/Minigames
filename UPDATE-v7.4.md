# GiG v7.4 · Spielablauf und Zeitsteuerung

## Sketch Suspect

Die Zeichenfläche ist jetzt ein freies Canvas mit 900 × 500 Koordinaten statt eines 16 × 16 Pixelrasters. Maus und Finger zeichnen Linien, die Palette bietet Farben/Radierer, vier Stiftbreiten, Rückgängig und Leeren. Eine Abgabe enthält begrenzte Vektorsegmente statt einer beliebigen Bilddatei: maximal 700 Segmente, geprüfte Koordinaten, Farben und Stiftbreiten. Der Server validiert die Zeichnungen.

Während der Zeichenphase sieht jede Person nach der Abgabe ihre eigene Zeichnung und den gemeinsamen Abgabestand. Die anderen Zeichnungen werden anschließend in der Diskussions-, Abstimmungs- und Auflösungsphase gemeinsam angezeigt. Änderungen der Galerieversion lösen eine Aktualisierung aus. Die Zeichenfläche wird beim Abgeben nicht mehr aus einem veralteten Snapshot neu erstellt und geleert. Änderungen des Rundenstatus vom Countdown zum Spielen werden ebenfalls berücksichtigt.

Auch eine Person ohne abgegebene Zeichnung erhält eine eigene Karte und bleibt auswählbar. So kann der Faker sich nicht durch Nichtabgabe vor einer Abstimmung verstecken. Bestehende Pixel-Abgaben älterer Clients bleiben kompatibel. Die vorhandene Zeichnungssammlung behält ihr bisheriges Format kleiner Pixel-Vorschaubilder; die Galerie während des Spiels zeigt die freien Zeichnungen vollständig.

Die tatsächliche Mindestspielerzahl wird auf Spielkarten angezeigt. Fällt die Lobby unter die Mindestzahl des laufenden Spiels, geht es ohne Wertung zurück in die Lobby. Das berücksichtigt insbesondere die drei Personen für Sketch Suspect und bleibt beim Server-Shutdown sicher, wenn die Runde bereits aufgeräumt wurde.

## One Tap und gemeinsame Uhr

Jede One-Tap-Aufgabe hat eine serverseitige Vorbereitungszeit von 1,2 Sekunden. Die Anzeige beginnt anschließend bei null; frühe oder verspätete Eingaben werden nicht verbucht. Tasten- und Button-Eingaben folgen demselben Ablauf. Die kurze LOS-Einblendung verdeckt bei One Tap und Grünes Licht keine Timing-Ziele mehr.

Die Browser-Uhr wird aus Server-Zeitbeobachtungen und `performance.now()` fortgeschrieben. Ein Sprung der lokalen Systemuhr um drei Sekunden lässt die Aufgabe dadurch nicht bei 3000 ms beginnen. Veraltete Zeitbeobachtungen werden ignoriert; Pingmessung und Serverabgleich verwenden monotone Zeitabstände. Der Server bestimmt weiterhin Zeitpunkt, Gültigkeit und Punkte jeder Eingabe; es werden keine vom Client behaupteten Trefferzeiten akzeptiert.

## Timer in allen Spielen

- Der Startcountdown zählt nicht mehr zur angezeigten Spielzeit. Bis zum tatsächlichen Start steht der Timer auf `--:--`.
- Die sechs neueren Spiele zeigen die Deadline ihrer aktuellen Aufgabe statt gleichzeitig eine andere Gesamtzeit oben und die Aufgabenzeit daneben.
- Memory Pulse trennt die Zeit zum Merken vom anschließenden Eingabefenster. Der Server liefert die dafür notwendigen öffentlichen Phasenzeitpunkte mit.
- Gemeinsame Pausen frieren Spielzeit ein. Die Rückkehr zur Lobby nach einem Ergebnis verwendet getrennt davon die laufende Server-Wandzeit, damit frühere Pausen die Rückkehranzeige nicht verlängern.

## Prüfung

`npm test`: **77 Tests bestanden**. Neue Regressionstests prüfen freie Zeichnungen/Privatsphäre/Grenzen, drei Sekunden lokale Uhrabweichung, Pausen und erreichbare One-Tap-Ziele. Ein zusätzlicher Socket-Test durchläuft alle 26 Spiele mit drei aktiven Clients und einem später beitretenden Zuschauer. Er prüft Startsperre vor Countdown-Ende, gleichen Startzeitpunkt, Eingabesperre für Zuschauer und gemeinsame Pause/Fortsetzung.

Die zusätzliche Prüfung `scripts/check-gameplay-clients.cjs` lädt die tatsächlichen Frontend-Skripte in getrennten DOM-Umgebungen mit Canvas und echten Socket.IO-Verbindungen. Sie verwendet drei Spieler und einen späten Zuschauer. Für **alle 26 Spiele** bestanden:

- Countdown und korrekte Deadline der angezeigten Phasenzeit;
- lokaler Uhrsprung um drei Sekunden;
- gemeinsame Pause und Fortsetzung;
- sichtbar gekennzeichnete Zuschaueransicht und abgewiesene Zuschauereingaben.

Sketch Suspect wurde zusätzlich über tatsächliche Zeiger-Ereignisse und die Abgabe-Buttons gezeichnet: Alle drei Zeichnungen erschienen bei jedem Spieler, die Canvas-Pixel enthielten die tatsächlichen Striche und die Abstimmung bot die anderen Personen an. In One Tap wurden sechs aufeinanderfolgende Aufgaben über Leertasten-Ereignisse gespielt; jeder Treffer erzielte mindestens 90 Punkte.

Die vorhandenen Tests der einzelnen Mechaniken, Endstände und Lebenszyklen bleiben Teil der Suite. Native Browser-/WebGL-Ausgabe, reale Mikrofonaufnahmen und Geräte-Touch wurden in dieser Umgebung nicht geprüft. Die Clientprüfung verwendet DOM und Canvas, keinen nativen Browser.

Die optionale Clientprüfung benötigt lokal `jsdom` und `@napi-rs/canvas`; diese wurden nicht als neue Produktionsabhängigkeiten hinzugefügt. `GIG_QA_MODULES` kann auf eine separate Installation von jsdom zeigen. Keine neue Produktionskonfiguration oder Datenmigration nötig. Nach dem Merge auf Render deployen lassen und die geöffneten Spielseiten neu laden.
