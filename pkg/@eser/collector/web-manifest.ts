// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

import * as posix from "@std/path/posix";
import * as jsRuntime from "@eser/standards/js-runtime";
import * as logger from "@eser/logging/logger";
import * as collector from "./collector.ts";
import * as formatter from "./formatter.ts";

import type {
  ComponentSchema as ComponentManifestEntry,
  IslandSchema as IslandManifestEntry,
  LayoutSchema as LayoutManifestEntry,
  ManifestBuilder,
  ManifestValidator,
  MiddlewareSchema as MiddlewareManifestEntry,
  RouteSchema as RouteManifestEntry,
  WebFrameworkManifestSchema as WebFrameworkManifest,
} from "./schemas.ts";

export type {
  ComponentManifestEntry,
  IslandManifestEntry,
  LayoutManifestEntry,
  ManifestBuilder,
  ManifestValidator,
  MiddlewareManifestEntry,
  RouteManifestEntry,
  WebFrameworkManifest,
};

export type WebManifestBuildOptions = {
  baseDir: string;
  baseUrl: string;
  routesPattern?: string;
  islandsPattern?: string;
  layoutsPattern?: string;
  middlewarePattern?: string;
  componentsPattern?: string;
};

const IMPORT_PREFIX = "$$";
const PLACEHOLDER_PREFIX = `##!!//__`;
const PLACEHOLDER_SUFFIX = "__//!!##";

const toImportSpecifier = (file: string) => {
  const specifier = posix.normalize(file).replace(/\\/g, "/");
  return specifier.startsWith(".") ? specifier : `./${specifier}`;
};

const placeholder = (text: string) => {
  return `${PLACEHOLDER_PREFIX}${text}${PLACEHOLDER_SUFFIX}`;
};

export const buildWebFrameworkManifest = async (
  options: WebManifestBuildOptions,
): Promise<WebFrameworkManifest> => {
  const manifest: WebFrameworkManifest = {
    baseUrl: options.baseUrl,
    routes: [],
    islands: [],
    layouts: [],
    middleware: [],
    components: [],
  };

  // Collect routes
  if (options.routesPattern) {
    const routes = await collector.collectRouteModules(
      options.baseDir,
      options.routesPattern,
    );

    for (const [file, exports] of routes) {
      for (const [exportName] of exports) {
        if (exportName === "limeModule") {
          // Route details will be determined by the registry at runtime
          manifest.routes.push({
            path: `/${file.replace(/\.(ts|tsx|js|jsx)$/, "")}`,
            file,
            handler: exportName,
          });
        }
      }
    }
  }

  // Collect islands
  if (options.islandsPattern) {
    const islands = await collector.collectIslandModules(
      options.baseDir,
      options.islandsPattern,
    );

    for (const [file, exports] of islands) {
      for (const [exportName] of exports) {
        if (exportName === "limeModule") {
          // Island details will be determined by the registry at runtime
          manifest.islands.push({
            name: posix.basename(file, posix.extname(file)),
            file,
            component: exportName,
            adapter: "react", // Default, will be overridden by registry
          });
        }
      }
    }
  }

  // Collect layouts
  if (options.layoutsPattern) {
    const layouts = await collector.collectLayoutModules(
      options.baseDir,
      options.layoutsPattern,
    );

    for (const [file, exports] of layouts) {
      for (const [exportName] of exports) {
        if (exportName === "limeModule") {
          manifest.layouts.push({
            name: posix.basename(file, posix.extname(file)),
            file,
            component: exportName,
          });
        }
      }
    }
  }

  // Collect middleware
  if (options.middlewarePattern) {
    const middleware = await collector.collectMiddlewareModules(
      options.baseDir,
      options.middlewarePattern,
    );

    for (const [file, exports] of middleware) {
      for (const [exportName] of exports) {
        if (exportName === "limeModule") {
          manifest.middleware.push({
            name: posix.basename(file, posix.extname(file)),
            file,
            handler: exportName,
          });
        }
      }
    }
  }

  // Collect components
  if (options.componentsPattern) {
    const components = await collector.collectComponentModules(
      options.baseDir,
      options.componentsPattern,
    );

    for (const [file, exports] of components) {
      for (const [exportName] of exports) {
        if (exportName === "limeModule") {
          manifest.components.push({
            name: posix.basename(file, posix.extname(file)),
            file,
            component: exportName,
          });
        }
      }
    }
  }

  return manifest;
};

export const writeWebFrameworkManifestToString = async (
  manifest: WebFrameworkManifest,
): Promise<string> => {
  const used = new Set<string>();
  const imports: string[] = [];
  const allFiles = new Set<string>();

  // Collect all unique files
  [
    ...manifest.routes,
    ...manifest.islands,
    ...manifest.layouts,
    ...manifest.middleware,
    ...manifest.components,
  ].forEach((entry) => {
    allFiles.add(entry.file);
  });

  // Generate imports for all files
  const fileToIdentifier = new Map<string, string>();
  for (const file of allFiles) {
    const specifier = toImportSpecifier(file);
    const identifier = collector.specifierToIdentifier(file, used);
    fileToIdentifier.set(file, identifier);

    imports.push(
      `import * as ${IMPORT_PREFIX}${identifier} from "${specifier}";`,
    );
  }

  // Build manifest object with placeholders
  const manifestObj = {
    baseUrl: placeholder("import.meta.url"),
    routes: manifest.routes.map((route) => ({
      ...route,
      handler: placeholder(
        `${IMPORT_PREFIX}${fileToIdentifier.get(route.file)}.${route.handler}`,
      ),
    })),
    islands: manifest.islands.map((island) => ({
      ...island,
      component: placeholder(
        `${IMPORT_PREFIX}${
          fileToIdentifier.get(island.file)
        }.${island.component}`,
      ),
    })),
    layouts: manifest.layouts.map((layout) => ({
      ...layout,
      component: placeholder(
        `${IMPORT_PREFIX}${
          fileToIdentifier.get(layout.file)
        }.${layout.component}`,
      ),
    })),
    middleware: manifest.middleware.map((mw) => ({
      ...mw,
      handler: placeholder(
        `${IMPORT_PREFIX}${fileToIdentifier.get(mw.file)}.${mw.handler}`,
      ),
    })),
    components: manifest.components.map((comp) => ({
      ...comp,
      component: placeholder(
        `${IMPORT_PREFIX}${fileToIdentifier.get(comp.file)}.${comp.component}`,
      ),
    })),
  };

  // Serialize and replace placeholders
  const manifestSerialized = JSON.stringify(manifestObj, null, 2)
    .replaceAll(`"${PLACEHOLDER_PREFIX}`, "")
    .replaceAll(`${PLACEHOLDER_SUFFIX}"`, "");

  const output =
    `// This file is generated by @eser/collector. Your changes might be overwritten.

${imports.join("\n")}

export const manifest = ${manifestSerialized};
export type { WebFrameworkManifest } from "@eser/collector/web-manifest";
`;

  return formatter.format(output);
};

export const buildWebFrameworkManifestFile = async (
  filepath: string,
  options: WebManifestBuildOptions,
): Promise<void> => {
  const manifest = await buildWebFrameworkManifest(options);
  const manifestStr = await writeWebFrameworkManifestToString(manifest);

  const target = await jsRuntime.current.open(filepath, {
    create: true,
    write: true,
  });

  const outputWriter = target.writable.getWriter();
  await outputWriter.ready;

  const encoded = new TextEncoder().encode(manifestStr);
  await outputWriter.write(encoded);

  outputWriter.releaseLock();
  target.close();

  logger.current.info(
    `Web framework manifest generated: ${manifest.routes.length} routes, ${manifest.islands.length} islands, ${manifest.layouts.length} layouts`,
  );
};
