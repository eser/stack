// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

import * as assert from "@std/assert";
import * as standardsRuntime from "@eser/standards/runtime";
import {
  BrowserTargetPresets,
  browserVersion,
  minifyCss,
  transformCssFile,
  transformCssModules,
  transformWithLightningCss,
} from "./lightning.ts";

// ============================================================================
// browserVersion tests
// ============================================================================

Deno.test("browserVersion encodes major version only", () => {
  const version = browserVersion(90);

  // 90 << 16 = 5898240
  assert.assertEquals(version, 90 << 16);
  assert.assertEquals(version, 5898240);
});

Deno.test("browserVersion encodes major.minor version", () => {
  const version = browserVersion(14, 1);

  // (14 << 16) | (1 << 8) = 917760
  assert.assertEquals(version, (14 << 16) | (1 << 8));
  assert.assertEquals(version, 917760);
});

Deno.test("browserVersion encodes major.minor.patch version", () => {
  const version = browserVersion(120, 1, 5);

  // (120 << 16) | (1 << 8) | 5
  assert.assertEquals(version, (120 << 16) | (1 << 8) | 5);
});

Deno.test("browserVersion with default minor and patch is 0", () => {
  const versionMajorOnly = browserVersion(100);
  const versionExplicit = browserVersion(100, 0, 0);

  assert.assertEquals(versionMajorOnly, versionExplicit);
});

// ============================================================================
// BrowserTargetPresets tests
// ============================================================================

Deno.test("BrowserTargetPresets.modern returns Chrome 90, Firefox 88, Safari 14", () => {
  const targets = BrowserTargetPresets.modern();

  assert.assertEquals(targets.chrome, browserVersion(90));
  assert.assertEquals(targets.firefox, browserVersion(88));
  assert.assertEquals(targets.safari, browserVersion(14));
});

Deno.test("BrowserTargetPresets.wide returns Chrome 80, Firefox 75, Safari 13", () => {
  const targets = BrowserTargetPresets.wide();

  assert.assertEquals(targets.chrome, browserVersion(80));
  assert.assertEquals(targets.firefox, browserVersion(75));
  assert.assertEquals(targets.safari, browserVersion(13));
});

Deno.test("BrowserTargetPresets.latest returns Chrome 120, Firefox 120, Safari 17", () => {
  const targets = BrowserTargetPresets.latest();

  assert.assertEquals(targets.chrome, browserVersion(120));
  assert.assertEquals(targets.firefox, browserVersion(120));
  assert.assertEquals(targets.safari, browserVersion(17));
});

// ============================================================================
// transformWithLightningCss tests
// ============================================================================

Deno.test("transformWithLightningCss transforms basic CSS", () => {
  const css = ".foo { color: red; }";

  const result = transformWithLightningCss(css);

  assert.assertExists(result.code);
  assert.assert(result.code.includes(".foo"));
  assert.assert(result.code.includes("color"));
});

Deno.test("transformWithLightningCss minifies when minify option is true", () => {
  const css = ".foo {\n  color: red;\n  background: blue;\n}";

  const minified = transformWithLightningCss(css, { minify: true });
  const unminified = transformWithLightningCss(css, { minify: false });

  assert.assert(minified.code.length < unminified.code.length);
  // Minified should not have newlines
  assert.assertEquals(minified.code.includes("\n"), false);
});

Deno.test("transformWithLightningCss handles CSS custom properties", () => {
  const css = ":root { --color: red; } .foo { color: var(--color); }";

  const result = transformWithLightningCss(css);

  assert.assert(result.code.includes("--color"));
  assert.assert(result.code.includes("var(--color)"));
});

Deno.test("transformWithLightningCss uses custom filename", () => {
  const css = ".test { display: block; }";

  // Should not throw with custom filename
  const result = transformWithLightningCss(css, { filename: "custom.css" });

  assert.assertExists(result.code);
});

Deno.test("transformWithLightningCss returns undefined map by default", () => {
  const css = ".foo { color: red; }";

  const result = transformWithLightningCss(css);

  // Source map is not requested, should be undefined
  assert.assertEquals(result.map, undefined);
});

Deno.test("transformWithLightningCss handles empty CSS", () => {
  const css = "";

  const result = transformWithLightningCss(css);

  assert.assertExists(result.code);
  // Empty CSS may produce a newline or empty string
  assert.assert(result.code.trim().length === 0);
});

Deno.test("transformWithLightningCss removes comments when minified", () => {
  const css = "/* This is a comment */ .foo { color: red; }";

  const result = transformWithLightningCss(css, { minify: true });

  assert.assertEquals(result.code.includes("This is a comment"), false);
});

Deno.test("transformWithLightningCss handles multiple selectors", () => {
  const css = ".a, .b, .c { color: blue; }";

  const result = transformWithLightningCss(css);

  assert.assert(result.code.includes(".a"));
  assert.assert(result.code.includes(".b"));
  assert.assert(result.code.includes(".c"));
});

// ============================================================================
// transformCssModules tests
// ============================================================================

Deno.test("transformCssModules enables CSS Modules and returns exports", () => {
  const css = ".button { background: blue; }";

  const result = transformCssModules(css, "button.module.css");

  assert.assertExists(result.exports);
  assert.assertExists(result.exports?.["button"]);
  assert.assertExists(result.exports?.["button"]?.name);
});

Deno.test("transformCssModules generates scoped class names", () => {
  const css = ".original { color: red; }";

  const result = transformCssModules(css, "test.module.css");

  // The scoped name should be different from original
  const scopedName = result.exports?.["original"]?.name;
  assert.assertExists(scopedName);
  // Scoped names typically include hash or unique suffix
  assert.assertNotEquals(scopedName, "original");
});

Deno.test("transformCssModules handles multiple classes", () => {
  const css =
    ".btn { padding: 10px; } .container { margin: 0; } .header { font-size: 24px; }";

  const result = transformCssModules(css, "multi.module.css");

  assert.assertExists(result.exports?.["btn"]);
  assert.assertExists(result.exports?.["container"]);
  assert.assertExists(result.exports?.["header"]);
});

Deno.test("transformCssModules preserves minify option", () => {
  const css = ".foo {\n  color: red;\n}";

  const minified = transformCssModules(css, "test.module.css", {
    minify: true,
  });
  const unminified = transformCssModules(css, "test.module.css", {
    minify: false,
  });

  assert.assert(minified.code.length <= unminified.code.length);
});

// ============================================================================
// minifyCss tests
// ============================================================================

Deno.test("minifyCss removes whitespace", () => {
  const css = ".foo {\n  color: red;\n  background: blue;\n}";

  const result = minifyCss(css);

  assert.assertEquals(result.includes("\n"), false);
  assert.assert(result.length < css.length);
});

Deno.test("minifyCss preserves functionality", () => {
  const css = ".test { display: flex; justify-content: center; }";

  const result = minifyCss(css);

  assert.assert(result.includes(".test"));
  assert.assert(result.includes("display"));
  assert.assert(result.includes("flex"));
});

Deno.test("minifyCss handles empty input", () => {
  const result = minifyCss("");

  assert.assertEquals(result, "");
});

Deno.test("minifyCss removes comments", () => {
  const css = "/* comment */ .foo { color: red; } /* another */";

  const result = minifyCss(css);

  assert.assertEquals(result.includes("comment"), false);
  assert.assertEquals(result.includes("another"), false);
});

Deno.test("minifyCss accepts browser targets", () => {
  const css = ".foo { color: red; }";

  const result = minifyCss(css, BrowserTargetPresets.modern());

  assert.assertExists(result);
  assert.assert(result.includes(".foo"));
});

// ============================================================================
// transformCssFile tests (integration - requires temp files)
// ============================================================================

const createTestContext = async () => {
  const tempDir = await standardsRuntime.runtime.fs.makeTempDir({
    prefix: "lightning-test-",
  });
  return {
    tempDir,
    cleanup: async () => {
      try {
        await standardsRuntime.runtime.fs.remove(tempDir, { recursive: true });
      } catch {
        // Ignore cleanup errors
      }
    },
  };
};

Deno.test("transformCssFile reads, transforms, and writes CSS file", async () => {
  const { tempDir, cleanup } = await createTestContext();

  try {
    const inputPath = standardsRuntime.runtime.path.join(tempDir, "input.css");
    const outputPath = standardsRuntime.runtime.path.join(
      tempDir,
      "output.css",
    );
    await standardsRuntime.runtime.fs.writeTextFile(
      inputPath,
      ".foo { color: red; }",
    );

    const result = await transformCssFile(inputPath, outputPath);

    assert.assertExists(result.code);
    const outputContent = await standardsRuntime.runtime.fs.readTextFile(
      outputPath,
    );
    assert.assertEquals(outputContent, result.code);
  } finally {
    await cleanup();
  }
});

Deno.test("transformCssFile overwrites input when no output specified", async () => {
  const { tempDir, cleanup } = await createTestContext();

  try {
    const inputPath = standardsRuntime.runtime.path.join(tempDir, "style.css");
    const originalContent = ".bar {\n  display: block;\n}";
    await standardsRuntime.runtime.fs.writeTextFile(inputPath, originalContent);

    await transformCssFile(inputPath, undefined, { minify: true });

    const updatedContent = await standardsRuntime.runtime.fs.readTextFile(
      inputPath,
    );
    // Content should be minified (no newlines)
    assert.assertEquals(updatedContent.includes("\n"), false);
  } finally {
    await cleanup();
  }
});

Deno.test("transformCssFile applies options", async () => {
  const { tempDir, cleanup } = await createTestContext();

  try {
    const inputPath = standardsRuntime.runtime.path.join(tempDir, "opts.css");
    const outputPath = standardsRuntime.runtime.path.join(
      tempDir,
      "opts-out.css",
    );
    await standardsRuntime.runtime.fs.writeTextFile(
      inputPath,
      ".test {\n  padding: 10px;\n}",
    );

    await transformCssFile(inputPath, outputPath, { minify: true });

    const output = await standardsRuntime.runtime.fs.readTextFile(outputPath);
    assert.assertEquals(output.includes("\n"), false);
  } finally {
    await cleanup();
  }
});

// ============================================================================
// Real-world pattern tests (from laroux codebase analysis)
// ============================================================================

Deno.test("transformWithLightningCss handles nested selectors with &", () => {
  const css = ".btn { color: blue; &:hover { color: red; } }";

  const result = transformWithLightningCss(css, { nesting: true });

  assert.assertExists(result.code);
  assert.assert(result.code.includes(".btn"));
  // After nesting is resolved, should have .btn:hover
  assert.assert(
    result.code.includes(".btn:hover") || result.code.includes("&:hover"),
  );
});

Deno.test("transformWithLightningCss handles deeply nested selectors", () => {
  const css = ".card { .header { .title { font-size: 1.5rem; } } }";

  const result = transformWithLightningCss(css, { nesting: true });

  assert.assertExists(result.code);
  assert.assert(result.code.includes("font-size"));
});

Deno.test("transformWithLightningCss handles mixed nesting patterns", () => {
  const css = `.btn {
    color: blue;
    &:hover { color: red; }
    &:active { transform: scale(0.95); }
    .icon { margin-right: 0.5rem; }
  }`;

  const result = transformWithLightningCss(css, { nesting: true });

  assert.assertExists(result.code);
  assert.assert(result.code.includes("color"));
  assert.assert(
    result.code.includes("transform") || result.code.includes("scale"),
  );
});

Deno.test("transformWithLightningCss preserves @keyframes", () => {
  const css = "@keyframes fade { from { opacity: 0; } to { opacity: 1; } }";

  const result = transformWithLightningCss(css, {});

  assert.assert(result.code.includes("@keyframes"));
  assert.assert(result.code.includes("fade"));
});

Deno.test("transformWithLightningCss handles complex keyframe percentages", () => {
  const css = `@keyframes pulse {
    0%, 100% { transform: scale(1); }
    50% { transform: scale(1.05); }
  }`;

  const result = transformWithLightningCss(css, {});

  assert.assertExists(result.code);
  assert.assert(result.code.includes("@keyframes"));
  assert.assert(result.code.includes("pulse"));
});

Deno.test("minifyCss preserves keyframe functionality", () => {
  const css =
    "@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }";

  const result = minifyCss(css);

  assert.assert(result.includes("@keyframes"));
  assert.assert(result.includes("rotate"));
});

Deno.test("transformWithLightningCss handles data attribute selectors", () => {
  const css = '.btn[data-variant="primary"] { color: blue; }';

  const result = transformWithLightningCss(css, {});

  assert.assert(result.code.includes('[data-variant="primary"]'));
});

Deno.test("transformWithLightningCss handles nested data attribute selectors", () => {
  const css = '.btn { &[data-size="lg"] { padding: 1rem; } }';

  const result = transformWithLightningCss(css, { nesting: true });

  assert.assertExists(result.code);
  assert.assert(result.code.includes('[data-size="lg"]'));
});

Deno.test("transformWithLightningCss handles OKLCH colors", () => {
  const css = ".box { background: oklch(0.55 0.24 264); }";

  const result = transformWithLightningCss(css, {});

  assert.assertExists(result.code);
  // OKLCH may be preserved or converted depending on targets
  assert.assert(result.code.includes("background"));
});

Deno.test("transformWithLightningCss handles OKLCH in custom properties", () => {
  const css =
    ":root { --primary: oklch(0.55 0.24 264); } .btn { color: var(--primary); }";

  const result = transformWithLightningCss(css, {});

  assert.assertExists(result.code);
  // Custom properties should be preserved
  assert.assert(result.code.includes("--primary"));
});

Deno.test("transformWithLightningCss preserves media queries", () => {
  const css = "@media (max-width: 768px) { .btn { padding: 0.5rem; } }";

  const result = transformWithLightningCss(css, {});

  assert.assert(result.code.includes("@media"));
  assert.assert(result.code.includes("768px"));
});

Deno.test("minifyCss preserves media query functionality", () => {
  const css =
    "@media (min-width: 1024px) { .container { max-width: 1200px; } }";

  const result = minifyCss(css);

  assert.assert(result.includes("@media"));
  assert.assert(result.includes("1024px"));
});
