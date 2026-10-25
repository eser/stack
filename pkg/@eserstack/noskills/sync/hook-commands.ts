// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * The noskills hook commands the generated tool configs run, and how long
 * each tool waits for them. Claude Code, Codex, Copilot CLI and Kiro let a
 * tool call go ahead when its PreToolUse hook does not answer in time, so the
 * PreToolUse timeout bounds how long the hook may wait on the network before
 * the guard stops applying.
 *
 * @module
 */

import * as gitWrapper from "../commands/git-wrapper.ts";

/** The `invoke-hook` subcommands the tool configs run. */
export type HookEvent =
  | "session-start"
  | "pre-tool-use"
  | "post-file-write"
  | "post-bash"
  | "post-ask-user-question"
  | "stop";

const HOOK_EVENTS: readonly HookEvent[] = [
  "session-start",
  "pre-tool-use",
  "post-file-write",
  "post-bash",
  "post-ask-user-question",
  "stop",
];

/**
 * Seconds a tool waits for each hook. PreToolUse gets as long as the git
 * wrapper's check (`GIT_CHECK_TIMEOUT_SECONDS`): the default command,
 * `npx eser@latest noskills`, may ask the npm registry for the latest version
 * and download it before the hook runs. A hook that calls the Go binary
 * (cmd/noskills) answers in milliseconds without the network, so the long
 * limit only matters for configs that still start noskills through npx.
 */
export const HOOK_TIMEOUT_SECONDS: Readonly<Record<HookEvent, number>> = {
  "session-start": 5,
  "pre-tool-use": gitWrapper.GIT_CHECK_TIMEOUT_SECONDS,
  "post-file-write": 3,
  "post-bash": 3,
  "post-ask-user-question": 3,
  stop: 10,
};

/**
 * The shell command a tool config runs for one hook:
 * `<commandPrefix> invoke-hook <event> [args]`.
 */
export const hookCommand = (
  commandPrefix: string,
  event: HookEvent,
  args: readonly string[] = [],
): string => [commandPrefix, "invoke-hook", event, ...args].join(" ");

const NOSKILLS_HOOK = new RegExp(
  `\\binvoke-hook (?:${HOOK_EVENTS.join("|")})(?:\\s|$)`,
);

/**
 * True when `command` runs a noskills hook. A sync that merges its hooks into
 * a config file the user also edits replaces the entries this matches and
 * keeps the others.
 */
export const isNoskillsHookCommand = (command: unknown): boolean =>
  typeof command === "string" && NOSKILLS_HOOK.test(command);

const isRecord = (value: unknown): value is Readonly<Record<string, unknown>> =>
  value instanceof Object && !Array.isArray(value);

/**
 * The `hooks` of a Claude Code or Codex settings file, which map each event to
 * matcher groups that each hold a `hooks` list of handlers, without the
 * handlers that run a noskills hook. A group left without handlers is
 * dropped, and so is an event left without groups or whose value is not a
 * list. Groups of another shape stay as they are.
 */
export const userHookGroups = (hooks: unknown): Record<string, unknown[]> => {
  const kept: Record<string, unknown[]> = {};
  if (!isRecord(hooks)) return kept;

  for (const [event, groups] of Object.entries(hooks)) {
    if (!Array.isArray(groups)) continue;

    const userGroups = groups.flatMap((group: unknown) => {
      if (!isRecord(group) || !Array.isArray(group["hooks"])) return [group];

      const handlers = group["hooks"].filter((handler: unknown) =>
        !(isRecord(handler) && isNoskillsHookCommand(handler["command"]))
      );

      return handlers.length === 0 ? [] : [{ ...group, hooks: handlers }];
    });
    if (userGroups.length > 0) kept[event] = userGroups;
  }

  return kept;
};

/**
 * `userHooks` with noskills' groups added after the user's in each event, the
 * order in which the tool runs them.
 */
export const mergeHookGroups = (
  userHooks: Readonly<Record<string, readonly unknown[]>>,
  noskillsHooks: Readonly<Record<string, readonly unknown[]>>,
): Record<string, unknown[]> => {
  const merged: Record<string, unknown[]> = {};

  for (const [event, groups] of Object.entries(userHooks)) {
    merged[event] = [...groups];
  }
  for (const [event, groups] of Object.entries(noskillsHooks)) {
    merged[event] = [...(merged[event] ?? []), ...groups];
  }

  return merged;
};

// =============================================================================
// Commands that reach the network
// =============================================================================

// Runners that fetch the package they run from a registry when it is missing
// or, for a `@latest` spec, older than the registry's latest.
const PACKAGE_RUNNERS: ReadonlySet<string> = new Set(["npx", "pnpx", "bunx"]);
const SUBCOMMAND_RUNNERS: ReadonlyMap<string, ReadonlySet<string>> = new Map([
  ["npm", new Set(["exec", "x"])],
  ["pnpm", new Set(["dlx"])],
  ["yarn", new Set(["dlx"])],
]);
// Module specifiers Deno downloads when its cache lacks them.
const REMOTE_MODULE = /^(?:jsr|npm|https?):/;

/**
 * How a noskills command reaches the network before noskills runs, or null
 * when it runs an installed noskills: `npx`, `pnpx`, `bunx`, `npm exec`,
 * `npm x`, `pnpm dlx` and `yarn dlx` may ask a package registry for the
 * package and download it, and `deno run` or `deno x` with a `jsr:`, `npm:`
 * or `http(s):` module downloads the module when its cache lacks it. Leading
 * `NAME=value` assignments are skipped.
 *
 * Every hook and every check of the git wrapper starts this command, so a
 * slow registry delays each of them.
 */
export const networkRunnerOf = (command: string): string | null => {
  const words = command.trim().split(/\s+/);
  const start = words.findIndex((word) =>
    !/^[A-Za-z_][A-Za-z0-9_]*=/.test(word)
  );
  if (start === -1) return null;

  const [program = "", subcommand = "", ...rest] = words.slice(start);

  if (PACKAGE_RUNNERS.has(program)) return program;
  if (SUBCOMMAND_RUNNERS.get(program)?.has(subcommand) === true) {
    return `${program} ${subcommand}`;
  }
  if (program === "deno" && (subcommand === "run" || subcommand === "x")) {
    const module = rest.find((word) => REMOTE_MODULE.test(word));

    return module === undefined ? null : `deno ${subcommand} ${module}`;
  }

  return null;
};

/**
 * The warning `noskills init` shows when `command` reaches the network before
 * noskills runs (`networkRunnerOf`), or null when it does not.
 */
export const networkCommandWarning = (command: string): string | null => {
  const runner = networkRunnerOf(command);
  if (runner === null) return null;

  return `The hooks run noskills as "${command}", and ${runner} can wait on the network before noskills starts. Claude Code, Codex, Copilot CLI and Kiro let a tool call go ahead when its PreToolUse hook does not answer within ${
    HOOK_TIMEOUT_SECONDS["pre-tool-use"]
  } seconds, so the git guard and the protected-file check would not apply to that call. Install the eser CLI (npm install -g eser, or deno install -g -A jsr:@eserstack/cli) and run "eser noskills init" so the hooks call the installed command.`;
};
