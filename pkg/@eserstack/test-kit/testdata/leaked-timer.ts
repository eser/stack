// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

// A fixture for leaks.test.ts, run in a child `node --test` process. The
// first test leaks a timer on purpose; the second clears its own.

import * as nodeTest from "node:test";
import * as leaks from "../leaks.ts";

leaks.checkLeaks();

nodeTest.test("leaks a timer", () => {
  setTimeout(() => {}, 60_000);
});

nodeTest.test("clears its timer", () => {
  const timer = setTimeout(() => {}, 60_000);
  clearTimeout(timer);
});
