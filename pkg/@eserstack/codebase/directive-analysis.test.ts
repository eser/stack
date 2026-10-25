// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

import * as nodeTest from "node:test";
import * as assert from "@eserstack/test-kit/assert";
import * as directiveAnalysis from "./directive-analysis.ts";

nodeTest.test("hasDirective - finds use client with double quotes", () => {
  const content = `"use client";

export function Button() {}
`;
  assert.assertEquals(
    directiveAnalysis.hasDirective(content, "use client"),
    true,
  );
});

nodeTest.test("hasDirective - finds use client with single quotes", () => {
  const content = `'use client';

export function Button() {}
`;
  assert.assertEquals(
    directiveAnalysis.hasDirective(content, "use client"),
    true,
  );
});

nodeTest.test("hasDirective - finds use server", () => {
  const content = `"use server";

export async function submitForm() {}
`;
  assert.assertEquals(
    directiveAnalysis.hasDirective(content, "use server"),
    true,
  );
});

nodeTest.test("hasDirective - ignores directive after code", () => {
  const content = `import React from "react";
"use client";

export function Button() {}
`;
  assert.assertEquals(
    directiveAnalysis.hasDirective(content, "use client"),
    false,
  );
});

nodeTest.test("hasDirective - handles comments before directive", () => {
  const content = `// This is a client component
"use client";

export function Button() {}
`;
  assert.assertEquals(
    directiveAnalysis.hasDirective(content, "use client"),
    true,
  );
});

nodeTest.test("hasDirective - returns false when directive not present", () => {
  const content = `export function Button() {}`;
  assert.assertEquals(
    directiveAnalysis.hasDirective(content, "use client"),
    false,
  );
});

nodeTest.test("hasDirective - case insensitive", () => {
  const content = `"Use Client";

export function Button() {}
`;
  assert.assertEquals(
    directiveAnalysis.hasDirective(content, "use client"),
    true,
  );
});

nodeTest.test("hasDirective - handles multi-line JSDoc comments", () => {
  const content = `/**
 * Server Actions
 * These functions run on the server and can be called from client components.
 *
 * The bundler automatically:
 * 1. Marks these functions with React's server reference symbols
 * 2. Generates client stubs that call the server via RSC protocol
 * 3. Action IDs are generated as: path/to/file#exportName
 *
 * Usage in client components:
 * import { addComment } from "./actions";
 * import { useActionState } from "react";
 *
 * function Comments() {
 *   const [state, formAction, isPending] = useActionState(addComment, null);
 *   return <form action={formAction}>...</form>;
 * }
 */

"use server";

import * as logging from "@eserstack/logging";

export async function addComment() {}
`;
  assert.assertEquals(
    directiveAnalysis.hasDirective(content, "use server"),
    true,
  );
});

nodeTest.test("extractExports - finds named function exports", () => {
  const content = `export function Button() {}
export function Input() {}
`;
  const exports = directiveAnalysis.extractExports(content);
  assert.assertEquals(exports.includes("Button"), true);
  assert.assertEquals(exports.includes("Input"), true);
});

nodeTest.test("extractExports - finds async function exports", () => {
  const content = `export async function fetchData() {}`;
  const exports = directiveAnalysis.extractExports(content);
  assert.assertEquals(exports.includes("fetchData"), true);
});

nodeTest.test("extractExports - finds const exports", () => {
  const content = `export const Button = () => {};
export const theme = { color: "blue" };
`;
  const exports = directiveAnalysis.extractExports(content);
  assert.assertEquals(exports.includes("Button"), true);
  assert.assertEquals(exports.includes("theme"), true);
});

nodeTest.test("extractExports - finds class exports", () => {
  const content = `export class UserService {}`;
  const exports = directiveAnalysis.extractExports(content);
  assert.assertEquals(exports.includes("UserService"), true);
});

nodeTest.test("extractExports - finds default export", () => {
  const content = `export default function Button() {}`;
  const exports = directiveAnalysis.extractExports(content);
  assert.assertEquals(exports.includes("default"), true);
});

nodeTest.test("extractExports - finds named export block", () => {
  const content = `const a = 1;
const b = 2;
export { a, b };
`;
  const exports = directiveAnalysis.extractExports(content);
  assert.assertEquals(exports.includes("a"), true);
  assert.assertEquals(exports.includes("b"), true);
});

nodeTest.test("extractExports - handles export with alias", () => {
  const content = `const internalName = 1;
export { internalName as publicName };
`;
  const exports = directiveAnalysis.extractExports(content);
  assert.assertEquals(exports.includes("publicName"), true);
});

nodeTest.test("extractExports - returns empty array for no exports", () => {
  const content = `const x = 1;`;
  const exports = directiveAnalysis.extractExports(content);
  assert.assertEquals(exports.length, 0);
});
