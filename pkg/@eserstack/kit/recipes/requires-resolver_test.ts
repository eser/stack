// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

import * as assert from "@std/assert";
import {
  CyclicDependencyError,
  MissingDependencyError,
  resolveRequires,
} from "./requires-resolver.ts";
import type { Recipe } from "./registry-schema.ts";

// =============================================================================
// Test helpers
// =============================================================================

const makeRecipe = (
  name: string,
  requires?: string[],
): Recipe => ({
  name,
  description: `Recipe ${name}`,
  language: "typescript",
  scale: "utility",
  files: [{ source: `${name}.ts`, target: `lib/${name}.ts` }],
  requires,
});

// =============================================================================
// Happy path
// =============================================================================

Deno.test("resolveRequires — recipe with no deps returns [self]", () => {
  const recipes = [makeRecipe("a")];
  const result = resolveRequires("a", recipes);

  assert.assertEquals(result.length, 1);
  assert.assertEquals(result[0]!.name, "a");
});

Deno.test("resolveRequires — linear chain A→B→C", () => {
  const recipes = [
    makeRecipe("a", ["b"]),
    makeRecipe("b", ["c"]),
    makeRecipe("c"),
  ];

  const result = resolveRequires("a", recipes);
  const names = result.map((r) => r.name);

  assert.assertEquals(names, ["c", "b", "a"]);
});

Deno.test("resolveRequires — diamond A→B,C; B→D; C→D", () => {
  const recipes = [
    makeRecipe("a", ["b", "c"]),
    makeRecipe("b", ["d"]),
    makeRecipe("c", ["d"]),
    makeRecipe("d"),
  ];

  const result = resolveRequires("a", recipes);
  const names = result.map((r) => r.name);

  // D should appear exactly once
  assert.assertEquals(names.filter((n) => n === "d").length, 1);
  // D must come before B and C
  assert.assertEquals(names.indexOf("d") < names.indexOf("b"), true);
  assert.assertEquals(names.indexOf("d") < names.indexOf("c"), true);
  // A must come last
  assert.assertEquals(names[names.length - 1], "a");
  assert.assertEquals(names.length, 4);
});

Deno.test("resolveRequires — multiple independent deps", () => {
  const recipes = [
    makeRecipe("a", ["b", "c"]),
    makeRecipe("b"),
    makeRecipe("c"),
  ];

  const result = resolveRequires("a", recipes);
  const names = result.map((r) => r.name);

  assert.assertEquals(names.length, 3);
  assert.assertEquals(names[names.length - 1], "a");
  // b and c should both come before a
  assert.assertEquals(names.indexOf("b") < names.indexOf("a"), true);
  assert.assertEquals(names.indexOf("c") < names.indexOf("a"), true);
});

// =============================================================================
// Cycle detection
// =============================================================================

Deno.test("resolveRequires — detects simple cycle A→B→A", () => {
  const recipes = [
    makeRecipe("a", ["b"]),
    makeRecipe("b", ["a"]),
  ];

  assert.assertThrows(
    () => resolveRequires("a", recipes),
    CyclicDependencyError,
    "Circular dependency",
  );
});

Deno.test("resolveRequires — detects longer cycle A→B→C→A", () => {
  const recipes = [
    makeRecipe("a", ["b"]),
    makeRecipe("b", ["c"]),
    makeRecipe("c", ["a"]),
  ];

  assert.assertThrows(
    () => resolveRequires("a", recipes),
    CyclicDependencyError,
    "Circular dependency",
  );
});

Deno.test("resolveRequires — self-dependency A→A", () => {
  const recipes = [makeRecipe("a", ["a"])];

  assert.assertThrows(
    () => resolveRequires("a", recipes),
    CyclicDependencyError,
  );
});

// =============================================================================
// Missing dependency
// =============================================================================

Deno.test("resolveRequires — throws on missing dependency", () => {
  const recipes = [makeRecipe("a", ["nonexistent"])];

  assert.assertThrows(
    () => resolveRequires("a", recipes),
    MissingDependencyError,
    "nonexistent",
  );
});

Deno.test("resolveRequires — throws on unknown root recipe", () => {
  const recipes = [makeRecipe("a")];

  assert.assertThrows(
    () => resolveRequires("unknown", recipes),
    MissingDependencyError,
    "unknown",
  );
});

// =============================================================================
// Edge cases
// =============================================================================

Deno.test("resolveRequires — empty requires array treated as no deps", () => {
  const recipes = [makeRecipe("a", [])];
  const result = resolveRequires("a", recipes);

  assert.assertEquals(result.length, 1);
  assert.assertEquals(result[0]!.name, "a");
});

Deno.test("resolveRequires — deep chain (5 levels)", () => {
  const recipes = [
    makeRecipe("a", ["b"]),
    makeRecipe("b", ["c"]),
    makeRecipe("c", ["d"]),
    makeRecipe("d", ["e"]),
    makeRecipe("e"),
  ];

  const result = resolveRequires("a", recipes);
  const names = result.map((r) => r.name);

  assert.assertEquals(names, ["e", "d", "c", "b", "a"]);
});
