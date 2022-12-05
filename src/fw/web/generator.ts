import { codebaseMapper } from "./codebase/mapper.ts";
import { transformCodebaseMapToRoutes } from "./routing/transformers.ts";
import { type Config } from "./config.ts";
import { path } from "./deps.ts";

const generator = async (baseDir: string, config: Config) => {
  const rootDir = path.posix.join(baseDir, config.app!.baseDir!);

  const codebaseMap = await codebaseMapper(rootDir, config.app!.extensions!);

  const routes = transformCodebaseMapToRoutes([], codebaseMap);

  return routes;
};

export { generator, generator as default };
