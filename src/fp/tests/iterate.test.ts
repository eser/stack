import { asserts } from "./deps.ts";
import compose from "../compose.ts";
import iterate from "../iterate.ts";

Deno.test("hex/fp/iterate:basic", async () => {
  const gen1 = function* gen() {
    yield 1;
    yield 2;
    yield 3;
  };

  let total = 0;

  const func1 = (x: number) => {
    total += x;
  };

  await iterate(gen1(), func1);

  asserts.assertEquals(total, 6);
});

Deno.test("hex/fp/iterate:async", async () => {
  const delay = (ms: number, value: number): Promise<number> =>
    new Promise((resolve, reject) => {
      setTimeout(
        () => resolve(value),
        ms,
      );
    });

  const gen1 = function* gen() {
    yield 1;
    yield 2;
    yield 3;
  };

  let total = 0;

  const func1 = async function func(x: number) {
    total += await delay(10, x);
  };

  await iterate(gen1(), func1);

  asserts.assertEquals(total, 6);
});

Deno.test("hex/fp/iterate:with compose", async () => {
  const gen1 = function* gen() {
    yield { value: 1 };
    yield { value: 2 };
    yield { value: 3 };
  };

  let total = 0;

  const getValue = (x: { value: number }) => Promise.resolve(x.value);
  const add5 = async (value: Promise<number>) => await value + 5;
  const sumWithTotal = async (value: Promise<number>) => {
    total += await value;
  };

  await iterate(
    gen1(),
    compose(
      getValue,
      add5,
      sumWithTotal,
    ),
  );

  asserts.assertEquals(total, 21);
});
