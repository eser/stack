// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

import * as assert from "@eserstack/test-kit/assert";
import type * as types from "./types.ts";
import * as imageConfig from "./image-config.ts";

const parseCases: ReadonlyArray<{
  readonly src: string;
  readonly expected: types.ParsedImageSrc;
}> = [
  {
    src: "/images/photo.jpg",
    expected: { basePath: "/images/photo", ext: "jpg" },
  },
  {
    src: "photo.min.jpg",
    expected: { basePath: "photo.min", ext: "jpg" },
  },
  {
    src: "./photo.png",
    expected: { basePath: "./photo", ext: "png" },
  },
  {
    src: "/albums.jpg/cover.jpg",
    expected: { basePath: "/albums.jpg/cover", ext: "jpg" },
  },
  {
    src: "https://img.example.com/avatar",
    expected: { basePath: "https://img.example.com/avatar", ext: "" },
  },
  {
    src: "/api/avatars/42",
    expected: { basePath: "/api/avatars/42", ext: "" },
  },
  {
    src: "/images/photo.jpg?v=3",
    expected: { basePath: "/images/photo", ext: "jpg?v=3" },
  },
  {
    src: "/images/photo.jpg?from=/uploads",
    expected: { basePath: "/images/photo", ext: "jpg?from=/uploads" },
  },
];

for (const { src, expected } of parseCases) {
  Deno.test(`parseImageSrc splits "${src}"`, () => {
    assert.assertEquals(imageConfig.parseImageSrc(src), expected);
  });
}

Deno.test("buildImageAttributes lazy-loads by default", () => {
  assert.assertEquals(
    imageConfig.buildImageAttributes({ src: "/a.jpg", alt: "A team photo" }),
    {
      alt: "A team photo",
      width: undefined,
      height: undefined,
      className: "object-cover",
      loading: "lazy",
      decoding: "async",
      fetchPriority: "auto",
      sizes: undefined,
      srcSet: undefined,
    },
  );
});

Deno.test("buildImageAttributes loads a priority image eagerly", () => {
  const attributes = imageConfig.buildImageAttributes({
    src: "/hero.jpg",
    alt: "",
    priority: true,
    width: 1200,
    height: 600,
    objectFit: "contain",
    className: "rounded",
    sizes: "100vw",
    srcSet: "/hero-1200w.jpg 1200w",
  });

  assert.assertEquals(attributes.loading, "eager");
  assert.assertEquals(attributes.fetchPriority, "high");
  assert.assertEquals(attributes.className, "object-contain rounded");
  assert.assertEquals(attributes.width, 1200);
  assert.assertEquals(attributes.height, 600);
  assert.assertEquals(attributes.sizes, "100vw");
  assert.assertEquals(attributes.srcSet, "/hero-1200w.jpg 1200w");
});

Deno.test("combineClassNames skips empty and missing names", () => {
  assert.assertEquals(
    imageConfig.combineClassNames("a", undefined, "", "b"),
    "a b",
  );
  assert.assertEquals(imageConfig.combineClassNames(), "");
});
