// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

import { assertEquals } from "@std/assert";
import { FileTokenStore } from "./file-token-store.ts";

const tokens = {
  accessToken: "DUMMY-ACCESS",
  refreshToken: "DUMMY-REFRESH",
  expiresAt: new Date(0),
};

const modeOf = async (p: string): Promise<number> =>
  ((await Deno.stat(p)).mode ?? 0) & 0o777;

Deno.test({
  name: "token store is written owner-only and repairs a world-readable file",
  ignore: Deno.build.os === "windows",
  fn: async () => {
    const root = await Deno.makeTempDir();
    try {
      const dir = `${root}/.eser/posts`;
      const file = `${dir}/tokens.json`;
      const store = new FileTokenStore(file);

      await store.save("twitter", tokens);
      assertEquals(await modeOf(dir), 0o700);
      assertEquals(await modeOf(file), 0o600);

      // A store left by an earlier version at default permissions.
      await Deno.chmod(dir, 0o755);
      await Deno.chmod(file, 0o644);
      await store.save("bluesky", tokens);
      assertEquals(await modeOf(dir), 0o700);
      assertEquals(await modeOf(file), 0o600);

      const loaded = await store.load("twitter");
      assertEquals(loaded?.accessToken, "DUMMY-ACCESS");

      // No temp files are left beside the store.
      const names = [];
      for await (const e of Deno.readDir(dir)) names.push(e.name);
      assertEquals(names, ["tokens.json"]);
    } finally {
      await Deno.remove(root, { recursive: true });
    }
  },
});
