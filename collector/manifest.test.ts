// Copyright 2023-present the cool authors. All rights reserved. MIT license.

import * as assert from "$std/assert/mod.ts";
import * as bdd from "$std/testing/bdd.ts";
import * as manifest from "./manifest.ts";

bdd.describe("cool/collector/manifest", () => {
  bdd.it("specifierToIdentifier", () => {
    const used = new Set<string>();

    assert.assertEquals(
      manifest.specifierToIdentifier("foo/bar.ts", used),
      "foo_bar",
    );
    assert.assertEquals(
      manifest.specifierToIdentifier("foo/bar.json.ts", used),
      "foo_bar_json",
    );
    assert.assertEquals(
      manifest.specifierToIdentifier("foo/[id]/bar", used),
      "foo_id_bar",
    );
    assert.assertEquals(
      manifest.specifierToIdentifier("foo/[...all]/bar", used),
      "foo_all_bar",
    );
    assert.assertEquals(
      manifest.specifierToIdentifier("foo/[[optional]]/bar", used),
      "foo_optional_bar",
    );
    assert.assertEquals(
      manifest.specifierToIdentifier("foo/as-df/bar", used),
      "foo_as_df_bar",
    );
    assert.assertEquals(
      manifest.specifierToIdentifier("foo/as@df", used),
      "foo_as_df",
    );
    assert.assertEquals(
      manifest.specifierToIdentifier("foo/foo.bar.baz.tsx", used),
      "foo_foo_bar_baz",
    );
    assert.assertEquals(
      manifest.specifierToIdentifier("404", used),
      "_404",
    );
    assert.assertEquals(
      manifest.specifierToIdentifier("foo/_middleware", used),
      "foo_middleware",
    );
  });

  bdd.it("specifierToIdentifier deals with duplicates", () => {
    const used = new Set<string>();

    assert.assertEquals(
      manifest.specifierToIdentifier("foo/bar", used),
      "foo_bar",
    );
    assert.assertEquals(
      manifest.specifierToIdentifier("foo/bar", used),
      "foo_bar_1",
    );
  });
});
