import { asserts } from "./deps.ts";
import { associateArray } from "../associate-array.ts";

Deno.test("hex/fp/associate-array:basic", () => {
  const arr1 = [
    { id: 1, name: "foo" },
    { id: 2, name: "bar" },
    { id: 3, name: "baz" },
  ];
  const func1 = (value: { id: number }) => value.id;

  const result = associateArray(arr1, func1);

  asserts.assertNotStrictEquals(result, arr1);
  asserts.assertEquals(Object.keys(result).length, 3);
  asserts.assertEquals(result, {
    1: { id: 1, name: "foo" },
    2: { id: 2, name: "bar" },
    3: { id: 3, name: "baz" },
  });
});

Deno.test("hex/fp/associate-array:with-value-skipping", () => {
  const arr1 = [
    { id: 1, name: "foo", skip: false },
    { id: 2, name: "bar", skip: false },
    { id: 3, name: "baz", skip: true },
  ];
  const func1 = (value: { id: number; skip: boolean }) =>
    value.skip ? undefined : value.id;

  const result = associateArray(arr1, func1);

  asserts.assertNotStrictEquals(result, arr1);
  asserts.assertEquals(Object.keys(result).length, 2);
  asserts.assertEquals(result, {
    1: { id: 1, name: "foo", skip: false },
    2: { id: 2, name: "bar", skip: false },
  });
});
