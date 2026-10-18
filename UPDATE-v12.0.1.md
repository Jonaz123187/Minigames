# v12.0.1 – Spielansicht nach dem Countdown

Ein Fehler in einem Canvas- oder WebGL-Renderer konnte bislang den nächsten
Animationsaufruf verhindern. Damit blieben Countdown und Spielfeld in diesem Tab
stehen; auch der Wechsel zu einem anderen Spiel startete die Schleife nicht neu.
Dieser Fehlerpfad ist im bisherigen Code mit einem unterbrochenen Painter reproduziert.

- Die Animationsschleife plant den nächsten Frame vor dem Zeichnen. Fehler in
  Spielansicht und HUD/Audio werden getrennt behandelt und einmal pro Runde protokolliert.
- Nach einem Zeichenfehler werden auch zurückgelassene Canvas-Clips und Transformationen
  zurückgesetzt, damit spätere Spiele wieder sichtbar zeichnen können.
- Grand Prix und Monster Trails wechseln bei Fehlern beim Szenenaufbau, beim
  Vergrößern, bei der Shader-Kompilierung oder beim Rendern in ihre steuerbare
  2D-Streckenansicht. Der fehlerhafte 3D-Layer verdeckt diese Ansicht nicht.
- Countdown und LOS-Einblendung folgen der synchronisierten Rundenzeit. Ein alter
  Timeout kann die Einblendung einer neuen Runde nicht mehr verändern.
- Ein passendes autoritatives State-Paket kann einen verpassten Wechsel vom
  Countdown zum laufenden Spiel nachholen. Fremde/veraltete Runden bleiben ignoriert.
- Geänderte Browser-Skripte erhalten eine neue Cache-Version.

## Prüfungen

- `npm test`: 125 Tests.
- `GIG_QA_MODULES=../build-tools node scripts/check-gameplay-clients.cjs`:
  27 Spiele mit drei echten lokalen Socket.IO-Clients, Countdown, phasenabhängige
  Timer, Uhrensprung, gemeinsame Pause/Fortsetzung, Eingaben und späte Zuschauer.
- `scripts/check-premium-rendering.cjs`: 27 Ansichten jeweils für Desktop,
  Hochformat/Touch, reduzierte Animation und Englisch; Canvas-Rendering und DOM.
- `scripts/check-premium-3d.cjs`: sechs echte Three-Szenen und Kameras;
  abgefangene Fehler lassen die Prüfung jetzt ausdrücklich scheitern.
- `scripts/check-render-recovery.cjs`: tatsächlich geleerte/erneut gefüllte
  Animationswarteschlange, unterbrochener Painter mit Clip, HUD-Fehler, verlorener
  Phasenwechsel sowie injizierte WebGL-Initialisierungs-, Größen-, Shader- und
  Renderfehler. Beide Fahrzeugspiele und anschließend sämtliche 27 Spiele werden
  erneut gerendert; das Spielmenü bleibt bedienbar. Auch Touch wird geprüft.

## Grenze der Prüfung

Das konkrete Fehlerbild im Browser des Nutzers konnte hier nicht unmittelbar
beobachtet werden. Der Cloud-Browser ließ sich nicht öffnen; das lokale Chromium
beendete sich vor dem Seitenaufruf mit SIGSEGV. Die Prüfungen verwenden deshalb
JSDOM, echtes Canvas, echte Three-Geometrie und gezielt fehlschlagende GPU-Aufrufe.
Native WebGL-Shader, Browser-Layout und echte Touch-Bedienung sind nicht als
erfolgreich getestet zu verstehen. Der abgesicherte Fehlerpfad erklärt, wie ein
einzelner Renderingfehler alle folgenden Spiele blockieren konnte; der ursprüngliche
geräteabhängige Auslöser ist damit noch nicht nachgewiesen.
