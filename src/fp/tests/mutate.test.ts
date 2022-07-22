import { asserts } from "./deps.ts";
import mutate from "../mutate.ts";

Deno.test("hex/fp/mutate:basic", () => {
  const obj1 = {
    firstName: "Eser",
    lastName: "Ozvataf",
    aliases: [],
  };

  const result = mutate(obj1, (x) => x.firstName = "Helo");

  asserts.assertNotStrictEquals(result, obj1);
  asserts.assertEquals(Object.keys(result).length, 3);
  asserts.assertEquals(
    result,
    {
      firstName: "Helo",
      lastName: "Ozvataf",
      aliases: [],
    },
  );
});

Deno.test("hex/fp/mutate:array-push", () => {
  const obj1 = {
    firstName: "Eser",
    lastName: "Ozvataf",
    aliases: <string[]> [],
  };

  const result = mutate(obj1, (x) => {
    x.firstName = "Helo";

    x.aliases.push("laroux");
  });

  asserts.assertNotStrictEquals(result, obj1);
  asserts.assertEquals(Object.keys(result).length, 3);
  asserts.assertEquals(
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

Deno.test("hex/fp/mutate:with-class", () => {
  class dummy {
    items: string[];

    constructor() {
      this.items = [];
    }
  }

  const obj1 = new dummy();

  const result = mutate(obj1, (x) => {
    x.items.push("laroux");
  });

  asserts.assertNotStrictEquals(result, obj1);
  asserts.assertEquals(result.constructor, dummy);
  asserts.assertEquals(Object.keys(result), ["items"]);
  asserts.assertEquals(
    result.items,
    [
      "laroux",
    ],
  );
});
