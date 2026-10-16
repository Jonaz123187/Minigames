# v7.1 – Erstellerprofil und Spielcover

Das bereits über `OWNER_UIDS` hinterlegte Erstellerkonto erhält automatisch alle neun Abzeichen und alle Titel. Beim ersten Profilabruf nach dem Deploy wird seine Vitrine mit allen Abzeichen vorbelegt. Der exklusive Titel **GiG-Ursprung** wird bei noch nicht gewähltem Titel aktiviert. Spätere eigene Vitrinen- und Titelentscheidungen werden beibehalten. Diese Freischaltung hängt ausschließlich von der Firebase-UID ab, niemals von der Rolle als Lobby-Host.

Die Ersteller-Abzeichen werden bei der Ausgabe des Profils ergänzt. Sie schreiben keine erfundenen Siege, Runden, Rekorde, gesammelten Coins oder verdienten Abzeichen in die Datenbank. Wird eine UID aus `OWNER_UIDS` entfernt, entfallen die zusätzlichen Abzeichen und unverdiente Titel wieder; tatsächlich erspielte Erfolge bleiben. Bestehende private Zeichnungen und Sammlungen bleiben eigene Inhalte und werden nicht durch Beispieldaten gefüllt.

Neu für alle Spieler:

| Abzeichen         | Stufe       | Freischaltung                                 |
| ----------------- | ----------- | --------------------------------------------- |
| Hundertfach dabei | Episch      | 100 Multiplayer-Runden                        |
| Arcade-Legende    | Legendär    | 100 Multiplayer-Siege                         |
| Mythos der Crew   | Mythisch    | 1.000 Multiplayer-Runden                      |
| GiG-Ursprung      | Einzigartig | Ausschließlich das hinterlegte Erstellerkonto |

Die beiden seltenen Meilensteine schalten passende Titel frei; sie sind nicht kaufbar. Unter „Mein Profil → Vitrine & Sammlung“ zeigt eine Übersicht alle Abzeichen, Freischaltbedingungen und die Auswahl für die öffentliche Vitrine. Das Erstellerkonto kann alle neun anzeigen, andere Konten weiterhin zwei beziehungsweise sechs mit Vitrinen-Erweiterung.

Der Avatar im Profilbutton hatte am Desktop zwar 40 × 40 Pixel, aber einen geerbten Flex-Basiswert von 64 Pixeln. Jetzt stimmen Breite, Höhe und Flex-Basis überein; auf kleinen Bildschirmen gelten weiterhin 32 × 32 Pixel. Der Avatar-Hintergrund wird dadurch nicht mehr seitlich gestreckt.

## Neue Namen und Cover

| Bisher                  | Neuer Name     | Unveränderte Spiel-ID |
| ----------------------- | -------------- | --------------------- |
| Pixel-Flüsterpost       | Pixel Relay    | telephone             |
| Finde den Faker         | Sketch Suspect | faker                 |
| Schätz mal!             | Guesswork      | estimate              |
| Eine Taste reicht       | One Tap        | onebutton             |
| Pixel-Detektiv          | Pixel Shift    | detective             |
| Gemeinsam gegen die Uhr | Code Crew      | coop                  |

Alle sechs Spiele sowie **GiG Monster Trails** und **GiG Grand Prix** erhalten neu generierte, zusammengehörige Cover: dunkles Navy, Mint/Violett und klar erkennbare Voxel-Motive ohne eingebrannte Titel. Namen und deutsche Erklärungen bleiben als normaler zugänglicher Text auf den Karten. Es handelt sich um Illustrationen, nicht um Screenshots. Spielabläufe, gespeicherte Rekorde und Playlists behalten ihre bisherigen IDs.

Die acht WebP-Dateien liegen unter `public/previews/covers/`, jeweils 1120 × 630 Pixel, zusammen rund 423 kB. Neue Bildpfade ersetzen die alten Vorschauen im Katalog; dadurch greifen keine alten Thumbnail-Caches. Die bisherigen Bilder bleiben im Repository. Die vollständigen Bildprompts stehen in [docs/thumbnail-prompts.md](docs/thumbnail-prompts.md).

## Bereitstellung und Prüfung

Keine neue Umgebungsvariable oder manuelle Migration nötig. Die vorhandenen `OWNER_UIDS` müssen unverändert dein Erstellerkonto enthalten. Nach dem Zusammenführen Render-Deploy abwarten und vollständig neu laden. Ein Abruf von `/api/me` aktualisiert das Erstellerprofil automatisch. Der separate Lobby-Scroll- und Reihenfolge-Fix in PR #4 bleibt unabhängig kombinierbar.

Validiert: 68 automatisierte Tests, einschließlich UID-Grenzen, Schutz vor gefälschtem Besitzerstatus/Abzeichen, Entzug zusätzlicher Rechte, echten Spielstatistiken, seltenen Meilensteinen und nicht kaufbaren Titeln. Alle 26 Spiel-Lebenszyklen sowie Namen, HTTP-Bildpfade, WebP-MIME und Dateisignaturen geprüft. Ergänzende DOM-/Canvas-Prüfungen zeigen alle Ersteller-Abzeichen, die Vitrine und passende 40-Pixel-CSS-Werte im Profilbutton. Alle acht Cover wurden visuell geprüft.

Ein nativer Browser-Layouttest und die echten Firebase-/Supabase-Abläufe sind weiterhin nach dem Deploy zusätzlich zu prüfen, da der lokale Chromium-Prozess in dieser Umgebung nicht startet.
