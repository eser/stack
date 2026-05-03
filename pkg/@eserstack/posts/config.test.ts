// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

import * as bdd from "@std/testing/bdd";
import * as assert from "@std/assert";
import * as results from "@eserstack/primitives/results";
import { runtime } from "@eserstack/standards/cross-runtime";
import { loadPostsConfig } from "./config.ts";
import { validateConfig } from "./config-validation.ts";
import type { PostsConfig } from "./config.ts";

// ── Test fixtures ─────────────────────────────────────────────────────────────

function makeConfig(overrides?: Partial<PostsConfig>): PostsConfig {
  return {
    env: "test",
    twitter: {
      clientId: "test-twitter-client-id",
      clientSecret: undefined,
      redirectUri: "http://127.0.0.1:8080/callback",
      apiBaseUrl: undefined,
    },
    bluesky: {
      pdsHost: undefined,
      identifier: undefined,
      appPassword: undefined,
    },
    ai: {
      provider: "anthropic",
      apiKey: undefined,
    },
    tokenStorePath: undefined,
    ...overrides,
  };
}

// ── validateConfig ────────────────────────────────────────────────────────────

bdd.describe("validateConfig", () => {
  bdd.it("returns ok when Twitter clientId is present", () => {
    const cfg = makeConfig({
      twitter: {
        clientId: "abc",
        clientSecret: undefined,
        redirectUri: "http://127.0.0.1:8080/callback",
        apiBaseUrl: undefined,
      },
    });
    const result = validateConfig(cfg);
    assert.assertEquals(results.isOk(result), true);
    if (results.isOk(result)) {
      assert.assertEquals(result.value, cfg);
    }
  });

  bdd.it(
    "returns ok when Bluesky identifier and appPassword are both present",
    () => {
      const cfg = makeConfig({
        twitter: {
          clientId: undefined,
          clientSecret: undefined,
          redirectUri: "http://127.0.0.1:8080/callback",
          apiBaseUrl: undefined,
        },
        bluesky: {
          pdsHost: undefined,
          identifier: "user.bsky.social",
          appPassword: "abcd-efgh-ijkl-mnop",
        },
      });
      const result = validateConfig(cfg);
      assert.assertEquals(results.isOk(result), true);
    },
  );

  bdd.it("returns fail when neither platform is configured", () => {
    const cfg = makeConfig({
      twitter: {
        clientId: undefined,
        clientSecret: undefined,
        redirectUri: "http://127.0.0.1:8080/callback",
        apiBaseUrl: undefined,
      },
      bluesky: {
        pdsHost: undefined,
        identifier: undefined,
        appPassword: undefined,
      },
    });
    const result = validateConfig(cfg);
    assert.assertEquals(results.isFail(result), true);
    if (results.isFail(result)) {
      assert.assertEquals(result.error.code, "CONFIG_INVALID");
      assert.assertArrayIncludes(result.error.missing, ["TWITTER_CLIENT_ID"]);
    }
  });

  bdd.it(
    "returns fail when Bluesky identifier is present but appPassword is missing",
    () => {
      const cfg = makeConfig({
        twitter: {
          clientId: undefined,
          clientSecret: undefined,
          redirectUri: "http://127.0.0.1:8080/callback",
          apiBaseUrl: undefined,
        },
        bluesky: {
          pdsHost: undefined,
          identifier: "user.bsky.social",
          appPassword: undefined,
        },
      });
      const result = validateConfig(cfg);
      assert.assertEquals(results.isFail(result), true);
      if (results.isFail(result)) {
        assert.assertArrayIncludes(result.error.missing, [
          "BLUESKY_APP_PASSWORD",
        ]);
      }
    },
  );

  bdd.it(
    "returns fail when Bluesky appPassword is present but identifier is missing",
    () => {
      const cfg = makeConfig({
        twitter: {
          clientId: undefined,
          clientSecret: undefined,
          redirectUri: "http://127.0.0.1:8080/callback",
          apiBaseUrl: undefined,
        },
        bluesky: {
          pdsHost: undefined,
          identifier: undefined,
          appPassword: "abcd-efgh-ijkl-mnop",
        },
      });
      const result = validateConfig(cfg);
      assert.assertEquals(results.isFail(result), true);
      if (results.isFail(result)) {
        assert.assertArrayIncludes(result.error.missing, [
          "BLUESKY_IDENTIFIER",
        ]);
      }
    },
  );

  bdd.it("error message lists all missing fields", () => {
    const cfg = makeConfig({
      twitter: {
        clientId: undefined,
        clientSecret: undefined,
        redirectUri: "http://127.0.0.1:8080/callback",
        apiBaseUrl: undefined,
      },
      bluesky: {
        pdsHost: undefined,
        identifier: undefined,
        appPassword: undefined,
      },
    });
    const result = validateConfig(cfg);
    assert.assertEquals(results.isFail(result), true);
    if (results.isFail(result)) {
      assert.assertStringIncludes(result.error.message, "TWITTER_CLIENT_ID");
    }
  });
});

// ── loadPostsConfig ───────────────────────────────────────────────────────────

bdd.describe("loadPostsConfig", () => {
  bdd.it("reads TWITTER_CLIENT_ID from environment", async () => {
    // Set a unique sentinel value unlikely to collide with real env
    runtime.env.set("TWITTER_CLIENT_ID", "__test_client_id__");
    try {
      const cfg = await loadPostsConfig();
      assert.assertEquals(cfg.twitter.clientId, "__test_client_id__");
    } finally {
      runtime.env.delete("TWITTER_CLIENT_ID");
    }
  });

  bdd.it(
    "applies default redirect URI when TWITTER_REDIRECT_URI is not set",
    async () => {
      runtime.env.delete("TWITTER_REDIRECT_URI");
      const cfg = await loadPostsConfig();
      assert.assertEquals(
        cfg.twitter.redirectUri,
        "http://localhost:3000/callback",
      );
    },
  );

  bdd.it("applies custom redirect URI from TWITTER_REDIRECT_URI", async () => {
    runtime.env.set(
      "TWITTER_REDIRECT_URI",
      "https://myapp.example.com/callback",
    );
    try {
      const cfg = await loadPostsConfig();
      assert.assertEquals(
        cfg.twitter.redirectUri,
        "https://myapp.example.com/callback",
      );
    } finally {
      runtime.env.delete("TWITTER_REDIRECT_URI");
    }
  });

  bdd.it("defaults ai.provider to anthropic", async () => {
    runtime.env.delete("AI_PROVIDER");
    const cfg = await loadPostsConfig();
    assert.assertEquals(cfg.ai.provider, "anthropic");
  });

  bdd.it("reads ANTHROPIC_API_KEY from environment", async () => {
    runtime.env.set("ANTHROPIC_API_KEY", "sk-ant-test");
    try {
      const cfg = await loadPostsConfig();
      assert.assertEquals(cfg.ai.apiKey, "sk-ant-test");
    } finally {
      runtime.env.delete("ANTHROPIC_API_KEY");
    }
  });

  bdd.it(
    "returns undefined tokenStorePath when POSTS_TOKEN_STORE_PATH is not set",
    async () => {
      runtime.env.delete("POSTS_TOKEN_STORE_PATH");
      const cfg = await loadPostsConfig();
      assert.assertEquals(cfg.tokenStorePath, "~/.eser/posts/tokens");
    },
  );

  bdd.it("reads POSTS_TOKEN_STORE_PATH from environment", async () => {
    runtime.env.set("POSTS_TOKEN_STORE_PATH", "/tmp/test-tokens.json");
    try {
      const cfg = await loadPostsConfig();
      assert.assertEquals(cfg.tokenStorePath, "/tmp/test-tokens.json");
    } finally {
      runtime.env.delete("POSTS_TOKEN_STORE_PATH");
    }
  });
});
