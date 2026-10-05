// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.
// Middleware Dispatcher for laroux.js
// Handles file-based proxy/middleware (proxy.ts files)

import * as logging from "@eserstack/logging";
import { runtime } from "@eserstack/standards/cross-runtime";
import type { Proxy, ProxyResult } from "../proxy/types.ts";
import * as buildModule from "./build-module.ts";

const proxyLogger = logging.logger.getLogger([
  "laroux-server",
  "proxy-handler",
]);

/**
 * Proxy entry from the generated registry
 */
export type ProxyEntry = {
  pathPrefix: string;
  modulePath: string;
};

/**
 * Result of proxy execution
 */
export type ProxyExecutionResult = {
  result: ProxyResult;
  finalPathname: string;
};

/** The proxies of one build and the proxy modules loaded from it. */
type LoadedProxies = {
  readonly proxies: readonly ProxyEntry[];
  /** Directory the registry's module paths are relative to */
  readonly registryDir: string;
  readonly buildId: string;
  /** Proxy modules of this build, by resolved path */
  readonly moduleCache: Map<string, { default: Proxy }>;
};

/**
 * Middleware Dispatcher
 * Manages loading and executing proxies/middleware
 */
export class MiddlewareDispatcher {
  private loaded: LoadedProxies = {
    proxies: [],
    registryDir: "",
    buildId: "",
    moduleCache: new Map(),
  };

  /**
   * Load the proxies of a build from its generated registry,
   * <distDir>/server/proxy-registry.ts. A build without proxy.ts files
   * writes no registry, so it has no proxies. Proxy modules load on the
   * first request they run for, by URLs that carry the build id: after a
   * rebuild, loading the new build makes requests import the rebuilt proxies.
   *
   * @param distDir - Build output directory
   * @param buildId - Id of the build to load
   */
  async loadProxies(distDir: string, buildId: string): Promise<void> {
    const registryDir = runtime.path.resolve(distDir, "server");
    const registry = await buildModule.importOptionalBuildModule(
      runtime.path.join(registryDir, "proxy-registry.ts"),
      buildId,
    );
    const entries = registry?.["proxyRegistry"];
    const proxies: readonly ProxyEntry[] = Array.isArray(entries)
      ? entries
      : [];

    // Replaced in one step: a request that started before keeps the build
    // it started with, so it never mixes the modules of two builds.
    this.loaded = { proxies, registryDir, buildId, moduleCache: new Map() };

    proxyLogger.debug(`Loaded ${proxies.length} proxy definition(s)`);
  }

  /**
   * Run proxies for a request
   * Returns the final result and potentially rewritten pathname
   */
  async runProxies(
    req: Request,
    pathname: string,
  ): Promise<ProxyExecutionResult> {
    const loaded = this.loaded;
    let currentPathname = pathname;

    for (const proxy of loaded.proxies) {
      // Check if pathname matches this proxy's prefix
      if (!this.matchesPrefix(currentPathname, proxy.pathPrefix)) {
        continue;
      }

      proxyLogger.debug(
        `Running proxy: ${proxy.pathPrefix} for ${currentPathname}`,
      );

      try {
        // Resolve module path relative to the registry directory
        const resolvedPath = runtime.path.resolve(
          loaded.registryDir,
          proxy.modulePath,
        );

        // Load module (with caching)
        let module = loaded.moduleCache.get(resolvedPath);
        if (module === undefined) {
          const moduleUrl = buildModule.toBuildModuleUrl(
            resolvedPath,
            loaded.buildId,
          );
          // Loaded lazily inside the chain: a proxy that an earlier one cuts
          // off by a response or redirect is never imported.
          // deno-lint-ignore no-await-in-loop
          module = await import(moduleUrl) as { default: Proxy };
          loaded.moduleCache.set(resolvedPath, module);
        }

        const proxyFn = module.default;
        if (typeof proxyFn !== "function") {
          proxyLogger.warn(
            `Proxy ${proxy.modulePath} does not export a default function`,
          );
          continue;
        }

        // Execute proxy. Sequential on purpose: a rewrite changes the
        // pathname the next proxy sees, and a response or redirect ends the
        // chain.
        // deno-lint-ignore no-await-in-loop
        const result = await proxyFn({
          request: req,
          pathname: currentPathname,
          params: {},
        });

        // Handle result
        if (result.type === "response") {
          proxyLogger.debug(`Proxy ${proxy.pathPrefix} returned response`);
          return { result, finalPathname: currentPathname };
        }

        if (result.type === "redirect") {
          proxyLogger.debug(
            `Proxy ${proxy.pathPrefix} redirecting to ${result.url}`,
          );
          return { result, finalPathname: currentPathname };
        }

        if (result.type === "rewrite") {
          proxyLogger.debug(
            `Proxy ${proxy.pathPrefix} rewriting to ${result.pathname}`,
          );
          currentPathname = result.pathname;
          // Continue to next proxy with rewritten pathname
        }

        // type === "next" - continue to next proxy
      } catch (error) {
        // Handled here: logged once with the proxy, and the client gets a
        // fixed message without the error's details. The chain ends with
        // this response, so the await runs once.
        // deno-lint-ignore no-await-in-loop
        await proxyLogger.with({
          pathPrefix: proxy.pathPrefix,
          modulePath: proxy.modulePath,
          error,
        }).error("proxy failed to load or threw; answered 500");
        return {
          result: {
            type: "response",
            response: new Response(
              JSON.stringify({
                error: "Proxy Error",
              }),
              {
                status: 500,
                headers: { "Content-Type": "application/json" },
              },
            ),
          },
          finalPathname: currentPathname,
        };
      }
    }

    // No proxy intercepted, continue normally
    return {
      result: { type: "next" },
      finalPathname: currentPathname,
    };
  }

  /**
   * Check if pathname matches proxy prefix
   */
  private matchesPrefix(pathname: string, prefix: string): boolean {
    // Root prefix "/" matches everything
    if (prefix === "/") {
      return true;
    }

    return pathname === prefix || pathname.startsWith(prefix + "/");
  }
}
