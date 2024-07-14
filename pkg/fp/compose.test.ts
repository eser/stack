// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

import * as assert from "@std/assert";
import { compose } from "./compose.ts";

Deno.test("basic", () => {
  const lower = (x: string) => x.toLowerCase();
  const chars = (x: string) => x.replace(/[^\w \\-]+/g, "");
  const spaces = (x: string) => x.split(" ");
  const dashes = (x: Array<string>) => x.join("-");

  const slug = compose(dashes, spaces, chars, lower);

  const result = slug("Hello World!");

  assert.assertEquals(result, "hello-world");
});
