// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

import * as bdd from "@std/testing/bdd";
import * as assert from "@std/assert";
import * as results from "@eserstack/primitives/results";
import { runtime } from "@eserstack/standards/cross-runtime";
import {
  loadPostsConfig,
  requireServiceUrl,
  requireTokenStorePath,
} from "./config.ts";
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
        "http://127.0.0.1:8080/callback",
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
      assert.assertEquals(cfg.tokenStorePath, undefined);
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

bdd.describe("credential routing keys", () => {
  const ROUTING_KEYS = [
    "TWITTER_API_BASE_URL",
    "BLUESKY_PDS_HOST",
    "POSTS_TOKEN_STORE_PATH",
  ];

  bdd.it(
    "ignores routing keys set by a .env in the working directory",
    async () => {
      const dir = await Deno.makeTempDir();
      const previous = Deno.cwd();
      const saved = ROUTING_KEYS.map((k) => [k, runtime.env.get(k)] as const);
      try {
        for (const k of ROUTING_KEYS) runtime.env.delete(k);
        await Deno.writeTextFile(
          `${dir}/.env`,
          [
            "TWITTER_CLIENT_ID=from-dotenv",
            "TWITTER_API_BASE_URL=http://attacker.invalid/x",
            "BLUESKY_PDS_HOST=http://attacker.invalid/pds",
            "POSTS_TOKEN_STORE_PATH=./leaked/tokens.json",
          ].join("\n") + "\n",
        );
        Deno.chdir(dir);
        const cfg = await loadPostsConfig();
        // Non-routing keys still come from .env.
        assert.assertEquals(cfg.twitter.clientId, "from-dotenv");
        assert.assertEquals(cfg.twitter.apiBaseUrl, undefined);
        assert.assertEquals(cfg.bluesky.pdsHost, undefined);
        assert.assertEquals(cfg.tokenStorePath, undefined);
      } finally {
        Deno.chdir(previous);
        for (const [k, v] of saved) {
          if (v === undefined) runtime.env.delete(k);
          else runtime.env.set(k, v);
        }
        await Deno.remove(dir, { recursive: true });
      }
    },
  );

  bdd.it("accepts https and loopback http service URLs only", () => {
    assert.assertEquals(
      requireServiceUrl("X", "https://bsky.social"),
      "https://bsky.social",
    );
    assert.assertEquals(
      requireServiceUrl("X", "http://127.0.0.1:1234/mock"),
      "http://127.0.0.1:1234/mock",
    );
    assert.assertThrows(() =>
      requireServiceUrl("X", "http://attacker.invalid")
    );
    assert.assertThrows(() => requireServiceUrl("X", "not a url"));
  });

  bdd.it("expands ~/ and rejects relative token store paths", () => {
    const expanded = requireTokenStorePath("~/.eser/posts/tokens.json");
    assert.assertEquals(runtime.path.isAbsolute(expanded ?? ""), true);
    assert.assertEquals(expanded?.includes("~"), false);
    assert.assertThrows(() => requireTokenStorePath("./leaked/tokens.json"));
  });
});
