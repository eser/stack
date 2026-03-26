// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * Terminal spinner for CLI applications.
 * Uses @eser/streams for all output.
 */

import type * as streams from "@eser/streams";
import * as span from "@eser/streams/span";

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
 * import * as streams from "@eser/streams";
 *
 * const out = streams.output({
 *   renderer: streams.renderers.ansi(),
 *   sink: streams.sinks.stdout(),
 * });
 * const spinner = new Spinner(out, "Loading...");
 * spinner.start();
 *
 * await someAsyncOperation();
 *
 * spinner.succeed("Done!");
 * ```
 */
export class Spinner {
  private intervalId?: ReturnType<typeof setInterval>;
  private frames: string[];
  private frameInterval: number;
  private currentFrame = 0;
  private message: string;
  private output: streams.Output;

  constructor(
    output: streams.Output,
    message: string,
    options: SpinnerOptions = {},
  ) {
    this.output = output;
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
      this.output.write(
        span.text(`\r`),
        span.cyan(frame ?? ""),
        span.text(` ${this.message}`),
      );
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
    this.output.writeln(
      span.green("✓"),
      span.text(` ${message ?? this.message}`),
    );
  }

  /**
   * Stop the spinner with an error message.
   */
  fail(message?: string): void {
    this.stop();
    this.output.writeln(
      span.red("✗"),
      span.text(` ${message ?? this.message}`),
    );
  }

  /**
   * Stop the spinner with a warning message.
   */
  warn(message?: string): void {
    this.stop();
    this.output.writeln(
      span.yellow("⚠"),
      span.text(` ${message ?? this.message}`),
    );
  }

  /**
   * Stop the spinner with an info message.
   */
  info(message?: string): void {
    this.stop();
    this.output.writeln(
      span.blue("ℹ"),
      span.text(` ${message ?? this.message}`),
    );
  }

  /**
   * Stop the spinner without any message.
   */
  stop(): void {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.output.write(
        span.text(`\r${" ".repeat(this.message.length + 4)}\r`),
      );
    }
  }
}
