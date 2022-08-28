import { type Config } from "./config.ts";
import { fsWalk, pathPosix } from "./deps.ts";

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

interface CodebaseItem {
  isDynamicRoute: boolean;
  isCatchAllRoute: boolean;

  subpaths: CodebaseSubpath[];
  handlers: { name: string }[];
  layouts: { name: string }[];
  translations: { name: string }[];
  types: { name: string }[];
  assets: { name: string }[];
  others: { name: string }[];
}

interface CodebaseSubpath {
  name: string;
  items: CodebaseItem;
}

const comparer = function comparer(a: boolean, b: boolean) {
  if (a === b) {
    return 0;
  }

  return a ? 1 : -1;
};

const codebaseSubpathSorter = function (
  a: CodebaseSubpath,
  b: CodebaseSubpath,
) {
  const catchAllRouteComparision = comparer(
    a.items.isCatchAllRoute,
    b.items.isCatchAllRoute,
  );

  if (catchAllRouteComparision !== 0) {
    return catchAllRouteComparision;
  }

  const dynamicRouteComparision = comparer(
    a.items.isDynamicRoute,
    b.items.isDynamicRoute,
  );

  if (dynamicRouteComparision !== 0) {
    return dynamicRouteComparision;
  }

  return a.name.localeCompare(b.name);
};

const discoverDirectory = async function discoverDirectory(
  dir: string,
  config: Config,
) {
  const result: CodebaseItem = {
    isDynamicRoute: false,
    isCatchAllRoute: false,

    subpaths: [],
    handlers: [], // /index.ts
    layouts: [], // layout.ts
    translations: [], // translation.en.ts
    types: [], // types.ts
    assets: [], // css, js, svgs, images, fonts, ...
    others: [], // other files (components etc.)
  };

  const sanitizedDir = dir.endsWith("/") ? dir : `${dir}/`;

  for await (const entry of fsWalk.walk(sanitizedDir, { maxDepth: 1 })) {
    if (entry.path === sanitizedDir) {
      if (
        entry.isDirectory && entry.name.startsWith("[") &&
        entry.name.endsWith("]")
      ) {
        result.isDynamicRoute = true;

        if (entry.name.startsWith("[...")) {
          result.isCatchAllRoute = true;
        }
      }

      continue;
    }

    if (entry.isDirectory) {
      result.subpaths.push({
        name: entry.name,
        items: await discoverDirectory(`${sanitizedDir}${entry.name}`, config),
      });

      continue;
    }

    // handlers
    if (
      checkFileNaming(entry.name, false, "index", config.app!.extensions!)
    ) {
      result.handlers.push({ name: entry.name });

      continue;
    }

    // layouts
    if (
      checkFileNaming(entry.name, false, "layout", config.app!.extensions!)
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
        config.app!.extensions!,
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
        config.app!.extensions!,
      )
    ) {
      result.translations.push({ name: entry.name });

      continue;
    }

    // types
    if (
      checkFileNaming(entry.name, false, "types", config.app!.extensions!)
    ) {
      result.types.push({ name: entry.name });

      continue;
    }

    // assets
    if (!checkFileNaming(entry.name, false, "", config.app!.extensions!)) {
      result.assets.push({ name: entry.name });

      continue;
    }

    result.others.push({ name: entry.name });
  }

  result.subpaths = result.subpaths.sort(codebaseSubpathSorter);

  return result;
};

const codebaseMapper = async function codebaseMapper(
  baseDir: string,
  config: Config,
) {
  const rootDir = pathPosix.join(baseDir, config.app!.baseDir!);

  const map = await discoverDirectory(rootDir, config);

  return map;
};

export { type CodebaseItem, codebaseMapper, codebaseMapper as default };
