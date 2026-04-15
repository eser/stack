// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

import * as assert from "@std/assert";
import { jsx, jsxEscape, jsxTemplate } from "./mod.ts";

Deno.test("jsx is exported from React jsx-runtime", () => {
  assert.assertEquals(typeof jsx, "function");
});

Deno.test("jsxEscape() returns null for null and undefined", () => {
  assert.assertEquals(jsxEscape(null), null);
  assert.assertEquals(jsxEscape(undefined), null);
});

Deno.test("jsxEscape() returns null for boolean values", () => {
  assert.assertEquals(jsxEscape(true), null);
  assert.assertEquals(jsxEscape(false), null);
});

Deno.test("jsxEscape() returns null for functions", () => {
  const testFunction = () => "test";
  assert.assertEquals(jsxEscape(testFunction), null);
});

Deno.test("jsxEscape() returns object with undefined constructor", () => {
  const obj = Object.create(null);
  obj.test = "value";

  const result = jsxEscape(obj);
  assert.assertEquals(result, obj);
});

Deno.test("jsxEscape() processes arrays recursively", () => {
  const input = ["hello", 42, null, true, "world"];
  const result = jsxEscape(input);

  assert.assertInstanceOf(result, Array);
  const resultArray = result as unknown[];

  assert.assertEquals(resultArray[0], "hello");
  assert.assertEquals(resultArray[1], "42");
  assert.assertEquals(resultArray[2], null);
  assert.assertEquals(resultArray[3], null);
  assert.assertEquals(resultArray[4], "world");
});

Deno.test("jsxEscape() escapes string values", () => {
  const result = jsxEscape('Hello <world> & "test"');
  assert.assertEquals(result, "Hello &lt;world&gt; &amp; &quot;test&quot;");
});

Deno.test("jsxEscape() converts numbers to escaped strings", () => {
  assert.assertEquals(jsxEscape(42), "42");
  assert.assertEquals(jsxEscape(3.14), "3.14");
  assert.assertEquals(jsxEscape(-1), "-1");
});

Deno.test("jsxEscape() converts symbols to escaped strings", () => {
  const sym = Symbol("test");
  const result = jsxEscape(sym);
  assert.assertEquals(typeof result, "string");
  assert.assert((result as string).includes("Symbol(test)"));
});

Deno.test("jsxEscape() handles nested arrays", () => {
  const input = ["hello", ["nested", 42], "world"];
  const result = jsxEscape(input) as unknown[];

  assert.assertInstanceOf(result, Array);
  assert.assertEquals(result[0], "hello");
  assert.assertInstanceOf(result[1], Array);
  assert.assertEquals((result[1] as unknown[])[0], "nested");
  assert.assertEquals((result[1] as unknown[])[1], "42");
  assert.assertEquals(result[2], "world");
});

Deno.test("jsxEscape() handles objects with constructors", () => {
  class TestClass {
    value = "test";
  }

  const instance = new TestClass();
  const result = jsxEscape(instance);

  // Should convert object to string and escape it
  assert.assertEquals(typeof result, "string");
  assert.assert((result as string).includes("object"));
});

Deno.test("jsxTemplate() creates template vnode with fragments", () => {
  const templates = ["<div>", "</div>"];
  const exprs = ["Hello World"];

  const result = jsxTemplate(templates, ...exprs);

  assert.assertEquals(typeof result, "object");
  assert.assertNotEquals(result, null);
});

Deno.test("jsxTemplate() handles multiple expressions", () => {
  const templates = ["<div>", " - ", "</div>"];
  const exprs = ["Hello", "World"];

  const result = jsxTemplate(templates, ...exprs);

  assert.assertEquals(typeof result, "object");
  assert.assertNotEquals(result, null);
});

Deno.test("jsxTemplate() works with empty expressions", () => {
  const templates = ["<div>static content</div>"];

  const result = jsxTemplate(templates);

  assert.assertEquals(typeof result, "object");
  assert.assertNotEquals(result, null);
});

Deno.test("jsxEscape() handles empty string", () => {
  assert.assertEquals(jsxEscape(""), "");
});

Deno.test("jsxEscape() handles whitespace strings", () => {
  assert.assertEquals(jsxEscape("   "), "   ");
  assert.assertEquals(jsxEscape("\n\t"), "\n\t");
});

Deno.test("jsxEscape() handles BigInt values", () => {
  const bigInt = BigInt(123456789);
  const result = jsxEscape(bigInt);
  assert.assertEquals(result, "123456789");
});

Deno.test("jsxEscape() modifies array in place", () => {
  const input = ["<script>", 42];
  const result = jsxEscape(input);

  // Should be the same array reference
  assert.assertEquals(result, input);
  // Content should be escaped
  assert.assertEquals(input[0], "&lt;script&gt;");
  assert.assertEquals(input[1], "42");
});
