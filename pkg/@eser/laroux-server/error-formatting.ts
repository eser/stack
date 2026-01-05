// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.
/**
 * Error Formatting Utilities
 * Provides helpful error messages and formatting
 */

import { c } from "@eser/shell/formatting";
import * as logging from "@eser/logging";

const errorLogger = logging.logger.getLogger(["laroux-server", "error"]);

/**
 * Error code ranges:
 * - CLI001-099: CLI and command errors
 * - BUILD100-199: Build and bundler errors
 * - RUNTIME200-299: Runtime and server errors
 * - CONFIG300-399: Configuration errors
 * - HMR400-499: Hot Module Replacement errors
 */

/**
 * Base URL for error documentation
 */
const ERROR_DOCS_BASE_URL = "https://laroux.js.org/docs/errors";

/**
 * Get documentation URL for an error code
 */
export function getErrorDocUrl(code: string): string {
  return `${ERROR_DOCS_BASE_URL}#${code.toLowerCase()}`;
}

/**
 * Error context for enhanced debugging
 */
export interface ErrorContext {
  /** Unique correlation ID for request tracing */
  correlationId?: string;
  /** Timestamp when error occurred */
  timestamp?: Date;
  /** Additional context data */
  data?: Record<string, unknown>;
}

/**
 * Base error class for laroux.js
 * Enhanced with correlation ID for request tracing
 */
export class LarouxError extends Error {
  /** Unique correlation ID for request tracing */
  readonly correlationId: string;
  /** Timestamp when error occurred */
  readonly timestamp: Date;
  /** Additional context data */
  readonly context: Record<string, unknown>;

  constructor(
    message: string,
    public code: string | null = null,
    public hint: string | null = null,
    public docUrl: string | null = null,
    errorContext?: ErrorContext,
  ) {
    super(message);
    this.name = "LarouxError";

    // Set correlation ID (generate if not provided)
    this.correlationId = errorContext?.correlationId ?? crypto.randomUUID();
    this.timestamp = errorContext?.timestamp ?? new Date();
    this.context = errorContext?.data ?? {};

    // Auto-generate doc URL from error code if not provided
    if (code !== null && docUrl === null) {
      this.docUrl = getErrorDocUrl(code);
    }
  }

  /**
   * Create a new error with additional context
   */
  withContext(data: Record<string, unknown>): LarouxError {
    return new LarouxError(
      this.message,
      this.code,
      this.hint,
      this.docUrl,
      {
        correlationId: this.correlationId,
        timestamp: this.timestamp,
        data: { ...this.context, ...data },
      },
    );
  }
}

/**
 * Configuration error
 */
export class ConfigError extends LarouxError {
  constructor(message: string, code: string, hint: string | null = null) {
    super(message, code, hint);
    this.name = "ConfigError";
  }
}

/**
 * Build error
 */
export class BuildError extends LarouxError {
  constructor(message: string, code: string, hint: string | null = null) {
    super(message, code, hint);
    this.name = "BuildError";
  }
}

/**
 * Runtime error
 */
export class RuntimeError extends LarouxError {
  constructor(message: string, code: string, hint: string | null = null) {
    super(message, code, hint);
    this.name = "RuntimeError";
  }
}

/**
 * CLI error
 */
export class CLIError extends LarouxError {
  constructor(message: string, code: string, hint: string | null = null) {
    super(message, code, hint);
    this.name = "CLIError";
  }
}

/**
 * HMR error
 */
export class HMRError extends LarouxError {
  constructor(message: string, code: string, hint: string | null = null) {
    super(message, code, hint);
    this.name = "HMRError";
  }
}

/**
 * Format error for CLI output
 */
export function formatError(error: Error | LarouxError): string {
  const lines: string[] = [];

  // Error header
  lines.push("");
  lines.push(c.error("╭─ Error ") + c.error("─".repeat(60)));

  // Error name, code, and correlation ID
  if (error instanceof LarouxError) {
    const codeStr = error.code !== null ? c.dim(` [${error.code}]`) : "";
    const corrId = c.dim(` (${error.correlationId.slice(0, 8)})`);
    lines.push(c.error("│ ") + c.bold(error.name) + codeStr + corrId);
  } else {
    lines.push(c.error("│ ") + c.bold(error.name));
  }

  lines.push(c.error("│"));

  // Error message
  const messageLines = error.message.split("\n");
  messageLines.forEach((line) => {
    lines.push(c.error("│ ") + line);
  });

  // Hint (if available)
  if (error instanceof LarouxError && error.hint !== null) {
    lines.push(c.error("│"));
    lines.push(c.error("│ ") + c.dim("Hint:"));
    const hintLines = error.hint.split("\n");
    hintLines.forEach((line) => {
      lines.push(c.error("│ ") + c.dim("  " + line));
    });
  }

  // Documentation link (if available)
  if (error instanceof LarouxError && error.docUrl !== null) {
    lines.push(c.error("│"));
    lines.push(
      c.error("│ ") + c.dim("Documentation: ") + c.link(error.docUrl),
    );
  }

  // Stack trace (in development)
  if (Deno.env.get("DEBUG") !== "" && error.stack !== undefined) {
    lines.push(c.error("│"));
    lines.push(c.error("│ ") + c.dim("Stack trace:"));
    const stackLines = error.stack.split("\n").slice(1, 6); // First 5 lines
    stackLines.forEach((line) => {
      lines.push(c.error("│ ") + c.dim("  " + line.trim()));
    });
  }

  lines.push(c.error("╰" + "─".repeat(70)));
  lines.push("");

  return lines.join("\n");
}

/**
 * Common error factories
 */
export const errors = {
  // CLI Errors (CLI001-099)
  /** Invalid CLI command */
  invalidCommand: (command: string, available: string[]) =>
    new CLIError(
      `Unknown command: ${c.code(command)}`,
      "CLI001",
      `Available commands: ${
        available.map((cmd) => c.code(cmd)).join(", ")
      }\n\nRun ${c.code("laroux --help")} for more information.`,
    ),

  /** Invalid template */
  invalidTemplate: (template: string, available: string[]) =>
    new CLIError(
      `Invalid template: ${c.code(template)}`,
      "CLI002",
      `Available templates: ${
        available.map((t) => c.code(t)).join(", ")
      }\n\nExample: laroux init my-app --template ${available[0]}`,
    ),

  /** Project already exists */
  projectExists: (path: string) =>
    new CLIError(
      `Project directory already exists: ${c.path(path)}`,
      "CLI003",
      `Choose a different directory name or remove the existing directory.`,
    ),

  // Build Errors (BUILD100-199)
  /** Module not found */
  moduleNotFound: (modulePath: string) =>
    new BuildError(
      `Module not found: ${c.path(modulePath)}`,
      "BUILD100",
      `Check that the file exists and the import path is correct.\n\nIf using path aliases, verify your laroux.config.ts.`,
    ),

  /** Build failed */
  buildFailed: (reason: string) =>
    new BuildError(
      `Build failed: ${reason}`,
      "BUILD101",
      `Check the error details above and fix any syntax or type errors.\n\nRun with --log-level debug for more details.`,
    ),

  /** Syntax error in component */
  syntaxError: (filePath: string, line: number, reason: string) =>
    new BuildError(
      `Syntax error in ${c.path(filePath)}:${line}`,
      "BUILD102",
      `${reason}\n\nCheck the syntax at the specified line.`,
    ),

  /** Client component parsing error */
  clientComponentError: (filePath: string, reason: string) =>
    new BuildError(
      `Failed to transform client component: ${c.path(filePath)}`,
      "BUILD103",
      `${reason}\n\nEnsure your component uses valid React syntax and "use client" directive.`,
    ),

  /** CSS processing error */
  cssError: (reason: string) =>
    new BuildError(
      `CSS processing failed: ${reason}`,
      "BUILD104",
      `Check your CSS files and PostCSS configuration.\n\nVerify postcss.config.js is properly configured for Tailwind CSS 4.0.`,
    ),

  // Runtime Errors (RUNTIME200-299)
  /** Port already in use */
  portInUse: (port: number) =>
    new RuntimeError(
      `Port ${port} is already in use`,
      "RUNTIME200",
      `Try a different port with: laroux dev --port ${
        port + 1
      }\n\nOr kill the process using port ${port}.`,
    ),

  /** Server action error */
  actionFailed: (actionId: string, reason: string) =>
    new RuntimeError(
      `Server action "${actionId}" failed`,
      "RUNTIME201",
      `${reason}\n\nCheck your server action implementation in actions.ts.`,
    ),

  /** Component render error */
  componentError: (componentName: string, reason: string) =>
    new RuntimeError(
      `Error rendering component: ${c.code(componentName)}`,
      "RUNTIME202",
      `${reason}\n\nCheck your component's props and dependencies.`,
    ),

  /** Server startup error */
  serverStartupFailed: (reason: string) =>
    new RuntimeError(
      `Failed to start server: ${reason}`,
      "RUNTIME203",
      `Check that required resources are available and not already in use.`,
    ),

  /** RSC payload error */
  rscPayloadError: (reason: string) =>
    new RuntimeError(
      `Failed to process RSC payload: ${reason}`,
      "RUNTIME204",
      `This is likely a framework bug. Please report this issue.`,
    ),

  // Config Errors (CONFIG300-399)
  /** Config file not found or invalid */
  invalidConfig: (path: string, reason: string) =>
    new ConfigError(
      `Invalid configuration file: ${c.path(path)}`,
      "CONFIG300",
      `${reason}\n\nCheck your laroux.config.ts syntax and exports.`,
    ),

  /** Missing required directory */
  missingDirectory: (dir: string, purpose: string) =>
    new ConfigError(
      `Required directory not found: ${c.path(dir)}`,
      "CONFIG301",
      `This directory is needed for ${purpose}.\n\nCreate it with: mkdir -p ${dir}`,
    ),

  /** Invalid config option */
  invalidConfigOption: (option: string, value: unknown, expected: string) =>
    new ConfigError(
      `Invalid configuration option: ${c.code(option)}`,
      "CONFIG302",
      `Expected ${expected}, but got: ${
        JSON.stringify(value)
      }\n\nCheck the documentation for valid configuration options.`,
    ),

  // HMR Errors (HMR400-499)
  /** HMR connection failed */
  hmrConnectionFailed: (reason: string) =>
    new HMRError(
      `Hot Module Replacement connection failed: ${reason}`,
      "HMR400",
      `The HMR WebSocket connection could not be established.\n\nCheck that the dev server is running and accessible.`,
    ),

  /** HMR update failed */
  hmrUpdateFailed: (modulePath: string, reason: string) =>
    new HMRError(
      `Failed to apply HMR update for: ${c.path(modulePath)}`,
      "HMR401",
      `${reason}\n\nThe page will need a full reload.`,
    ),
};

/**
 * Handle uncaught errors
 */
export function handleUncaughtError(error: Error | LarouxError) {
  errorLogger.error(formatError(error));

  // Exit with error code
  Deno.exit(1);
}

/**
 * Setup global error handlers
 */
export function setupErrorHandlers() {
  // Handle uncaught exceptions
  globalThis.addEventListener("error", (event) => {
    event.preventDefault();
    handleUncaughtError(event.error);
  });

  // Handle unhandled promise rejections
  globalThis.addEventListener("unhandledrejection", (event) => {
    event.preventDefault();
    const error = event.reason instanceof Error
      ? event.reason
      : new Error(String(event.reason));
    handleUncaughtError(error);
  });
}
