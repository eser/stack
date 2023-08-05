import * as assert from "../../assert.ts";
import { bdd } from "../../testing/mod.ts";
import { trimEnd, trimStart } from "../strings.ts";

bdd.describe("hex/stdx/fmt/strings", () => {
  bdd.it("trimStart - basic", () => {
    const result = trimStart(" \thello\t ");
    const expected = "hello\t ";

    assert.assertEquals(result, expected);
  });

  bdd.it("trimStart - empty input", () => {
    const result = trimStart("");
    const expected = "";

    assert.assertEquals(result, expected);
  });

  bdd.it("trimStart - empty result", () => {
    const result = trimStart("  ");
    const expected = "";

    assert.assertEquals(result, expected);
  });

  bdd.it("trimStart - custom list", () => {
    const result = trimStart("/eser/", ["/"]);
    const expected = "eser/";

    assert.assertEquals(result, expected);
  });

  bdd.it("trimEnd - basic", () => {
    const result = trimEnd(" \thello\t ");
    const expected = " \thello";

    assert.assertEquals(result, expected);
  });

  bdd.it("trimEnd - empty input", () => {
    const result = trimEnd("");
    const expected = "";

    assert.assertEquals(result, expected);
  });

  bdd.it("trimEnd - empty result", () => {
    const result = trimEnd("  ");
    const expected = "";

    assert.assertEquals(result, expected);
  });

  bdd.it("trimEnd - custom list", () => {
    const result = trimEnd("/eser/", ["/"]);
    const expected = "/eser";

    assert.assertEquals(result, expected);
  });
});
