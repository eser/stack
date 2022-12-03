import { asserts, bdd } from "./deps.ts";
import { mutate } from "../mutate.ts";

bdd.describe("hex/lib/fp/mutate", () => {
  bdd.it("basic", () => {
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

  bdd.it("array-push", () => {
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

  bdd.it("with-class", () => {
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
});
