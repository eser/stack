import { asserts, bdd } from "./deps.ts";
import { curry } from "../curry.ts";

bdd.describe("hex/lib/fp/curry", () => {
  bdd.it("basic", () => {
    const sum = (a: number, b: number) => a + b;

    const sumWith5 = curry(sum, 5);

    const result = sumWith5(3);

    asserts.assertEquals(result, 8);
  });
});
