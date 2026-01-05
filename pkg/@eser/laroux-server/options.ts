// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.
/**
 * Server and Build Options
 * Types for programmatic API - used by CLI handlers
 */

import type { LogLevel } from "./config/load-config.ts";
import type { Renderer } from "./domain/renderer.ts";
import type { HtmlShellBuilder } from "./domain/html-shell.ts";
import type { CssPlugin, FrameworkPlugin } from "@eser/laroux-bundler";

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

  /** Bundler framework plugin (e.g., reactPlugin) */
  frameworkPlugin?: FrameworkPlugin;

  /** Bundler CSS plugin (e.g., createTailwindPlugin(...)) */
  cssPlugin?: CssPlugin;
};

/**
 * Options for building the application
 */
export type BuildOptions = {
  /** Project root directory (defaults to cwd) */
  projectRoot?: string;

  /** Output directory (relative to projectRoot) */
  outDir?: string;

  /** Enable minification */
  minify?: boolean;

  /** Clean output directory before build */
  clean?: boolean;

  /** Enable watch mode */
  watch?: boolean;

  /** Log level */
  logLevel?: LogLevel;

  // Explicit plugin injection (hexagonal architecture)

  /** Bundler framework plugin (e.g., reactPlugin) */
  frameworkPlugin?: FrameworkPlugin;

  /** Bundler CSS plugin (e.g., createTailwindPlugin(...)) */
  cssPlugin?: CssPlugin;
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
