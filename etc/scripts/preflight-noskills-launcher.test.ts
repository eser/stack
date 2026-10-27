// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

// etc/scripts belongs to no workspace package; the root package.json lists
// @eserstack/test-kit, so it resolves from the root node_modules.
import * as nodeTest from "node:test";
import * as assert from "@eserstack/test-kit/assert";
import * as launcherPreflight from "./preflight-noskills-launcher.ts";

type Entry = {
  readonly name: string;
  readonly mode: number;
  readonly content: string;
  readonly typeflag?: string;
  readonly prefix?: string;
};

/** Writes `value` into a header field as NUL-padded ASCII. */
const field = (header: Uint8Array, offset: number, value: string): void => {
  header.set(new TextEncoder().encode(value), offset);
};

/** A ustar archive of the entries, as npm and pnpm pack write one. */
const ustar = (entries: readonly Entry[]): Uint8Array => {
  const blocks: Uint8Array[] = [];

  for (const entry of entries) {
    const data = new TextEncoder().encode(entry.content);
    const header = new Uint8Array(512);

    field(header, 0, entry.name);
    field(header, 100, `${entry.mode.toString(8).padStart(6, "0")} \0`);
    field(header, 124, `${data.length.toString(8).padStart(11, "0")}\0`);
    field(header, 156, entry.typeflag ?? "0");
    field(header, 257, "ustar\0");
    field(header, 263, "00");
    field(header, 345, entry.prefix ?? "");
    blocks.push(header);

    const padded = new Uint8Array(Math.ceil(data.length / 512) * 512);
    padded.set(data);
    blocks.push(padded);
  }

  // Two zero blocks end the archive.
  blocks.push(new Uint8Array(1024));

  const archive = new Uint8Array(
    blocks.reduce((total, block) => total + block.length, 0),
  );
  let offset = 0;
  for (const block of blocks) {
    archive.set(block, offset);
    offset += block.length;
  }

  return archive;
};

nodeTest.test("tarEntryMode: the mode pnpm pack wrote for the binary", () => {
  const tar = ustar([
    { name: "package/package.json", mode: 0o644, content: "{}\n" },
    { name: "package/README.md", mode: 0o644, content: "x".repeat(700) },
    { name: "package/noskills", mode: 0o644, content: "binary" },
  ]);

  assert.assertEquals(
    launcherPreflight.tarEntryMode(tar, "package/noskills"),
    0o644,
  );
});

nodeTest.test("tarEntryMode: the executable mode npm pack keeps", () => {
  const tar = ustar([
    { name: "package/noskills", mode: 0o100755, content: "binary" },
  ]);

  assert.assertEquals(
    launcherPreflight.tarEntryMode(tar, "package/noskills"),
    0o755,
  );
});

nodeTest.test("tarEntryMode: joins the ustar prefix and the name", () => {
  const tar = ustar([
    { name: "noskills", prefix: "package", mode: 0o755, content: "binary" },
  ]);

  assert.assertEquals(
    launcherPreflight.tarEntryMode(tar, "package/noskills"),
    0o755,
  );
});

nodeTest.test("tarEntryMode: skips a pax header and a directory", () => {
  const tar = ustar([
    {
      name: "PaxHeader/noskills",
      mode: 0o644,
      content: "30 path=package/noskills\n",
      typeflag: "x",
    },
    { name: "package/noskills", mode: 0o755, content: "", typeflag: "5" },
    { name: "package/noskills", mode: 0o644, content: "binary" },
  ]);

  assert.assertEquals(
    launcherPreflight.tarEntryMode(tar, "package/noskills"),
    0o644,
  );
});

nodeTest.test("tarEntryMode: null when the archive has no such file", () => {
  const tar = ustar([
    { name: "package/package.json", mode: 0o644, content: "{}\n" },
  ]);

  assert.assertEquals(
    launcherPreflight.tarEntryMode(tar, "package/noskills"),
    null,
  );
  assert.assertEquals(
    launcherPreflight.tarEntryMode(new Uint8Array(0), "package/noskills"),
    null,
  );
});

nodeTest.test("tarEntryMode: fails on a size that is not octal", () => {
  const tar = ustar([
    { name: "package/noskills", mode: 0o644, content: "binary" },
  ]);
  tar.set(new TextEncoder().encode("9z\0"), 124);

  assert.assertThrows(
    () => launcherPreflight.tarEntryMode(tar, "package/other"),
    Error,
    "malformed size",
  );
});

nodeTest.test("formatMode: the permission bits as chmod takes them", () => {
  assert.assertEquals(launcherPreflight.formatMode(0o100644), "0644");
  assert.assertEquals(launcherPreflight.formatMode(0o755), "0755");
  assert.assertEquals(launcherPreflight.formatMode(0o7), "0007");
});
