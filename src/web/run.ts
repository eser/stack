import { type Config } from "./config.ts";
import { generator } from "./generator.ts";
import { urlResolver } from "./url-resolver.ts";

const run = async (config: Config) => {
  const baseDir = Deno.cwd();

  const routes = await generator(baseDir, config);

  const resolution = urlResolver("/en/home", routes, config);

  console.log(routes);
  console.log(resolution);
};

export { run, run as default };
