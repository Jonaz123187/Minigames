"use strict";
module.exports = function highlights(game, g, roster) {
  const result = [];
  const best = (label, value, format, minimum = 0) => {
    const candidates = roster
      .map((p) => ({ p, v: value(g.players[p.id]) }))
      .filter((x) => Number.isFinite(x.v) && x.v > minimum)
      .sort((a, b) => b.v - a.v);
    if (candidates.length) {
      const { p, v } = candidates[0];
      result.push({ label, name: p.name, id: p.id, value: format(v) });
    }
  };
  switch (game) {
    case "race":
      best(
        "Tempo-König",
        (p) => p.topSpeed,
        (v) => Math.round(v * 3.6) + " km/h",
      );
      best(
        "Drift-Künstler",
        (p) => p.driftTime,
        (v) => v.toFixed(1) + " s quer",
      );
      best(
        "Boxenfunk des Abends",
        (p) => p.resets,
        (v) => v + " Bergungen",
      );
      break;
    case "click":
      best(
        "Finger im Turbo",
        (p) => p.clicks,
        (v) => (v / 10).toFixed(1) + " Klicks/s",
      );
      break;
    case "draw":
      best(
        "Kreativkopf",
        (p) => p.score,
        (v) => v + " Zeichen- & Ratepunkte",
      );
      break;
    case "dub":
      best(
        "Publikumsliebling",
        (p) => p.crowdWins,
        (v) => v + " gewonnene Abstimmungen",
      );
      best(
        "Stimmakrobat",
        (p) => Math.max(...p.matches, 0),
        (v) => (v / 10).toFixed(1) + " % bester Match",
      );
      break;
    case "runner":
      best(
        "Weit gekommen",
        (p) => p.best,
        (v) => Math.round((v - 100) / 10) + " m",
      );
      break;
    case "rhythm":
      best(
        "Perfektes Gehör",
        (p) => p.perfect,
        (v) => v + " perfekte Treffer",
      );
      break;
    case "aim":
      best(
        "Ruhige Hand",
        (p) => (p.shots ? p.hits / p.shots : 0),
        (v) => Math.round(v * 100) + " % Präzision",
      );
      break;
    case "bomber":
      best(
        "Explosiver Auftritt",
        (p) => p.kills,
        (v) => v + " KOs",
      );
      break;
    case "stack":
      best(
        "Hochstapler",
        (p) => p.height,
        (v) => v + " Blöcke",
      );
      break;
    case "quiz":
      best(
        "Nerven aus Stahl",
        (p) => p.correct,
        (v) => v + "/6 Fragen richtig",
      );
      break;
    default:
      best(
        "Dabei geblieben",
        (p) => p.lived,
        (v) => v.toFixed(1) + " s überlebt",
      );
  }
  return result.slice(0, 3);
};
