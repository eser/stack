// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

// This file contains code from deno fresh (https://github.com/denoland/fresh),
// which is a web framework, licensed under the MIT license.

// Copyright (c) 2023 Eser Ozvataf and other contributors
// Copyright (c) 2021-2023 Luca Casonato

import * as assert from "@std/assert";
import * as manifest from "./manifest.ts";

Deno.test("specifierToIdentifier", () => {
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

Deno.test("specifierToIdentifier deals with duplicates", () => {
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
