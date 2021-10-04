import { asserts } from "./deps.ts";
import decorate from "../decorate.ts";

Deno.test("hex/fp/decorate:basic", () => {
  let generator = () => 5;

  generator = decorate(generator, (x) => x() * 2);
  generator = decorate(generator, (x) => x() + 1);

  const result = generator();

  asserts.assertEquals(result, 11);
});

Deno.test("hex/fp/decorate:with parameters", () => {
  let generator = (a: number) => a + 5;

  generator = decorate(generator, (x, a) => x(a) * 2);
  generator = decorate(generator, (x, a) => x(a) + 1);

  const result = generator(3);

  asserts.assertEquals(result, 17);
});
