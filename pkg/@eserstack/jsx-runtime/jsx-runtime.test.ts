// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

import * as nodeTest from "node:test";
import * as assert from "@eserstack/test-kit/assert";
import * as jsxRuntime from "./mod.ts";

nodeTest.test("jsx is exported from React jsx-runtime", () => {
  assert.assertEquals(typeof jsxRuntime.jsx, "function");
});

nodeTest.test("jsxEscape() returns null for null and undefined", () => {
  assert.assertEquals(jsxRuntime.jsxEscape(null), null);
  assert.assertEquals(jsxRuntime.jsxEscape(undefined), null);
});

nodeTest.test("jsxEscape() returns null for boolean values", () => {
  assert.assertEquals(jsxRuntime.jsxEscape(true), null);
  assert.assertEquals(jsxRuntime.jsxEscape(false), null);
});

nodeTest.test("jsxEscape() returns null for functions", () => {
  const testFunction = () => "test";
  assert.assertEquals(jsxRuntime.jsxEscape(testFunction), null);
});

nodeTest.test("jsxEscape() returns object with undefined constructor", () => {
  const obj = Object.create(null);
  obj.test = "value";

  const result = jsxRuntime.jsxEscape(obj);
  assert.assertEquals(result, obj);
});

nodeTest.test("jsxEscape() processes arrays recursively", () => {
  const input = ["hello", 42, null, true, "world"];
  const result = jsxRuntime.jsxEscape(input);

  assert.assertInstanceOf(result, Array);
  const resultArray = result as unknown[];

  assert.assertEquals(resultArray[0], "hello");
  assert.assertEquals(resultArray[1], "42");
  assert.assertEquals(resultArray[2], null);
  assert.assertEquals(resultArray[3], null);
  assert.assertEquals(resultArray[4], "world");
});

nodeTest.test("jsxEscape() escapes string values", () => {
  const result = jsxRuntime.jsxEscape('Hello <world> & "test"');
  assert.assertEquals(result, "Hello &lt;world&gt; &amp; &quot;test&quot;");
});

nodeTest.test("jsxEscape() converts numbers to escaped strings", () => {
  assert.assertEquals(jsxRuntime.jsxEscape(42), "42");
  assert.assertEquals(jsxRuntime.jsxEscape(3.14), "3.14");
  assert.assertEquals(jsxRuntime.jsxEscape(-1), "-1");
});

nodeTest.test("jsxEscape() converts symbols to escaped strings", () => {
  const sym = Symbol("test");
  const result = jsxRuntime.jsxEscape(sym);
  assert.assertEquals(typeof result, "string");
  assert.assert((result as string).includes("Symbol(test)"));
});

nodeTest.test("jsxEscape() handles nested arrays", () => {
  const input = ["hello", ["nested", 42], "world"];
  const result = jsxRuntime.jsxEscape(input) as unknown[];

  assert.assertInstanceOf(result, Array);
  assert.assertEquals(result[0], "hello");
  assert.assertInstanceOf(result[1], Array);
  assert.assertEquals((result[1] as unknown[])[0], "nested");
  assert.assertEquals((result[1] as unknown[])[1], "42");
  assert.assertEquals(result[2], "world");
});

nodeTest.test("jsxEscape() handles objects with constructors", () => {
  class TestClass {
    value = "test";
  }

  const instance = new TestClass();
  const result = jsxRuntime.jsxEscape(instance);

  // Should convert object to string and escape it
  assert.assertEquals(typeof result, "string");
  assert.assert((result as string).includes("object"));
});

nodeTest.test("jsxTemplate() creates template vnode with fragments", () => {
  const templates = ["<div>", "</div>"];
  const exprs = ["Hello World"];

  const result = jsxRuntime.jsxTemplate(templates, ...exprs);

  assert.assertEquals(typeof result, "object");
  assert.assertNotEquals(result, null);
});

nodeTest.test("jsxTemplate() handles multiple expressions", () => {
  const templates = ["<div>", " - ", "</div>"];
  const exprs = ["Hello", "World"];

  const result = jsxRuntime.jsxTemplate(templates, ...exprs);

  assert.assertEquals(typeof result, "object");
  assert.assertNotEquals(result, null);
});

nodeTest.test("jsxTemplate() works with empty expressions", () => {
  const templates = ["<div>static content</div>"];

  const result = jsxRuntime.jsxTemplate(templates);

  assert.assertEquals(typeof result, "object");
  assert.assertNotEquals(result, null);
});

nodeTest.test("jsxEscape() handles empty string", () => {
  assert.assertEquals(jsxRuntime.jsxEscape(""), "");
});

nodeTest.test("jsxEscape() handles whitespace strings", () => {
  assert.assertEquals(jsxRuntime.jsxEscape("   "), "   ");
  assert.assertEquals(jsxRuntime.jsxEscape("\n\t"), "\n\t");
});

nodeTest.test("jsxEscape() handles BigInt values", () => {
  const bigInt = BigInt(123456789);
  const result = jsxRuntime.jsxEscape(bigInt);
  assert.assertEquals(result, "123456789");
});

nodeTest.test("jsxEscape() modifies array in place", () => {
  const input = ["<script>", 42];
  const result = jsxRuntime.jsxEscape(input);

  // Should be the same array reference
  assert.assertEquals(result, input);
  // Content should be escaped
  assert.assertEquals(input[0], "&lt;script&gt;");
  assert.assertEquals(input[1], "42");
});
