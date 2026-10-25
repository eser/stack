// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

import * as nodeTest from "node:test";
import * as assert from "@eserstack/test-kit/assert";

import * as results from "@eserstack/primitives/results";
import * as shellExec from "@eserstack/shell/exec";
import * as standardsCrossRuntime from "@eserstack/standards/cross-runtime";

import * as update from "./update.ts";

const runtime = standardsCrossRuntime.runtime;

const BASE_URL = "https://github.com/eser/stack/releases/download/v1.2.3";
const ARCHIVE = "eser-v1.2.3-aarch64-apple-darwin.tar.gz";

const PAYLOAD = new TextEncoder().encode("archive-bytes");

// sha256 of the literal bytes above, taken from `shasum -a 256`, not from the
// code under test -- a digest computed by the same helper it verifies would
// agree with a broken helper.
const PAYLOAD_SHA256 =
  "0c982986710a026635603031674053ca851fc0e3ea760094a34f59b84f7f6da6";
const OTHER_SHA256 =
  "fbf22ec45a215e0d4711bfe2dde37292707edaf098c15bd5b204cb3ca72e6ca3";

const servingText =
  (body: string, status = 200): typeof fetch =>
  () =>
    Promise.resolve(new Response(body, { status }));

const failingFetch: typeof fetch = () =>
  Promise.reject(new TypeError("error sending request for url"));

const expectFail = (result: results.Result<void, string>): string => {
  if (results.isOk(result)) {
    throw new Error("expected verification to fail, but it succeeded");
  }

  return result.error;
};

// The defect this file exists for: verification used to be opportunistic. Both
// of the next two tests describe a download nobody checked, which the updater
// then wrote over the running binary.
nodeTest.test("an unreachable SHA256SUMS.txt aborts the update", async () => {
  const message = expectFail(
    await update.verifyArchiveChecksum(
      BASE_URL,
      ARCHIVE,
      PAYLOAD,
      failingFetch,
    ),
  );

  assert.assertStringIncludes(message, "SHA256SUMS.txt");
  assert.assertStringIncludes(message, "Refusing to install");
});

nodeTest.test("a non-200 SHA256SUMS.txt aborts the update", async () => {
  const message = expectFail(
    await update.verifyArchiveChecksum(
      BASE_URL,
      ARCHIVE,
      PAYLOAD,
      servingText("Not Found", 404),
    ),
  );

  assert.assertStringIncludes(message, "HTTP 404");
  assert.assertStringIncludes(message, "Refusing to install");
});

nodeTest.test(
  "a checksums file with no entry for the archive aborts the update",
  async () => {
    const sums = [
      `${OTHER_SHA256}  noskills-v1.2.3-aarch64-apple-darwin.tar.gz`,
      `${OTHER_SHA256}  laroux-v1.2.3-aarch64-apple-darwin.tar.gz`,
    ].join("\n");

    const message = expectFail(
      await update.verifyArchiveChecksum(
        BASE_URL,
        ARCHIVE,
        PAYLOAD,
        servingText(sums),
      ),
    );

    assert.assertStringIncludes(message, `No checksum listed for ${ARCHIVE}`);
  },
);

// The sharpest form of the substring bug: the decoy line carries the CORRECT
// hash of the payload, so a `line.includes(archiveName)` matcher would report
// "Checksum verified" for an archive that SHA256SUMS.txt never listed.
nodeTest.test("a substring match is not an entry", async () => {
  const sums = [
    `${PAYLOAD_SHA256}  ${ARCHIVE}.sig`,
    `${PAYLOAD_SHA256}  prefixed-${ARCHIVE}`,
  ].join("\n");

  assert.assertEquals(update.findExpectedChecksum(sums, ARCHIVE), undefined);

  const message = expectFail(
    await update.verifyArchiveChecksum(
      BASE_URL,
      ARCHIVE,
      PAYLOAD,
      servingText(sums),
    ),
  );

  assert.assertStringIncludes(message, `No checksum listed for ${ARCHIVE}`);
});

nodeTest.test("a mismatched checksum aborts the update", async () => {
  const sums = `${OTHER_SHA256}  ${ARCHIVE}\n`;

  const message = expectFail(
    await update.verifyArchiveChecksum(
      BASE_URL,
      ARCHIVE,
      PAYLOAD,
      servingText(sums),
    ),
  );

  assert.assertStringIncludes(message, "checksum verification failed");
  assert.assertStringIncludes(message, OTHER_SHA256);
  assert.assertStringIncludes(message, PAYLOAD_SHA256);
});

nodeTest.test("a correct checksum lets the update proceed", async () => {
  const sums = [
    `${OTHER_SHA256}  noskills-v1.2.3-aarch64-apple-darwin.tar.gz`,
    `${PAYLOAD_SHA256}  ${ARCHIVE}`,
    `${OTHER_SHA256}  ${ARCHIVE}.sig`,
  ].join("\n");

  const result = await update.verifyArchiveChecksum(
    BASE_URL,
    ARCHIVE,
    PAYLOAD,
    servingText(sums),
  );

  assert.assertEquals(results.isOk(result), true);
});

// GoReleaser writes `<hash>  <name>` with two spaces, but the file has arrived
// with CRLF endings and with a leading-blank first line before now. awk ignores
// leading whitespace; the trim here is what keeps this equivalent.
nodeTest.test("field matching survives surrounding whitespace", () => {
  const sums = `\r\n   ${PAYLOAD_SHA256}   ${ARCHIVE}  \r\n\r\n`;

  assert.assertEquals(
    update.findExpectedChecksum(sums, ARCHIVE),
    PAYLOAD_SHA256,
  );
});

// Paths reach the extractor as separate arguments. The Windows command used to
// be a PowerShell string with the paths spliced in, which dropped every
// backslash and let a quote in a path end the string.
const HOSTILE_DIR = `C:\\Users\\O'Brien "Ops"\\AppData\\Local\\Temp\\eser-update-$(whoami); rm -rf`;
const HOSTILE_ARCHIVE = `${HOSTILE_DIR}\\eser-v1.2.3-x86_64-pc-windows-msvc.zip`;

const extractCases: ReadonlyArray<{
  readonly name: string;
  readonly target: update.ExtractTarget;
  readonly expected: update.ExtractCommand;
}> = [
  {
    name: "Windows extraction runs System32 tar with the paths as arguments",
    target: { platform: "windows", systemRoot: "C:\\Windows" },
    expected: {
      cmd: "C:\\Windows\\System32\\tar.exe",
      args: ["-xf", HOSTILE_ARCHIVE, "-C", HOSTILE_DIR],
    },
  },
  {
    name: "Windows extraction tolerates a trailing separator in SystemRoot",
    target: { platform: "windows", systemRoot: "D:\\WINNT\\" },
    expected: {
      cmd: "D:\\WINNT\\System32\\tar.exe",
      args: ["-xf", HOSTILE_ARCHIVE, "-C", HOSTILE_DIR],
    },
  },
  {
    name: "Windows extraction falls back to tar.exe on PATH without SystemRoot",
    target: { platform: "windows", systemRoot: undefined },
    expected: {
      cmd: "tar.exe",
      args: ["-xf", HOSTILE_ARCHIVE, "-C", HOSTILE_DIR],
    },
  },
  {
    name: "Unix extraction runs tar with the paths as arguments",
    target: { platform: "unix" },
    expected: {
      cmd: "tar",
      args: ["-xzf", HOSTILE_ARCHIVE, "-C", HOSTILE_DIR],
    },
  },
];

for (const { name, target, expected } of extractCases) {
  nodeTest.test(name, () => {
    assert.assertEquals(
      update.extractArchiveCommand(HOSTILE_ARCHIVE, HOSTILE_DIR, target),
      expected,
    );
  });
}

// End to end on the host's tar: a directory name a shell would expand or split
// reaches tar unchanged, and nothing in it runs.
nodeTest.test(
  "Unix extraction unpacks into a directory with shell metacharacters",
  { skip: standardsCrossRuntime.getPlatform() === "windows" },
  async () => {
    const root = await runtime.fs.makeTempDir({ prefix: "eser-update-test-" });
    try {
      const staging = runtime.path.join(root, "staging");
      const dest = runtime.path.join(root, `it's "here" $(touch pwned); x`);
      await runtime.fs.mkdir(staging, { recursive: true });
      await runtime.fs.mkdir(dest, { recursive: true });
      await runtime.fs.writeTextFile(
        runtime.path.join(staging, "eser"),
        "binary",
      );
      const archive = runtime.path.join(root, "eser.tar.gz");
      await shellExec.exec`tar -czf ${archive} -C ${staging} eser`.spawn();

      const extract = update.extractArchiveCommand(archive, dest, {
        platform: "unix",
      });
      await new shellExec.CommandBuilder(extract.cmd, [...extract.args])
        .cwd(root)
        .spawn();

      assert.assertEquals(
        await runtime.fs.readTextFile(runtime.path.join(dest, "eser")),
        "binary",
      );
      assert.assertEquals(
        await runtime.fs.exists(runtime.path.join(root, "pwned")),
        false,
      );
    } finally {
      await runtime.fs.remove(root, { recursive: true });
    }
  },
);

nodeTest.test(
  "missingArchiveMessage points to npm and the install script",
  () => {
    const message = update.missingArchiveMessage(
      { command: "laroux", npmPackage: "laroux" },
      "v5.0.0",
      "laroux-v5.0.0-aarch64-apple-darwin.tar.gz",
      false,
    );

    assert.assertStringIncludes(
      message,
      "Release v5.0.0 has no laroux-v5.0.0-aarch64-apple-darwin.tar.gz",
    );
    assert.assertStringIncludes(message, "npm install -g laroux");
    assert.assertStringIncludes(
      message,
      "curl -fsSL https://raw.githubusercontent.com/eser/stack/main/etc/scripts/install.sh | sh -s laroux",
    );
    // The message names no checksum or download error.
    assert.assertFalse(/checksum|HTTP [0-9]/i.test(message));
  },
);

nodeTest.test(
  "missingArchiveMessage gives the PowerShell installer on Windows",
  () => {
    const message = update.missingArchiveMessage(
      { command: "eser" },
      "v5.0.0",
      "eser-v5.0.0-x86_64-pc-windows-msvc.zip",
      true,
    );

    assert.assertStringIncludes(message, "npm install -g eser");
    assert.assertStringIncludes(
      message,
      "irm https://raw.githubusercontent.com/eser/stack/main/etc/scripts/install.ps1",
    );
    assert.assertStringIncludes(message, "-Product eser");
  },
);
