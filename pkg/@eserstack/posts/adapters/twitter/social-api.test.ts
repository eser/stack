// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

import * as bdd from "@std/testing/bdd";
import * as assert from "@eserstack/test-kit/assert";
import * as postIdMod from "../../domain/values/post-id.ts";
import type { PostId } from "../../domain/values/post-id.ts";
import * as clientMod from "./client.ts";
import * as socialApiMod from "./social-api.ts";

/** A TwitterSocialApi whose fetch records each request URL and method. */
const createRecordingApi = (requests: string[]) =>
  new socialApiMod.TwitterSocialApi(
    new clientMod.TwitterClient({
      baseUrl: "https://api.x.test/2",
      accessToken: "access-token",
      fetchFn: (input, init) => {
        const request = new Request(input, init);
        requests.push(`${request.method} ${new URL(request.url).pathname}`);
        if (new URL(request.url).pathname === "/2/users/me") {
          return Promise.resolve(
            Response.json({
              data: { id: "42", name: "Me", username: "me" },
            }),
          );
        }
        return Promise.resolve(Response.json({ data: {} }));
      },
    }),
  );

const operations: ReadonlyArray<{
  readonly name: string;
  readonly run: (
    api: socialApiMod.TwitterSocialApi,
    id: PostId,
  ) => Promise<unknown>;
}> = [
  { name: "getPost", run: (api, id) => api.getPost(id) },
  { name: "deletePost", run: (api, id) => api.deletePost(id) },
  { name: "repost", run: (api, id) => api.repost(id) },
  { name: "undoRepost", run: (api, id) => api.undoRepost(id) },
  { name: "bookmarkPost", run: (api, id) => api.bookmarkPost(id) },
  { name: "removeBookmark", run: (api, id) => api.removeBookmark(id) },
  {
    name: "quotePost",
    run: (api, id) => api.quotePost({ text: "Look", quotedPostId: id }),
  },
  {
    name: "getConversation",
    run: (api, id) => api.getConversation({ postId: id }),
  },
];

bdd.describe("TwitterSocialApi post IDs", () => {
  for (const { name, run } of operations) {
    bdd.it(`${name} rejects a non-numeric ID before any request`, async () => {
      const requests: string[] = [];
      const api = createRecordingApi(requests);

      await assert.assertRejects(
        () => run(api, postIdMod.toPostId("../../../tweets/1234567890")),
        Error,
        "is not numeric",
      );
      assert.assertEquals(requests, []);
    });
  }

  bdd.it("removeBookmark puts a numeric ID into the request path", async () => {
    const requests: string[] = [];
    const api = createRecordingApi(requests);

    await api.removeBookmark(postIdMod.toPostId("1234567890"));

    assert.assertEquals(requests, [
      "GET /2/users/me",
      "DELETE /2/users/42/bookmarks/1234567890",
    ]);
  });
});
