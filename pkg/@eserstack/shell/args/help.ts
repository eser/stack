// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * Help text generation utilities
 *
 * @module
 */

import type { FlagDef } from "./types.ts";

/** A top-level shortcut listed in help: a name that runs a nested command. */
export type HelpShortcutMeta = {
  /** The shortcut as typed. */
  readonly name: string;
  /** The command path it runs, such as `["system", "install"]`. */
  readonly target: readonly string[];
  /** One line shown next to the shortcut. */
  readonly description: string;
};

/** What {@link generateHelp} needs to know about a command. */
export type HelpCommandMeta = {
  /** The command's name. */
  readonly name: string;
  /** Other names that run the same command. */
  readonly aliases?: readonly string[];
  /** One line describing the command. */
  readonly description?: string;
  /** A usage line that replaces the generated one. */
  readonly usage?: string;
  /** Example invocations, one per line. */
  readonly examples?: readonly string[];
  /** The flags the command accepts, persistent ones included. */
  readonly flags: readonly FlagDef[];
  /** Its subcommands. */
  readonly children: readonly HelpCommandMeta[];
  /** Shortcuts listed under the command. */
  readonly shortcuts?: readonly HelpShortcutMeta[];
};

const padRight = (str: string, len: number): string =>
  str + " ".repeat(Math.max(0, len - str.length));

const formatFlag = (flag: FlagDef): string => {
  const short = flag.short !== undefined ? `-${flag.short}, ` : "";
  const typeSuffix = flag.type !== "boolean" ? ` <${flag.type}>` : "";
  return `${short}--${flag.name}${typeSuffix}`;
};

const generateTitle = (meta: HelpCommandMeta, fullName: string): string[] => {
  const title =
    meta.description !== undefined
      ? `${fullName} - ${meta.description}`
      : fullName;
  return [title, ""];
};

const generateUsage = (meta: HelpCommandMeta, fullName: string): string[] => {
  if (meta.usage !== undefined) {
    return ["Usage:", `  ${meta.usage}`, ""];
  }

  const commands = meta.children.length > 0 ? " <command>" : "";
  const options = meta.flags.length > 0 ? " [options]" : "";
  return ["Usage:", `  ${fullName}${commands}${options}`, ""];
};

const generateCommands = (children: readonly HelpCommandMeta[]): string[] => {
  if (children.length === 0) return [];

  const nameColumn = (c: HelpCommandMeta): string => {
    if (c.aliases !== undefined && c.aliases.length > 0) {
      return `${c.name}, ${c.aliases.join(", ")}`;
    }
    return c.name;
  };

  const maxLen = Math.max(...children.map((c) => nameColumn(c).length));
  const lines = children.map(
    (c) => `  ${padRight(nameColumn(c), maxLen + 2)}${c.description ?? ""}`,
  );
  return ["Commands:", ...lines, ""];
};

const generateShortcuts = (
  shortcuts: readonly HelpShortcutMeta[] | undefined,
): string[] => {
  if (shortcuts === undefined || shortcuts.length === 0) return [];

  const targetCol = (t: readonly string[]): string => `-> "${t.join(" ")}"`;
  const maxName = Math.max(...shortcuts.map((s) => s.name.length));
  const maxTarget = Math.max(
    ...shortcuts.map((s) => targetCol(s.target).length),
  );

  const lines = shortcuts.map(
    (s) =>
      `  ${padRight(s.name, maxName + 2)}${padRight(
        targetCol(s.target),
        maxTarget + 2,
      )}${s.description}`,
  );
  return ["Shortcuts:", ...lines, ""];
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
    ...generateShortcuts(meta.shortcuts),
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
