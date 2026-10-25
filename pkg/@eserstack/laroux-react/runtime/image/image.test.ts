// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

import * as nodeTest from "node:test";
import * as assert from "@eserstack/test-kit/assert";
import * as React from "react";
import * as ReactDOMServer from "react-dom/server";
import * as image from "./image.ts";

const FALLBACK_ATTRIBUTE = "data-laroux-fallback";

const renderOnServer = (props: image.ImageProps): string =>
  ReactDOMServer.renderToStaticMarkup(React.createElement(image.Image, props));

// laroux serializes what a server component returns as JSON, so a function
// anywhere in the tree is dropped before it reaches the browser.
const findFunctionProps = (node: unknown, path = "Image"): string[] => {
  if (!React.isValidElement(node)) {
    return [];
  }

  const props = node.props as Record<string, unknown> & {
    children?: React.ReactNode;
  };
  const found: string[] = [];

  for (const [key, value] of Object.entries(props)) {
    if (typeof value === "function") {
      found.push(`${path}.${key}`);
    }
  }

  for (const child of React.Children.toArray(props.children)) {
    found.push(...findFunctionProps(child, `${path} > child`));
  }

  return found;
};

nodeTest.test("Image keeps its fallback in the server-rendered img", () => {
  const html = renderOnServer({
    src: "/images/hero.jpg",
    alt: "Team at the offsite",
    fallback: "/images/placeholder.jpg",
  });

  assert.assertStringIncludes(html, 'src="/images/hero.jpg"');
  assert.assertStringIncludes(
    html,
    `${FALLBACK_ATTRIBUTE}="/images/placeholder.jpg"`,
  );
});

nodeTest.test("Image keeps its fallback in the server-rendered picture", () => {
  const html = renderOnServer({
    src: "/images/hero.jpg",
    alt: "Team at the offsite",
    fallback: "/images/placeholder.jpg",
    formats: ["avif", "webp"],
  });

  assert.assertStringIncludes(html, "<picture");
  assert.assertStringIncludes(
    html,
    `${FALLBACK_ATTRIBUTE}="/images/placeholder.jpg"`,
  );
});

nodeTest.test("Image renders the fallback when the source is missing", () => {
  const html = renderOnServer({
    src: "",
    alt: "Team at the offsite",
    fallback: "/images/placeholder.jpg",
    formats: ["avif", "webp"],
  });

  assert.assertStringIncludes(html, 'src="/images/placeholder.jpg"');
  assert.assertEquals(html.includes("<picture"), false);
  assert.assertEquals(html.includes(FALLBACK_ATTRIBUTE), false);
});

nodeTest.test(
  "Image renders the fallback without the srcSet of a missing source",
  () => {
    const html = renderOnServer({
      src: "",
      alt: "Team at the offsite",
      fallback: "/images/placeholder.jpg",
      srcSet: "/images/hero-640.jpg 640w, /images/hero-1280.jpg 1280w",
      sizes: "100vw",
    });

    assert.assertStringIncludes(html, 'src="/images/placeholder.jpg"');
    assert.assertEquals(html.toLowerCase().includes("srcset"), false);
    assert.assertEquals(html.includes("sizes="), false);
  },
);

nodeTest.test(
  "Image gives each picture source its format's srcset and the sizes",
  () => {
    const html = renderOnServer({
      src: "/images/hero.jpg",
      alt: "Team at the offsite",
      formats: ["webp", "avif"],
      srcSet: "/images/hero-640w.jpg 640w, /images/hero-1280w.jpg 1280w",
      sizes: "100vw",
    });

    assert.assertStringIncludes(
      html,
      '<source type="image/avif" srcSet="/images/hero-640w.avif 640w, ' +
        '/images/hero-1280w.avif 1280w" sizes="100vw"/>' +
        '<source type="image/webp" srcSet="/images/hero-640w.webp 640w, ' +
        '/images/hero-1280w.webp 1280w" sizes="100vw"/>',
    );
  },
);

const blurCases: ReadonlyArray<{
  readonly name: string;
  readonly blurDataURL: string | undefined;
  readonly expectBlur: boolean;
}> = [
  {
    name: "with a data URL",
    blurDataURL: "data:image/webp;base64,UklGRhQAAABXRUJQ",
    expectBlur: true,
  },
  { name: "without a data URL", blurDataURL: undefined, expectBlur: false },
  { name: "with an empty data URL", blurDataURL: "", expectBlur: false },
];

for (const { name, blurDataURL, expectBlur } of blurCases) {
  nodeTest.test(`Image with a blur placeholder ${name}`, () => {
    const html = renderOnServer({
      src: "/images/hero.jpg",
      alt: "Team at the offsite",
      placeholder: "blur",
      blurDataURL,
    });

    assert.assertEquals(
      html.includes(
        "background-image:url(&quot;data:image/webp;base64,UklGRhQAAABXRUJQ&quot;)",
      ),
      expectBlur,
    );
    assert.assertEquals(html.includes("background-size:cover"), expectBlur);
  });

  nodeTest.test(
    `ResponsiveImage ${name} ${expectBlur ? "shows" : "has no"} blur`,
    () => {
      const html = ReactDOMServer.renderToStaticMarkup(
        React.createElement(image.ResponsiveImage, {
          src: "/images/hero.jpg",
          alt: "Team at the offsite",
          blurDataURL,
        }),
      );

      assert.assertEquals(html.includes("background-image"), expectBlur);
    },
  );
}

nodeTest.test("Image without a fallback renders no fallback attribute", () => {
  const html = renderOnServer({ src: "/images/hero.jpg", alt: "" });

  assert.assertEquals(html.includes(FALLBACK_ATTRIBUTE), false);
});

const serializableCases: ReadonlyArray<{
  name: string;
  props: image.ImageProps;
}> = [
  {
    name: "img",
    props: { src: "/a.jpg", alt: "", fallback: "/b.jpg" },
  },
  {
    name: "picture",
    props: {
      src: "/a.jpg",
      alt: "",
      fallback: "/b.jpg",
      formats: ["webp"],
    },
  },
];

for (const testCase of serializableCases) {
  nodeTest.test(
    `Image ${testCase.name} has no function props for laroux to drop`,
    () => {
      const element = image.Image(testCase.props);

      assert.assertEquals(findFunctionProps(element), []);
    },
  );
}
