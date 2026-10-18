"use strict";
const assert = require("node:assert/strict"),
  { io } = require("socket.io-client"),
  { createArcade } = require("../../server"),
  { fresh } = require("../../accounts");
class Store {
  constructor() {
    this.data = new Map();
    this.queue = Promise.resolve();
  }
  snapshot(key) {
    return {
      exists: this.data.has(key),
      data: () => structuredClone(this.data.get(key)),
    };
  }
  collection(name) {
    const store = this;
    let lo = "",
      hi = "\uffff",
      max = 100;
    const q = {
      doc: (id) => ({
        key: name + "/" + id,
        get: async () => store.snapshot(name + "/" + id),
      }),
      orderBy: () => q,
      startAt: (v) => ((lo = v), q),
      endAt: (v) => ((hi = v), q),
      limit: (v) => ((max = v), q),
      get: async () => ({
        docs: [...store.data.keys()]
          .filter(
            (k) =>
              k.startsWith(name + "/") &&
              k.slice(name.length + 1) >= lo &&
              k.slice(name.length + 1) <= hi,
          )
          .sort()
          .slice(0, max)
          .map((k) => store.snapshot(k)),
      }),
    };
    return q;
  }
  runTransaction(fn) {
    const task = this.queue.then(async () => {
      const writes = [];
      let writing = false;
      const out = await fn({
        get: async (r) => {
          assert.equal(
            writing,
            false,
            "Firestore transactions read before writing",
          );
          return this.snapshot(r.key);
        },
        set: (r, v) => {
          writing = true;
          writes.push([r.key, structuredClone(v)]);
        },
      });
      for (const [k, v] of writes) this.data.set(k, v);
      return out;
    });
    this.queue = task.catch(() => {});
    return task;
  }
  seed(uid, name = uid) {
    this.data.set("gigPlayers/" + uid, fresh(uid, name));
    this.data.set("gigNames/" + name.toLowerCase(), { uid });
  }
}
const delay = (ms) => new Promise((r) => setTimeout(r, ms));
async function until(fn, message = "condition") {
  for (let i = 0; i < 300; i++) {
    if (await fn()) return;
    await delay(5);
  }
  assert.fail(message);
}
const call = (s, event, payload = {}) =>
  new Promise((resolve, reject) =>
    s
      .timeout(4000)
      .emit(event, payload, (e, r) => (e ? reject(e) : resolve(r))),
  );
async function setup(t, accountOptions = {}) {
  let now = 100000;
  const store = new Store();
  for (const [id, name] of [
    ["alice", "Alice"],
    ["bob", "Bobby"],
    ["charlie", "Charlie"],
  ])
    store.seed(id, name);
  const clients = [];
  const arcade = createArcade({
    manual: true,
    clock: () => now,
    accountOptions: {
      ...accountOptions,
      testStore: store,
      testVerify: async (token) => {
        if (!["alice", "bob", "charlie"].includes(token)) throw Error();
        return { uid: token, email_verified: true };
      },
    },
  });
  await new Promise((r) => arcade.server.listen(0, "127.0.0.1", r));
  const base = "http://127.0.0.1:" + arcade.server.address().port;
  async function api(path, token = "alice", method = "GET", body) {
    const res = await fetch(base + path, {
      method,
      headers: {
        Authorization: "Bearer " + token,
        "Content-Type": "application/json",
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    return { status: res.status, ...(await res.json()) };
  }
  async function connect(uid) {
    const s = io(base, {
      transports: ["websocket"],
      forceNew: true,
      reconnection: false,
    });
    clients.push(s);
    s.on("room", (r) => (s.room = r));
    s.on("state", (r) => (s.snapshot = r));
    await new Promise((r) => s.once("connect", r));
    if (uid)
      assert.equal((await call(s, "account:login", { token: uid })).ok, true);
    return s;
  }
  async function friends(a = "alice", b = "bob") {
    assert.equal(
      (
        await api("/api/social/friend", a, "POST", {
          uid: b,
          action: "request",
        })
      ).ok,
      true,
    );
    assert.equal(
      (await api("/api/social/friend", b, "POST", { uid: a, action: "accept" }))
        .ok,
      true,
    );
  }
  function step(ms) {
    now += ms;
    arcade.step(now);
  }
  t.after(async () => {
    clients.forEach((s) => s.disconnect());
    await arcade.close();
  });
  return { store, arcade, api, connect, friends, step, base, now: () => now };
}
module.exports = { Store, setup, until, call, delay };
