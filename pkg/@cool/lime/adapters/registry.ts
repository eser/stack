// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * Adapter registry and management for Lime
 */

import { adapterRegistry, type ViewAdapter } from "./adapter.ts";
import { ReactAdapter, type ReactAdapterConfig } from "./react.ts";
import { PreactAdapter, type PreactAdapterConfig } from "./preact.ts";
import { StaticAdapter, type StaticAdapterConfig } from "./static.ts";

export { adapterRegistry };
export type { ViewAdapter };

/**
 * Adapter configuration union type
 */
export type AdapterConfig =
  | ReactAdapterConfig
  | PreactAdapterConfig
  | StaticAdapterConfig;

/**
 * Initialize and register all built-in adapters
 */
export async function initializeAdapters(
  configs: AdapterConfig[],
): Promise<void> {
  for (const config of configs) {
    let adapter: ViewAdapter;

    switch (config.name) {
      case "react":
        adapter = new ReactAdapter();
        break;
      case "preact":
        adapter = new PreactAdapter();
        break;
      case "static":
        adapter = new StaticAdapter();
        break;
      default:
        throw new Error(`Unknown adapter: ${(config as any).name}`);
    }

    await adapter.init(config);
    adapterRegistry.register(adapter);
  }
}

/**
 * Initialize default adapters with sensible defaults
 */
export async function initializeDefaultAdapters(): Promise<void> {
  const defaultConfigs: AdapterConfig[] = [
    {
      name: "react",
      version: "19",
      rsc: true,
      serverActions: true,
      streaming: true,
    },
    {
      name: "preact",
      version: "10",
      signals: true,
      compat: false,
    },
    {
      name: "static",
      optimize: true,
      pretty: false,
    },
  ];

  await initializeAdapters(defaultConfigs);

  // Set React as default adapter
  adapterRegistry.setDefault("react");
}

/**
 * Get adapter for component with fallback logic
 */
export function getAdapterForComponent(
  component: unknown,
  preferredAdapter?: string,
): ViewAdapter {
  // Try preferred adapter first
  if (preferredAdapter) {
    const preferred = adapterRegistry.get(preferredAdapter);
    if (preferred && preferred.isCompatible(component)) {
      return preferred;
    }
  }

  // Find best adapter automatically
  const best = adapterRegistry.findBestAdapter(component);
  if (best) return best;

  // Fallback to default adapter
  const defaultAdapter = adapterRegistry.getDefault();
  if (defaultAdapter) return defaultAdapter;

  throw new Error("No suitable adapter found and no default adapter set");
}

/**
 * Render component with appropriate adapter
 */
export async function renderWithAdapter(
  component: unknown,
  context: {
    url: URL;
    req: Request;
    props?: Record<string, unknown>;
    mode: "ssr" | "ssg" | "client";
  },
  preferredAdapter?: string,
): Promise<string> {
  const adapter = getAdapterForComponent(component, preferredAdapter);

  // Transform component if adapter supports it
  const transformedComponent = adapter.transform
    ? adapter.transform(component)
    : component;

  if (context.mode === "ssg") {
    return adapter.renderToStaticMarkup?.(transformedComponent, context) ??
      adapter.renderToString(transformedComponent, context);
  }

  return adapter.renderToString(transformedComponent, context);
}

/**
 * Get client bundle for all registered adapters
 */
export async function getClientBundles(): Promise<Map<string, string>> {
  const bundles = new Map<string, string>();

  for (const [name, adapter] of adapterRegistry.getAll()) {
    try {
      const bundle = await adapter.getClientBundle();
      bundles.set(name, bundle);
    } catch (error) {
      console.error(`Failed to generate client bundle for ${name}:`, error);
    }
  }

  return bundles;
}

/**
 * Cleanup all adapters
 */
export async function cleanupAdapters(): Promise<void> {
  const cleanup = Array.from(adapterRegistry.getAll().values()).map(
    (adapter) => adapter.cleanup(),
  );

  await Promise.all(cleanup);
}
