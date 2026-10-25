// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

import * as assert from "@eserstack/test-kit/assert";
import type * as types from "./types.ts";
import * as placeholder from "./placeholder.ts";

const BLUR_DATA_URL = "data:image/webp;base64,UklGRhQAAABXRUJQ";

const placeholderCases: ReadonlyArray<{
  readonly name: string;
  readonly placeholder: types.PlaceholderType | undefined;
  readonly blurDataURL: string | undefined;
  readonly expected: types.PlaceholderStyles | undefined;
}> = [
  {
    name: "blur with a data URL",
    placeholder: "blur",
    blurDataURL: BLUR_DATA_URL,
    expected: {
      backgroundImage: `url("${BLUR_DATA_URL}")`,
      backgroundSize: "cover",
      backgroundPosition: "center",
    },
  },
  {
    name: "blur without a data URL",
    placeholder: "blur",
    blurDataURL: undefined,
    expected: undefined,
  },
  {
    name: "blur with an empty data URL",
    placeholder: "blur",
    blurDataURL: "",
    expected: undefined,
  },
  {
    name: "an empty placeholder with a data URL",
    placeholder: "empty",
    blurDataURL: BLUR_DATA_URL,
    expected: undefined,
  },
  {
    name: "no placeholder with a data URL",
    placeholder: undefined,
    blurDataURL: BLUR_DATA_URL,
    expected: undefined,
  },
];

for (const testCase of placeholderCases) {
  Deno.test(`buildPlaceholderStyles for ${testCase.name}`, () => {
    assert.assertEquals(
      placeholder.buildPlaceholderStyles(
        testCase.placeholder,
        testCase.blurDataURL,
      ),
      testCase.expected,
    );
  });

  Deno.test(`shouldShowPlaceholder for ${testCase.name}`, () => {
    assert.assertEquals(
      placeholder.shouldShowPlaceholder(
        testCase.placeholder,
        testCase.blurDataURL,
      ),
      testCase.expected !== undefined,
    );
  });
}

Deno.test("buildPlaceholderStyles keeps a quote or a line break inside the CSS string", () => {
  const styles = placeholder.buildPlaceholderStyles(
    "blur",
    'data:image/png;base64,AA");color:red;x:("\nB\\',
  );

  assert.assertEquals(
    styles?.backgroundImage,
    'url("data:image/png;base64,AA\\22 );color:red;x:(\\22 \\a B\\5c ")',
  );
});
