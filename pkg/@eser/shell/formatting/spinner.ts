// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * Terminal spinner for CLI applications.
 * Cross-runtime compatible - works in Deno, Node.js, and Bun.
 */

import { c } from "./colors.ts";

/**
 * Write to stdout without newline.
 * Cross-runtime compatible function.
 * @throws Error if no supported runtime is detected
 */
const writeStdout = (text: string): void => {
  const encoder = new TextEncoder();
  const data = encoder.encode(text);

  if (typeof globalThis.Deno !== "undefined") {
    Deno.stdout.writeSync(data);
  } else if (
    typeof globalThis.process !== "undefined" &&
    globalThis.process.stdout !== undefined
  ) {
    globalThis.process.stdout.write(data);
  } else {
    throw new Error(
      "Spinner requires a terminal environment (Deno, Node.js, or Bun)",
    );
  }
};

/**
 * Spinner configuration options.
 */
export type SpinnerOptions = {
  /** Spinner frames (default: braille dots) */
  frames?: string[];
  /** Frame interval in milliseconds (default: 80) */
  interval?: number;
};

const DEFAULT_FRAMES = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];
const DEFAULT_INTERVAL = 80;

/**
 * Simple progress spinner for CLI applications.
 *
 * @example
 * ```typescript
 * import { Spinner } from "@eser/shell/formatting";
 *
 * const spinner = new Spinner("Loading...");
 * spinner.start();
 *
 * // Do some work...
 * await someAsyncOperation();
 *
 * spinner.succeed("Done!");
 * // or
 * spinner.fail("Failed!");
 * ```
 */
export class Spinner {
  private intervalId?: ReturnType<typeof setInterval>;
  private frames: string[];
  private frameInterval: number;
  private currentFrame = 0;
  private message: string;

  constructor(message: string, options: SpinnerOptions = {}) {
    this.message = message;
    this.frames = options.frames ?? DEFAULT_FRAMES;
    this.frameInterval = options.interval ?? DEFAULT_INTERVAL;
  }

  /**
   * Start the spinner animation.
   */
  start(): this {
    this.intervalId = setInterval(() => {
      const frame = this.frames[this.currentFrame];
      writeStdout(`\r${c.brand(frame ?? "")} ${this.message}`);
      this.currentFrame = (this.currentFrame + 1) % this.frames.length;
    }, this.frameInterval);

    return this;
  }

  /**
   * Update the spinner message.
   */
  update(message: string): this {
    this.message = message;
    return this;
  }

  /**
   * Stop the spinner with a success message.
   */
  succeed(message?: string): void {
    this.stop();
    console.log(c.success("✓") + " " + (message ?? this.message));
  }

  /**
   * Stop the spinner with an error message.
   */
  fail(message?: string): void {
    this.stop();
    console.log(c.error("✗") + " " + (message ?? this.message));
  }

  /**
   * Stop the spinner with a warning message.
   */
  warn(message?: string): void {
    this.stop();
    console.log(c.warning("⚠") + " " + (message ?? this.message));
  }

  /**
   * Stop the spinner with an info message.
   */
  info(message?: string): void {
    this.stop();
    console.log(c.info("ℹ") + " " + (message ?? this.message));
  }

  /**
   * Stop the spinner without any message.
   */
  stop(): void {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      writeStdout("\r" + " ".repeat(this.message.length + 4) + "\r");
    }
  }
}
