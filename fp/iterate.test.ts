// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

import { assert, bdd } from "./deps-dev.ts";
import { pipe } from "./pipe.ts";
import { iterate } from "./iterate.ts";

bdd.describe("cool/fp/iterate", () => {
  bdd.it("basic", async () => {
    const gen1 = function* () {
      yield 1;
      yield 2;
      yield 3;
    };

    let total = 0;

    const func1 = (x: number) => {
      total += x;
    };

    await iterate(gen1(), func1);

    assert.assertEquals(total, 6);
  });

  bdd.it("async", async () => {
    const delay = (ms: number, value: number): Promise<number> =>
      new Promise((resolve, _reject) => {
        setTimeout(
          () => resolve(value),
          ms,
        );
      });

    const gen1 = function* () {
      yield 1;
      yield 2;
      yield 3;
    };

    let total = 0;

    const func1 = async (x: number) => {
      total += await delay(10, x);
    };

    await iterate(gen1(), func1);

    assert.assertEquals(total, 6);
  });

  bdd.it("pipe", async () => {
    const gen1 = function* () {
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
      pipe(
        getValue,
        add5,
        sumWithTotal,
      ),
    );

    assert.assertEquals(total, 21);
  });
});
