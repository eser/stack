import { asserts } from "./deps.ts";
import deepCopyWith from "../deep-copy-with.ts";

type PropType = { value: number };

class Dummy {
  prop: PropType;

  constructor(prop: PropType) {
    this.prop = prop;
  }
}

Deno.test("hex/fp/deep-copy-with:basic", () => {
  const obj1 = new Dummy({ value: 5 });

  const result = deepCopyWith(obj1, (x) => x.prop.value = 6);

  asserts.assertNotStrictEquals(result, obj1);
  asserts.assertStrictEquals(result.constructor, Dummy);
  asserts.assertEquals(result.prop, { value: 6 });
  asserts.assertEquals(result, new Dummy({ value: 6 }));
});
