import { asserts, bdd } from "./testing/mod.ts";
import { clampTime, datesBetween, tryParse } from "./datetime.ts";

bdd.describe("hex/stdx/datetime", () => {
  bdd.it("tryParse", () => {
    const result = tryParse("2021-01-01", "yyyy-MM-dd");
    const expected = new Date(2021, 0, 1);

    asserts.assertEquals(result, expected);
  });

  bdd.it("clampTime", () => {
    const date = new Date(2021, 0, 1, 12, 30, 45);
    const result = clampTime(date);

    const expected = new Date(2021, 0, 1, 0, 0, 0);

    asserts.assertEquals(result, expected);
  });

  bdd.it("datesBetween", () => {
    const result = datesBetween(
      new Date(2021, 0, 1, 0, 0, 0),
      new Date(2021, 0, 3, 0, 0, 0),
    );

    asserts.assertEquals(result, [
      new Date(2021, 0, 1, 0, 0, 0),
      new Date(2021, 0, 2, 0, 0, 0),
      new Date(2021, 0, 3, 0, 0, 0),
    ]);
  });
});
