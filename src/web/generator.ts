import { type Config, readConfig } from "./config.ts";
import { codebaseMapper } from "./codebase-mapper.ts";

interface PathContent {
  pathElements: string[];
  isDynamicRoute: boolean;
  isCatchAllRoute: boolean;
}

const extractPaths = function extractPaths(
  pathElements: string[],
  // deno-lint-ignore no-explicit-any
  node: any,
  config: Config,
): PathContent[] {
  let paths: PathContent[] = [];

  if (!node.isCatchAllRoute) {
    for (const subnode of node.subpaths) {
      const subpaths = extractPaths(
        [...pathElements, subnode.name],
        subnode.items,
        config,
      );

      paths = [...paths, ...subpaths];
    }
  }

  if (node.handlers.length > 0) {
    paths = [...paths, {
      pathElements,
      isDynamicRoute: node.isDynamicRoute,
      isCatchAllRoute: node.isCatchAllRoute,
    }];
  }

  return paths;
};

const generate = async function generate(baseDir: string) {
  const config = await readConfig(baseDir);

  const map = await codebaseMapper(baseDir, config);

  const paths = extractPaths([], map, config);

  console.log(config);
  console.log(JSON.stringify(map, null, 2));
  console.log(paths);
};

generate(Deno.cwd());

export { generate, generate as default };
