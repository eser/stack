// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

import * as nodeTest from "node:test";
import * as assert from "@eserstack/test-kit/assert";
import { runtime } from "@eserstack/standards/cross-runtime";
import * as fileTokenStore from "./file-token-store.ts";

const tokens = {
  accessToken: "DUMMY-ACCESS",
  refreshToken: "DUMMY-REFRESH",
  expiresAt: new Date(0),
};

const modeOf = async (p: string): Promise<number> =>
  ((await Deno.stat(p)).mode ?? 0) & 0o777;

nodeTest.test(
  "token store is written owner-only and repairs a world-readable file",
  { skip: Deno.build.os === "windows" },
  async () => {
    const root = await Deno.makeTempDir();
    try {
      const dir = `${root}/.eser/posts`;
      const file = `${dir}/tokens.json`;
      const store = new fileTokenStore.FileTokenStore(file);

      await store.save("twitter", tokens);
      assert.assertEquals(await modeOf(dir), 0o700);
      assert.assertEquals(await modeOf(file), 0o600);

      // A store left by an earlier version at default permissions.
      await Deno.chmod(dir, 0o755);
      await Deno.chmod(file, 0o644);
      await store.save("bluesky", tokens);
      assert.assertEquals(await modeOf(dir), 0o700);
      assert.assertEquals(await modeOf(file), 0o600);

      const loaded = await store.load("twitter");
      assert.assertEquals(loaded?.accessToken, "DUMMY-ACCESS");

      // No temp files are left beside the store.
      const names = [];
      for await (const e of Deno.readDir(dir)) names.push(e.name);
      assert.assertEquals(names, ["tokens.json"]);
    } finally {
      await Deno.remove(root, { recursive: true });
    }
  },
);

nodeTest.test(
  "a corrupt token file fails with its path and without its content",
  async () => {
    const { fs, path } = runtime;
    const root = await fs.makeTempDir();
    try {
      const file = path.join(root, "tokens.json");
      await fs.writeTextFile(file, '{"twitter":{"accessToken":"SECRET-TOKEN"');
      const store = new fileTokenStore.FileTokenStore(file);

      const error = await assert.assertRejects(() => store.load("twitter"));

      assert.assertInstanceOf(error, Error);
      assert.assertStringIncludes(error.message, file);
      assert.assertEquals(error.message.includes("SECRET-TOKEN"), false);
    } finally {
      await fs.remove(root, { recursive: true });
    }
  },
);
