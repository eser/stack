// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * Help text generation utilities
 *
 * @module
 */

import type { FlagDef } from "./types.ts";

/**
 * Internal command metadata for help generation
 */
export type HelpCommandMeta = {
  readonly name: string;
  readonly description?: string;
  readonly usage?: string;
  readonly examples?: readonly string[];
  readonly flags: readonly FlagDef[];
  readonly children: readonly HelpCommandMeta[];
};

const padRight = (str: string, len: number): string => {
  return str + " ".repeat(Math.max(0, len - str.length));
};

const formatFlag = (flag: FlagDef): string => {
  let name = `--${flag.name}`;
  if (flag.short !== undefined) {
    name = `-${flag.short}, ${name}`;
  }

  if (flag.type !== "boolean") {
    name += ` <${flag.type}>`;
  }

  return name;
};

/**
 * Generate help text for a command
 */
export const generateHelp = (
  meta: HelpCommandMeta,
  commandPath: readonly string[],
): string => {
  const lines: string[] = [];

  // Title and description
  const fullName = commandPath.join(" ");
  if (meta.description !== undefined) {
    lines.push(`${fullName} - ${meta.description}`);
  } else {
    lines.push(fullName);
  }
  lines.push("");

  // Usage
  if (meta.usage !== undefined) {
    lines.push("Usage:");
    lines.push(`  ${meta.usage}`);
  } else {
    let usage = fullName;
    if (meta.children.length > 0) {
      usage += " <command>";
    }
    if (meta.flags.length > 0) {
      usage += " [options]";
    }
    lines.push("Usage:");
    lines.push(`  ${usage}`);
  }
  lines.push("");

  // Commands
  if (meta.children.length > 0) {
    lines.push("Commands:");
    const maxLen = Math.max(...meta.children.map((c) => c.name.length));
    for (const child of meta.children) {
      const desc = child.description ?? "";
      lines.push(`  ${padRight(child.name, maxLen + 2)}${desc}`);
    }
    lines.push("");
  }

  // Options
  if (meta.flags.length > 0) {
    lines.push("Options:");
    const formatted = meta.flags.map((f) => ({
      flag: formatFlag(f),
      desc: f.description,
    }));
    const maxLen = Math.max(...formatted.map((f) => f.flag.length));
    for (const { flag, desc } of formatted) {
      lines.push(`  ${padRight(flag, maxLen + 2)}${desc}`);
    }
    lines.push("");
  }

  // Examples
  if (meta.examples !== undefined && meta.examples.length > 0) {
    lines.push("Examples:");
    for (const example of meta.examples) {
      lines.push(`  ${example}`);
    }
    lines.push("");
  }

  // Footer hint
  if (meta.children.length > 0) {
    lines.push(
      `Run '${fullName} <command> --help' for more information on a command.`,
    );
  }

  return lines.join("\n");
};
