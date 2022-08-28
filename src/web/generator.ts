import { readConfig } from "./config.ts";
import { codebaseMapper } from "./codebase-mapper.ts";

const generate = async function generate(baseDir: string) {
  const config = await readConfig(baseDir);

  const map = await codebaseMapper(baseDir, config);

  console.log(config);
  console.log(JSON.stringify(map, null, 2));
};

generate(Deno.cwd());

export { generate, generate as default };
