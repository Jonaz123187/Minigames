# v12 · Augenmaß, Begleiter und dein Entwicklerbereich

Dieses Update baut auf v11 auf und ergänzt das 27. Spiel. Es werden keine neuen Pakete oder Umgebungsvariablen benötigt. Bestehende Konten, Käufe, Coins und Freundschaften bleiben erhalten.

## Size It Up · Multiplayer-Tageschallenge

In der Lobby **Size It Up** auswählen und mit 2–8 Personen als einzelnes gemeinsames Spiel starten. Die Tageschallenge gehört nicht in die zufällige Party-Playlist und hat kein Solo-Training. Alle Lobbys bekommen für denselben Tag dasselbe Set aus fünf Vergleichen.

Eine Referenz hat ein bekanntes Maß. Das Zielobjekt skaliert jeder für sich mit Regler, Plus/Minus oder Ziehen nach links/rechts. Länge, Höhe, Breite, Spannweite bzw. Durchmesser werden ausdrücklich bezeichnet. Beide Objekte nutzen denselben geometrischen Maßstab, auch wenn ein Höhenmaß mit einer Länge verglichen wird; die responsive SVG-Ansicht verzerrt diesen Maßstab nicht.

Pro Vergleich sind bis zu 100 Punkte möglich, insgesamt 500. Gleiche relative Über- und Unterschätzungen werden gleich behandelt. Der Server berechnet die Wertung aus der verbindlich eingeloggten Schätzung. Fremde Schätzungen, aktuelle Punkte und Zielmaße werden vorher nicht an andere Browser geschickt; es gibt keine Geistervorschau. Nach Abgabe aller verbundenen Spieler, frühestens nach vier Sekunden, oder nach 28 Sekunden folgt die sieben Sekunden lange gemeinsame Auflösung. Dort stehen Abweichung, Punkte und Quellen. Verpasste Abgaben bringen null Punkte. Danach geht es zum nächsten Vergleich. Im Endscreen sind alle fünf Vergleiche nochmals aufklappbar; er bleibt 30 Sekunden sichtbar. ESC, gemeinsame Pause und Zuschauerbeitritt funktionieren wie bei den übrigen Spielen.

**Nur der erste Tagesstart zählt.** Ein bestätigtes Konto kann pro Berliner Kalendertag einmal Belohnungen, Kontofortschritt und Lobby-Punkte erhalten, nach den bestehenden Regeln für aktive Mehrspieler-Teilnahme. Bereits der Start merkt diesen Versuch dauerhaft vor. Abbruch, Revanche, Lobbywechsel, anderes Gerät, Serverneustart oder ein vom Entwickler ausgetauschtes Tages-Set setzen ihn nicht zurück. Das wird schon bei der Spielauswahl erklärt. Weitere Durchläufe bleiben möglich und zeigen ihre Vergleichsergebnisse, vergeben aber keine weiteren Coins, Fortschritte oder Lobby-Punkte. Wiederholer verdrängen Erstversuche nicht bei der Vergabe der gewerteten Plätze.

Gäste können mitspielen und ihre Lobby-Punkte erhalten; Coins und Kontofortschritt setzen weiterhin ein Konto voraus. Gastversuche werden über die vorhandene Geräteidentität erkannt. Inkognito-/Browserdatenwechsel lassen sich für Gäste nicht zuverlässig einer Person zuordnen; daraus entstehen keine Kontobelohnungen. Die bezahlte Tageswertung hat zusätzlich zu den normalen begrenzten Rundenbelegen einen eigenen dauerhaften Beleg, der auch nach deren Ablauf wirksam bleibt.

Der tägliche Wechsel erfolgt automatisch um **00:00 Uhr Europe/Berlin**, einschließlich Sommer-/Winterzeit. Es ist kein Cronjob nötig. Eine bereits laufende Runde behält ihr geladenes Set über Mitternacht hinweg.

## Aufgaben und Quellen

Der Startpool enthält **38 benannte Maßreferenzen und 625 zulässige geordnete Vergleiche**. Die Tagesauswahl verwendet einen dauerhaft gespeicherten privaten Zufallswert und ist dadurch serverseitig deterministisch, enthält fünf Aufgaben und nutzt zehn verschiedene Objekte. Unlesbar extreme Verhältnisse und Vergleiche innerhalb derselben Objektfamilie werden herausgefiltert. Klar beschriftete Messlatten dienen ausschließlich als Referenz. Das automatisch erzeugte Tages-Set wird beim ersten Start fest gespeichert, sodass auch ein späteres Code-Update es nicht unbemerkt austauscht. Der private Ausgangswert wird weder an normale Spieler noch über den offenen Quellcode verteilt. Die Figuren sind eigene GiG-SVG-Silhouetten; externe Grafiken und Aufgabenbestände wurden nicht kopiert.

Beispiele sind Blauwal, Orca, Buckelwal, Formel-1-Frontansicht, MINI, Airbus-Modelle, ISS, Space Shuttle, Saturn V, Eiffelturm, Sportbälle, Tennis- und Volleyballfeld, Tischtennisplatte, Langhantel, Smartphone und Papierformate. Größen mit natürlicher Streuung sind als festes Referenzmodell bzw. größtes Referenztier gekennzeichnet. Kreis-Durchmesser aus vorgegebenem Umfang werden berechnet. Einige wichtige Quellen:

- [NOAA: Blauwal](https://www.fisheries.noaa.gov/species/blue-whale), [Orca](https://www.fisheries.noaa.gov/species/killer-whale), [Buckelwal](https://www.fisheries.noaa.gov/species/humpback-whale).
- [FIA: Regelreferenz 2026](https://www.fia.com/news/new-era-competition-fia-showcases-future-focused-formula-1-regulations-2026-and-beyond): verwendet wird die maximale Breite der Frontansicht, nicht eine erfundene einheitliche Fahrzeuglänge.
- [MINI: technische Daten](https://www.mini.ch/de_CH/home/range/mini-cooper-3-door/technical-data.html), [Airbus A380: Maßangaben](https://www.airbus.com/sites/g/files/jlcbta136/files/2022-01/EN-Airbus-A380-Facts-and-Figures-January-2022.pdf).
- [NASA: Saturn V](https://www.nasa.gov/learning-resources/for-kids-and-students/what-was-the-saturn-v-grades-5-8/), [Space Shuttle](https://www.nasa.gov/reference/the-space-shuttle/), [ISS](https://www.nasa.gov/international-space-station/space-station-facts-and-figures/).
- [NIST: Sportmaße](https://www.nist.gov/pml/owm/metric-sports-summer-games-fast-facts), [Längenreferenzen](https://www.nist.gov/pml/owm/si-units-length), [ISO 216](https://www.iso.org/standard/36631.html), [Apple: iPhone 16](https://www.apple.com/iphone-16/specs/), [Eiffelturm](https://www.toureiffel.paris/en/news/history-and-culture/300-330-meters-story-towers-height).

Alle Quellen und Referenzwerte stehen auch im Entwicklerbereich und nach der jeweiligen Auflösung zur Verfügung. Der Pool lässt sich im Code in `size-objects.js` um weitere belegte Objekte erweitern.

## Dein Entwicklerbereich

Mit deinem in **OWNER_UIDS** eingetragenen Konto erscheint oben **Entwicklerbereich**. Ein normaler Lobby-Host oder ein manipuliertes Profil bekommt keine Rechte. Jeder Verwaltungsendpunkt prüft die bestätigte Firebase-Identität und die serverseitige Erstellerliste erneut.

- **Übersicht:** aktuelle Lobby-/Spieler-/Rundenzahlen, Poolgröße, deine bestehenden goldenen MAX-/Sammlungs-Vorteile und direkte Zugriffe auf Erstellerprofil, Shop, Garage, Atelier und Soundboard.
- **Feedback:** direkter Zugang zum vorhandenen privaten Postfach mit Screenshot, Status und Antworten. Der Zugang über die Glocke bleibt erhalten.
- **Neuigkeiten:** auf Deutsch und Englisch verfassen, Vorschau, private Entwürfe speichern und später laden. Sofort oder zu einem gewählten Zeitpunkt veröffentlichen, Laufzeit 1–90 Tage, optional 0–500 Coins pro Konto. Zukünftige Nachrichten sind vorher weder öffentlich sichtbar noch beanspruchbar. Bestehende Nachrichten können entfernt werden. Die Zeitwahl verwendet die lokale Browserzeit und speichert einen eindeutigen Zeitpunkt.
- **Tagesaufgaben:** Datum ansehen, mit Vortag/Folgetag blättern, alternative Sets privat vorschauen und einzelne Vergleiche aus dem durchsuchbaren Pool ersetzen. Maß und Quelle werden angezeigt. Erst **Set für alle veröffentlichen → Bestätigen** übernimmt die fünf Vergleiche für das ausgewählte heutige oder zukünftige Datum. Mit „Vorschau heute veröffentlichen“ kann auch ein vorab angesehenes zukünftiges Set ausdrücklich für heute übernommen werden. Laufende Spiele und bereits vorgemerkte Versuche bleiben bestehen. Vergangene Tage werden nicht nachträglich überschrieben.
- **Konten & Sperren:** Benutzername suchen, mit Begründung für 24 Stunden, 7 Tage, 30 Tage oder dauerhaft sperren und jederzeit entsperren. Die aktive Sitzung wird sofort beendet. Geschützte Konto-APIs und erneute Kontologins werden ebenfalls gesperrt. Befristete Sperren laufen automatisch ab; Fortschritt und Käufe werden nicht gelöscht. Das Erstellerkonto kann hier nicht gesperrt werden. Es handelt sich um Kontosperren, keine Sperre des Internetanschlusses oder einer anonymen Person.
- **Spielbetrieb:** einzelne Spiele mit einem sichtbaren Wartungshinweis für neue Starts und Revanchen deaktivieren und wieder freigeben. Laufende Runden dürfen enden; ein inzwischen gesperrtes nächstes Playlist-Spiel führt kontrolliert zur Lobby zurück.
- **Änderungsverlauf:** die letzten 200 Verwaltungsaktionen mit Zeitpunkt und betroffenem Bereich. Aufgaben, Sperren, Wartung, Neuigkeiten, Entwürfe und Feedback-Statusänderungen werden serverseitig protokolliert.

Neue private Firestore-Collections: `gigDeveloper`, `gigBans`, `gigSizeDays`, `gigSizeAttempts`, `gigSizeSchedule`. Die vorhandenen gesperrten Browser-Regeln bleiben unverändert. Keine zusätzlichen Indizes oder Supabase-Buckets nötig. Entwürfe sind auf die letzten 30 begrenzt, der Sperrverlauf ist paginiert. Aufgaben, Sperren, Entwürfe, Wartung und Verlauf bleiben über Render-Neustarts erhalten.

## Freunde und Begleiter

Der Freundedialog verschiebt ein bereits geöffnetes Dialogelement nicht mehr erneut im Dokument. Dadurch bleibt es beim Wechsel zu „Nachricht schreiben“ in der modalen Anzeige; die Unterhaltung öffnet sich, Senden funktioniert und danach lassen sich die Einladungsaktionen erneut öffnen. Avatar und SVG sind in diesem Bereich auf 42 Pixel begrenzt und abgeschnitten, sodass die Animation nicht über den Namen ragt. Das gilt auch auf Mobilgeräten; die kleine Freundeskachel hat eigene 32-Pixel-Grenzen.

Pixelkatze, Mini-Bot und Toast haben eigene erkennbare Figuren und leichte Körper-, Schwanz- bzw. Augenanimationen. Im Profil erhalten sie einen eigenen großzügigen Abschnitt mit größerer Darstellung und Begrüßung per Klick. In der Lobby stehen sie neben dem Avatar und reagieren auf Bereitschaft; auf dem Podium begleitet das ausgerüstete Tier seinen Spieler und der Siegerbegleiter hüpft. Die Auswahl bleibt an den vorhandenen gekauften Begleiter gebunden. Bewegungsreduktion schaltet die Animationen ab. Die Begleiter verändern keine Spielwerte.

## Validierung und Betrieb

- `npm test`: 125 Tests bestanden. Kalendergrenzen inklusive Sommerzeit, deterministischer Pool, Geheimhaltung, Wertung, erste Teilnahme, Revanche, dauerhafte Belege, Entwicklerrechte, Aufgabenveröffentlichung, geplante Nachrichten, Sperren und Wartung. Dazu sämtliche bisherigen Regressionen.
- Drei Clients am echten lokalen Server: Entwicklerzugriff, private Vorschau und bestätigte Veröffentlichung, Freunde → Nachricht senden → wieder Aktionen öffnen, Avatargrenzen, Profilbegleiter, fünf komplette verdeckte Größenrunden, Auflösung, Endarchiv und Podiumsbegleiter.
- Alle 27 Spiele auf Mehrspieler-Start, Timer, Zeitsprung, gemeinsame Pause und Zuschauerbeitritt geprüft. Social-, Community- und Feedback-Abläufe erneut geprüft.
- Alle 27 Ansichten in Desktop-, Touch-, Bewegungsreduktions- und Englisch-Konfiguration geprüft.
- Diese Prüfungen verwenden DOM-Simulation sowie Canvas/SVG-Struktur. Natives Browserlayout, echte Touchgeräte und GPU/WebGL sind damit nicht bestätigt. Produktivkonten und produktive Daten wurden nicht verändert.

Nach dem Merge des Pull Requests auf Render den neuen Commit deployen (`npm ci`, `npm start`) und die Seite neu laden. Die neuen Collections entstehen bei der ersten Verwendung automatisch. Der Entwicklerbutton setzt dasselbe OWNER_UIDS-Konto wie dein bisheriges Erstellerprofil voraus.
