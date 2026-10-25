// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

import * as nodeTest from "node:test";
import * as assert from "@eserstack/test-kit/assert";
import { runtime } from "@eserstack/standards/cross-runtime";
import * as launcher from "./npm-launcher.ts";

const installed = (packages: Record<string, string>) => (name: string) => {
  const manifest = packages[name];

  if (manifest === undefined) {
    throw new Error(`Cannot find module '${name}/package.json'`);
  }

  return manifest;
};

nodeTest.test("findBinary: the platform package's binary", () => {
  const lookup = launcher.findBinary(
    "darwin",
    "arm64",
    installed({
      "@eserstack/noskills-darwin-arm64":
        "/n/node_modules/@eserstack/noskills-darwin-arm64/package.json",
    }),
    () => true,
  );

  assert.assertEquals(lookup, {
    kind: "found",
    path: "/n/node_modules/@eserstack/noskills-darwin-arm64/noskills",
  });
});

nodeTest.test("findBinary: noskills.exe on Windows", () => {
  const lookup = launcher.findBinary(
    "win32",
    "x64",
    installed({ "@eserstack/noskills-win32-x64": "/w/pkg/package.json" }),
    () => true,
  );

  assert.assertEquals(lookup.kind, "found");
  assert.assertStringIncludes(
    lookup.kind === "found" ? lookup.path : "",
    "noskills.exe",
  );
});

nodeTest.test(
  "findBinary: an unsupported platform names the supported ones",
  () => {
    const lookup = launcher.findBinary(
      "win32",
      "arm64",
      installed({}),
      () => true,
    );

    assert.assertEquals(lookup.kind, "missing");
    assert.assertStringIncludes(
      lookup.kind === "missing" ? lookup.message : "",
      "no prebuilt binary for win32-arm64. The npm package ships one for darwin-arm64, darwin-x64, linux-arm64, linux-x64, win32-x64",
    );
  },
);

nodeTest.test(
  "findBinary: a skipped optional dependency says how to fix it",
  () => {
    const lookup = launcher.findBinary(
      "linux",
      "x64",
      installed({}),
      () => true,
    );

    assert.assertEquals(lookup.kind, "missing");
    assert.assertStringIncludes(
      lookup.kind === "missing" ? lookup.message : "",
      "@eserstack/noskills-linux-x64 is not installed",
    );
  },
);

nodeTest.test("findBinary: a package without its binary", () => {
  const lookup = launcher.findBinary(
    "linux",
    "arm64",
    installed({ "@eserstack/noskills-linux-arm64": "/l/package.json" }),
    () => false,
  );

  assert.assertEquals(lookup.kind, "missing");
  assert.assertStringIncludes(
    lookup.kind === "missing" ? lookup.message : "",
    "has no binary at",
  );
});

nodeTest.test(
  "PLATFORM_PACKAGES matches the package's optionalDependencies",
  async () => {
    const manifest = JSON.parse(
      await runtime.fs.readTextFile(
        runtime.path.join(import.meta.dirname ?? ".", "..", "package.json"),
      ),
    ) as { optionalDependencies: Record<string, string> };

    const declared = Object.keys(manifest.optionalDependencies)
      .filter((name) => name.startsWith("@eserstack/noskills-"))
      .sort();

    assert.assertEquals(
      Object.values(launcher.PLATFORM_PACKAGES).sort(),
      declared,
    );
  },
);

nodeTest.test("exitCodeOf: the binary's code, or 128 + the signal", () => {
  assert.assertEquals(launcher.exitCodeOf(0, null), 0);
  assert.assertEquals(launcher.exitCodeOf(2, null), 2);
  assert.assertEquals(launcher.exitCodeOf(null, "SIGINT"), 130);
  assert.assertEquals(launcher.exitCodeOf(null, "SIGTERM"), 143);
  assert.assertEquals(launcher.exitCodeOf(null, "SIGUSR2"), 1);
});
