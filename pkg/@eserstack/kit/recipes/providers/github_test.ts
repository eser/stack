// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

import * as assert from "@std/assert";
import { describe, it } from "@std/testing/bdd";
import { provider } from "./github.ts";

describe("github provider — parse", () => {
  it("bare owner/repo", () => {
    const parsed = provider.parse("eser/stack") as {
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

  it("gh: prefix stripped", () => {
    const parsed = provider.parse("gh:eser/stack") as {
      owner: string;
      repo: string;
    };
    assert.assertEquals(parsed.owner, "eser");
    assert.assertEquals(parsed.repo, "stack");
  });

  it("github: prefix stripped", () => {
    const parsed = provider.parse("github:eser/stack") as {
      owner: string;
      repo: string;
    };
    assert.assertEquals(parsed.owner, "eser");
    assert.assertEquals(parsed.repo, "stack");
  });

  it("ref from #fragment", () => {
    const parsed = provider.parse("eser/stack#v2.0") as {
      ref: string;
    };
    assert.assertEquals(parsed.ref, "v2.0");
  });

  it("subpath from extra path segments", () => {
    const parsed = provider.parse("eser/monorepo/packages/foo") as {
      owner: string;
      repo: string;
      subpath?: string;
    };
    assert.assertEquals(parsed.owner, "eser");
    assert.assertEquals(parsed.repo, "monorepo");
    assert.assertEquals(parsed.subpath, "packages/foo");
  });

  it("subpath with ref", () => {
    const parsed = provider.parse("eser/monorepo/packages/foo#v1.0") as {
      subpath?: string;
      ref: string;
    };
    assert.assertEquals(parsed.subpath, "packages/foo");
    assert.assertEquals(parsed.ref, "v1.0");
  });

  it("throws on single segment", () => {
    assert.assertThrows(
      () => provider.parse("gh:singleword"),
      Error,
    );
  });

  it("throws on empty owner or repo", () => {
    assert.assertThrows(
      () => provider.parse("gh:/repo"),
      Error,
    );
  });

  it("providerName is github", () => {
    const parsed = provider.parse("eser/stack");
    assert.assertEquals(parsed.providerName, "github");
  });

  it("stripComponents is 1", () => {
    const parsed = provider.parse("eser/stack");
    assert.assertEquals(parsed.stripComponents, 1);
  });
});
