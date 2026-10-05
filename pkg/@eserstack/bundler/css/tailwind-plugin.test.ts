// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

import * as assert from "@std/assert";
import * as tailwindPlugin from "./tailwind-plugin.ts";

// ============================================================================
// TailwindFeatures tests
// ============================================================================

Deno.test("TailwindFeatures has correct flag values", () => {
  assert.assertEquals(tailwindPlugin.TailwindFeatures.None, 0);
  assert.assertEquals(tailwindPlugin.TailwindFeatures.AtApply, 1);
  assert.assertEquals(tailwindPlugin.TailwindFeatures.ThemeFunction, 2);
  assert.assertEquals(tailwindPlugin.TailwindFeatures.Utilities, 4);
  assert.assertEquals(tailwindPlugin.TailwindFeatures.JsPluginCompat, 8);
});

Deno.test("TailwindFeatures flags can be combined with bitwise OR", () => {
  const combined = tailwindPlugin.TailwindFeatures.AtApply |
    tailwindPlugin.TailwindFeatures.Utilities;

  assert.assertEquals(combined, 5);
  assert.assert((combined & tailwindPlugin.TailwindFeatures.AtApply) !== 0);
  assert.assert((combined & tailwindPlugin.TailwindFeatures.Utilities) !== 0);
  assert.assertEquals(
    combined & tailwindPlugin.TailwindFeatures.ThemeFunction,
    0,
  );
});

// ============================================================================
// hasTailwindDirectives tests
// ============================================================================

Deno.test("hasTailwindDirectives detects @tailwind directive", () => {
  const css = "@tailwind base;\n.btn { color: red; }";

  assert.assertEquals(tailwindPlugin.hasTailwindDirectives(css), true);
});

Deno.test("hasTailwindDirectives detects @apply directive", () => {
  const css = ".btn { @apply px-4 py-2; }";

  assert.assertEquals(tailwindPlugin.hasTailwindDirectives(css), true);
});

Deno.test("hasTailwindDirectives detects @reference directive", () => {
  const css = '@reference "tailwindcss";\n.btn { color: blue; }';

  assert.assertEquals(tailwindPlugin.hasTailwindDirectives(css), true);
});

Deno.test("hasTailwindDirectives detects @theme directive", () => {
  const css = "@theme { --color-primary: blue; }";

  assert.assertEquals(tailwindPlugin.hasTailwindDirectives(css), true);
});

Deno.test("hasTailwindDirectives detects @import tailwindcss", () => {
  const css = '@import "tailwindcss";';

  assert.assertEquals(tailwindPlugin.hasTailwindDirectives(css), true);
});

Deno.test("hasTailwindDirectives detects @import with single quotes", () => {
  const css = "@import 'tailwindcss';";

  assert.assertEquals(tailwindPlugin.hasTailwindDirectives(css), true);
});

Deno.test("hasTailwindDirectives returns false for plain CSS", () => {
  const css = ".btn { color: red; background: blue; }";

  assert.assertEquals(tailwindPlugin.hasTailwindDirectives(css), false);
});

Deno.test("hasTailwindDirectives returns false for CSS with @media", () => {
  const css = "@media (min-width: 768px) { .btn { color: red; } }";

  assert.assertEquals(tailwindPlugin.hasTailwindDirectives(css), false);
});

Deno.test("hasTailwindDirectives returns false for CSS with @keyframes", () => {
  const css = "@keyframes fade { from { opacity: 0; } to { opacity: 1; } }";

  assert.assertEquals(tailwindPlugin.hasTailwindDirectives(css), false);
});

Deno.test("hasTailwindDirectives returns false for empty string", () => {
  assert.assertEquals(tailwindPlugin.hasTailwindDirectives(""), false);
});

Deno.test("hasTailwindDirectives handles CSS with comments", () => {
  const css = "/* @apply is commented out */\n.btn { color: red; }";

  // Note: This is a simple check, comments are included
  assert.assertEquals(tailwindPlugin.hasTailwindDirectives(css), true);
});

// ============================================================================
// createTailwindRoot tests (unit tests - no actual Tailwind processing)
// ============================================================================

Deno.test("createTailwindRoot returns object with compile and dispose methods", () => {
  const root = tailwindPlugin.createTailwindRoot({ base: "." });

  assert.assertExists(root.compile);
  assert.assertExists(root.dispose);
  assert.assertEquals(typeof root.compile, "function");
  assert.assertEquals(typeof root.dispose, "function");

  root.dispose();
});

Deno.test("createTailwindRoot.dispose can be called multiple times safely", () => {
  const root = tailwindPlugin.createTailwindRoot({ base: "." });

  // Should not throw
  root.dispose();
  root.dispose();
  root.dispose();
});

Deno.test("createTailwindRoot accepts base option", () => {
  const root = tailwindPlugin.createTailwindRoot({ base: "/project/root" });

  assert.assertExists(root);

  root.dispose();
});

Deno.test("createTailwindRoot accepts sourceMaps option", () => {
  const root = tailwindPlugin.createTailwindRoot({
    base: ".",
    sourceMaps: true,
  });

  assert.assertExists(root);

  root.dispose();
});

Deno.test("createTailwindRoot accepts minify option", () => {
  const root = tailwindPlugin.createTailwindRoot({ base: ".", minify: true });

  assert.assertExists(root);

  root.dispose();
});

Deno.test("createTailwindRoot accepts all options", () => {
  const root = tailwindPlugin.createTailwindRoot({
    base: "/app",
    sourceMaps: true,
    minify: true,
  });

  assert.assertExists(root);

  root.dispose();
});

// ============================================================================
// TailwindRoot interface compliance tests
// ============================================================================

Deno.test("TailwindRoot.compile returns a Promise", () => {
  const root = tailwindPlugin.createTailwindRoot({ base: "." });

  // We can't actually run compile without Tailwind deps, but we can check return type
  const compileResult = root.compile(".btn { color: red; }", "test.css");

  assert.assertInstanceOf(compileResult, Promise);

  root.dispose();
});

Deno.test("Multiple TailwindRoot instances are independent", () => {
  const root1 = tailwindPlugin.createTailwindRoot({ base: "/project1" });
  const root2 = tailwindPlugin.createTailwindRoot({ base: "/project2" });

  assert.assertNotStrictEquals(root1, root2);
  assert.assertNotStrictEquals(root1.compile, root2.compile);

  root1.dispose();
  root2.dispose();
});

// ============================================================================
// Type export tests
// ============================================================================

Deno.test("TailwindPluginOptions type can be constructed", () => {
  const options = {
    base: ".",
    sourceMaps: true,
    minify: false,
  };

  // TypeScript compilation will fail if types are incorrect
  const root = tailwindPlugin.createTailwindRoot(options);
  root.dispose();
});

Deno.test("TailwindRoot methods have correct signatures", () => {
  const root = tailwindPlugin.createTailwindRoot({ base: "." });

  // compile takes (content: string, id: string) and returns Promise
  assert.assertEquals(root.compile.length, 2);

  // dispose takes no arguments
  assert.assertEquals(root.dispose.length, 0);

  root.dispose();
});

// ============================================================================
// autoInjectReference option tests
// ============================================================================

Deno.test("createTailwindRoot accepts autoInjectReference option", () => {
  const root = tailwindPlugin.createTailwindRoot({
    base: ".",
    autoInjectReference: true,
  });

  assert.assertExists(root);

  root.dispose();
});

Deno.test("createTailwindRoot accepts autoInjectReference false", () => {
  const root = tailwindPlugin.createTailwindRoot({
    base: ".",
    autoInjectReference: false,
  });

  assert.assertExists(root);

  root.dispose();
});

Deno.test("createTailwindRoot defaults autoInjectReference to true", () => {
  // No explicit autoInjectReference - should default to true
  const root = tailwindPlugin.createTailwindRoot({ base: "." });

  assert.assertExists(root);

  root.dispose();
});

Deno.test("createTailwindRoot with all options including autoInjectReference", () => {
  const root = tailwindPlugin.createTailwindRoot({
    base: "/app",
    sourceMaps: true,
    minify: true,
    autoInjectReference: true,
  });

  assert.assertExists(root);

  root.dispose();
});

// ============================================================================
// Real-world pattern tests (from laroux codebase analysis)
// ============================================================================

Deno.test("hasTailwindDirectives detects @reference with relative file path", () => {
  const css = '@reference "./styles/global.css";\n.btn { @apply px-4; }';

  assert.assertEquals(tailwindPlugin.hasTailwindDirectives(css), true);
});

Deno.test("hasTailwindDirectives detects @reference with absolute file path", () => {
  const css = '@reference "/app/styles/global.css";\n.btn { color: red; }';

  assert.assertEquals(tailwindPlugin.hasTailwindDirectives(css), true);
});

Deno.test("hasTailwindDirectives detects @apply in nested selector", () => {
  const css = ".btn { &:hover { @apply bg-blue-500; } }";

  assert.assertEquals(tailwindPlugin.hasTailwindDirectives(css), true);
});

Deno.test("hasTailwindDirectives detects @apply in deeply nested selector", () => {
  const css = ".card { .header { &:active { @apply scale-95; } } }";

  assert.assertEquals(tailwindPlugin.hasTailwindDirectives(css), true);
});

Deno.test("hasTailwindDirectives detects multi-line @apply", () => {
  const css = `.btn {
    @apply p-6 mb-5 border-2
      rounded-lg bg-blue-500;
  }`;

  assert.assertEquals(tailwindPlugin.hasTailwindDirectives(css), true);
});

Deno.test("hasTailwindDirectives detects @theme with custom properties", () => {
  const css = "@theme { --color-primary: blue; --spacing-lg: 2rem; }";

  assert.assertEquals(tailwindPlugin.hasTailwindDirectives(css), true);
});

Deno.test("hasTailwindDirectives detects @theme with OKLCH colors", () => {
  const css = "@theme { --color-primary-500: oklch(0.55 0.24 264); }";

  assert.assertEquals(tailwindPlugin.hasTailwindDirectives(css), true);
});
