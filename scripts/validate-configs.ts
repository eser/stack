// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

import * as jsonc from "@std/jsonc";
import * as posix from "@std/path/posix";
// import * as walk from "@std/fs/walk";

import * as jsRuntime from "@eser/standards/js-runtime";

type DenoConfig = {
  name?: string;
  version?: string;
  workspace?: string[];
  imports: Record<string, string>;
  exports: Record<string, string>;
};

const tryLoadJsonFile = async (
  path: string,
): Promise<DenoConfig | undefined> => {
  try {
    const config = jsonc.parse(
      await jsRuntime.current.readTextFile(path),
      { allowTrailingComma: true },
    ) as DenoConfig;

    return config;
  } catch {
    return undefined;
  }
};

const main = async () => {
  const baseUrl = new URL(".", import.meta.url);
  const basePath = posix.join(
    posix.fromFileUrl(baseUrl.href),
    "..",
  );

  const rootConfig = await tryLoadJsonFile(`${basePath}/deno.jsonc`);
  if (rootConfig === undefined) {
    console.error("Could not load deno.jsonc");
    return;
  }

  for (const entry of rootConfig.workspace ?? []) {
    console.log(`Processing ${entry}...`);
    const modulePath = posix.join(basePath, entry);
    const moduleConfigFile = posix.join(modulePath, "deno.jsonc");

    const moduleConfig = await tryLoadJsonFile(moduleConfigFile);
    if (moduleConfig === undefined) {
      console.error(`  Could not load JSONC file`);
      continue;
    }

    if (moduleConfig.name === undefined) {
      console.error(`  Skipping this since module name is not specified`);
      continue;
    }

    // const moduleName = posix.basename(entry);
    // moduleConfig.name = `@eser/${moduleName}`;
    moduleConfig.version = rootConfig.version ?? "0.0.0";

    const contents = `${JSON.stringify(moduleConfig, null, 2)}\n`;
    await jsRuntime.current.writeTextFile(
      `${modulePath}/deno.jsonc`,
      contents,
    );
  }
};

main();
