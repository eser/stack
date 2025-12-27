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

const padRight = (str: string, len: number): string =>
  str + " ".repeat(Math.max(0, len - str.length));

const formatFlag = (flag: FlagDef): string => {
  const short = flag.short !== undefined ? `-${flag.short}, ` : "";
  const typeSuffix = flag.type !== "boolean" ? ` <${flag.type}>` : "";
  return `${short}--${flag.name}${typeSuffix}`;
};

const generateTitle = (
  meta: HelpCommandMeta,
  fullName: string,
): string[] => {
  const title = meta.description !== undefined
    ? `${fullName} - ${meta.description}`
    : fullName;
  return [title, ""];
};

const generateUsage = (
  meta: HelpCommandMeta,
  fullName: string,
): string[] => {
  if (meta.usage !== undefined) {
    return ["Usage:", `  ${meta.usage}`, ""];
  }

  const commands = meta.children.length > 0 ? " <command>" : "";
  const options = meta.flags.length > 0 ? " [options]" : "";
  return ["Usage:", `  ${fullName}${commands}${options}`, ""];
};

const generateCommands = (children: readonly HelpCommandMeta[]): string[] => {
  if (children.length === 0) return [];

  const maxLen = Math.max(...children.map((c) => c.name.length));
  const lines = children.map(
    (c) => `  ${padRight(c.name, maxLen + 2)}${c.description ?? ""}`,
  );
  return ["Commands:", ...lines, ""];
};

const generateOptions = (flags: readonly FlagDef[]): string[] => {
  if (flags.length === 0) return [];

  const formatted = flags.map((f) => ({
    flag: formatFlag(f),
    desc: f.description,
  }));
  const maxLen = Math.max(...formatted.map((f) => f.flag.length));
  const lines = formatted.map(
    ({ flag, desc }) => `  ${padRight(flag, maxLen + 2)}${desc}`,
  );
  return ["Options:", ...lines, ""];
};

const generateExamples = (examples?: readonly string[]): string[] => {
  if (!examples?.length) return [];
  return ["Examples:", ...examples.map((e) => `  ${e}`), ""];
};

/**
 * Generate help text for a command
 */
export const generateHelp = (
  meta: HelpCommandMeta,
  commandPath: readonly string[],
): string => {
  const fullName = commandPath.join(" ");

  const sections = [
    ...generateTitle(meta, fullName),
    ...generateUsage(meta, fullName),
    ...generateCommands(meta.children),
    ...generateOptions(meta.flags),
    ...generateExamples(meta.examples),
  ];

  if (meta.children.length > 0) {
    sections.push(
      `Run '${fullName} <command> --help' for more information on a command.`,
    );
  }

  return sections.join("\n");
};
