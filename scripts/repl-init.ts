// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

import * as config from "@eser/config";
import * as jsRuntime from "@eser/standards/js-runtime";
// import * as mod from "@eser/";

// TODO(@eser) get dependency injection container entries instead of this
await (async () => {
  const env = await config.dotenv.load();
  const kv = await jsRuntime.current.openKv();

  const variables: Record<string, unknown> = {
    // ...mod,
    env,
    kv,
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

  console.log(`%ccool REPL, version ${mod.metadata.version}`, "color: #00ff00");

  vars();
})();
