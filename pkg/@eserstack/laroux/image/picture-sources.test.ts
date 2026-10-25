// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

import * as assert from "@eserstack/test-kit/assert";
import * as imageConfig from "./image-config.ts";
import * as pictureSources from "./picture-sources.ts";

Deno.test("buildPictureSources puts AVIF before WebP whatever the order asked", () => {
  const sources = pictureSources.buildPictureSources({
    basePath: "/images/photo",
    ext: "jpg",
    formats: ["webp", "avif"],
  });

  assert.assertEquals(
    sources.map((source) => source.type),
    ["image/avif", "image/webp"],
  );
});

Deno.test("buildPictureSources infers each format's srcset from the base path", () => {
  const [source] = pictureSources.buildPictureSources({
    basePath: "/images/photo",
    ext: "jpg",
    formats: ["webp"],
    sizes: "100vw",
  });

  assert.assertEquals(source, {
    type: "image/webp",
    srcSet:
      "/images/photo-640w.webp 640w, /images/photo-768w.webp 768w, " +
      "/images/photo-1024w.webp 1024w, /images/photo-1280w.webp 1280w, " +
      "/images/photo-1920w.webp 1920w",
    sizes: "100vw",
  });
});

Deno.test("buildPictureSources adapts a given srcset to each format", () => {
  const sources = pictureSources.buildPictureSources({
    basePath: "/images/photo",
    ext: "jpg",
    formats: ["avif", "webp"],
    srcSet: "/images/photo-400w.jpg 400w, /images/photo-800w.jpg 800w",
  });

  assert.assertEquals(sources, [
    {
      type: "image/avif",
      srcSet: "/images/photo-400w.avif 400w, /images/photo-800w.avif 800w",
      sizes: undefined,
    },
    {
      type: "image/webp",
      srcSet: "/images/photo-400w.webp 400w, /images/photo-800w.webp 800w",
      sizes: undefined,
    },
  ]);
});

Deno.test("buildPictureSources gives every source the sizes next to a given srcset", () => {
  const sources = pictureSources.buildPictureSources({
    basePath: "/images/photo",
    ext: "png",
    formats: ["avif", "webp"],
    srcSet: "/images/photo-400w.png 400w",
    sizes: "(min-width: 768px) 50vw, 100vw",
  });

  assert.assertEquals(sources, [
    {
      type: "image/avif",
      srcSet: "/images/photo-400w.avif 400w",
      sizes: "(min-width: 768px) 50vw, 100vw",
    },
    {
      type: "image/webp",
      srcSet: "/images/photo-400w.webp 400w",
      sizes: "(min-width: 768px) 50vw, 100vw",
    },
  ]);
});

Deno.test("buildPictureSources takes the fields parseImageSrc returns", () => {
  const sources = pictureSources.buildPictureSources({
    ...imageConfig.parseImageSrc("/images/photo.jpg"),
    formats: ["avif"],
    srcSet: "/images/photo-400w.jpg 400w",
  });

  assert.assertEquals(
    sources.map((source) => source.srcSet),
    ["/images/photo-400w.avif 400w"],
  );
});

Deno.test("buildPictureSources returns no sources for no formats", () => {
  assert.assertEquals(
    pictureSources.buildPictureSources({
      basePath: "/images/photo",
      ext: "jpg",
      formats: [],
    }),
    [],
  );
});

const pictureElementCases: ReadonlyArray<{
  readonly name: string;
  readonly formats: Parameters<
    typeof pictureSources.shouldUsePictureElement
  >[0];
  readonly expected: boolean;
}> = [
  { name: "no formats given", formats: undefined, expected: false },
  { name: "an empty format list", formats: [], expected: false },
  { name: "one format", formats: ["webp"], expected: true },
];

for (const { name, formats, expected } of pictureElementCases) {
  Deno.test(`shouldUsePictureElement is ${expected} for ${name}`, () => {
    assert.assertEquals(
      pictureSources.shouldUsePictureElement(formats),
      expected,
    );
  });
}

Deno.test("getFormatMimeType maps each format to its MIME type", () => {
  assert.assertEquals(pictureSources.getFormatMimeType("avif"), "image/avif");
  assert.assertEquals(pictureSources.getFormatMimeType("webp"), "image/webp");
});
