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

const checkFileNaming = function checkFileNaming(
  filename: string,
  checkEndsWith: boolean,
  prefix: string,
  extensions: string[],
) {
  for (const extension of extensions) {
    if (checkEndsWith) {
      if (filename.endsWith(`${prefix}${extension}`)) {
        return true;
      }
    } else if (filename === `${prefix}${extension}`) {
      return true;
    }
  }

  return false;
};

const discoverDirectory = async function discoverDirectory(
  dir: string,
  config: Config,
) {
  // deno-lint-ignore no-explicit-any
  const result: any = {
    subpaths: [],
    handlers: [], // /index.ts
    layouts: [], // layout.ts
    translations: [], // translation.en.ts
    types: [], // types.ts
    assets: [], // css, js, svgs, images, fonts, ...
    others: [], // other files (components etc.)
  };

  for await (const entry of fsWalk.walk(dir, { maxDepth: 1 })) {
    if (entry.path === dir) {
      continue;
    }

    if (entry.isDirectory) {
      result.subpaths.push({
        name: entry.name,
        items: await discoverDirectory(`${dir}/${entry.name}`, config),
      });

      continue;
    }

    // handlers
    if (
      checkFileNaming(entry.name, false, "index", config.pages!.extensions!)
    ) {
      result.handlers.push({ name: entry.name });

      continue;
    }

    // layouts
    if (
      checkFileNaming(entry.name, false, "layout", config.pages!.extensions!)
    ) {
      result.layouts.push({ name: entry.name });

      continue;
    }

    // translations
    if (
      checkFileNaming(
        entry.name,
        false,
        "translations",
        config.pages!.extensions!,
      )
    ) {
      result.translations.push({ name: entry.name });

      continue;
    }

    if (
      checkFileNaming(
        entry.name,
        true,
        ".translations",
        config.pages!.extensions!,
      )
    ) {
      result.translations.push({ name: entry.name });

      continue;
    }

    // types
    if (
      checkFileNaming(entry.name, false, "types", config.pages!.extensions!)
    ) {
      result.types.push({ name: entry.name });

      continue;
    }

    // assets
    if (!checkFileNaming(entry.name, false, "", config.pages!.extensions!)) {
      result.assets.push({ name: entry.name });

      continue;
    }

    result.others.push({ name: entry.name });
  }

  return result;
};

const discover = async function discover(baseDir: string, config: Config) {
  const rootDir = pathPosix.join(baseDir, config.pages?.baseDir ?? ".", "app");

  const map = await discoverDirectory(rootDir, config);

  console.log(JSON.stringify(map, null, 2));
};

const generate = async function generate(baseDir: string) {
  const config = await readConfig(baseDir);

  const discovery = await discover(baseDir, config);

  console.log(config);
  console.log(discovery);
};

generate(Deno.cwd());

export { generate, generate as default };
