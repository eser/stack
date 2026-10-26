// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

import * as assert from "@eserstack/test-kit/assert";
import * as bdd from "node:test";
import { runtime } from "@eserstack/standards/cross-runtime";
import * as tarModule from "./tar.ts";
import * as testing from "./testing.ts";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

type ArchiveEntry = testing.TarFixtureEntry;

/** Builds an uncompressed tar archive from `entries`. */
const tarball = (entries: readonly ArchiveEntry[]): Uint8Array =>
  testing.tarArchive(entries);

/** Gzips the given byte arrays, one after another, into one stream. */
const gzip = testing.gzipStream;

/**
 * Builds a gzipped tarball in memory, in the shape the GitHub provider
 * streams, so each test states its archive layout next to its assertions.
 */
const gzippedTarball = testing.gzippedTarball;

/**
 * Serves the bytes of `source` and then stays open, like a download that is
 * still in progress, and records whether extraction cancelled it.
 */
const openDownload = (
  source: ReadableStream<Uint8Array>,
): { stream: ReadableStream<Uint8Array>; isCancelled: () => boolean } => {
  const reader = source.getReader();
  let cancelled = false;

  const stream = new ReadableStream<Uint8Array>({
    async pull(controller) {
      const { done, value } = await reader.read();
      if (done) {
        // More bytes never arrive; only a cancel ends this stream.
        return await new Promise<void>(() => {});
      }

      controller.enqueue(value);
    },
    cancel() {
      cancelled = true;
    },
  });

  return { stream, isCancelled: () => cancelled };
};

/** Lets the stream pipes settle after extraction returns. */
const settle = (): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, 0));

/** Lists the files under `dir`, relative to it, in sorted order. */
const listFiles = async (dir: string): Promise<string[]> => {
  const files: string[] = [];
  for await (const entry of runtime.fs.walk(dir, { includeDirs: false })) {
    files.push(runtime.path.relative(dir, entry.path));
  }

  return files.sort();
};

const withTempDir = async (
  fn: (dir: string) => Promise<void>,
): Promise<void> => {
  const dir = await runtime.fs.makeTempDir({ prefix: "kit-tar-test-" });
  try {
    await fn(dir);
  } finally {
    await runtime.fs.remove(dir, { recursive: true });
  }
};

const threeFiles: readonly ArchiveEntry[] = [
  { type: "file", path: "a.txt", content: "a\n" },
  { type: "file", path: "b.txt", content: "b\n" },
  { type: "file", path: "c.txt", content: "c\n" },
];

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

bdd.describe("extractTarball", () => {
  bdd.it("strips the leading path components", async () => {
    await withTempDir(async (dir) => {
      const archive = gzippedTarball([
        { type: "file", path: "repo-main/hello.txt", content: "hello\n" },
        { type: "file", path: "repo-main/src/mod.ts", content: "export {};\n" },
      ]);

      await tarModule.extractTarball(archive, dir, { stripComponents: 1 });

      assert.assertEquals(await listFiles(dir), [
        "hello.txt",
        runtime.path.join("src", "mod.ts"),
      ]);
      assert.assertEquals(
        await runtime.fs.readTextFile(runtime.path.join(dir, "hello.txt")),
        "hello\n",
      );
    });
  });

  for (const subpath of ["include", "/include/"]) {
    bdd.it(`extracts only the entries under subpath "${subpath}"`, async () => {
      await withTempDir(async (dir) => {
        const archive = gzippedTarball([
          {
            type: "file",
            path: "repo-main/include/wanted.txt",
            content: "wanted\n",
          },
          {
            type: "file",
            path: "repo-main/exclude/unwanted.txt",
            content: "unwanted\n",
          },
          {
            // Shares the subpath as a string prefix but is a sibling directory
            type: "file",
            path: "repo-main/include-extra/sibling.txt",
            content: "sibling\n",
          },
        ]);

        await tarModule.extractTarball(archive, dir, {
          stripComponents: 1,
          subpath,
        });

        assert.assertEquals(await listFiles(dir), ["wanted.txt"]);
        assert.assertEquals(
          await runtime.fs.readTextFile(runtime.path.join(dir, "wanted.txt")),
          "wanted\n",
        );
      });
    });
  }

  for (const subpath of ["", "/", "."]) {
    bdd.it(`extracts everything for root subpath "${subpath}"`, async () => {
      await withTempDir(async (dir) => {
        const archive = gzippedTarball([
          { type: "file", path: "repo-main/.github/ci.yml", content: "ci\n" },
          { type: "file", path: "repo-main/src/mod.ts", content: "mod\n" },
        ]);

        await tarModule.extractTarball(archive, dir, {
          stripComponents: 1,
          subpath,
        });

        assert.assertEquals(await listFiles(dir), [
          runtime.path.join(".github", "ci.yml"),
          runtime.path.join("src", "mod.ts"),
        ]);
      });
    });
  }

  bdd.it("skips entries that escape the target directory", async () => {
    await withTempDir(async (dir) => {
      // The target sits two levels below the temp dir, so a traversal entry
      // that slipped through would still land inside it and show up below.
      const target = runtime.path.join(dir, "nested", "target");
      const archive = gzippedTarball([
        { type: "file", path: "../../etc/passwd", content: "root:x:0:0\n" },
        { type: "file", path: "/abs/escape.txt", content: "escape\n" },
        { type: "file", path: "ok.txt", content: "ok\n" },
      ]);

      await tarModule.extractTarball(archive, target);

      assert.assertEquals(await listFiles(dir), [
        runtime.path.join("nested", "target", "ok.txt"),
      ]);
    });
  });

  bdd.it("skips symlink entries", async () => {
    await withTempDir(async (dir) => {
      const archive = gzippedTarball([
        { type: "file", path: "real.txt", content: "real\n" },
        { type: "symlink", path: "link.txt", linkname: "real.txt" },
        { type: "symlink", path: "escape", linkname: "../../outside" },
      ]);

      await tarModule.extractTarball(archive, dir);

      assert.assertEquals(await listFiles(dir), ["real.txt"]);
      await assert.assertRejects(() =>
        runtime.fs.lstat(runtime.path.join(dir, "link.txt")),
      );
      await assert.assertRejects(() =>
        runtime.fs.lstat(runtime.path.join(dir, "escape")),
      );
    });
  });

  bdd.it("skips pax metadata entries instead of writing them", async () => {
    await withTempDir(async (dir) => {
      // A pax record starts with its own length in bytes, which the Go tar
      // reader checks; GitHub writes "52 comment=<commit sha>\n".
      const archive = gzip(
        tarball([
          {
            type: "raw",
            path: "pax_global_header",
            typeflag: "g",
            content: "20 comment=0123abcd\n",
          },
          { type: "file", path: "real.txt", content: "real\n" },
        ]),
      );

      await tarModule.extractTarball(archive, dir);

      assert.assertEquals(await listFiles(dir), ["real.txt"]);
    });
  });

  bdd.it("rejects a stream that is not gzip", async () => {
    await withTempDir(async (dir) => {
      await assert.assertRejects(
        () =>
          tarModule.extractTarball(
            testing.readableStreamFrom([new TextEncoder().encode("not gzip")]),
            dir,
          ),
        Error,
        "extract tarball: decompress",
      );
    });
  });

  bdd.it("rejects an archive cut off inside an entry", async () => {
    await withTempDir(async (dir) => {
      const tarBytes = tarball([
        { type: "file", path: "a.txt", content: "a".repeat(2048) },
      ]);

      await assert.assertRejects(
        () => tarModule.extractTarball(gzip(tarBytes.subarray(0, 1024)), dir),
        Error,
        "extract tarball",
      );
      assert.assertEquals(await listFiles(dir), []);
    });
  });

  bdd.describe("maxBytes", () => {
    bdd.it("fails on an archive that expands past the limit", async () => {
      await withTempDir(async (dir) => {
        // 1 MiB of zeros gzips to about 1 KiB: a small decompression bomb.
        const source = openDownload(
          gzippedTarball([
            { type: "file", path: "bomb.bin", content: "\0".repeat(1 << 20) },
          ]),
        );

        const error = await assert.assertRejects(
          () =>
            tarModule.extractTarball(source.stream, dir, {
              maxBytes: 64 * 1024,
            }),
          tarModule.TarballLimitError,
          "decompressed size exceeds maxBytes (65536 bytes)",
        );

        assert.assertEquals(error.limit, "maxBytes");
        assert.assertEquals(error.max, 64 * 1024);
        assert.assertEquals(await listFiles(dir), []);
        await settle();
        assert.assertEquals(source.isCancelled(), true);
      });
    });

    bdd.it("extracts an archive of exactly maxBytes", async () => {
      await withTempDir(async (dir) => {
        const tarBytes = tarball(threeFiles);
        const archive = gzip(tarBytes);

        await tarModule.extractTarball(archive, dir, {
          maxBytes: tarBytes.length,
        });

        assert.assertEquals(await listFiles(dir), ["a.txt", "b.txt", "c.txt"]);
      });
    });

    bdd.it("fails one byte under the archive size", async () => {
      await withTempDir(async (dir) => {
        const tarBytes = tarball(threeFiles);
        const archive = gzip(tarBytes);

        await assert.assertRejects(
          () =>
            tarModule.extractTarball(archive, dir, {
              maxBytes: tarBytes.length - 1,
            }),
          tarModule.TarballLimitError,
          "maxBytes",
        );
      });
    });
  });

  bdd.describe("maxEntries", () => {
    bdd.it("fails before writing the entry past the limit", async () => {
      await withTempDir(async (dir) => {
        const source = openDownload(gzippedTarball(threeFiles));

        const error = await assert.assertRejects(
          () => tarModule.extractTarball(source.stream, dir, { maxEntries: 2 }),
          tarModule.TarballLimitError,
          "entry count exceeds maxEntries (2)",
        );

        assert.assertEquals(error.limit, "maxEntries");
        assert.assertEquals(error.max, 2);
        assert.assertEquals(await listFiles(dir), ["a.txt", "b.txt"]);
        await settle();
        assert.assertEquals(source.isCancelled(), true);
      });
    });

    bdd.it("counts entries that are skipped", async () => {
      await withTempDir(async (dir) => {
        const archive = gzippedTarball([
          { type: "file", path: "repo-main/other/x.txt", content: "x\n" },
          { type: "file", path: "repo-main/other/y.txt", content: "y\n" },
          { type: "file", path: "repo-main/wanted/z.txt", content: "z\n" },
        ]);

        await assert.assertRejects(
          () =>
            tarModule.extractTarball(archive, dir, {
              stripComponents: 1,
              subpath: "wanted",
              maxEntries: 2,
            }),
          tarModule.TarballLimitError,
          "maxEntries",
        );
      });
    });

    bdd.it("extracts an archive of exactly maxEntries", async () => {
      await withTempDir(async (dir) => {
        await tarModule.extractTarball(gzippedTarball(threeFiles), dir, {
          maxEntries: 3,
        });

        assert.assertEquals(await listFiles(dir), ["a.txt", "b.txt", "c.txt"]);
      });
    });
  });

  bdd.describe("limit validation", () => {
    const invalidLimits: ReadonlyArray<{
      readonly name: string;
      readonly options: tarModule.ExtractOptions;
    }> = [
      { name: "a zero maxBytes", options: { maxBytes: 0 } },
      { name: "a fractional maxBytes", options: { maxBytes: 1.5 } },
      { name: "a NaN maxBytes", options: { maxBytes: Number.NaN } },
      { name: "a negative maxEntries", options: { maxEntries: -1 } },
      {
        name: "an infinite maxEntries",
        options: { maxEntries: Number.POSITIVE_INFINITY },
      },
    ];

    for (const { name, options } of invalidLimits) {
      bdd.it(`rejects ${name}`, async () => {
        await assert.assertRejects(
          () =>
            tarModule.extractTarball(
              testing.readableStreamFrom([]),
              "unused",
              options,
            ),
          RangeError,
          "expected a positive integer",
        );
      });
    }

    bdd.it("cancels the source stream when it rejects a limit", async () => {
      let cancelled = false;
      const source = new ReadableStream<Uint8Array>({
        cancel() {
          cancelled = true;
        },
      });

      await assert.assertRejects(
        () => tarModule.extractTarball(source, "unused", { maxEntries: 0 }),
        RangeError,
      );
      assert.assertEquals(cancelled, true);
    });
  });
});
