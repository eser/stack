// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

import * as assert from "@eserstack/test-kit/assert";
import { runtime } from "@eserstack/standards/cross-runtime";
import * as larouxConfig from "@eserstack/laroux/config";
import * as sharp from "sharp";
import * as imageOptimizer from "./image-optimizer.ts";

/** Write a 32x16 PNG to public/images under a temp directory. */
async function withImages(
  fn: (inputDir: string, outputDir: string) => Promise<void>,
): Promise<void> {
  const root = await runtime.fs.makeTempDir({ prefix: "laroux-images-" });

  try {
    const inputDir = runtime.path.join(root, "public", "images");
    await runtime.fs.ensureDir(inputDir);
    const png: Uint8Array = await sharp.default({
      create: {
        width: 32,
        height: 16,
        channels: 3,
        background: { r: 200, g: 40, b: 40 },
      },
    }).png().toBuffer();
    await runtime.fs.writeFile(runtime.path.join(inputDir, "logo.png"), png);

    await fn(inputDir, runtime.path.join(root, "dist", "client", "images"));
  } finally {
    await runtime.fs.remove(root, { recursive: true });
  }
}

Deno.test(
  "sharpImageOptimizer writes the configured variants and a blur placeholder",
  async () => {
    await withImages(async (inputDir, outputDir) => {
      const manifest = await imageOptimizer.sharpImageOptimizer.optimize({
        inputDir,
        outputDir,
        publicPath: "/images",
        config: {
          ...larouxConfig.DEFAULT_IMAGES,
          formats: ["webp"],
          widths: [16, 64],
          placeholder: "blur",
        },
      });

      const image = manifest?.images[runtime.path.join(inputDir, "logo.png")];
      assert.assertExists(image);
      assert.assertEquals(image.publicPath, "/images/logo");
      // 64 is wider than the 32 px source, so only the 16 px variant exists
      assert.assertEquals(
        image.variants.map((variant) => [variant.format, variant.width]),
        [["webp", 16]],
      );
      assert.assertEquals(
        await runtime.fs.exists(runtime.path.join(outputDir, "logo-16w.webp")),
        true,
      );
      assert.assertStringIncludes(image.blurDataUrl ?? "", "data:image/webp");
    });
  },
);
