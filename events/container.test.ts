// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

import { assert, bdd, mock } from "./deps-dev.ts";
import { Registry } from "./container.ts";

bdd.describe("cool/events/container", () => {
  bdd.it("simple", () => {
    const spyFn = mock.spy();

    const registry = new Registry();
    registry.add("ev", () => spyFn());

    const dispatcher = registry.build();
    dispatcher.dispatch("ev");

    mock.assertSpyCalls(spyFn, 1);
  });

  bdd.it("multiple", () => {
    const spyFn = mock.spy();

    const registry = new Registry();
    registry.add("ev", () => spyFn());

    const dispatcher = registry.build();
    dispatcher.dispatch("ev");
    dispatcher.dispatch("ev");

    mock.assertSpyCalls(spyFn, 2);
  });

  bdd.it("once", () => {
    const spyFn = mock.spy();

    const registry = new Registry();
    registry.add("ev", () => spyFn(), { once: true });

    const dispatcher = registry.build();
    dispatcher.dispatch("ev");
    dispatcher.dispatch("ev");

    mock.assertSpyCalls(spyFn, 1);
  });

  bdd.it("parameters", () => {
    const spyFn = mock.spy();

    const registry = new Registry();
    registry.add("ev", (e) => spyFn(e));

    const dispatcher = registry.build();
    dispatcher.dispatch("ev", { detail: "xx" });

    mock.assertSpyCalls(spyFn, 1);

    const arg = spyFn.calls[0]?.args[0] as CustomEvent;
    assert.assertEquals(arg.detail, "xx");
  });

  bdd.it("no parameters", () => {
    const spyFn = mock.spy();

    const registry = new Registry();
    registry.add("ev", (e) => spyFn(e));

    const dispatcher = registry.build();
    dispatcher.dispatch("ev");

    mock.assertSpyCalls(spyFn, 1);

    const arg = spyFn.calls[0]?.args[0] as CustomEvent;
    assert.assertStrictEquals(arg.detail, undefined);
  });
});
