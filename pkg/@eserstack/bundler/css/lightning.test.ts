// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

import * as nodeTest from "node:test";
import * as assert from "@eserstack/test-kit/assert";
import { runtime } from "@eserstack/standards/cross-runtime";
import * as lightning from "./lightning.ts";

// ============================================================================
// browserVersion tests
// ============================================================================

nodeTest.test("browserVersion encodes major version only", () => {
  const version = lightning.browserVersion(90);

  // 90 << 16 = 5898240
  assert.assertEquals(version, 90 << 16);
  assert.assertEquals(version, 5898240);
});

nodeTest.test("browserVersion encodes major.minor version", () => {
  const version = lightning.browserVersion(14, 1);

  // (14 << 16) | (1 << 8) = 917760
  assert.assertEquals(version, (14 << 16) | (1 << 8));
  assert.assertEquals(version, 917760);
});

nodeTest.test("browserVersion encodes major.minor.patch version", () => {
  const version = lightning.browserVersion(120, 1, 5);

  // (120 << 16) | (1 << 8) | 5
  assert.assertEquals(version, (120 << 16) | (1 << 8) | 5);
});

nodeTest.test("browserVersion with default minor and patch is 0", () => {
  const versionMajorOnly = lightning.browserVersion(100);
  const versionExplicit = lightning.browserVersion(100, 0, 0);

  assert.assertEquals(versionMajorOnly, versionExplicit);
});

// ============================================================================
// BrowserTargetPresets tests
// ============================================================================

nodeTest.test(
  "BrowserTargetPresets.modern returns Chrome 90, Firefox 88, Safari 14",
  () => {
    const targets = lightning.BrowserTargetPresets.modern();

    assert.assertEquals(targets.chrome, lightning.browserVersion(90));
    assert.assertEquals(targets.firefox, lightning.browserVersion(88));
    assert.assertEquals(targets.safari, lightning.browserVersion(14));
  },
);

nodeTest.test(
  "BrowserTargetPresets.wide returns Chrome 80, Firefox 75, Safari 13",
  () => {
    const targets = lightning.BrowserTargetPresets.wide();

    assert.assertEquals(targets.chrome, lightning.browserVersion(80));
    assert.assertEquals(targets.firefox, lightning.browserVersion(75));
    assert.assertEquals(targets.safari, lightning.browserVersion(13));
  },
);

nodeTest.test(
  "BrowserTargetPresets.latest returns Chrome 120, Firefox 120, Safari 17",
  () => {
    const targets = lightning.BrowserTargetPresets.latest();

    assert.assertEquals(targets.chrome, lightning.browserVersion(120));
    assert.assertEquals(targets.firefox, lightning.browserVersion(120));
    assert.assertEquals(targets.safari, lightning.browserVersion(17));
  },
);

// ============================================================================
// transformWithLightningCss tests
// ============================================================================

nodeTest.test("transformWithLightningCss transforms basic CSS", () => {
  const css = ".foo { color: red; }";

  const result = lightning.transformWithLightningCss(css);

  assert.assertExists(result.code);
  assert.assert(result.code.includes(".foo"));
  assert.assert(result.code.includes("color"));
});

nodeTest.test(
  "transformWithLightningCss minifies when minify option is true",
  () => {
    const css = ".foo {\n  color: red;\n  background: blue;\n}";

    const minified = lightning.transformWithLightningCss(css, { minify: true });
    const unminified = lightning.transformWithLightningCss(css, {
      minify: false,
    });

    assert.assert(minified.code.length < unminified.code.length);
    // Minified should not have newlines
    assert.assertEquals(minified.code.includes("\n"), false);
  },
);

nodeTest.test("transformWithLightningCss handles CSS custom properties", () => {
  const css = ":root { --color: red; } .foo { color: var(--color); }";

  const result = lightning.transformWithLightningCss(css);

  assert.assert(result.code.includes("--color"));
  assert.assert(result.code.includes("var(--color)"));
});

nodeTest.test("transformWithLightningCss uses custom filename", () => {
  const css = ".test { display: block; }";

  // Should not throw with custom filename
  const result = lightning.transformWithLightningCss(css, {
    filename: "custom.css",
  });

  assert.assertExists(result.code);
});

nodeTest.test(
  "transformWithLightningCss returns undefined map by default",
  () => {
    const css = ".foo { color: red; }";

    const result = lightning.transformWithLightningCss(css);

    // Source map is not requested, should be undefined
    assert.assertEquals(result.map, undefined);
  },
);

nodeTest.test("transformWithLightningCss handles empty CSS", () => {
  const css = "";

  const result = lightning.transformWithLightningCss(css);

  assert.assertExists(result.code);
  // Empty CSS may produce a newline or empty string
  assert.assert(result.code.trim().length === 0);
});

nodeTest.test(
  "transformWithLightningCss removes comments when minified",
  () => {
    const css = "/* This is a comment */ .foo { color: red; }";

    const result = lightning.transformWithLightningCss(css, { minify: true });

    assert.assertEquals(result.code.includes("This is a comment"), false);
  },
);

nodeTest.test("transformWithLightningCss handles multiple selectors", () => {
  const css = ".a, .b, .c { color: blue; }";

  const result = lightning.transformWithLightningCss(css);

  assert.assert(result.code.includes(".a"));
  assert.assert(result.code.includes(".b"));
  assert.assert(result.code.includes(".c"));
});

// ============================================================================
// transformCssModules tests
// ============================================================================

nodeTest.test(
  "transformCssModules enables CSS Modules and returns exports",
  () => {
    const css = ".button { background: blue; }";

    const result = lightning.transformCssModules(css, "button.module.css");

    assert.assertExists(result.exports);
    assert.assertExists(result.exports?.["button"]);
    assert.assertExists(result.exports?.["button"]?.name);
  },
);

nodeTest.test("transformCssModules generates scoped class names", () => {
  const css = ".original { color: red; }";

  const result = lightning.transformCssModules(css, "test.module.css");

  // The scoped name should be different from original
  const scopedName = result.exports?.["original"]?.name;
  assert.assertExists(scopedName);
  // Scoped names typically include hash or unique suffix
  assert.assertNotEquals(scopedName, "original");
});

nodeTest.test("transformCssModules handles multiple classes", () => {
  const css =
    ".btn { padding: 10px; } .container { margin: 0; } .header { font-size: 24px; }";

  const result = lightning.transformCssModules(css, "multi.module.css");

  assert.assertExists(result.exports?.["btn"]);
  assert.assertExists(result.exports?.["container"]);
  assert.assertExists(result.exports?.["header"]);
});

nodeTest.test("transformCssModules preserves minify option", () => {
  const css = ".foo {\n  color: red;\n}";

  const minified = lightning.transformCssModules(css, "test.module.css", {
    minify: true,
  });
  const unminified = lightning.transformCssModules(css, "test.module.css", {
    minify: false,
  });

  assert.assert(minified.code.length <= unminified.code.length);
});

// ============================================================================
// minifyCss tests
// ============================================================================

nodeTest.test("minifyCss removes whitespace", () => {
  const css = ".foo {\n  color: red;\n  background: blue;\n}";

  const result = lightning.minifyCss(css);

  assert.assertEquals(result.includes("\n"), false);
  assert.assert(result.length < css.length);
});

nodeTest.test("minifyCss preserves functionality", () => {
  const css = ".test { display: flex; justify-content: center; }";

  const result = lightning.minifyCss(css);

  assert.assert(result.includes(".test"));
  assert.assert(result.includes("display"));
  assert.assert(result.includes("flex"));
});

nodeTest.test("minifyCss handles empty input", () => {
  const result = lightning.minifyCss("");

  assert.assertEquals(result, "");
});

nodeTest.test("minifyCss removes comments", () => {
  const css = "/* comment */ .foo { color: red; } /* another */";

  const result = lightning.minifyCss(css);

  assert.assertEquals(result.includes("comment"), false);
  assert.assertEquals(result.includes("another"), false);
});

nodeTest.test("minifyCss accepts browser targets", () => {
  const css = ".foo { color: red; }";

  const result = lightning.minifyCss(
    css,
    lightning.BrowserTargetPresets.modern(),
  );

  assert.assertExists(result);
  assert.assert(result.includes(".foo"));
});

// ============================================================================
// transformCssFile tests (integration - requires temp files)
// ============================================================================

const createTestContext = async () => {
  const tempDir = await runtime.fs.makeTempDir({
    prefix: "lightning-test-",
  });
  return {
    tempDir,
    cleanup: async () => {
      try {
        await runtime.fs.remove(tempDir, { recursive: true });
      } catch {
        // Ignore cleanup errors
      }
    },
  };
};

nodeTest.test(
  "transformCssFile reads, transforms, and writes CSS file",
  async () => {
    const { tempDir, cleanup } = await createTestContext();

    try {
      const inputPath = runtime.path.join(tempDir, "input.css");
      const outputPath = runtime.path.join(tempDir, "output.css");
      await runtime.fs.writeTextFile(inputPath, ".foo { color: red; }");

      const result = await lightning.transformCssFile(inputPath, outputPath);

      assert.assertExists(result.code);
      const outputContent = await runtime.fs.readTextFile(outputPath);
      assert.assertEquals(outputContent, result.code);
    } finally {
      await cleanup();
    }
  },
);

nodeTest.test(
  "transformCssFile overwrites input when no output specified",
  async () => {
    const { tempDir, cleanup } = await createTestContext();

    try {
      const inputPath = runtime.path.join(tempDir, "style.css");
      const originalContent = ".bar {\n  display: block;\n}";
      await runtime.fs.writeTextFile(inputPath, originalContent);

      await lightning.transformCssFile(inputPath, undefined, { minify: true });

      const updatedContent = await runtime.fs.readTextFile(inputPath);
      // Content should be minified (no newlines)
      assert.assertEquals(updatedContent.includes("\n"), false);
    } finally {
      await cleanup();
    }
  },
);

nodeTest.test("transformCssFile applies options", async () => {
  const { tempDir, cleanup } = await createTestContext();

  try {
    const inputPath = runtime.path.join(tempDir, "opts.css");
    const outputPath = runtime.path.join(tempDir, "opts-out.css");
    await runtime.fs.writeTextFile(inputPath, ".test {\n  padding: 10px;\n}");

    await lightning.transformCssFile(inputPath, outputPath, { minify: true });

    const output = await runtime.fs.readTextFile(outputPath);
    assert.assertEquals(output.includes("\n"), false);
  } finally {
    await cleanup();
  }
});

// ============================================================================
// Real-world pattern tests (from laroux codebase analysis)
// ============================================================================

nodeTest.test(
  "transformWithLightningCss handles nested selectors with &",
  () => {
    const css = ".btn { color: blue; &:hover { color: red; } }";

    const result = lightning.transformWithLightningCss(css, { nesting: true });

    assert.assertExists(result.code);
    assert.assert(result.code.includes(".btn"));
    // After nesting is resolved, should have .btn:hover
    assert.assert(
      result.code.includes(".btn:hover") || result.code.includes("&:hover"),
    );
  },
);

nodeTest.test(
  "transformWithLightningCss handles deeply nested selectors",
  () => {
    const css = ".card { .header { .title { font-size: 1.5rem; } } }";

    const result = lightning.transformWithLightningCss(css, { nesting: true });

    assert.assertExists(result.code);
    assert.assert(result.code.includes("font-size"));
  },
);

nodeTest.test(
  "transformWithLightningCss handles mixed nesting patterns",
  () => {
    const css = `.btn {
    color: blue;
    &:hover { color: red; }
    &:active { transform: scale(0.95); }
    .icon { margin-right: 0.5rem; }
  }`;

    const result = lightning.transformWithLightningCss(css, { nesting: true });

    assert.assertExists(result.code);
    assert.assert(result.code.includes("color"));
    assert.assert(
      result.code.includes("transform") || result.code.includes("scale"),
    );
  },
);

nodeTest.test("transformWithLightningCss preserves @keyframes", () => {
  const css = "@keyframes fade { from { opacity: 0; } to { opacity: 1; } }";

  const result = lightning.transformWithLightningCss(css, {});

  assert.assert(result.code.includes("@keyframes"));
  assert.assert(result.code.includes("fade"));
});

nodeTest.test(
  "transformWithLightningCss handles complex keyframe percentages",
  () => {
    const css = `@keyframes pulse {
    0%, 100% { transform: scale(1); }
    50% { transform: scale(1.05); }
  }`;

    const result = lightning.transformWithLightningCss(css, {});

    assert.assertExists(result.code);
    assert.assert(result.code.includes("@keyframes"));
    assert.assert(result.code.includes("pulse"));
  },
);

nodeTest.test("minifyCss preserves keyframe functionality", () => {
  const css =
    "@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }";

  const result = lightning.minifyCss(css);

  assert.assert(result.includes("@keyframes"));
  assert.assert(result.includes("rotate"));
});

nodeTest.test(
  "transformWithLightningCss handles data attribute selectors",
  () => {
    const css = '.btn[data-variant="primary"] { color: blue; }';

    const result = lightning.transformWithLightningCss(css, {});

    assert.assert(result.code.includes('[data-variant="primary"]'));
  },
);

nodeTest.test(
  "transformWithLightningCss handles nested data attribute selectors",
  () => {
    const css = '.btn { &[data-size="lg"] { padding: 1rem; } }';

    const result = lightning.transformWithLightningCss(css, { nesting: true });

    assert.assertExists(result.code);
    assert.assert(result.code.includes('[data-size="lg"]'));
  },
);

nodeTest.test("transformWithLightningCss handles OKLCH colors", () => {
  const css = ".box { background: oklch(0.55 0.24 264); }";

  const result = lightning.transformWithLightningCss(css, {});

  assert.assertExists(result.code);
  // OKLCH may be preserved or converted depending on targets
  assert.assert(result.code.includes("background"));
});

nodeTest.test(
  "transformWithLightningCss handles OKLCH in custom properties",
  () => {
    const css =
      ":root { --primary: oklch(0.55 0.24 264); } .btn { color: var(--primary); }";

    const result = lightning.transformWithLightningCss(css, {});

    assert.assertExists(result.code);
    // Custom properties should be preserved
    assert.assert(result.code.includes("--primary"));
  },
);

nodeTest.test("transformWithLightningCss preserves media queries", () => {
  const css = "@media (max-width: 768px) { .btn { padding: 0.5rem; } }";

  const result = lightning.transformWithLightningCss(css, {});

  assert.assert(result.code.includes("@media"));
  assert.assert(result.code.includes("768px"));
});

nodeTest.test("minifyCss preserves media query functionality", () => {
  const css =
    "@media (min-width: 1024px) { .container { max-width: 1200px; } }";

  const result = lightning.minifyCss(css);

  assert.assert(result.includes("@media"));
  assert.assert(result.includes("1024px"));
});
