// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

import * as jsxRuntimeInternal from "../jsx-runtime/index.js";
import { assert, bdd, mock } from "./deps-dev.ts";
import * as root from "./root.tsx";

bdd.describe("cool/jsx-runtime", () => {
  bdd.it("should return the root component", () => {
    const actual = root.Root();

    assert.assertObjectMatch(actual, {
      constructor: undefined,
      type: root.Component,
      props: {
        "foo": "bar",
        "lime-hack": true,
      },
      key: undefined,
      ref: undefined,
    });
  });

  bdd.it("should call the hook", () => {
    const spyFn = mock.spy();

    // deno-lint-ignore no-explicit-any
    const hook = (vnode: any) => {
      if (vnode.props["lime-hack"]) {
        spyFn();
      }
    };

    // @ts-ignore typescript don't recognize this
    jsxRuntimeInternal.options.tagHelperHook = hook;

    root.Root();

    mock.assertSpyCalls(spyFn, 1);

    jsxRuntimeInternal.options.tagHelperHook = null;
  });
});
