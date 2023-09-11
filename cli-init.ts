import { load } from "$cool/dotenv/mod.ts";
import * as mod from "./mod.ts";

// TODO(@eser) get dependency injection container entries instead of this
(async () => {
  const env = await load();
  const kv = await Deno.openKv();

  const variables: Record<string, unknown> = {
    ...mod,
    env,
    kv,
  };

  const vars = () => {
    console.log("\npredefined variables\n--------------------");
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

  vars();
})();
