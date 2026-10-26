// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.
/**
 * Renderer Port Interface
 * Defines the contract for framework-specific rendering implementations
 */

import type { AppConfig } from "@eserstack/laroux/config";
import type { Bundler } from "@eserstack/laroux-bundler";

/**
 * Context passed to rendering methods
 */
export type RenderContext = {
  /** Current URL pathname */
  pathname: string;
  /** Application configuration */
  config: AppConfig;
  /** Bundler instance for asset resolution */
  bundler: Bundler;
  /** Route parameters extracted from URL */
  params: Record<string, string | string[]>;
  /** Request object for headers, cookies, etc. */
  request: Request;
};

/**
 * Result of page rendering
 */
export type RenderResult = {
  /** Rendered HTML content */
  html: string;
  /** Serialized RSC payload for hydration */
  rscPayload?: string;
};

/**
 * Renderer port interface
 * Framework adapters (React, Vue, etc.) implement this interface
 */
export type Renderer = {
  /** Renderer name for identification */
  name: string;

  /**
   * Render a full HTML page with optional SSR
   * @param Layout - Root layout component
   * @param Page - Page component for current route
   * @param context - Render context
   */
  renderPage(
    Layout: unknown,
    Page: unknown,
    context: RenderContext,
  ): Promise<RenderResult>;

  /**
   * Render RSC streaming response
   * @param Layout - Root layout component
   * @param Page - Page component for current route
   * @param context - Render context
   */
  renderRSC(
    Layout: unknown,
    Page: unknown,
    context: RenderContext,
  ): Promise<Response>;

  /**
   * Generate bootstrap script for client hydration
   * @param context - Render context
   */
  generateBootstrapScript(context: RenderContext): string;
};

/**
 * No-op renderer implementation
 * Used as default when no renderer is configured
 */
export const noopRenderer: Renderer = {
  name: "noop",
  renderPage: () => Promise.resolve({ html: "" }),
  renderRSC: () => Promise.resolve(new Response("")),
  generateBootstrapScript: () => "",
};
