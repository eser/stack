import { assertEquals } from "$std/assert/mod.ts";
import { fromFileUrl, join, toFileUrl } from "../server/deps.ts";
import { locateDenoConfig } from "../server/config.ts";
import { EsbuildBuilder } from "./esbuild.ts";

const denoJson = await locateDenoConfig(join(
  fromFileUrl(import.meta.url),
  "..",
  "..",
  "..",
));

const mainEntry = toFileUrl(join(
  fromFileUrl(import.meta.url),
  "..",
  "..",
  "runtime",
  "entrypoints",
  "client.ts",
)).href;

Deno.test("esbuild snapshot with cwd=Deno.cwd()", async () => {
  const builder = new EsbuildBuilder({
    absoluteWorkingDir: Deno.cwd(),
    buildID: "foo",
    configPath: denoJson!,
    dev: false,
    entrypoints: {
      main: mainEntry,
    },
    jsx: "react",
    target: "es2020",
  });

  const snapshot = await builder.build();
  assertEquals(snapshot.paths, ["main.js", "metafile.json"]);
});

Deno.test({
  name: "esbuild snapshot with cwd=/",
  ignore: Deno.build.os === "windows",
  fn: async () => {
    const builder = new EsbuildBuilder({
      absoluteWorkingDir: "/",
      buildID: "foo",
      configPath: denoJson!,
      dev: false,
      entrypoints: {
        main: mainEntry,
      },
      jsx: "react",
      target: "es2020",
    });

    const snapshot = await builder.build();
    assertEquals(snapshot.paths, ["main.js", "metafile.json"]);
  },
});
