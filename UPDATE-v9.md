# GiG v9 – Freunde, Fortschritt und verlässliche Runden

## Spielkorrekturen

- **Pixel Relay:** Freihandfläche statt des alten 16×16-Editors, zwölf schnelle Farben plus freier RGB-Farbwähler, Stiftbreiten, Radierer und Rückgängig. Die Abgabe ist an den jeweiligen Kettenschritt gebunden. Im nächsten Textschritt wird die fremde Zeichnung tatsächlich angezeigt; anschließend enthält die Galerie die vollständige Geschichte. Bestehende Pixelbilder bleiben lesbar. Eigene Sammlungen speichern weiterhin kompakte Vorschaubilder.
- **Revanche:** Der Host startet das zuletzt gespielte Spiel direkt mit einem neuen Countdown und einer neuen Runden-ID. Fehlende Mitspieler oder erschöpfte Meme-Dub-Clips werden verständlich gemeldet. Ein laufender Spieleabend muss zunächst abgeschlossen werden.
- **ESC → Zurück zur Lobby:** Nach Bestätigung endet die Runde für alle ohne Wertung. Die Simulation wird entfernt; sie läuft nicht verdeckt weiter. Ausstehende lokale Ergebnisübergänge werden bei der Lobby-Rückkehr verworfen.
- **Bereitschaft:** Der Host braucht keinen Bereit-Klick. Nur die anderen Mitspieler bestätigen ihre Bereitschaft. Allein ist der Bereit-Button gesperrt; der Host sieht stattdessen eine deutliche Trainingskarte. Sie verschwindet, sobald jemand beitritt. Spiele mit einer höheren Mindestspielerzahl bleiben im Training gesperrt.
- **Monster Trails:** Strecken von 9.000/10.000/9.500 auf 42.000/48.000/45.000 Spieleinheiten verlängert (etwa 2,1/2,4/2,25 km). Zusätzliche Hügel, Hindernisse, Checkpoints und Marker reichen bis ins letzte Streckensegment. Maximale Rundenzeit zwölf Minuten, nach dem ersten Finish noch 45 Sekunden für die anderen.
- **Ruhigere Fahrzeugbewegung:** Chassis und Räder werden gemeinsam zwischen Serverzuständen interpoliert. Der bisherige Wechsel zwischen aktueller Position und Vorhersage entfällt. Rücksetzer werden direkt übernommen; es gibt keinen künstlichen Unschärfeeffekt. Nahe Kollisionssegmente werden nachgeladen, statt die gesamten langen Strecken pro Fahrzeug zu simulieren.

## Freunde und gemeinsame Lobbys

Eingeloggte Konten öffnen **Freunde** oben in der Kontoleiste.

- Suche ab drei Zeichen nach dem Anfang eines Benutzernamens, ohne Unterscheidung von Groß- und Kleinschreibung. Eine Freundschaft entsteht erst durch eine angenommene Anfrage.
- Bis zu 100 Freunde; bis zu zwölf angeheftete Freunde erscheinen oben. Online-Freunde folgen vor Offline-Freunden.
- Online, abwesend, unsichtbar, nicht stören; die Anzeige des gerade gespielten Spiels lässt sich separat ausschalten.
- Optional für 30 Minuten anzeigen, für welches Spiel man Mitspieler sucht.
- Freunde in die eigene Lobby einladen oder den Beitritt zur Lobby eines Freundes anfragen. Beitrittsanfragen gehen an den aktuellen Host, auch wenn dieser als Gast spielt.
- Einladungen und Freigaben gelten zwei Minuten. Empfangsberechtigung, Freundschaft, freie Plätze, Lobby-Instanz und Sperren werden serverseitig geprüft. Ein Wechsel aus einer bestehenden Lobby verlangt eine zusätzliche Bestätigung und wird erst nach Prüfung des Ziels ausgeführt.
- Die letzten 25 angemeldeten Mitspieler aus gewerteten, aktiven Runden lassen sich wiederfinden und hinzufügen.
- Freundschaften entfernen und Konten blockieren; Blockierungen sperren neue Freundschaftsanfragen, Einladungen, Nachrichten und Geschenke.

## Nachrichten und privater Vergleich

- Private Textnachrichten sind nur zwischen bestätigten Freunden möglich. Die letzten 80 Nachrichten bleiben serverseitig gespeichert und überdauern Lobbywechsel. Ungelesene Nachrichten erscheinen in der Freunde-Schaltfläche; ein Lesestand bestätigt nur tatsächlich geladene Nachrichten.
- Im geöffneten Freundesprofil befindet sich ein eingeklappter Bereich **„Ihr im Vergleich · nur für dich sichtbar“**. Er zeigt gemeinsame gewertete Runden, direkte Siege, Niederlagen und Gleichstände, aufgeteilt nach Spiel.
- In der Freundesliste stehen nur Name und Präsenz. Der Vergleich wird weder in öffentliche Profile eingebettet noch an fremde Konten ausgeliefert. Er wird ab diesem Update aus tatsächlichen Server-Ergebnissen aufgebaut; frühere Direktduelle lassen sich aus vorhandenen Gesamtstatistiken nicht rekonstruieren.

## Wunschlisten und Geschenke

- Kaufbare Shopartikel lassen sich auf eine Wunschliste mit bis zu 20 Einträgen setzen. Freunde können diese Liste öffnen und Gegenstände mit ihren eigenen GiG-Coins verschenken.
- Vor dem Schenken werden Empfänger und Coinpreis angezeigt. Eine kurze Nachricht ist optional.
- Belastung, Freischaltung und Geschenkbeleg werden in einer gemeinsamen Datenbanktransaktion gespeichert. Eine wiederholte Übermittlung desselben Geschenks belastet nicht doppelt. Preise kommen aus dem Serverkatalog.
- Bereits vorhandene Gegenstände, Erfolgskosmetik und Ersteller-Auszeichnungen sind ausgeschlossen. Sound-Slots behalten ihre Reihenfolge. Auch das Erstellerkonto bezahlt Geschenke aus seinem tatsächlichen Coin-Guthaben.
- Empfangene Geschenke stehen unter **Freunde → Anfragen**; das Inventar aktualisiert sich ohne Neuladen.

## Erspielbare Kosmetik und Ziele

Unter **Mein Profil → Ziele & Belohnungen** gibt es sechs dauerhafte Ziele:

| Gegenstand            | Voraussetzung                                              |
| --------------------- | ---------------------------------------------------------- |
| Kometenspur           | 5 Siege in Grand Prix                                      |
| Obsidian-Lackierung   | 5 Monster-Trails-Zieleinfahrten ohne Rücksetzer            |
| Aurora-Golfball       | 10 Golfbahnen mit weniger Schlägen als Par abschließen     |
| Atelier-Meisterrahmen | 5 Siege in Sketch & Guess, Sketch Suspect oder Pixel Relay |
| Champions Lounge      | 25 Multiplayer-Siege                                       |
| Siegestanz            | 10 Multiplayer-Siege                                       |

Ein Ziel lässt sich anheften und mit seinem Fortschritt in der Lobby verfolgen. Die Anforderungen verwenden aktive, gewertete Multiplayer-Runden mit mindestens zwei verschiedenen Identitäten und acht Sekunden Spielzeit; Training, fehlende Teilnahme und doppelte Ergebnisbelege zählen nicht. Spezielle Spielziele beginnen ab diesem Update; die allgemeinen Siegziele verwenden vorhandene Siege. Alle Gegenstände sind rein optisch. Ersteller-Freischaltungen folgen weiterhin ausschließlich `OWNER_UIDS` und erfinden keine erspielten Statistiken.

Lackierung, Spur und Golfball wählt man in der Garage; Rahmen und Profiltheme unter Aussehen. Erspielbare Gegenstände lassen sich weder kaufen noch verschenken.

## Avatar-Reaktionen und Steuerung

- Vier ausrüstbare Reaktionen unter **Mein Profil → Aussehen**. Winken, Lachen, Facepalm und Jubeln sind enthalten; Wirbelwind und Verbeugung kosten 120 beziehungsweise 140 Coins. Der Siegestanz wird erspielt.
- Reaktionen lassen sich in der Lobby und beim Zuschauen auslösen, mit vier Sekunden Abstand. Statische Uploadbilder bleiben statisch; reduzierte Bewegung wird berücksichtigt.
- **Einstellungen → Deine Steuerung:** Bewegungs- und Aktionstasten, Stick-Totzone, Lenkempfindlichkeit sowie Größe, unterer und seitlicher Abstand und Seitenwechsel der Touch-Steuerung werden im Konto gespeichert. Doppelte und Systemtasten werden abgefangen. Die Pfeiltasten bleiben verfügbar.
- Standard-Controller unterstützen Bewegung, Gas/Bremse, Hauptaktion, zweite Aktion und Fahrzeugrücksetzen in passenden Spielen. Zeichnen und Texteingaben verwenden weiterhin Maus/Touch beziehungsweise Tastatur. Der Browser muss einen Controller zunächst erkennen; häufig ist dafür ein Tastendruck am Controller erforderlich.

## Betrieb und Daten

Keine neue Laufzeitabhängigkeit, kein neuer Dienst und keine zusätzlichen Umgebungsvariablen. Firebase Admin und die vorhandenen Konten bleiben die Grundlage. Die serverseitigen Collections `gigSocial`, `gigChats`, `gigRivalries` und `gigGifts` entstehen bei Bedarf. Der Namenspräfix nutzt den eingebauten Dokument-ID-Index von `gigNames`; ein zusammengesetzter Firestore-Index ist nicht erforderlich. Die bestehenden Regeln müssen nicht für Browser-Schreibzugriffe geöffnet werden.

Präsenz und kurzlebige Lobby-Einladungen liegen im Arbeitsspeicher und werden nach einem Serverneustart neu aufgebaut. Freundschaften, Nachrichten, Wunschlisten, Geschenke, Vergleiche und Kontofortschritt liegen in Firestore. Ein Neustart verwirft offene Lobby-Einladungen.

## Prüfung

- `npm test`: 97 bestandene Tests zu Spielregeln, Konten, Berechtigungen, Transaktionen, Privatsphäre, neue Rundenabläufe, RGB-Zeichnungen und Fahrzeuginterpolation.
- `scripts/check-gameplay-clients.cjs`: drei echte Socket.IO-Clients und ein später Zuschauer in allen 26 Spielen. Pixel Relay durchläuft Satz → freies RGB-Bild → fremdes Bild erraten → Galerie; die tatsächlich gerenderten Canvas-Pixel werden verglichen.
- `scripts/check-social-clients.cjs`: tatsächliche Anwendungsskripte mit mehreren Testkonten, realem Server und DOM/Canvas. Suche, Annehmen, Einladen, Nachrichten, Geschenkbestätigung und sofortige Freischaltung, privater Vergleich, Ziele, Wunschlisten, gespeicherte Tasten und simulierte Controller-Eingaben sowie bestätigte ESC-Rückkehr.
- `scripts/check-premium-rendering.cjs`: alle 26 Ansichten mit acht Spielern, Desktop-/Touch-Größen und reduzierter Bewegung, einschließlich Eingabe- und Overlay-Prüfungen.
- `scripts/check-premium-3d.cjs`: tatsächliche Three-Szenen und Kameras aller sechs Auto-Strecken, endliche Geometrie und begrenzte Objekt-/Dreieckszahlen.

Die DOM-/Canvas-Prüfungen verwenden JSDOM und `@napi-rs/canvas`; `GIG_QA_MODULES` kann auf eine lokale JSDOM-Installation zeigen. Sie sind kein nativer Browserlauf. Native WebGL-Shader, die Bildrate auf echten Geräten, reale Touch-Bedienung und physische Controller wurden in dieser Umgebung nicht bestätigt. Firebase-/Supabase-Produktionszugangsdaten wurden für die Tests nicht benutzt oder verändert.
