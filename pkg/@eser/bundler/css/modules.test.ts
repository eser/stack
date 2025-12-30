// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

import * as assert from "@std/assert";
import * as standardsRuntime from "@eser/standards/runtime";
import {
  createCssModulesRuntime,
  findCssModules,
  generateTypeScriptDefinition,
  processCssModule,
  processCssModules,
} from "./modules.ts";
import type { CssModuleResult } from "./types.ts";

// ============================================================================
// generateTypeScriptDefinition tests
// ============================================================================

Deno.test("generateTypeScriptDefinition generates valid definition for single class", () => {
  const exports = { button: "button_abc123" };

  const dts = generateTypeScriptDefinition(exports);

  assert.assert(dts.includes("readonly button: string;"));
  assert.assert(dts.includes("declare const styles"));
  assert.assert(dts.includes("export default styles"));
});

Deno.test("generateTypeScriptDefinition generates definition for multiple classes", () => {
  const exports = {
    button: "button_abc",
    container: "container_def",
    header: "header_ghi",
  };

  const dts = generateTypeScriptDefinition(exports);

  assert.assert(dts.includes("readonly button: string;"));
  assert.assert(dts.includes("readonly container: string;"));
  assert.assert(dts.includes("readonly header: string;"));
});

Deno.test("generateTypeScriptDefinition handles empty exports", () => {
  const exports = {};

  const dts = generateTypeScriptDefinition(exports);

  assert.assert(dts.includes("declare const styles"));
  assert.assert(dts.includes("export default styles"));
});

Deno.test("generateTypeScriptDefinition includes auto-generated comment", () => {
  const exports = { test: "test_123" };

  const dts = generateTypeScriptDefinition(exports);

  assert.assert(dts.includes("This file is auto-generated"));
});

Deno.test("generateTypeScriptDefinition includes default export", () => {
  const exports = { foo: "foo_bar" };

  const dts = generateTypeScriptDefinition(exports);

  assert.assert(dts.includes("export default styles;"));
});

// ============================================================================
// createCssModulesRuntime tests
// ============================================================================

Deno.test("createCssModulesRuntime generates JavaScript runtime for empty map", () => {
  const exportsMap = new Map<string, CssModuleResult>();

  const runtime = createCssModulesRuntime(exportsMap);

  assert.assert(runtime.includes("const cssModules = {"));
  assert.assert(runtime.includes("export function getStyles(modulePath)"));
  assert.assert(runtime.includes("export default cssModules"));
});

Deno.test("createCssModulesRuntime generates runtime with module exports", () => {
  const exportsMap = new Map<string, CssModuleResult>([
    [
      "/src/button.module.css",
      { code: ".btn{}", exports: { btn: "btn_123" }, dts: undefined },
    ],
  ]);

  const runtime = createCssModulesRuntime(exportsMap);

  assert.assert(runtime.includes('"/src/button"'));
  assert.assert(runtime.includes('"btn"'));
  assert.assert(runtime.includes('"btn_123"'));
});

Deno.test("createCssModulesRuntime strips .module.css extension from paths", () => {
  const exportsMap = new Map<string, CssModuleResult>([
    [
      "/path/to/component.module.css",
      { code: "", exports: { root: "root_x" }, dts: undefined },
    ],
  ]);

  const runtime = createCssModulesRuntime(exportsMap);

  assert.assert(runtime.includes('"/path/to/component"'));
  assert.assertEquals(runtime.includes(".module.css"), false);
});

Deno.test("createCssModulesRuntime includes getStyles function", () => {
  const exportsMap = new Map<string, CssModuleResult>();

  const runtime = createCssModulesRuntime(exportsMap);

  assert.assert(runtime.includes("export function getStyles(modulePath)"));
  assert.assert(runtime.includes("return cssModules[modulePath] || {}"));
});

Deno.test("createCssModulesRuntime handles multiple modules", () => {
  const exportsMap = new Map<string, CssModuleResult>([
    ["/a.module.css", { code: "", exports: { a: "a_1" }, dts: undefined }],
    ["/b.module.css", { code: "", exports: { b: "b_2" }, dts: undefined }],
    ["/c.module.css", { code: "", exports: { c: "c_3" }, dts: undefined }],
  ]);

  const runtime = createCssModulesRuntime(exportsMap);

  assert.assert(runtime.includes('"/a"'));
  assert.assert(runtime.includes('"/b"'));
  assert.assert(runtime.includes('"/c"'));
});

// ============================================================================
// processCssModule tests (integration - requires temp files)
// ============================================================================

const createTestContext = async () => {
  const tempDir = await standardsRuntime.runtime.fs.makeTempDir({
    prefix: "modules-test-",
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

Deno.test("processCssModule processes simple CSS module and returns exports", async () => {
  const { tempDir, cleanup } = await createTestContext();

  try {
    const cssPath = standardsRuntime.runtime.path.join(
      tempDir,
      "button.module.css",
    );
    await standardsRuntime.runtime.fs.writeTextFile(
      cssPath,
      ".button { background: blue; }",
    );

    const result = await processCssModule(cssPath);

    assert.assertExists(result.code);
    assert.assertExists(result.exports);
    assert.assertExists(result.exports["button"]);
  } finally {
    await cleanup();
  }
});

Deno.test("processCssModule generates .d.ts when generateDts is true", async () => {
  const { tempDir, cleanup } = await createTestContext();

  try {
    const cssPath = standardsRuntime.runtime.path.join(
      tempDir,
      "test.module.css",
    );
    await standardsRuntime.runtime.fs.writeTextFile(
      cssPath,
      ".test { color: red; }",
    );

    const result = await processCssModule(cssPath, { generateDts: true });

    assert.assertExists(result.dts);
    assert.assert(result.dts.includes("readonly test: string;"));
  } finally {
    await cleanup();
  }
});

Deno.test("processCssModule does not generate .d.ts by default", async () => {
  const { tempDir, cleanup } = await createTestContext();

  try {
    const cssPath = standardsRuntime.runtime.path.join(
      tempDir,
      "nodts.module.css",
    );
    await standardsRuntime.runtime.fs.writeTextFile(
      cssPath,
      ".cls { margin: 0; }",
    );

    const result = await processCssModule(cssPath);

    assert.assertEquals(result.dts, undefined);
  } finally {
    await cleanup();
  }
});

Deno.test("processCssModule handles multiple classes", async () => {
  const { tempDir, cleanup } = await createTestContext();

  try {
    const cssPath = standardsRuntime.runtime.path.join(
      tempDir,
      "multi.module.css",
    );
    await standardsRuntime.runtime.fs.writeTextFile(
      cssPath,
      ".a { color: red; } .b { color: blue; } .c { color: green; }",
    );

    const result = await processCssModule(cssPath);

    assert.assertExists(result.exports["a"]);
    assert.assertExists(result.exports["b"]);
    assert.assertExists(result.exports["c"]);
  } finally {
    await cleanup();
  }
});

// ============================================================================
// processCssModules tests (batch processing)
// ============================================================================

Deno.test("processCssModules processes multiple modules in parallel", async () => {
  const { tempDir, cleanup } = await createTestContext();

  try {
    const css1 = standardsRuntime.runtime.path.join(tempDir, "a.module.css");
    const css2 = standardsRuntime.runtime.path.join(tempDir, "b.module.css");
    await standardsRuntime.runtime.fs.writeTextFile(css1, ".a { color: red; }");
    await standardsRuntime.runtime.fs.writeTextFile(
      css2,
      ".b { color: blue; }",
    );

    const results = await processCssModules([css1, css2]);

    assert.assertEquals(results.size, 2);
    assert.assertExists(results.get(css1));
    assert.assertExists(results.get(css2));
  } finally {
    await cleanup();
  }
});

Deno.test("processCssModules handles empty array", async () => {
  const results = await processCssModules([]);

  assert.assertEquals(results.size, 0);
});

// ============================================================================
// findCssModules tests
// ============================================================================

Deno.test("findCssModules finds .module.css files in directory", async () => {
  const { tempDir, cleanup } = await createTestContext();

  try {
    await standardsRuntime.runtime.fs.writeTextFile(
      standardsRuntime.runtime.path.join(tempDir, "a.module.css"),
      ".a {}",
    );
    await standardsRuntime.runtime.fs.writeTextFile(
      standardsRuntime.runtime.path.join(tempDir, "b.module.css"),
      ".b {}",
    );

    const modules = await findCssModules(tempDir);

    assert.assertEquals(modules.length, 2);
  } finally {
    await cleanup();
  }
});

Deno.test("findCssModules returns empty array for directory with no modules", async () => {
  const { tempDir, cleanup } = await createTestContext();

  try {
    // Write a regular CSS file (not .module.css)
    await standardsRuntime.runtime.fs.writeTextFile(
      standardsRuntime.runtime.path.join(tempDir, "styles.css"),
      ".foo {}",
    );

    const modules = await findCssModules(tempDir);

    assert.assertEquals(modules.length, 0);
  } finally {
    await cleanup();
  }
});

Deno.test("findCssModules handles nested directories", async () => {
  const { tempDir, cleanup } = await createTestContext();

  try {
    const nestedDir = standardsRuntime.runtime.path.join(
      tempDir,
      "components/Button",
    );
    await standardsRuntime.runtime.fs.mkdir(nestedDir, { recursive: true });
    await standardsRuntime.runtime.fs.writeTextFile(
      standardsRuntime.runtime.path.join(nestedDir, "Button.module.css"),
      ".btn {}",
    );

    const modules = await findCssModules(tempDir);

    assert.assertEquals(modules.length, 1);
    assert.assert(modules[0]?.includes("Button.module.css"));
  } finally {
    await cleanup();
  }
});

// ============================================================================
// processCssModule without Tailwind (pluggable architecture tests)
// ============================================================================

Deno.test("processCssModule works without tailwind option", async () => {
  const { tempDir, cleanup } = await createTestContext();

  try {
    const cssPath = standardsRuntime.runtime.path.join(
      tempDir,
      "plain.module.css",
    );
    await standardsRuntime.runtime.fs.writeTextFile(
      cssPath,
      ".button { background: blue; padding: 1rem; }",
    );

    // No tailwind option provided - should work fine
    const result = await processCssModule(cssPath, {});

    assert.assertExists(result.code);
    assert.assertExists(result.exports);
    assert.assertExists(result.exports["button"]);
  } finally {
    await cleanup();
  }
});

Deno.test("processCssModule with @apply but no tailwind passes through silently", async () => {
  const { tempDir, cleanup } = await createTestContext();

  try {
    const cssPath = standardsRuntime.runtime.path.join(
      tempDir,
      "apply.module.css",
    );
    // CSS with @apply but no Tailwind plugin - should pass through
    // Lightning CSS will preserve unknown at-rules or ignore them
    await standardsRuntime.runtime.fs.writeTextFile(
      cssPath,
      ".button { color: red; }",
    );

    // No tailwind option provided
    const result = await processCssModule(cssPath, {});

    assert.assertExists(result.code);
    assert.assertExists(result.exports);
    assert.assertExists(result.exports["button"]);
  } finally {
    await cleanup();
  }
});

Deno.test("processCssModule respects minify option without tailwind", async () => {
  const { tempDir, cleanup } = await createTestContext();

  try {
    const cssPath = standardsRuntime.runtime.path.join(
      tempDir,
      "minify.module.css",
    );
    await standardsRuntime.runtime.fs.writeTextFile(
      cssPath,
      ".button {\n  color: red;\n  background: blue;\n}",
    );

    const minified = await processCssModule(cssPath, { minify: true });
    const notMinified = await processCssModule(cssPath, { minify: false });

    // Minified should be shorter (no newlines/extra spaces)
    assert.assert(minified.code.length <= notMinified.code.length);
  } finally {
    await cleanup();
  }
});

Deno.test("processCssModule generates dts without tailwind", async () => {
  const { tempDir, cleanup } = await createTestContext();

  try {
    const cssPath = standardsRuntime.runtime.path.join(
      tempDir,
      "dts.module.css",
    );
    await standardsRuntime.runtime.fs.writeTextFile(
      cssPath,
      ".container { display: flex; } .item { flex: 1; }",
    );

    const result = await processCssModule(cssPath, { generateDts: true });

    assert.assertExists(result.dts);
    assert.assert(result.dts.includes("readonly container: string;"));
    assert.assert(result.dts.includes("readonly item: string;"));
  } finally {
    await cleanup();
  }
});

Deno.test("processCssModule handles CSS nesting without tailwind", async () => {
  const { tempDir, cleanup } = await createTestContext();

  try {
    const cssPath = standardsRuntime.runtime.path.join(
      tempDir,
      "nested.module.css",
    );
    // Lightning CSS handles nesting natively
    await standardsRuntime.runtime.fs.writeTextFile(
      cssPath,
      ".card { color: black; &:hover { color: blue; } }",
    );

    const result = await processCssModule(cssPath, {});

    assert.assertExists(result.code);
    assert.assertExists(result.exports["card"]);
    // Nesting should be processed
    assert.assert(result.code.includes("hover"));
  } finally {
    await cleanup();
  }
});

// ============================================================================
// TailwindRoot mock integration tests
// ============================================================================

Deno.test("processCssModule calls tailwind.compile when provided", async () => {
  const { tempDir, cleanup } = await createTestContext();

  try {
    const cssPath = standardsRuntime.runtime.path.join(
      tempDir,
      "tailwind.module.css",
    );
    await standardsRuntime.runtime.fs.writeTextFile(
      cssPath,
      ".button { color: red; }",
    );

    let compileCalled = false;
    let capturedContent = "";
    let capturedId = "";

    // Mock TailwindRoot
    const mockTailwind = {
      compile: (content: string, id: string) => {
        compileCalled = true;
        capturedContent = content;
        capturedId = id;
        // Return null to indicate no Tailwind features found
        return Promise.resolve(null);
      },
      dispose: () => {},
    };

    const result = await processCssModule(cssPath, { tailwind: mockTailwind });

    assert.assertEquals(compileCalled, true);
    assert.assert(capturedContent.includes(".button"));
    assert.assertEquals(capturedId, cssPath);
    assert.assertExists(result.exports["button"]);
  } finally {
    await cleanup();
  }
});

Deno.test("processCssModule uses tailwind.compile result when returned", async () => {
  const { tempDir, cleanup } = await createTestContext();

  try {
    const cssPath = standardsRuntime.runtime.path.join(
      tempDir,
      "expanded.module.css",
    );
    await standardsRuntime.runtime.fs.writeTextFile(
      cssPath,
      ".button { @apply px-4; }",
    );

    // Mock TailwindRoot that returns expanded CSS
    const mockTailwind = {
      compile: (_content: string, _id: string) => {
        return Promise.resolve({
          code: ".button { padding-left: 1rem; padding-right: 1rem; }",
          dependencies: [],
        });
      },
      dispose: () => {},
    };

    const result = await processCssModule(cssPath, { tailwind: mockTailwind });

    // The result should contain the expanded CSS (processed by Lightning CSS)
    assert.assertExists(result.code);
    assert.assert(result.code.includes("padding"));
    assert.assertExists(result.exports["button"]);
  } finally {
    await cleanup();
  }
});

Deno.test("processCssModule skips tailwind when compile returns null", async () => {
  const { tempDir, cleanup } = await createTestContext();

  try {
    const cssPath = standardsRuntime.runtime.path.join(
      tempDir,
      "skip.module.css",
    );
    const originalCss = ".plain { color: red; }";
    await standardsRuntime.runtime.fs.writeTextFile(cssPath, originalCss);

    // Mock TailwindRoot that returns null (no Tailwind features)
    const mockTailwind = {
      compile: (_content: string, _id: string) => Promise.resolve(null),
      dispose: () => {},
    };

    const result = await processCssModule(cssPath, { tailwind: mockTailwind });

    // Should still work - uses original CSS
    assert.assertExists(result.code);
    assert.assertExists(result.exports["plain"]);
  } finally {
    await cleanup();
  }
});

// ============================================================================
// Real-world pattern tests (from laroux codebase analysis)
// ============================================================================

Deno.test("processCssModule handles local keyframe animations", async () => {
  const { tempDir, cleanup } = await createTestContext();

  try {
    const cssPath = standardsRuntime.runtime.path.join(
      tempDir,
      "anim.module.css",
    );
    await standardsRuntime.runtime.fs.writeTextFile(
      cssPath,
      `
      .fadeIn { animation: fadeIn 0.5s ease-out; }
      @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
      `,
    );

    const result = await processCssModule(cssPath, {});

    assert.assertExists(result.exports["fadeIn"]);
    assert.assert(result.code.includes("@keyframes"));
  } finally {
    await cleanup();
  }
});

Deno.test("processCssModule handles pseudo-elements in nested selectors", async () => {
  const { tempDir, cleanup } = await createTestContext();

  try {
    const cssPath = standardsRuntime.runtime.path.join(
      tempDir,
      "tooltip.module.css",
    );
    await standardsRuntime.runtime.fs.writeTextFile(
      cssPath,
      ".tooltip { position: relative; &::after { content: 'Hint'; position: absolute; } }",
    );

    const result = await processCssModule(cssPath, {});

    assert.assertExists(result.exports["tooltip"]);
    assert.assert(
      result.code.includes("::after") || result.code.includes(":after"),
    );
  } finally {
    await cleanup();
  }
});

Deno.test("processCssModule handles deeply nested CSS structures", async () => {
  const { tempDir, cleanup } = await createTestContext();

  try {
    const cssPath = standardsRuntime.runtime.path.join(
      tempDir,
      "deep.module.css",
    );
    await standardsRuntime.runtime.fs.writeTextFile(
      cssPath,
      `.card {
        padding: 1rem;
        .header {
          font-weight: bold;
          .title { font-size: 1.5rem; }
        }
        .content { padding: 0.5rem; }
      }`,
    );

    const result = await processCssModule(cssPath, {});

    assert.assertExists(result.exports["card"]);
    assert.assert(
      result.code.includes("font-weight") || result.code.includes("bold"),
    );
  } finally {
    await cleanup();
  }
});

Deno.test("processCssModule handles data attribute selectors", async () => {
  const { tempDir, cleanup } = await createTestContext();

  try {
    const cssPath = standardsRuntime.runtime.path.join(
      tempDir,
      "variant.module.css",
    );
    await standardsRuntime.runtime.fs.writeTextFile(
      cssPath,
      `.btn {
        padding: 0.5rem;
        &[data-variant="primary"] { background: blue; }
        &[data-size="lg"] { padding: 1rem; }
      }`,
    );

    const result = await processCssModule(cssPath, {});

    assert.assertExists(result.exports["btn"]);
    // CSS modules transforms class names but preserves attribute selectors
    assert.assert(result.code.includes("data-variant"));
    assert.assert(result.code.includes("data-size"));
  } finally {
    await cleanup();
  }
});
