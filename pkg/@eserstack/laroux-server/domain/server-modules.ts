// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.
/**
 * Server Modules
 *
 * The modules a laroux server loads from its build output: the page routes
 * with the layout and the not-found page, the API routes, the proxies and the
 * server actions. Each one is imported by a URL that carries the build id
 * (see build-module.ts), so loading the next build after a dev rebuild makes
 * every later request use the rebuilt modules without a restart.
 */

import * as logging from "@eserstack/logging";
import { runtime } from "@eserstack/standards/cross-runtime";
import * as patterns from "@eserstack/standards/patterns";
import * as router from "@eserstack/laroux/router";
import type { RouteDefinition } from "@eserstack/laroux/router";
import * as buildModule from "./build-module.ts";
import * as middlewareDispatcher from "./middleware-dispatcher.ts";
import * as routeDispatcher from "./route-dispatcher.ts";

const modulesLogger = logging.logger.getLogger([
  "laroux-server",
  "server-modules",
]);

/** Directory under distDir that holds the server output of a build. */
const SERVER_DIR = "server";

/**
 * Result of loading app components for a given pathname
 */
export type AppComponents = {
  // Layout and Page come from app modules imported at runtime; the renderer
  // adapter, not this layer, knows their component type.
  // oxlint-disable-next-line typescript/no-explicit-any
  Layout: any;
  // oxlint-disable-next-line typescript/no-explicit-any
  Page: any;
  params: Record<string, string | string[]>;
};

/** The parts of one build that load() reads ahead of the requests. */
type LoadedBuild = {
  readonly buildId: string;
  readonly pageRoutes: readonly RouteDefinition[];
  /** Exports of the app's root layout module */
  readonly layoutModule: Readonly<Record<string, unknown>>;
};

/**
 * The server modules of one app. A server keeps one instance, so servers for
 * different apps in one process never share routes.
 */
export class ServerModules {
  /** The API routes of the loaded build */
  readonly apiRoutes: routeDispatcher.ApiRouteHandler =
    new routeDispatcher.ApiRouteHandler();
  /** The proxies of the loaded build */
  readonly proxies: middlewareDispatcher.MiddlewareDispatcher =
    new middlewareDispatcher.MiddlewareDispatcher();
  readonly #distDir: string;
  #loaded: LoadedBuild | null = null;

  /**
   * Create the server modules of the app built into distDir. Nothing loads
   * until {@link load} is called.
   *
   * @param distDir - Absolute path of the build output directory
   */
  constructor(distDir: string) {
    this.#distDir = distDir;
  }

  /**
   * Load a build: its page routes, which import every page module, the
   * layout, the server action modules, the API route registry and the proxy
   * registry. API route and proxy modules load on their first request.
   * Requests that start after this resolves use the new build; when the page
   * routes or the layout fail to load, every module stays on the build loaded
   * before. When the API route or proxy registry fails to load after that,
   * load rejects and the pages stay on the build loaded before, while a
   * registry that did load already serves the new build.
   *
   * @param buildId - Id of the build in distDir, from its chunk manifest or
   *   its BuildResult
   */
  async load(buildId: string): Promise<void> {
    // Loaded first, so a page or layout that fails to import leaves the
    // server on the previous build
    const [pageRoutes, layoutModule] = await Promise.all([
      loadPageRoutes(this.#distDir, buildId),
      importServerComponent(this.#distDir, "layout", buildId),
    ]);
    await Promise.all([
      this.apiRoutes.loadRoutes(this.#distDir, buildId),
      this.proxies.loadProxies(this.#distDir, buildId),
      loadServerActions(this.#distDir, buildId),
    ]);

    this.#loaded = { buildId, pageRoutes, layoutModule };
    modulesLogger.debug(
      `Loaded build ${buildId}: ${pageRoutes.length} page route(s)`,
    );
  }

  /**
   * Id of the loaded build. Server action modules are imported with it.
   *
   * @throws {Error} When no build has been loaded yet
   */
  loadedBuildId(): string {
    return this.#requireLoaded("loadedBuildId").buildId;
  }

  /**
   * Load the layout and the page for a pathname from the loaded build; a
   * pathname no route matches gets the not-found page.
   *
   * @param pathname - Request pathname, such as "/stories/hello"
   * @throws {Error} When no build has been loaded yet
   */
  async getApp(pathname: string): Promise<AppComponents> {
    const { buildId, pageRoutes, layoutModule } = this.#requireLoaded("getApp");
    const match = router.findMatchingRoute(pathname, pageRoutes);

    if (match === null) {
      const notFoundModule = await importServerComponent(
        this.#distDir,
        "not-found",
        buildId,
      );
      return {
        Layout: layoutModule["Layout"],
        Page: notFoundModule["NotFound"],
        params: {},
      };
    }

    return {
      Layout: layoutModule["Layout"],
      Page: match.route.component,
      params: match.params,
    };
  }

  #requireLoaded(operation: string): LoadedBuild {
    if (this.#loaded === null) {
      throw new Error(
        `ServerModules.${operation}: no build of ${this.#distDir} is loaded; call load(buildId) first`,
      );
    }
    return this.#loaded;
  }
}

/**
 * Import the page routes the build generated into
 * <distDir>/server/_generated-routes.ts. The file imports the page modules
 * with its own build id, so a new build id loads the rebuilt pages.
 */
async function loadPageRoutes(
  distDir: string,
  buildId: string,
): Promise<readonly RouteDefinition[]> {
  const routesPath = runtime.path.join(
    distDir,
    SERVER_DIR,
    "_generated-routes.ts",
  );
  const routesModule = await import(
    buildModule.toBuildModuleUrl(routesPath, buildId)
  );
  const generatedRoutes: unknown = routesModule["generatedRoutes"];

  if (!Array.isArray(generatedRoutes)) {
    throw new Error(
      `load page routes from ${routesPath}: the file exports no generatedRoutes array; rebuild the app`,
    );
  }

  return generatedRoutes;
}

/**
 * Import the server action modules the build lists in
 * <distDir>/server/actions-manifest.json. An action module that fails to
 * import is logged and skipped, so the other actions still load.
 */
async function loadServerActions(
  distDir: string,
  buildId: string,
): Promise<void> {
  const manifestPath = runtime.path.resolve(
    distDir,
    SERVER_DIR,
    "actions-manifest.json",
  );
  if (!(await runtime.fs.exists(manifestPath))) {
    modulesLogger.debug("No actions manifest found (optional)");
    return;
  }

  const manifest: { actions: string[] } = JSON.parse(
    await runtime.fs.readTextFile(manifestPath),
  );
  let loadedCount = 0;

  for (const actionPath of manifest.actions) {
    // Action paths keep the source layout, such as "src/app/actions.js",
    // under dist/server
    const fullPath = runtime.path.resolve(distDir, SERVER_DIR, actionPath);
    try {
      // Action modules register themselves on import, so they load one at a
      // time to keep the registration order equal to the manifest order.
      // oxlint-disable-next-line no-await-in-loop
      const loaded = await buildModule.importOptionalBuildModule(
        fullPath,
        buildId,
      );
      if (loaded !== null) {
        loadedCount++;
      }
    } catch (error) {
      // Logged before the next module loads, so the entries keep the
      // manifest order of the imports above.
      // oxlint-disable-next-line no-await-in-loop
      await modulesLogger
        .with({ actionPath, buildId, error })
        .warn(
          "load server action module: importing it failed, so its actions answer 500 until it is fixed",
        );
    }
  }

  if (loadedCount > 0) {
    modulesLogger.debug(`Server actions loaded: ${loadedCount} file(s)`);
  }
}

/**
 * Import a server component of the app root, such as the layout. The bundled
 * file at dist/server/src/app/<baseName>.js is preferred; a source file next
 * to it is the fallback.
 */
async function importServerComponent(
  distDir: string,
  baseName: string,
  buildId: string,
): Promise<Readonly<Record<string, unknown>>> {
  const componentPath = await resolveServerComponentPath(distDir, baseName);
  return await import(buildModule.toBuildModuleUrl(componentPath, buildId));
}

/**
 * Resolve server component import path.
 * Bundled .js files are at dist/server/src/app/*.js (both bundlers output here).
 * Falls back to source files for compatibility.
 *
 * @param distDir - Build output directory
 * @param baseName - Base file name without extension (e.g., "layout", "not-found")
 * @returns Resolved path to the component file
 */
async function resolveServerComponentPath(
  distDir: string,
  baseName: string,
): Promise<string> {
  const appDir = runtime.path.resolve(distDir, SERVER_DIR, "src", "app");

  // Try bundled .js file in src/app (both bundlers output here)
  const bundledPath = runtime.path.join(appDir, `${baseName}.js`);
  if (await runtime.fs.exists(bundledPath)) {
    return bundledPath;
  }

  // Fall back to source file - try each extension
  for (const ext of patterns.JS_FILE_EXTENSIONS) {
    const sourcePath = runtime.path.join(appDir, `${baseName}.${ext}`);
    // Extensions are tried in preference order and the first match wins.
    // oxlint-disable-next-line no-await-in-loop
    if (await runtime.fs.exists(sourcePath)) {
      return sourcePath;
    }
  }

  // Return bundled path as default (will fail with clear error)
  return bundledPath;
}
