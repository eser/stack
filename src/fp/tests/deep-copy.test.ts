import { asserts } from "./deps.ts";
import deepCopy from "../deep-copy.ts";

class Dummy {
  prop: unknown;

  constructor(prop: unknown) {
      this.prop = prop;
  }
}

Deno.test("hex/fp/deep-copy:basic", () => {
  const obj1 = new Dummy({ value: 5 });

  const result = deepCopy(obj1);

  asserts.assertNotStrictEquals(result, obj1);
  asserts.assertEquals(result, obj1);
  asserts.assertEquals(result, new Dummy({ value: 5 }));
});
