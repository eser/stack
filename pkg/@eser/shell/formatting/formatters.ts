// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * Pure formatting functions that return structured `FormattedLine[]`.
 *
 * These functions produce formatted text without writing it anywhere —
 * the output destination is determined by the `OutputTarget` they are
 * emitted through. This is the "format" layer of the two-layer
 * architecture (format + emit).
 *
 * @module
 */

import { c } from "./colors.ts";
import type { OutputChannel } from "./types.ts";

/**
 * A formatted line with its intended output channel.
 */
export type FormattedLine = {
  readonly line: string;
  readonly channel: OutputChannel;
};

/** Format a section header with underline. */
export const formatSection = (title: string): FormattedLine[] => [
  { line: "", channel: "stdout" },
  { line: c.bold(title), channel: "stdout" },
  { line: c.gray("─".repeat(title.length)), channel: "stdout" },
];

/** Format a success message with checkmark. */
export const formatSuccess = (
  message: string,
  details: string | null = null,
): FormattedLine[] => {
  const lines: FormattedLine[] = [
    { line: `${c.success("✓")} ${message}`, channel: "stdout" },
  ];
  if (details !== null) {
    lines.push({ line: c.dim(`  ${details}`), channel: "stdout" });
  }
  return lines;
};

/** Format an error message with X mark. */
export const formatError = (
  message: string,
  details: string | null = null,
): FormattedLine[] => {
  const lines: FormattedLine[] = [
    { line: `${c.error("✗")} ${message}`, channel: "stderr" },
  ];
  if (details !== null) {
    lines.push({ line: c.dim(`  ${details}`), channel: "stderr" });
  }
  return lines;
};

/** Format a warning message with warning symbol. */
export const formatWarning = (
  message: string,
  details: string | null = null,
): FormattedLine[] => {
  const lines: FormattedLine[] = [
    { line: `${c.warning("⚠")} ${message}`, channel: "stderr" },
  ];
  if (details !== null) {
    lines.push({ line: c.dim(`  ${details}`), channel: "stderr" });
  }
  return lines;
};

/** Format an info message with info symbol. */
export const formatInfo = (
  message: string,
  details: string | null = null,
): FormattedLine[] => {
  const lines: FormattedLine[] = [
    { line: `${c.info("ℹ")} ${message}`, channel: "stdout" },
  ];
  if (details !== null) {
    lines.push({ line: c.dim(`  ${details}`), channel: "stdout" });
  }
  return lines;
};

/** Format a labeled item (key-value pair). */
export const formatItem = (label: string, value: string): FormattedLine[] => [
  { line: `  ${c.dim(label + ":")} ${value}`, channel: "stdout" },
];

/** Format a list of next steps. */
export const formatNextSteps = (steps: string[]): FormattedLine[] => {
  const lines: FormattedLine[] = [
    { line: "", channel: "stdout" },
    { line: c.bold("Next steps:"), channel: "stdout" },
    { line: "", channel: "stdout" },
  ];
  steps.forEach((step, i) => {
    lines.push({
      line: `  ${c.dim((i + 1).toString() + ".")} ${step}`,
      channel: "stdout",
    });
  });
  lines.push({ line: "", channel: "stdout" });
  return lines;
};

/** Format text in a box for emphasis. */
export const formatBox = (
  text: string,
  color: (s: string) => string = c.brand,
): FormattedLine[] => {
  if (text.length === 0) {
    return [];
  }
  const textLines = text.split("\n");
  const lengths = textLines.map((l) => l.length);
  const maxLength = lengths.length > 0 ? Math.max(...lengths) : 0;
  const border = "─".repeat(maxLength + 2);

  const lines: FormattedLine[] = [
    { line: color(`╭${border}╮`), channel: "stdout" },
  ];
  textLines.forEach((textLine) => {
    const padding = " ".repeat(maxLength - textLine.length);
    lines.push({
      line: `${color("│")} ${textLine}${padding} ${color("│")}`,
      channel: "stdout",
    });
  });
  lines.push({ line: color(`╰${border}╯`), channel: "stdout" });
  return lines;
};

/** Format a clear-terminal escape sequence. */
export const formatClearTerminal = (): FormattedLine[] => [
  { line: "\x1Bc", channel: "stdout" },
];

/** Format a blank line. */
export const formatBlank = (): FormattedLine[] => [
  { line: "", channel: "stdout" },
];

/** Format a horizontal rule. */
export const formatRule = (
  width = 40,
  char = "─",
): FormattedLine[] => [
  { line: c.dim(char.repeat(width)), channel: "stdout" },
];

/** Format a table of key-value pairs. */
export const formatTable = (
  items: Record<string, string>,
  options: { indent?: number; labelWidth?: number } = {},
): FormattedLine[] => {
  const entries = Object.entries(items);
  if (entries.length === 0) {
    return [];
  }
  const { indent = 2, labelWidth } = options;
  const prefix = " ".repeat(indent);
  const keys = Object.keys(items);
  const maxLabelLength = labelWidth ??
    (keys.length > 0 ? Math.max(...keys.map((k) => k.length)) : 0);

  return entries.map(([label, value]) => {
    const paddedLabel = label.padEnd(maxLabelLength);
    return {
      line: `${prefix}${c.dim(paddedLabel + ":")} ${value}`,
      channel: "stdout" as OutputChannel,
    };
  });
};
