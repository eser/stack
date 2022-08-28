import { asserts } from "./deps.ts";
import { deepMerge } from "../deep-merge.ts";

Deno.test("hex/fp/deep-merge:basic", () => {
  const obj1 = {
    a: {
      b: [1, 2, 3],
      c: {
        d: 4,
      },
    },
  };

  const obj2 = {
    a: {
      b: [55],
    },
    e: "hello",
  };

  const result = deepMerge(obj1, obj2);

  asserts.assertNotStrictEquals(result, obj1);
  asserts.assertNotStrictEquals(result, obj2);
  asserts.assertStrictEquals(result.constructor, Object);
  asserts.assertEquals(result, {
    a: {
      b: [55],
      c: {
        d: 4,
      },
    },
    e: "hello",
  });
});
