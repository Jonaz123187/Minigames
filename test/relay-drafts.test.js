"use strict";
const { test } = require("node:test"),
  assert = require("node:assert/strict"),
  { GAMES } = require("../server"),
  { setup, until, call } = require("./helpers/social-harness.cjs");
const drawing = (color) => ({
    width: 900,
    height: 500,
    strokes: [[20, 40, 500, 300, color, 16]],
  }),
  round = (ids) => ({ connected: new Set(ids), controls: {} });
function begin() {
  const game = GAMES.telephone,
    g = game.init(["a", "b", "c"], 0),
    r = round(g.ids);
  for (const id of g.ids)
    game.input(g, id, { action: "submit", text: "Satz " + id }, 1);
  game.tick(g, 0, 3001, r);
  return { game, g, r };
}
test("Relay: unfinished drawings are privately checkpointed and passed to the correct next player automatically at the deadline", () => {
  const { game, g, r } = begin(),
    d = drawing("#19aa77");
  assert.equal(
    game.input(
      g,
      "a",
      { action: "draft", step: 1, revision: 1, drawing: d },
      4000,
    ),
    true,
  );
  assert.deepEqual(game.view(g, 4000, "a").ownDraft.value, d);
  assert.equal(game.view(g, 4000, "b").ownDraft, null);
  assert.equal(game.view(g, 4000, "observer").ownDraft, null);
  assert.equal(game.view(g, 4000, "observer").task, null);
  assert.equal(g.players.a.score, 100);
  game.tick(g, 0, g.until + 1, r);
  const task = game.view(g, g.at, "b").task;
  assert.deepEqual(task.value, d);
  assert.equal(task.author, "a");
  assert.equal(task.automatic, true);
  assert.equal(g.players.a.score, 200);
  assert.equal(game.view(g, g.at, "c").task.missing, true);
  assert.equal(game.view(g, g.at, "c").task.value, null);
});
test("Relay: revisions, step IDs, clears and malformed drafts cannot revive an older drawing or poison the next phase", () => {
  const { game, g, r } = begin();
  assert.equal(
    game.input(
      g,
      "a",
      { action: "draft", step: 0, revision: 1, drawing: drawing("#112233") },
      4000,
    ),
    false,
  );
  assert.equal(
    game.input(
      g,
      "a",
      {
        action: "draft",
        step: 1,
        revision: 1,
        drawing: { ...drawing("#112233"), width: 100 },
      },
      4000,
    ),
    false,
  );
  assert.equal(
    game.input(
      g,
      "a",
      { action: "draft", step: 1, revision: 2, drawing: drawing("#112233") },
      4000,
    ),
    true,
  );
  assert.equal(
    game.input(
      g,
      "a",
      { action: "draft", step: 1, revision: 1, drawing: drawing("#445566") },
      4500,
    ),
    false,
  );
  assert.equal(
    game.input(
      g,
      "a",
      {
        action: "draft",
        step: 1,
        revision: 3,
        drawing: { width: 900, height: 500, strokes: [] },
      },
      5000,
    ),
    true,
  );
  game.tick(g, 0, g.until + 1, r);
  assert.equal(game.view(g, g.at, "b").task.missing, true);
  assert.equal(
    game.input(
      g,
      "a",
      { action: "draft", step: 1, revision: 4, drawing: drawing("#445566") },
      g.at + 1,
    ),
    false,
  );
});
test("Relay: explicit final submission wins over a checkpoint and is scored exactly once", () => {
  const { game, g, r } = begin();
  game.input(
    g,
    "a",
    { action: "draft", step: 1, revision: 1, drawing: drawing("#112233") },
    4000,
  );
  const final = drawing("#ff00aa");
  assert.equal(
    game.input(g, "a", { action: "submit", step: 1, drawing: final }, 4500),
    true,
  );
  assert.equal(
    game.input(
      g,
      "a",
      { action: "draft", step: 1, revision: 2, drawing: drawing("#445566") },
      5000,
    ),
    false,
  );
  game.tick(g, 0, g.until + 1, r);
  assert.deepEqual(game.view(g, g.at, "b").task.value, final);
  assert.equal(g.players.a.score, 200);
});
test("Relay Socket.IO: a draft survives time expiry, is delivered remotely and rejects a delayed old-step packet", async (t) => {
  const h = await setup(t),
    a = await h.connect("alice"),
    b = await h.connect("bob");
  await call(a, "lobby", { action: "create", name: "Alice" });
  await until(() => a.room);
  await call(b, "lobby", { action: "join", name: "Bobby", code: a.room.code });
  await call(a, "wish", { game: "telephone" });
  await call(b, "ready", { ready: true });
  await call(a, "start", { game: "telephone" });
  h.step(3001);
  await until(() => a.room.phase === "playing");
  const id = a.room.round.id;
  for (const s of [a, b])
    assert.equal(
      (
        await call(s, "input", {
          roundId: id,
          action: "submit",
          text: "Eine bunte Katze",
        })
      ).ok,
      true,
    );
  h.step(3001);
  await until(() => a.snapshot?.data.step === 1);
  const d = drawing("#1a9fc4");
  assert.equal(
    (
      await call(a, "input", {
        roundId: id,
        action: "draft",
        step: 1,
        revision: 1,
        drawing: d,
      })
    ).ok,
    true,
  );
  h.step(35001);
  await until(() => b.snapshot?.data.step === 2);
  assert.deepEqual(b.snapshot.data.task.value, d);
  assert.equal(b.snapshot.data.task.automatic, true);
  assert.equal(
    (
      await call(a, "input", {
        roundId: id,
        action: "draft",
        step: 1,
        revision: 2,
        drawing: d,
      })
    ).ok,
    false,
  );
});
