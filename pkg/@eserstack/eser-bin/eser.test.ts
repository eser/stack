// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

import * as nodeTest from "node:test";
import * as assert from "@eserstack/test-kit/assert";
import { runtime } from "@eserstack/standards/cross-runtime";
import * as eser from "./eser.ts";
import * as launcher from "./launcher.ts";

const here = import.meta.dirname ?? ".";

nodeTest.test(
  "launcher.ts is the same file as the noskills launcher's",
  async () => {
    const [mine, noskills] = await Promise.all([
      runtime.fs.readTextFile(runtime.path.join(here, "launcher.ts")),
      runtime.fs.readTextFile(
        runtime.path.join(here, "..", "noskills-bin", "launcher.ts"),
      ),
    ]);

    assert.assertEquals(
      mine,
      noskills,
      "pkg/@eserstack/eser-bin/launcher.ts and noskills-bin/launcher.ts must stay equal; change both",
    );
  },
);

nodeTest.test(
  "ESER.platformPackages matches the package's optionalDependencies",
  async () => {
    const manifest = JSON.parse(
      await runtime.fs.readTextFile(runtime.path.join(here, "package.json")),
    ) as { optionalDependencies: Record<string, string> };

    assert.assertEquals(
      Object.values(eser.ESER.platformPackages).sort(),
      Object.keys(manifest.optionalDependencies).sort(),
    );
  },
);

nodeTest.test("findBinary: eser.exe on Windows", () => {
  const lookup = launcher.findBinary(
    eser.ESER,
    "win32",
    "x64",
    () => "/w/node_modules/@eserstack/eser-win32-x64/package.json",
    () => true,
  );

  assert.assertEquals(lookup.kind, "found");
  assert.assertStringIncludes(
    lookup.kind === "found" ? lookup.path : "",
    "eser.exe",
  );
});

nodeTest.test(
  "findBinary: an unsupported platform names the supported ones",
  () => {
    const lookup = launcher.findBinary(
      eser.ESER,
      "freebsd",
      "x64",
      () => {
        throw new Error("not installed");
      },
      () => true,
    );

    assert.assertEquals(lookup.kind, "missing");
    const message = lookup.kind === "missing" ? lookup.message : "";
    assert.assertStringIncludes(
      message,
      "eser: no prebuilt binary for freebsd-x64. The npm package ships one for darwin-arm64, darwin-x64, linux-arm64, linux-x64, win32-x64",
    );
    assert.assertStringIncludes(message, "build cmd/eser");
  },
);

nodeTest.test(
  "binDirectories: every node_modules/.bin above, nearest first",
  () => {
    const existing = new Set([
      "/p/node_modules/eser/node_modules/.bin",
      "/p/node_modules/.bin",
      "/node_modules/.bin",
    ]);

    assert.assertEquals(
      eser.binDirectories("/p/node_modules/eser/dist", (dir) =>
        existing.has(dir),
      ),
      [
        "/p/node_modules/eser/node_modules/.bin",
        "/p/node_modules/.bin",
        "/node_modules/.bin",
      ],
    );
  },
);

nodeTest.test("pluginPath: the user's directories come first", () => {
  assert.assertEquals(
    eser.pluginPath("/mine", ["/a/.bin", "/b/.bin"], ":"),
    "/mine:/a/.bin:/b/.bin",
  );
  assert.assertEquals(eser.pluginPath(undefined, ["/a/.bin"], ";"), "/a/.bin");
  assert.assertEquals(eser.pluginPath("", [], ":"), "");
});
