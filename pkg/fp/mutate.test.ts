// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

import * as assert from "@std/assert";
import { mutate } from "./mutate.ts";

Deno.test("basic", () => {
  const obj1 = {
    firstName: "Eser",
    lastName: "Ozvataf",
    aliases: [],
  };

  const result = mutate(obj1, (x) => x.firstName = "Helo");

  assert.assertNotStrictEquals(result, obj1);
  assert.assertEquals(Object.keys(result).length, 3);
  assert.assertEquals(
    result,
    {
      firstName: "Helo",
      lastName: "Ozvataf",
      aliases: [],
    },
  );
});

Deno.test("array-push", () => {
  const obj1 = {
    firstName: "Eser",
    lastName: "Ozvataf",
    aliases: <Array<string>> [],
  };

  const result = mutate(obj1, (x) => {
    x.firstName = "Helo";

    x.aliases.push("laroux");
  });

  assert.assertNotStrictEquals(result, obj1);
  assert.assertEquals(Object.keys(result).length, 3);
  assert.assertEquals(
    result,
    {
      firstName: "Helo",
      lastName: "Ozvataf",
      aliases: [
        "laroux",
      ],
    },
  );
});

Deno.test("with-class", () => {
  class Dummy {
    items: Array<string>;

    constructor() {
      this.items = [];
    }
  }

  const obj1 = new Dummy();

  const result = mutate(obj1, (x) => {
    x.items.push("laroux");
  });

  assert.assertNotStrictEquals(result, obj1);
  assert.assertEquals(result.constructor, Dummy);
  assert.assertEquals(Object.keys(result), ["items"]);
  assert.assertEquals(
    result.items,
    [
      "laroux",
    ],
  );
});
