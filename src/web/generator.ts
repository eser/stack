import { codebaseMapper } from "./codebase/mapper.ts";
import { transformCodebaseMapToRoutes } from "./routing/transformers.ts";
import { urlResolver } from "./url-resolver.ts";
import { type Config, readConfig } from "./config.ts";
import { pathPosix } from "./deps.ts";

const generator = async function generator(baseDir: string, config: Config) {
  const rootDir = pathPosix.join(baseDir, config.app!.baseDir!);

  const codebaseMap = await codebaseMapper(rootDir, config.app!.extensions!);

  const routes = transformCodebaseMapToRoutes([], codebaseMap);

  return routes;
};

export { generator, generator as default };
