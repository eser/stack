// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

import * as bdd from "@std/testing/bdd";
import * as assert from "@eserstack/test-kit/assert";
import * as results from "@eserstack/primitives/results";
import * as testing from "../../application/testing.ts";
import * as postIdMod from "../../domain/values/post-id.ts";
import * as bluesky from "./mod.ts";

type ReplyRef = { readonly uri: string; readonly cid: string };
type SentRecord = {
  readonly text: string;
  readonly reply?: { readonly root: ReplyRef; readonly parent: ReplyRef };
};

/**
 * A BlueskyClient stand-in that records every created record and answers
 * with the next AT-URI, so tests see exactly what would be sent.
 */
const createFakeClient = () => {
  const sent: SentRecord[] = [];
  const fake = {
    did: "did:plc:me",
    get: () => Promise.resolve({ did: "did:plc:me", handle: "me.bsky.social" }),
    post: (_nsid: string, body?: unknown) => {
      sent.push((body as { readonly record: SentRecord }).record);
      const n = sent.length;
      return Promise.resolve({
        uri: `at://did:plc:me/app.bsky.feed.post/${n}`,
        cid: `cid${n}`,
      });
    },
  };
  // The adapter only calls did, get and post on its client.
  return { client: fake as unknown as bluesky.BlueskyClient, sent };
};

const topLevel = {
  uri: "at://did:plc:other/app.bsky.feed.post/top",
  cid: "c0",
};

bdd.describe("BlueskySocialApi.replyToPost", () => {
  bdd.it("uses a top-level post as both root and parent", async () => {
    const { client, sent } = createFakeClient();
    const api = new bluesky.BlueskySocialApi(client);

    const reply = await api.replyToPost({
      text: "Hi",
      inReplyToPost: testing.createTestPost({
        id: postIdMod.toPostId(topLevel.uri),
        platform: "bluesky",
        platformRef: topLevel,
      }),
    });

    assert.assertEquals(sent[0]?.reply, { root: topLevel, parent: topLevel });
    assert.assertEquals(reply.platformRef?.["rootUri"], topLevel.uri);
  });

  bdd.it("keeps the thread root when replying to a reply", async () => {
    const { client, sent } = createFakeClient();
    const api = new bluesky.BlueskySocialApi(client);
    const parent = {
      uri: "at://did:plc:other/app.bsky.feed.post/mid",
      cid: "c1",
    };

    await api.replyToPost({
      text: "Hi",
      inReplyToPost: testing.createTestPost({
        id: postIdMod.toPostId(parent.uri),
        platform: "bluesky",
        platformRef: {
          ...parent,
          rootUri: topLevel.uri,
          rootCid: topLevel.cid,
        },
      }),
    });

    assert.assertEquals(sent[0]?.reply, { root: topLevel, parent });
  });
});

bdd.describe("BlueskySocialApi.postThread", () => {
  bdd.it("gives every later post the thread root to reply under", async () => {
    const { client, sent } = createFakeClient();
    const api = new bluesky.BlueskySocialApi(client);

    const result = await api.postThread({ texts: ["one", "two", "three"] });

    assert.assert(results.isOk(result));
    const first = { uri: "at://did:plc:me/app.bsky.feed.post/1", cid: "cid1" };
    assert.assertEquals(result.value.posts[0]?.platformRef, first);
    assert.assertEquals(result.value.posts[2]?.platformRef, {
      uri: "at://did:plc:me/app.bsky.feed.post/3",
      cid: "cid3",
      rootUri: first.uri,
      rootCid: first.cid,
    });
    assert.assertEquals(sent[2]?.reply?.root, first);
  });
});

bdd.describe("BluekysSocialApi", () => {
  bdd.it("is the deprecated alias of BlueskySocialApi", () => {
    assert.assertStrictEquals(
      bluesky.BluekysSocialApi,
      bluesky.BlueskySocialApi,
    );
  });

  bdd.it("still constructs a BlueskySocialApi", () => {
    const api: bluesky.BluekysSocialApi = new bluesky.BluekysSocialApi(
      new bluesky.BlueskyClient(),
    );

    assert.assertInstanceOf(api, bluesky.BlueskySocialApi);
  });
});
