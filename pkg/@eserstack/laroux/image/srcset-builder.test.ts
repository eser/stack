// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

import * as assert from "@eserstack/test-kit/assert";
import * as srcsetBuilder from "./srcset-builder.ts";

Deno.test("inferSrcSet lists one variant per default width", () => {
  assert.assertEquals(
    srcsetBuilder.inferSrcSet("/images/photo.jpg"),
    "/images/photo-640w.jpg 640w, /images/photo-768w.jpg 768w, " +
      "/images/photo-1024w.jpg 1024w, /images/photo-1280w.jpg 1280w, " +
      "/images/photo-1920w.jpg 1920w",
  );
});

const inferCases: ReadonlyArray<{
  readonly name: string;
  readonly src: string;
  readonly expected: string;
}> = [
  {
    name: "keeps every dot of a multi-part file name but the last",
    src: "/images/photo.min.jpg",
    expected:
      "/images/photo.min-400w.jpg 400w, /images/photo.min-800w.jpg 800w",
  },
  {
    name: "keeps a host and directories that contain dots",
    src: "https://img.example.com/v1.2/photo.webp",
    expected: "https://img.example.com/v1.2/photo-400w.webp 400w, " +
      "https://img.example.com/v1.2/photo-800w.webp 800w",
  },
  {
    name: "replaces only the extension when a directory has the same one",
    src: "/albums.jpg/cover.jpg",
    expected:
      "/albums.jpg/cover-400w.jpg 400w, /albums.jpg/cover-800w.jpg 800w",
  },
  {
    name: "appends the width to a URL without an extension",
    src: "https://img.example.com/avatar",
    expected: "https://img.example.com/avatar-400w 400w, " +
      "https://img.example.com/avatar-800w 800w",
  },
  {
    name: "keeps a query string after the extension",
    src: "/images/photo.jpg?v=1.2",
    expected: "/images/photo-400w.jpg?v=1.2 400w, " +
      "/images/photo-800w.jpg?v=1.2 800w",
  },
];

for (const { name, src, expected } of inferCases) {
  Deno.test(`inferSrcSet ${name}`, () => {
    assert.assertEquals(srcsetBuilder.inferSrcSet(src, [400, 800]), expected);
  });
}

Deno.test("inferSrcSet returns an empty srcset for no widths", () => {
  assert.assertEquals(srcsetBuilder.inferSrcSet("/images/photo.jpg", []), "");
});

const replaceCases: ReadonlyArray<{
  readonly name: string;
  readonly srcSet: string;
  readonly originalExt: string;
  readonly expected: string;
}> = [
  {
    name: "replaces the extension of every candidate",
    srcSet: "/a-400w.jpg 400w, /a-800w.jpg 800w",
    originalExt: "jpg",
    expected: "/a-400w.avif 400w, /a-800w.avif 800w",
  },
  {
    name: "replaces the extension of a candidate without a descriptor",
    srcSet: "/a.jpg",
    originalExt: "jpg",
    expected: "/a.avif",
  },
  {
    name: "leaves a host that contains the extension alone",
    srcSet: "https://cdn.jpg.example.com/a-400w.jpg 400w",
    originalExt: "jpg",
    expected: "https://cdn.jpg.example.com/a-400w.avif 400w",
  },
  {
    name: "leaves a longer extension that starts with the same letters alone",
    srcSet: "/a.jpgx 400w",
    originalExt: "jpg",
    expected: "/a.jpgx 400w",
  },
  {
    name: "keeps a URL with commas in one candidate",
    srcSet: "https://cdn.example.com/w_400,h_300/a.jpg 400w",
    originalExt: "jpg",
    expected: "https://cdn.example.com/w_400,h_300/a.avif 400w",
  },
  {
    name: "matches an extension with regex characters literally",
    srcSet: "/a.jpg?v=3 400w, /b.jpgXv=3 800w",
    originalExt: "jpg?v=3",
    expected: "/a.avif 400w, /b.jpgXv=3 800w",
  },
  {
    name: "leaves the srcset alone when the source has no extension",
    srcSet: "https://img.example.com/avatar-400w 400w",
    originalExt: "",
    expected: "https://img.example.com/avatar-400w 400w",
  },
];

for (const { name, srcSet, originalExt, expected } of replaceCases) {
  Deno.test(`replaceSrcSetExtension ${name}`, () => {
    assert.assertEquals(
      srcsetBuilder.replaceSrcSetExtension(srcSet, originalExt, "avif"),
      expected,
    );
  });
}

Deno.test("buildFormatSrcSet builds the srcset of one format from a base path", () => {
  assert.assertEquals(
    srcsetBuilder.buildFormatSrcSet("/images/photo", "webp", [320, 640]),
    "/images/photo-320w.webp 320w, /images/photo-640w.webp 640w",
  );
  assert.assertEquals(
    srcsetBuilder.buildFormatSrcSet("/images/photo", "avif").split(", ")
      .length,
    5,
  );
});
