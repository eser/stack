// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

import { assertEquals } from "@std/assert";
import { extractExports, hasDirective } from "./directive-analysis.ts";

Deno.test("hasDirective - finds use client with double quotes", () => {
  const content = `"use client";

export function Button() {}
`;
  assertEquals(hasDirective(content, "use client"), true);
});

Deno.test("hasDirective - finds use client with single quotes", () => {
  const content = `'use client';

export function Button() {}
`;
  assertEquals(hasDirective(content, "use client"), true);
});

Deno.test("hasDirective - finds use server", () => {
  const content = `"use server";

export async function submitForm() {}
`;
  assertEquals(hasDirective(content, "use server"), true);
});

Deno.test("hasDirective - ignores directive after code", () => {
  const content = `import React from "react";
"use client";

export function Button() {}
`;
  assertEquals(hasDirective(content, "use client"), false);
});

Deno.test("hasDirective - handles comments before directive", () => {
  const content = `// This is a client component
"use client";

export function Button() {}
`;
  assertEquals(hasDirective(content, "use client"), true);
});

Deno.test("hasDirective - returns false when directive not present", () => {
  const content = `export function Button() {}`;
  assertEquals(hasDirective(content, "use client"), false);
});

Deno.test("hasDirective - case insensitive", () => {
  const content = `"Use Client";

export function Button() {}
`;
  assertEquals(hasDirective(content, "use client"), true);
});

Deno.test("extractExports - finds named function exports", () => {
  const content = `export function Button() {}
export function Input() {}
`;
  const exports = extractExports(content);
  assertEquals(exports.includes("Button"), true);
  assertEquals(exports.includes("Input"), true);
});

Deno.test("extractExports - finds async function exports", () => {
  const content = `export async function fetchData() {}`;
  const exports = extractExports(content);
  assertEquals(exports.includes("fetchData"), true);
});

Deno.test("extractExports - finds const exports", () => {
  const content = `export const Button = () => {};
export const theme = { color: "blue" };
`;
  const exports = extractExports(content);
  assertEquals(exports.includes("Button"), true);
  assertEquals(exports.includes("theme"), true);
});

Deno.test("extractExports - finds class exports", () => {
  const content = `export class UserService {}`;
  const exports = extractExports(content);
  assertEquals(exports.includes("UserService"), true);
});

Deno.test("extractExports - finds default export", () => {
  const content = `export default function Button() {}`;
  const exports = extractExports(content);
  assertEquals(exports.includes("default"), true);
});

Deno.test("extractExports - finds named export block", () => {
  const content = `const a = 1;
const b = 2;
export { a, b };
`;
  const exports = extractExports(content);
  assertEquals(exports.includes("a"), true);
  assertEquals(exports.includes("b"), true);
});

Deno.test("extractExports - handles export with alias", () => {
  const content = `const internalName = 1;
export { internalName as publicName };
`;
  const exports = extractExports(content);
  assertEquals(exports.includes("publicName"), true);
});

Deno.test("extractExports - returns empty array for no exports", () => {
  const content = `const x = 1;`;
  const exports = extractExports(content);
  assertEquals(exports.length, 0);
});
