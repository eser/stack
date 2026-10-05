// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

import * as assert from "@std/assert";
import * as bdd from "@std/testing/bdd";
import * as github from "./github.ts";

bdd.describe("github provider — parse", () => {
  bdd.it("bare owner/repo", () => {
    const parsed = github.provider.parse("eser/stack") as unknown as {
      owner: string;
      repo: string;
      ref: string;
      subpath?: string;
    };
    assert.assertEquals(parsed.owner, "eser");
    assert.assertEquals(parsed.repo, "stack");
    assert.assertEquals(parsed.ref, "main");
    assert.assertEquals(parsed.subpath, undefined);
  });

  bdd.it("gh: prefix stripped", () => {
    const parsed = github.provider.parse("gh:eser/stack") as unknown as {
      owner: string;
      repo: string;
    };
    assert.assertEquals(parsed.owner, "eser");
    assert.assertEquals(parsed.repo, "stack");
  });

  bdd.it("github: prefix stripped", () => {
    const parsed = github.provider.parse("github:eser/stack") as unknown as {
      owner: string;
      repo: string;
    };
    assert.assertEquals(parsed.owner, "eser");
    assert.assertEquals(parsed.repo, "stack");
  });

  bdd.it("ref from #fragment", () => {
    const parsed = github.provider.parse("eser/stack#v2.0") as unknown as {
      ref: string;
    };
    assert.assertEquals(parsed.ref, "v2.0");
  });

  bdd.it("subpath from extra path segments", () => {
    const parsed = github.provider.parse(
      "eser/monorepo/packages/foo",
    ) as unknown as {
      owner: string;
      repo: string;
      subpath?: string;
    };
    assert.assertEquals(parsed.owner, "eser");
    assert.assertEquals(parsed.repo, "monorepo");
    assert.assertEquals(parsed.subpath, "packages/foo");
  });

  bdd.it("subpath with ref", () => {
    const parsed = github.provider.parse(
      "eser/monorepo/packages/foo#v1.0",
    ) as unknown as {
      subpath?: string;
      ref: string;
    };
    assert.assertEquals(parsed.subpath, "packages/foo");
    assert.assertEquals(parsed.ref, "v1.0");
  });

  bdd.it("throws on single segment", () => {
    assert.assertThrows(
      () => github.provider.parse("gh:singleword"),
      Error,
    );
  });

  bdd.it("throws on empty owner or repo", () => {
    assert.assertThrows(
      () => github.provider.parse("gh:/repo"),
      Error,
    );
  });

  bdd.it("providerName is github", () => {
    const parsed = github.provider.parse("eser/stack");
    assert.assertEquals(parsed.providerName, "github");
  });

  bdd.it("stripComponents is 1", () => {
    const parsed = github.provider.parse("eser/stack");
    assert.assertEquals(parsed.stripComponents, 1);
  });
});
