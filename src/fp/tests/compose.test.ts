import { asserts } from "./deps.ts";
import compose from "../compose.ts";

Deno.test("hex/fp/compose:basic", () => {
  const lower = (x: string) => x.toLowerCase();
  const chars = (x: string) => x.replace(/[^\w \\-]+/g, "");
  const spaces = (x: string) => x.split(" ");
  const dashes = (x: string[]) => x.join("-");

  const slug = compose(lower, chars, spaces, dashes);

  const result = slug("Hello World!");

  asserts.assertEquals(result, "hello-world");
});
