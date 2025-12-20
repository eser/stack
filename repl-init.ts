// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

// Display formatting constants
const COLUMN_WIDTH = 20;
const COLUMNS_PER_ROW = 3;

// Note: These relative paths are designed to be run from the project root
import * as pkg from "./pkg/@eser/codebase/package/mod.ts";
import * as mod from "./pkg/mod.ts";

// TODO(@eser) get dependency injection container entries instead of this
await (async () => {
  // const env = await config.dotenv.load();

  // Load package configuration from current directory
  const packageConfig = await pkg.tryLoad({ baseDir: "." });

  const variables: Record<string, unknown> = {
    ...mod,
    packageConfig,
    // env,
  };

  const vars = () => {
    console.log(
      "\n%cpredefined variables\n--------------------",
      "font-weight: bold",
    );
    console.log(
      `- ${
        Object.keys(variables).map((x, i) =>
          `${x.padEnd(COLUMN_WIDTH, " ")}${
            i % COLUMNS_PER_ROW === COLUMNS_PER_ROW - 1 ? "\n" : ""
          }`
        ).join("- ")
      }`,
    );
    console.log();
  };

  variables["vars"] = vars;

  for (const [key, value] of Object.entries(variables)) {
    // @ts-ignore globalThis type check
    globalThis[key] = value;
  }

  console.log(
    `%ceserstack REPL, version ${packageConfig?.version?.value ?? "unknown"}`,
    "color: #00ff00",
  );

  vars();
})();
