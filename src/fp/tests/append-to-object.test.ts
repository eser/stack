import { asserts } from "./deps.ts";
import appendToObject from "../append-to-object.ts";

Deno.test("hex/fp/append-to-object:basic", () => {
	const obj1 = { a: 1, b: 2 };
	const obj2 = { c: 3 };

	const result = appendToObject(obj1, obj2);

	asserts.assertNotStrictEquals(result, obj1);
	asserts.assertNotStrictEquals(result, obj2);
	asserts.assertEquals(Object.keys(result).length, 3);
	asserts.assertEquals(result, { a: 1, b: 2, c: 3 });
});
