import { asserts } from "./deps.ts";
import decorate from "../decorate.ts";

Deno.test("hex/fp/decorate:basic", () => {
  let generator = () => 5;

  generator = decorate(generator, (func: () => number) => func() * 2);
  generator = decorate(generator, (func: () => number) => func() + 1);

  const result = generator();

  asserts.assertEquals(result, 11);
});
