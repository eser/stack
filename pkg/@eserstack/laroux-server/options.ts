// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.
/**
 * Server Options
 * Types for the programmatic API, used by the CLI commands
 */

import type { LogLevel } from "./config/load-config.ts";
import type { Renderer } from "./domain/renderer.ts";
import type { HtmlShellBuilder } from "./domain/html-shell.ts";
import type {
  CssPlugin,
  CssProcessor,
  FontOptimizer,
  FrameworkPlugin,
  ImageOptimizer,
} from "@eserstack/laroux-bundler";

/**
 * Options for starting the development or production server
 */
export type ServerOptions = {
  /** Server mode */
  mode: "dev" | "serve";

  /** Server port */
  port?: number;

  /** Enable Hot Module Replacement (dev mode only) */
  hmr?: boolean;

  /** Open browser automatically */
  open?: boolean;

  /** Project root directory (defaults to cwd) */
  projectRoot?: string;

  /** Log level */
  logLevel?: LogLevel;

  // Explicit plugin injection (hexagonal architecture)

  /** Framework renderer adapter (e.g., reactRenderer) */
  renderer?: Renderer;

  /** HTML shell builder adapter (e.g., reactHtmlShellBuilder) */
  htmlShell?: HtmlShellBuilder;

  /**
   * Bundler framework plugin (e.g., reactPlugin). Without one, the server
   * builds nothing and serves the dist/ it finds.
   */
  frameworkPlugin?: FrameworkPlugin;

  /** Bundler CSS plugin (e.g., createTailwindPlugin(...)) */
  cssPlugin?: CssPlugin;

  /**
   * Transforms the global stylesheet when the CSS plugin does not compile it
   * (e.g., lightningCssProcessor). Without one, it is written unchanged.
   */
  cssProcessor?: CssProcessor;

  /**
   * Self-hosts the configured fonts (e.g., googleFontOptimizer). Without one,
   * no font files are downloaded.
   */
  fontOptimizer?: FontOptimizer;

  /**
   * Optimizes the images under public/images (e.g., sharpImageOptimizer).
   * Without one, images are served as they are.
   */
  imageOptimizer?: ImageOptimizer;
};

/** Valid log levels for validation */
export const VALID_LOG_LEVELS: LogLevel[] = [
  "trace",
  "debug",
  "info",
  "warn",
  "error",
  "fatal",
];
