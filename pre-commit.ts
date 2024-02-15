// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

import { jsonc, posix } from "./deps.ts";
import * as runtime from "./standards/runtime.ts";

const main = async () => {
  const baseUrl = new URL(".", import.meta.url);
  const basePath = posix.fromFileUrl(baseUrl.href);

  const config = jsonc.parse(
    await runtime.current.readTextFile(`${basePath}/deno.jsonc`),
  ) as { version?: string };

  await runtime.current.writeTextFile(
    `${basePath}/version.txt`,
    `${config.version ?? "0.0.0"}\n`,
  );
};

main();
