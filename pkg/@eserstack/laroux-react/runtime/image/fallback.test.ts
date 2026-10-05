// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

import * as assert from "@std/assert";
import * as imageFallback from "./fallback.ts";

type FakeSource = imageFallback.FallbackSourceElement & {
  readonly attributes: Map<string, string>;
};

type FakeImage = imageFallback.FallbackImageElement & {
  readonly attributes: Map<string, string>;
};

type FakeImageOptions = {
  readonly attributes: Record<string, string>;
  readonly sources?: readonly FakeSource[];
  readonly complete?: boolean;
  readonly naturalWidth?: number;
  readonly decodes?: boolean;
};

const createSource = (srcset: string): FakeSource => {
  const attributes = new Map([["srcset", srcset]]);

  return {
    attributes,
    removeAttribute: (name) => {
      attributes.delete(name);
    },
  };
};

const createImage = (options: FakeImageOptions): FakeImage => {
  const attributes = new Map(Object.entries(options.attributes));
  const sources = options.sources ?? [];

  return {
    attributes,
    tagName: "IMG",
    complete: options.complete ?? false,
    naturalWidth: options.naturalWidth ?? 0,
    parentElement: sources.length > 0
      ? { tagName: "PICTURE", querySelectorAll: () => sources }
      : { tagName: "DIV", querySelectorAll: () => [] },
    getAttribute: (name) => attributes.get(name) ?? null,
    setAttribute: (name, value) => {
      attributes.set(name, value);
    },
    removeAttribute: (name) => {
      attributes.delete(name);
    },
    decode: () =>
      options.decodes === true
        ? Promise.resolve()
        : Promise.reject(new Error("EncodingError")),
  };
};

type FakeDocument = imageFallback.FallbackDocument & {
  readonly listeners: Set<(event: imageFallback.FallbackErrorEvent) => void>;
  readonly queries: string[];
};

const createDocument = (images: readonly unknown[]): FakeDocument => {
  const listeners = new Set<
    (event: imageFallback.FallbackErrorEvent) => void
  >();
  const queries: string[] = [];

  return {
    listeners,
    queries,
    addEventListener: (_type, listener, useCapture) => {
      assert.assertEquals(useCapture, true);
      listeners.add(listener);
    },
    removeEventListener: (_type, listener) => {
      listeners.delete(listener);
    },
    querySelectorAll: (selectors) => {
      queries.push(selectors);
      return images;
    },
  };
};

const dispatchError = (document: FakeDocument, target: unknown): void => {
  for (const listener of document.listeners) {
    listener({ target });
  }
};

// The startup check settles in promise callbacks; one macrotask runs them all.
const settle = (): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, 0));

Deno.test("applyImageFallback switches the src to the fallback", () => {
  const image = createImage({
    attributes: {
      src: "/hero.jpg",
      srcset: "/hero-640.jpg 640w",
      [imageFallback.FALLBACK_ATTRIBUTE]: "/placeholder.jpg",
    },
  });

  assert.assertEquals(imageFallback.applyImageFallback(image), true);
  assert.assertEquals(image.attributes.get("src"), "/placeholder.jpg");
  assert.assertEquals(image.attributes.has("srcset"), false);
});

Deno.test("applyImageFallback clears the picture sources", () => {
  const sources = [createSource("/hero.avif"), createSource("/hero.webp")];
  const image = createImage({
    attributes: {
      src: "/hero.jpg",
      [imageFallback.FALLBACK_ATTRIBUTE]: "/placeholder.jpg",
    },
    sources,
  });

  imageFallback.applyImageFallback(image);

  assert.assertEquals(
    sources.map((source) => source.attributes.has("srcset")),
    [false, false],
  );
  assert.assertEquals(image.attributes.get("src"), "/placeholder.jpg");
});

const unchangedCases: ReadonlyArray<
  { name: string; attributes: Record<string, string> }
> = [
  { name: "has no fallback", attributes: { src: "/hero.jpg" } },
  {
    name: "has an empty fallback",
    attributes: { src: "/hero.jpg", [imageFallback.FALLBACK_ATTRIBUTE]: "" },
  },
  {
    name: "already shows its fallback",
    attributes: {
      src: "/placeholder.jpg",
      [imageFallback.FALLBACK_ATTRIBUTE]: "/placeholder.jpg",
    },
  },
];

for (const testCase of unchangedCases) {
  Deno.test(`applyImageFallback leaves an image that ${testCase.name}`, () => {
    const image = createImage({ attributes: testCase.attributes });

    assert.assertEquals(imageFallback.applyImageFallback(image), false);
    assert.assertEquals(
      Object.fromEntries(image.attributes),
      testCase.attributes,
    );
  });
}

Deno.test("installImageFallbacks applies the fallback when an image fails", () => {
  const document = createDocument([]);
  const image = createImage({
    attributes: {
      src: "/hero.jpg",
      [imageFallback.FALLBACK_ATTRIBUTE]: "/placeholder.jpg",
    },
  });

  imageFallback.installImageFallbacks(document);
  dispatchError(document, image);

  assert.assertEquals(image.attributes.get("src"), "/placeholder.jpg");
});

Deno.test("installImageFallbacks ignores errors from other elements", () => {
  const document = createDocument([]);
  const script = {
    tagName: "SCRIPT",
    setAttribute: () => {
      throw new Error("a script must not be changed");
    },
  };

  imageFallback.installImageFallbacks(document);
  dispatchError(document, script);
  dispatchError(document, null);
});

Deno.test("installImageFallbacks checks images that failed before it ran", async () => {
  const broken = createImage({
    attributes: {
      src: "/missing.jpg",
      [imageFallback.FALLBACK_ATTRIBUTE]: "/placeholder.jpg",
    },
    complete: true,
    naturalWidth: 0,
    decodes: false,
  });
  const unsizedSvg = createImage({
    attributes: {
      src: "/logo.svg",
      [imageFallback.FALLBACK_ATTRIBUTE]: "/placeholder.jpg",
    },
    complete: true,
    naturalWidth: 0,
    decodes: true,
  });
  const loading = createImage({
    attributes: {
      src: "/later.jpg",
      [imageFallback.FALLBACK_ATTRIBUTE]: "/placeholder.jpg",
    },
    complete: false,
  });
  const document = createDocument([broken, unsizedSvg, loading]);

  imageFallback.installImageFallbacks(document);
  await settle();

  assert.assertEquals(document.queries, [
    `img[${imageFallback.FALLBACK_ATTRIBUTE}]`,
  ]);
  assert.assertEquals(broken.attributes.get("src"), "/placeholder.jpg");
  assert.assertEquals(unsizedSvg.attributes.get("src"), "/logo.svg");
  assert.assertEquals(loading.attributes.get("src"), "/later.jpg");
});

Deno.test("installImageFallbacks returns a function that removes the listener", () => {
  const document = createDocument([]);

  const uninstall = imageFallback.installImageFallbacks(document);
  assert.assertEquals(document.listeners.size, 1);

  uninstall();
  assert.assertEquals(document.listeners.size, 0);
});
