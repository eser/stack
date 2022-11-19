import { type Config, makeConfig } from "./config.ts";
import { generator } from "./generator.ts";
import { urlResolver } from "./url-resolver.ts";

const run = async (config: Config) => {
  const baseDir = Deno.cwd();

  const config_ = makeConfig(config);
  const routes = await generator(baseDir, config_);

  const resolution = urlResolver("/en/home", routes, config_);

  console.log(routes);
  console.log(resolution);
};

export { run, run as default };
