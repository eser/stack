// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

import * as nodeTest from "node:test";
import * as assert from "@eserstack/test-kit/assert";
import * as crossRuntime from "@eserstack/standards/cross-runtime";
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

/** A file system whose binary has `mode`, recording each chmod. */
const modeAccess = (
  mode: number,
  chmod: (file: string, mode: number) => void = () => {},
) => {
  const calls: { file: string; mode: number }[] = [];
  const access: launcher.ModeAccess = {
    isExecutable: () => (mode & 0o100) !== 0,
    mode: () => mode,
    chmod: (file, next) => {
      calls.push({ file, mode: next });
      chmod(file, next);
    },
  };

  return { access, calls };
};

nodeTest.test(
  "ensureExecutable: adds the bits npm pack keeps to a 0644 binary",
  () => {
    const { access, calls } = modeAccess(0o100644);

    assert.assertEquals(
      launcher.ensureExecutable("/n/noskills", "linux", access),
      { kind: "ready" },
    );
    assert.assertEquals(calls, [{ file: "/n/noskills", mode: 0o100755 }]);
  },
);

nodeTest.test("ensureExecutable: leaves an executable binary alone", () => {
  const { access, calls } = modeAccess(0o100755);

  assert.assertEquals(
    launcher.ensureExecutable("/n/noskills", "darwin", access),
    { kind: "ready" },
  );
  assert.assertEquals(calls, []);
});

nodeTest.test("ensureExecutable: Windows has no mode to set", () => {
  const { access, calls } = modeAccess(0o100644);

  assert.assertEquals(
    launcher.ensureExecutable("C:\\n\\noskills.exe", "win32", access),
    { kind: "ready" },
  );
  assert.assertEquals(calls, []);
});

nodeTest.test(
  "ensureExecutable: a read-only install names the binary and the fix",
  () => {
    const { access } = modeAccess(0o100644, () => {
      throw Object.assign(new Error("EPERM: operation not permitted"), {
        code: "EPERM",
      });
    });

    const result = launcher.ensureExecutable(
      "/usr/lib/node_modules/@eserstack/noskills-linux-x64/noskills",
      "linux",
      access,
    );

    assert.assertEquals(result.kind, "failed");
    const message = result.kind === "failed" ? result.message : "";
    assert.assertStringIncludes(
      message,
      "/usr/lib/node_modules/@eserstack/noskills-linux-x64/noskills is not executable",
    );
    assert.assertStringIncludes(message, "EPERM");
    assert.assertStringIncludes(
      message,
      "chmod +x /usr/lib/node_modules/@eserstack/noskills-linux-x64/noskills",
    );
  },
);

nodeTest.test(
  "main: runs a platform binary that pnpm pack left at mode 0644",
  { skip: crossRuntime.getPlatform() === "windows" },
  async () => {
    const root = await runtime.fs.makeTempDir({ prefix: "noskills_launcher_" });

    try {
      // One package per platform, so the host's is there whatever it is.
      const binaries = await Promise.all(
        Object.values(launcher.PLATFORM_PACKAGES).map(async (name) => {
          const dir = runtime.path.join(
            root,
            "node_modules",
            ...name.split("/"),
          );
          const binary = runtime.path.join(dir, "noskills");

          await runtime.fs.mkdir(dir, { recursive: true });
          await runtime.fs.writeTextFile(
            runtime.path.join(dir, "package.json"),
            `${JSON.stringify({ name, version: "0.0.0" })}\n`,
          );
          await runtime.fs.writeTextFile(binary, '#!/bin/sh\necho "ran $*"\n');
          await runtime.fs.chmod(binary, 0o644);

          return binary;
        }),
      );

      // The launcher next to the fixture node_modules, as dist/noskills.js
      // sits in an installed noskills package.
      await runtime.fs.writeTextFile(
        runtime.path.join(root, "package.json"),
        '{"type":"module"}\n',
      );
      await runtime.fs.copyFile(
        runtime.path.join(import.meta.dirname ?? ".", "npm-launcher.ts"),
        runtime.path.join(root, "npm-launcher.ts"),
      );
      await runtime.fs.writeTextFile(
        runtime.path.join(root, "entry.ts"),
        'import { main } from "./npm-launcher.ts";\nmain();\n',
      );

      const result = await runtime.exec.spawn(
        runtime.process.execPath(),
        [runtime.path.join(root, "entry.ts"), "--help"],
        { cwd: root, stdout: "piped", stderr: "piped" },
      );
      const decoder = new TextDecoder();

      assert.assertEquals(decoder.decode(result.stderr), "");
      assert.assertEquals(decoder.decode(result.stdout), "ran --help\n");
      assert.assertEquals(result.code, 0);

      const modes = await Promise.all(
        binaries.map(
          async (binary) => ((await runtime.fs.stat(binary)).mode ?? 0) & 0o777,
        ),
      );
      assert.assertEquals(
        modes.filter((mode) => mode === 0o755).length,
        1,
        "the launcher sets the mode of the host's binary only",
      );
    } finally {
      await runtime.fs.remove(root, { recursive: true });
    }
  },
);
