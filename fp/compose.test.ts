import { assert, bdd } from "../deps.ts";
import { compose } from "./compose.ts";

bdd.describe("cool/fp/compose", () => {
  bdd.it("basic", () => {
    const lower = (x: string) => x.toLowerCase();
    const chars = (x: string) => x.replace(/[^\w \\-]+/g, "");
    const spaces = (x: string) => x.split(" ");
    const dashes = (x: Array<string>) => x.join("-");

    const slug = compose(dashes, spaces, chars, lower);

    const result = slug("Hello World!");

    assert.assertEquals(result, "hello-world");
  });
});
