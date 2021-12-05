import { asserts } from "./deps.ts";
import removeFirstMatchFromObject from "../remove-first-match-from-object.ts";

Deno.test("hex/fp/remove-first-match-from-object:basic", () => {
	const obj1 = { a: 1, f: 5, b: 2, c: 3, d: 4, e: 5 };
	const func1 = (x: number) => x === 5;

	const result = removeFirstMatchFromObject(obj1, func1);

	asserts.assertNotStrictEquals(result, obj1);
	asserts.assertEquals(Object.keys(result).length, 5);
	asserts.assertEquals(result, { a: 1, b: 2, c: 3, d: 4, e: 5 });
});
