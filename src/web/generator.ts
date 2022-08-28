import { type Config, defaultConfig, makeConfig } from "./config.ts";
import { fsWalk, pathPosix } from "./deps.ts";

const readConfig = async function readConfig(baseDir: string) {
  const variations = [
    `${baseDir}/hex.config.ts`,
    `${baseDir}/hex.config.js`,
  ];

  let config;
  for (const variation of variations) {
    try {
      config = (await import(variation))?.default;

      break;
    } catch {
      // do nothing
    }
  }

  if (config === undefined) {
    return defaultConfig;
  }

  return makeConfig(config);
};

const discover = async function discover(baseDir: string, config: Config) {
  const rootDir = pathPosix.join(baseDir, config.pages?.baseDir ?? ".");

  const map = [];

  for await (const entry of fsWalk.walk(rootDir)) {
    const shortPath = entry.path.substring(rootDir.length);

    if (shortPath.length === 0) {
      continue;
    }

    map.push([
      {
        path: shortPath,
        type: entry.isDirectory ? "directory" : "file",
        virtual: entry.isSymlink,
      },
    ]);
  }

  console.log(map);
};

const generate = async function generate(baseDir: string) {
  const config = await readConfig(baseDir);

  const discovery = await discover(baseDir, config);

  console.log(config);
  console.log(discovery);
};

generate(Deno.cwd());

export { generate, generate as default };
