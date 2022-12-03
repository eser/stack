import { asserts, bdd } from "./deps.ts";
import { curryRight } from "../curry-right.ts";

bdd.describe("hex/lib/fp/curry-right", () => {
  bdd.it("basic", () => {
    const dec = (a: number, b: number) => a - b;

    const decWith5 = curryRight(dec, 5);

    const result = decWith5(3);

    asserts.assertEquals(result, -2);
  });
});
