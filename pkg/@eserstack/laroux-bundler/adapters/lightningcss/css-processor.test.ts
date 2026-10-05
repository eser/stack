// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

import * as assert from "@std/assert";
import { runtime } from "@eserstack/standards/cross-runtime";
import * as cssProcessor from "./css-processor.ts";
import * as types from "../../types.ts";
import type { CssPlugin } from "../../domain/css-plugin.ts";

async function withCssInput(
  fn: (input: string, output: string) => Promise<void>,
): Promise<void> {
  const dir = await runtime.fs.makeTempDir({ prefix: "laroux-css-" });

  try {
    const input = runtime.path.join(dir, "global.css");
    await runtime.fs.writeTextFile(input, ".title { color: red; }\n");

    await fn(input, runtime.path.join(dir, "dist", "styles.css"));
  } finally {
    await runtime.fs.remove(dir, { recursive: true });
  }
}

Deno.test("css-processor", async (t) => {
  await t.step("processCss writes the compiled CSS", async () => {
    await withCssInput(async (input, output) => {
      const plugin: CssPlugin = {
        name: "uppercase",
        compile: (css) => Promise.resolve(css.toUpperCase()),
      };

      await cssProcessor.processCss({
        input,
        output,
        projectRoot: runtime.path.dirname(input),
        plugin,
      });

      assert.assertEquals(
        await runtime.fs.readTextFile(output),
        ".TITLE { COLOR: RED; }\n",
      );
    });
  });

  await t.step(
    "processCss rethrows a compile failure as a BuildError with its cause",
    async () => {
      await withCssInput(async (input, output) => {
        const compileError = new Error("unknown utility class `text-brand`");
        const plugin: CssPlugin = {
          name: "failing",
          compile: () => Promise.reject(compileError),
        };

        const error = await assert.assertRejects(
          () =>
            cssProcessor.processCss({
              input,
              output,
              projectRoot: runtime.path.dirname(input),
              plugin,
            }),
          types.BuildError,
        );

        assert.assertEquals(error.code, "BUILD104");
        assert.assertStrictEquals(error.cause, compileError);
        assert.assertStringIncludes(error.message, input);
        assert.assertStringIncludes(error.message, "text-brand");
      });
    },
  );
});

const lightningCases = [
  {
    name:
      "lightningCssProcessor lowers nesting for the target browsers and minifies when asked",
    css: ".card { .title { color: red; } }\n",
    minify: true,
    expected: ".card .title{color:red}",
  },
  {
    name: "lightningCssProcessor keeps the layout when not minifying",
    css: ".card { .title { color: red; } }\n",
    minify: false,
    expected: ".card .title {\n  color: red;\n}\n",
  },
  {
    name:
      "lightningCssProcessor returns a stylesheet it cannot parse unchanged",
    css: "..card { color: red; }\n",
    minify: true,
    expected: "..card { color: red; }\n",
  },
];

for (const { name, css, minify, expected } of lightningCases) {
  Deno.test(name, async () => {
    const result = await cssProcessor.lightningCssProcessor.process(css, {
      filename: "global.css",
      minify,
    });

    assert.assertEquals(result, expected);
  });
}
