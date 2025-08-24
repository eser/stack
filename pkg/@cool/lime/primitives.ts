// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

import * as runModes from "@eser/standards/run-modes";
import * as fileLoader from "@eser/config/file";
import * as appRuntime from "@eser/app-runtime";
import { LimeRouter } from "./router.ts";
import { initializeDefaultAdapters } from "./adapters/registry.ts";
import { createServerActionsMiddleware } from "./server-actions.ts";

export type LimeExportedSymbol = unknown;

export type LimeManifest = {
  exports: Array<[string, Array<[string, LimeExportedSymbol]>]>;
};

/**
 * Enhanced manifest format for web framework features
 */
export type WebFrameworkManifest = {
  routes: Array<{
    path: string;
    handler: string;
    config: import("./registry.ts").RouteConfig;
  }>;
  layouts: Array<{
    name: string;
    component: string;
    config: import("./registry.ts").LayoutConfig;
  }>;
  islands: Array<{
    name: string;
    component: string;
    config: import("./registry.ts").IslandConfig;
  }>;
  serverComponents: Array<{
    name: string;
    component: string;
    config: import("./registry.ts").ServerComponentConfig;
  }>;
  serverActions: Array<{
    name: string;
    action: string;
    config: import("./registry.ts").ServerActionConfig;
  }>;
};

export type LimeOptions = {
  basePath: string;
};

export type LimeState = appRuntime.AppRuntimeState & {
  baseUrl: string | null;
  manifests: Array<LimeManifest>;
  webManifests: Array<WebFrameworkManifest>;
  router: LimeRouter;
  options: LimeOptions;
};

export const createLimeState = (options?: Partial<LimeOptions>): LimeState => {
  return {
    ...appRuntime.createAppRuntimeState(),
    baseUrl: null,
    manifests: [],
    webManifests: [],
    router: new LimeRouter(),
    options: Object.assign(
      { basePath: "" },
      options,
    ),
  };
};

export class Lime extends appRuntime.AppRuntime<LimeState> {
  constructor(state?: LimeState) {
    super(state ?? createLimeState());
  }

  setBaseUrl(baseUrl: string | null): this {
    this.state.baseUrl = baseUrl;

    return this;
  }

  addManifest(manifest: LimeManifest): this {
    this.state.manifests = [...this.state.manifests, manifest];

    return this;
  }

  addWebManifest(manifest: WebFrameworkManifest): this {
    this.state.webManifests = [...this.state.webManifests, manifest];

    // Load routes into router
    this.state.router.loadFromManifest(manifest);

    return this;
  }

  loadManifest(baseDir?: string): this {
    const promise = fileLoader.load<LimeManifest>(
      fileLoader.resolvePath(baseDir ?? ".", this.state.baseUrl),
      ["manifest.yaml", "manifest.jsonc", "manifest.json", "manifest.toml"],
    ).then((result) => {
      if (result.content === undefined) {
        return;
      }

      this.addManifest(result.content);
    }).catch((error) => {
      // In production, we silently ignore manifest loading failures
      // since manifests are optional. In development mode, we throw
      // for better debugging experience.
      if (this.state.runMode & runModes.RunModes.Development) {
        throw new Error(
          `Failed to load manifest from ${baseDir ?? "."}: ${error.message}`,
        );
      }
    });

    this.state.awaits = [...this.state.awaits, promise];

    return this;
  }

  dev(): this {
    this.state.runMode |= runModes.RunModes.Development;

    return this;
  }

  async start(): Promise<void> {
    await this.awaitAll();

    // Initialize adapters
    await initializeDefaultAdapters();

    // Start web server
    await this.serve();
  }

  async serve(port = 8000): Promise<void> {
    console.log(`🍋 Lime server starting on port ${port}`);

    const serverActionsMiddleware = createServerActionsMiddleware();

    const handler = async (req: Request, info?: Deno.ServeHandlerInfo) => {
      // First check if it's a Server Action request
      const serverActionResponse = await serverActionsMiddleware(
        req,
        () => this.state.router.handle(req, info),
      );

      return serverActionResponse;
    };

    await Deno.serve({ port }, handler);
  }

  execute(): Promise<void> {
    return this.start();
  }
}
