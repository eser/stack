// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

import * as nodeTest from "node:test";
import * as assert from "@eserstack/test-kit/assert";
import * as runModes from "@eserstack/standards/run-modes";
import * as appRuntime from "./mod.ts";

const moduleNamed = (name?: string): appRuntime.Module => ({
  name,
  manifest: {},
  provides: [],
  entrypoint: () => {},
});

nodeTest.test(
  "createAppRuntimeState starts with no run mode and empty collections",
  () => {
    const state = appRuntime.createAppRuntimeState();

    assert.assertEquals(state.runMode, runModes.RunModes.NotSet);
    assert.assertEquals(state.modules.size, 0);
    assert.assertEquals(state.channels.size, 0);
    assert.assertEquals(state.awaits, []);
  },
);

nodeTest.test(
  "createAppRuntimeState returns new collections on every call",
  () => {
    const first = appRuntime.createAppRuntimeState();
    const second = appRuntime.createAppRuntimeState();

    first.modules.set("db", moduleNamed("db"));
    first.awaits.push(Promise.resolve());

    assert.assertEquals(second.modules.size, 0);
    assert.assertEquals(second.awaits, []);
  },
);

nodeTest.test("AppRuntime uses the state it is given", () => {
  const state = appRuntime.createAppRuntimeState();

  assert.assertStrictEquals(new appRuntime.AppRuntime(state).state, state);
});

nodeTest.test(
  "addModule keys a module by its name, and a later one replaces it",
  () => {
    const app = new appRuntime.AppRuntime();
    const first = moduleNamed("database");
    const second = moduleNamed("database");

    app.addModule(first);
    assert.assertStrictEquals(app.state.modules.get("database"), first);

    app.addModule(second);
    assert.assertEquals(app.state.modules.size, 1);
    assert.assertStrictEquals(app.state.modules.get("database"), second);
  },
);

nodeTest.test(
  "addModule keys an unnamed module by its constructor name",
  () => {
    class CacheModule implements appRuntime.Module {
      manifest = {};
      provides = [];
      entrypoint(): void {}
    }
    const app = new appRuntime.AppRuntime();
    const module = new CacheModule();

    app.addModule(module);

    assert.assertStrictEquals(app.state.modules.get("CacheModule"), module);
  },
);

nodeTest.test(
  "addChannel keys a channel by its name or constructor name",
  () => {
    class EventsChannel {}
    const app = new appRuntime.AppRuntime();
    const named = { name: "http" };
    const unnamed = new EventsChannel();

    app.addChannel(named);
    app.addChannel(unnamed);

    assert.assertStrictEquals(app.state.channels.get("http"), named);
    assert.assertStrictEquals(app.state.channels.get("EventsChannel"), unnamed);
  },
);

nodeTest.test(
  "setAsDefault registers the runtime under AppRuntime.default",
  () => {
    const app = new appRuntime.AppRuntime();

    app.setAsDefault();

    assert.assertStrictEquals(
      app.state.di.get(appRuntime.AppRuntime.default),
      app,
    );
  },
);

nodeTest.test(
  "awaitAll waits for the queued work and empties the queue",
  async () => {
    const app = new appRuntime.AppRuntime();
    const finished: string[] = [];
    const later = (name: string, ms: number) =>
      new Promise<void>((resolve) =>
        setTimeout(() => {
          finished.push(name);
          resolve();
        }, ms),
      );
    app.state.awaits.push(later("slow", 20), later("fast", 1));

    await app.awaitAll();

    assert.assertEquals(finished.toSorted(), ["fast", "slow"]);
    assert.assertEquals(app.state.awaits, []);
  },
);

nodeTest.test(
  "awaitAll rejects with the first failure, and only once",
  async () => {
    const app = new appRuntime.AppRuntime();
    app.state.awaits.push(
      Promise.resolve(),
      Promise.reject(new Error("manifest unreadable")),
    );

    await assert.assertRejects(
      () => app.awaitAll(),
      Error,
      "manifest unreadable",
    );
    assert.assertEquals(app.state.awaits, []);
    // The failed operation left the queue, so the next call has nothing to wait for.
    await app.awaitAll();
  },
);

nodeTest.test(
  "awaitAll keeps work queued while it waits for the next call",
  async () => {
    const app = new appRuntime.AppRuntime();
    const gate = Promise.withResolvers<void>();
    app.state.awaits.push(gate.promise);

    const waiting = app.awaitAll();
    const pushed = Promise.resolve();
    app.state.awaits.push(pushed);
    // LarouxRuntime replaces the array instead of pushing to it.
    const replaced = Promise.resolve();
    app.state.awaits = [...app.state.awaits, replaced];
    gate.resolve();
    await waiting;

    assert.assertEquals(app.state.awaits.length, 2);
    assert.assertStrictEquals(app.state.awaits[0], pushed);
    assert.assertStrictEquals(app.state.awaits[1], replaced);
    await app.awaitAll();
    assert.assertEquals(app.state.awaits, []);
  },
);
