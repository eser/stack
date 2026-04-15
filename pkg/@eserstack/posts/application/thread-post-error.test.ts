// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

import * as bdd from "@std/testing/bdd";
import * as assert from "@std/assert";
import * as results from "@eserstack/primitives/results";
import { ThreadPartialError } from "./thread-post-error.ts";
import { createTestPost } from "./testing.ts";
import * as postIdMod from "../domain/values/post-id.ts";

bdd.describe("ThreadPartialError", () => {
  bdd.it("formats a descriptive message", () => {
    const p1 = createTestPost({ id: postIdMod.toPostId("p1") });
    const cause = new Error("rate limit");
    const err = new ThreadPartialError([p1], 1, 5, cause);

    assert.assertEquals(err.code, "THREAD_PARTIAL");
    assert.assertEquals(err.failedIndex, 1);
    assert.assertEquals(err.totalCount, 5);
    assert.assertEquals(err.postedTweets.length, 1);
    assert.assertEquals(err.failureCause, cause);
    assert.assertMatch(err.message, /1\/5/);
    assert.assertMatch(err.message, /index 1/);
  });

  bdd.it("is an instance of Error", () => {
    const err = new ThreadPartialError([], 0, 3, new Error("fail"));
    assert.assertInstanceOf(err, Error);
    assert.assertEquals(err.name, "ThreadPartialError");
  });

  bdd.it("carries zero postedTweets when the first post fails", () => {
    const err = new ThreadPartialError([], 0, 3, new Error("fail"));
    assert.assertEquals(err.postedTweets.length, 0);
    assert.assertEquals(err.failedIndex, 0);
  });
});

bdd.describe("SocialApi postThread Result contract", () => {
  bdd.it("ok result wraps posts array", () => {
    // Verify the Result shape the adapter is expected to produce
    const posts = [createTestPost({ id: postIdMod.toPostId("t1") })];
    const r = results.ok({ posts });
    assert.assertEquals(results.isOk(r), true);
    if (results.isOk(r)) {
      assert.assertEquals(r.value.posts, posts);
    }
  });

  bdd.it("fail result with ThreadPartialError carries partial data", () => {
    const p1 = createTestPost({ id: postIdMod.toPostId("t1") });
    const err = new ThreadPartialError(
      [p1],
      1,
      3,
      new Error("network timeout"),
    );
    const r: results.Result<{ posts: typeof p1[] }, Error> = results.fail(err);

    assert.assertEquals(results.isFail(r), true);
    if (results.isFail(r)) {
      assert.assertInstanceOf(r.error, ThreadPartialError);
      const partial = r.error as ThreadPartialError;
      assert.assertEquals(partial.postedTweets.length, 1);
      assert.assertEquals(partial.failedIndex, 1);
      assert.assertEquals(partial.totalCount, 3);
      assert.assertEquals(partial.code, "THREAD_PARTIAL");
    }
  });
});
