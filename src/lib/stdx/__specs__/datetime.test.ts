import * as assert from "../assert.ts";
import { bdd } from "../testing/mod.ts";
import { clampTime, datesBetween, tryParse } from "../datetime.ts";

bdd.describe("hex/lib/stdx/datetime", () => {
  bdd.it("tryParse", () => {
    const result = tryParse("2021-01-01", "yyyy-MM-dd");
    const expected = new Date(2021, 0, 1);

    assert.assertEquals(result, expected);
  });

  bdd.it("clampTime", () => {
    const date = new Date(2021, 0, 1, 12, 30, 45);
    const result = clampTime(date);

    const expected = new Date(2021, 0, 1, 0, 0, 0);

    assert.assertEquals(result, expected);
  });

  bdd.it("clampTime - utc date", () => {
    const date = new Date(Date.UTC(2021, 0, 1, 12, 30, 45));
    const result = clampTime(date, { utc: true });

    const expected = new Date(Date.UTC(2021, 0, 1, 0, 0, 0));

    assert.assertEquals(result, expected);
  });

  bdd.it("datesBetween - complete dates", () => {
    const result = datesBetween(
      new Date(2021, 0, 1, 0, 0, 0),
      new Date(2021, 0, 3, 0, 0, 0),
    );

    assert.assertEquals(result, [
      new Date(2021, 0, 1, 0, 0, 0),
      new Date(2021, 0, 2, 0, 0, 0),
      new Date(2021, 0, 3, 0, 0, 0),
    ]);
  });

  bdd.it("datesBetween - complex dates", () => {
    const result = datesBetween(
      new Date(2021, 0, 1, 22, 0, 0),
      new Date(2021, 0, 5, 15, 0, 0),
    );

    assert.assertEquals(result, [
      new Date(2021, 0, 1, 22, 0, 0),
      new Date(2021, 0, 2, 22, 0, 0),
      new Date(2021, 0, 3, 22, 0, 0),
      new Date(2021, 0, 4, 22, 0, 0),
    ]);
  });
});
