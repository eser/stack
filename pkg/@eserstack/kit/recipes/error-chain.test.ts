// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

import * as assert from "@eserstack/test-kit/assert";
import * as bdd from "@std/testing/bdd";
import * as errorChain from "./error-chain.ts";

class OuterError extends Error {}
class RootError extends Error {}

bdd.describe("formatErrorChain", () => {
  bdd.it("renders each cause on its own line, outermost first", () => {
    const error = new OuterError("apply recipe demo: copy a.ts to lib/a.ts", {
      cause: new Error("GET https://registry.example/a.ts: HTTP 404", {
        cause: new RootError("not found"),
      }),
    });

    assert.assertEquals(
      errorChain.formatErrorChain(error),
      [
        "apply recipe demo: copy a.ts to lib/a.ts",
        "  caused by: GET https://registry.example/a.ts: HTTP 404",
        "  caused by: not found",
      ].join("\n"),
    );
  });

  bdd.it("renders a non-Error value and a non-Error cause as text", () => {
    assert.assertEquals(errorChain.formatErrorChain("plain"), "plain");
    assert.assertEquals(
      errorChain.formatErrorChain(new Error("outer", { cause: 42 })),
      "outer\n  caused by: 42",
    );
  });

  bdd.it("removes terminal control sequences from messages", () => {
    const error = new Error("load registry x", {
      cause: new Error("name \u001b[2J\u001b]52;c;cGF5bG9hZA==\u0007evil"),
    });

    assert.assertEquals(
      errorChain.formatErrorChain(error),
      "load registry x\n  caused by: name evil",
    );
  });

  bdd.it("stops on a cyclic chain", () => {
    const first = new Error("first");
    const second = new Error("second", { cause: first });
    first.cause = second;

    const lines = errorChain.formatErrorChain(first).split("\n");

    assert.assertEquals(lines.length, 10);
  });
});

bdd.describe("findCause", () => {
  const root = new RootError("root");
  const error = new OuterError("outer", {
    cause: new Error("middle", { cause: root }),
  });

  bdd.it("finds an error of the type anywhere in the chain", () => {
    assert.assertStrictEquals(errorChain.findCause(error, RootError), root);
    assert.assertStrictEquals(errorChain.findCause(error, OuterError), error);
  });

  bdd.it("returns null when the chain has no error of the type", () => {
    assert.assertEquals(errorChain.findCause(error, RangeError), null);
    assert.assertEquals(errorChain.findCause("not an error", RootError), null);
  });
});
