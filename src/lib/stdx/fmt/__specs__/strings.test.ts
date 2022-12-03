import { asserts, bdd } from "../../testing/mod.ts";
import { trimEnd, trimStart } from "../strings.ts";

bdd.describe("hex/lib/stdx/fmt/strings", () => {
  bdd.it("trimStart - basic", () => {
    const result = trimStart(" \thello\t ");
    const expected = "hello\t ";

    asserts.assertEquals(result, expected);
  });

  bdd.it("trimStart - empty input", () => {
    const result = trimStart("");
    const expected = "";

    asserts.assertEquals(result, expected);
  });

  bdd.it("trimStart - empty result", () => {
    const result = trimStart("  ");
    const expected = "";

    asserts.assertEquals(result, expected);
  });

  bdd.it("trimStart - custom list", () => {
    const result = trimStart("/eser/", ["/"]);
    const expected = "eser/";

    asserts.assertEquals(result, expected);
  });

  bdd.it("trimEnd - basic", () => {
    const result = trimEnd(" \thello\t ");
    const expected = " \thello";

    asserts.assertEquals(result, expected);
  });

  bdd.it("trimEnd - empty input", () => {
    const result = trimEnd("");
    const expected = "";

    asserts.assertEquals(result, expected);
  });

  bdd.it("trimEnd - empty result", () => {
    const result = trimEnd("  ");
    const expected = "";

    asserts.assertEquals(result, expected);
  });

  bdd.it("trimEnd - custom list", () => {
    const result = trimEnd("/eser/", ["/"]);
    const expected = "/eser";

    asserts.assertEquals(result, expected);
  });
});
