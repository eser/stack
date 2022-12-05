import { asserts, bdd } from "./deps.ts";
import { match } from "../match.ts";

bdd.describe("hex/lib/fp/match", () => {
  bdd.it("basic", () => {
    const str1 = "apple";

    const result = match(str1, [
      ["apple", () => "Apple is selected."],
      ["pear", () => "Pear is selected."],
      ["banana", () => "Banana is selected."],
    ]);

    asserts.assertEquals(
      result,
      "Apple is selected.",
    );
  });

  bdd.it("conditions", () => {
    const str1 = "appLe"; // intentionally mixed case
    const str2 = "pear";
    const str3 = "banana";

    const result = match(true, [
      // @ts-ignore - intentionally testing for falsey values
      [str1 === "apple", () => "Apple is selected."],
      [str2 === "pear", () => "Pear is selected."],
      [str3 === "banana", () => "Banana is selected."],
    ]);

    asserts.assertEquals(
      result,
      "Pear is selected.",
    );
  });
});
