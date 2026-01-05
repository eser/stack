// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.
// Middleware Dispatcher for laroux.js
// Handles file-based proxy/middleware (proxy.ts files)

import * as logging from "@eser/logging";
import { runtime } from "@eser/standards/runtime";
import type { Proxy, ProxyResult } from "../proxy/types.ts";

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

/**
 * Middleware Dispatcher
 * Manages loading and executing proxies/middleware
 */
export class MiddlewareDispatcher {
  private proxies: ProxyEntry[] = [];
  private moduleCache = new Map<string, { default: Proxy }>();
  private registryDir: string = "";

  /**
   * Load proxies from the generated registry
   */
  async loadProxies(distDir: string): Promise<void> {
    try {
      const registryPath = `${distDir}/server/proxy-registry.ts`;
      this.registryDir = runtime.path.resolve(distDir, "server");
      const registry = await import(registryPath);
      this.proxies = registry.proxyRegistry || [];
      proxyLogger.debug(`Loaded ${this.proxies.length} proxy definition(s)`);
    } catch {
      // No proxies generated - this is fine
      this.proxies = [];
      proxyLogger.debug("No proxy registry found");
    }
  }

  /**
   * Run proxies for a request
   * Returns the final result and potentially rewritten pathname
   */
  async runProxies(
    req: Request,
    pathname: string,
  ): Promise<ProxyExecutionResult> {
    let currentPathname = pathname;

    for (const proxy of this.proxies) {
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
          this.registryDir,
          proxy.modulePath,
        );

        // Load module (with caching)
        let module = this.moduleCache.get(resolvedPath);
        if (!module) {
          module = await import(resolvedPath) as { default: Proxy };
          this.moduleCache.set(resolvedPath, module);
        }

        const proxyFn = module.default;
        if (typeof proxyFn !== "function") {
          proxyLogger.warn(
            `Proxy ${proxy.modulePath} does not export a default function`,
          );
          continue;
        }

        // Execute proxy
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
        proxyLogger.error(`Proxy error: ${proxy.pathPrefix}`, { error });
        // Don't expose error details to client - only log server-side
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

  /**
   * Clear module cache (for HMR)
   */
  clearCache(): void {
    this.moduleCache.clear();
  }
}

// Re-export old name for backward compatibility
export { MiddlewareDispatcher as ProxyHandler };
