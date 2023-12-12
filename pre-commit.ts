// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

import { posix } from "./deps.ts";
import * as runtime from "./standards/runtime.ts";
import metadata from "./metadata.json" assert { type: "json" };

const main = async () => {
  const baseUrl = new URL(".", import.meta.url);
  const basePath = posix.fromFileUrl(baseUrl.href);

  await runtime.writeTextFile(
    `${basePath}/version.txt`,
    `${metadata.version}\n`,
  );
};

main();
