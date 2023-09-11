import * as assert from "$cool/hex/stdx/assert.ts";
import * as bdd from "$cool/hex/stdx/testing/bdd.ts";
import { pipe } from "./pipe.ts";

bdd.describe("cool/fp/pipe", () => {
  bdd.it("basic", () => {
    const lower = (x: string) => x.toLowerCase();
    const chars = (x: string) => x.replace(/[^\w \\-]+/g, "");
    const spaces = (x: string) => x.split(" ");
    const dashes = (x: string[]) => x.join("-");

    const slug = pipe(lower, chars, spaces, dashes);

    const result = slug("Hello World!");

    assert.assertEquals(result, "hello-world");
  });
});
