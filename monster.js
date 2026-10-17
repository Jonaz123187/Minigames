"use strict";
const T = require("./public/monster-shared"),
  M = require("matter-js");
module.exports = {
  title: "GiG Monster Trails",
  icon: "20",
  seconds: 180,
  category: "Skill",
  difficulty: "Experte",
  description:
    "Dein Truck, drei Landschaften und eine Strecke voller Sprünge. Echte Federung, Balance in der Luft und faire Checkpoints statt sofortigem Ausscheiden.",
  controls:
    "W / ↑: Gas · S / ↓: Bremsen & rückwärts · A / ←: Nase hoch · D / →: Nase runter · R: zum Checkpoint (+3 s) · Überschläge setzen dich automatisch zurück · Touch: Pedale und Balance",
  init(ids, startsAt, options = {}) {
    const track = T.course(options.settings?.monster?.track),
      all = ids
        .map((id) => options.upgrades?.[id] || { power: 0, grip: 0, weight: 0 })
        .sort(
          (a, b) =>
            a.power + a.grip + a.weight - (b.power + b.grip + b.weight) ||
            a.power - b.power ||
            a.grip - b.grip,
        ),
      levels = { ...all[0] };
    return {
      track,
      levels,
      startsAt,
      players: Object.fromEntries(
        ids.map((id) => [id, T.makeWorld(track, levels)]),
      ),
      finishDeadline: null,
    };
  },
  meta: (g) => ({
    track: g.track.id,
    levels: g.levels,
    length: g.track.length,
  }),
  input(g, id, input, now) {
    return input.action === "reset" && g.players[id]
      ? T.reset(g.players[id], g.track, now)
      : false;
  },
  tick(g, dt, now, round) {
    for (const [id, p] of Object.entries(g.players)) {
      if (!round.connected.has(id)) {
        p.out = true;
        continue;
      }
      T.step(p, round.controls[id] || {}, dt, g.track, now);
      if (p.finished && !g.finishDeadline) g.finishDeadline = now + 15000;
    }
    return (
      Object.values(g.players).every((p) => p.out || p.finished) ||
      (g.finishDeadline !== null && now >= g.finishDeadline)
    );
  },
  view: (g) => ({
    track: g.track.id,
    levels: g.levels,
    length: g.track.length,
    finishAt: g.finishDeadline,
    players: Object.fromEntries(
      Object.entries(g.players).map(([id, p]) => [id, T.view(p)]),
    ),
  }),
  score: (g, id) =>
    g.players[id].finished
      ? 1e8 - (g.players[id].finishAt - g.startsAt) - g.players[id].penalty
      : Math.max(0, g.players[id].best - g.players[id].resets * 60),
  detail: (g, id) => {
    const p = g.players[id];
    return (
      (p.finished
        ? "Ziel · " +
          ((p.finishAt - g.startsAt + p.penalty) / 1000).toFixed(1) +
          " s"
        : Math.floor(p.best / 20) + " m") +
      " · " +
      p.coins.length +
      " Streckenmarker · " +
      p.airtime.toFixed(1) +
      " s Airtime · " +
      p.resets +
      " Rücksetzer"
    );
  },
  dispose: (g) =>
    Object.values(g.players).forEach((p) => M.Engine.clear(p.engine)),
};
