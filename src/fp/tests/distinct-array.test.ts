import { asserts } from "./deps.ts";
import distinctArray from "../distinct-array.ts";

Deno.test("hex/fp/distinct-array:basic", () => {
  const arr1 = [
    { id: 1, name: "foo", parent: 0 },
    { id: 2, name: "bar", parent: 1 },
    { id: 3, name: "baz", parent: 1 },
  ];
  const func1 = (item: { parent: number }) => item.parent;

  const result = distinctArray(arr1, func1);

  asserts.assertNotStrictEquals(result, arr1);
  asserts.assertEquals(Object.keys(result).length, 2);
  asserts.assertEquals(result, [
    { id: 1, name: "foo", parent: 0 },
    { id: 2, name: "bar", parent: 1 },
  ]);
});
