// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

import * as assert from "@std/assert";
// import * as mock from "@std/testing/mock";
// import * as jsxRuntimeInternals from "@eser/jsx-runtime/internals";
import * as root from "./root.tsx";

Deno.test("should return the root component", () => {
  const actual = root.Root();

  assert.assertObjectMatch(actual, {
    // constructor: undefined,
    type: root.Component,
    props: {
      "foo": "bar",
      "lime-hack": true,
    },
    key: null,
    ref: null,
  });
});

// Deno.test("should call the hook", () => {
//   const spyFn = mock.spy();

//   // deno-lint-ignore no-explicit-any
//   const hook = (vnode: any) => {
//     if (vnode.props["lime-hack"]) {
//       spyFn();
//     }
//   };

//   // @ts-ignore typescript don't recognize this
//   jsxRuntimeInternals.options.tagHelperHook = hook;

//   root.Root();

//   mock.assertSpyCalls(spyFn, 1);

//   jsxRuntimeInternals.options.tagHelperHook = null;
// });
