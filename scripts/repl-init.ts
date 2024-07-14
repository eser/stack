// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

import * as configFile from "@eser/config/file";
// import * as jsRuntime from "@eser/standards/js-runtime";
import * as mod from "./pkg/mod.ts";

// TODO(@eser) get dependency injection container entries instead of this
await (async () => {
  // const env = await config.dotenv.load();
  // const kv = await jsRuntime.current.openKv();

  const denoConfigLoader = await configFile.load(".", [
    "deno.jsonc",
    "deno.json",
  ]);
  const denoConfig = denoConfigLoader.content;

  const variables: Record<string, unknown> = {
    ...mod,
    denoConfig,
    // env,
    // kv,
  };

  const vars = () => {
    console.log(
      "\n%cpredefined variables\n--------------------",
      "font-weight: bold",
    );
    console.log(
      "- " +
        Object.keys(variables).map((x, i) =>
          x.padEnd(20, " ") + (i % 3 === 2 ? "\n" : "")
        ).join("- "),
    );
    console.log();
  };

  variables["vars"] = vars;

  for (const [key, value] of Object.entries(variables)) {
    // @ts-ignore globalThis type check
    globalThis[key] = value;
  }

  console.log(
    `%ccool REPL, version ${denoConfig.version ?? "unknown"}`,
    "color: #00ff00",
  );

  vars();
})();
