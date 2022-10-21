import { asserts, bdd } from "./deps.ts";
import { compose } from "../compose.ts";

bdd.describe("hex/fp/compose", () => {
  bdd.it("basic", () => {
    const lower = (x: string) => x.toLowerCase();
    const chars = (x: string) => x.replace(/[^\w \\-]+/g, "");
    const spaces = (x: string) => x.split(" ");
    const dashes = (x: string[]) => x.join("-");

    const slug = compose(dashes, spaces, chars, lower);

    const result = slug("Hello World!");

    asserts.assertEquals(result, "hello-world");
  });
});
