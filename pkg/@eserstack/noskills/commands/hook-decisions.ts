// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * Hook decision logic: pure functions for the `invoke-hook` handlers.
 *
 * invoke-hook.ts reads the hook input, loads state and writes the answer;
 * every decision in between lives here, so it can be unit-tested without
 * stdin, stdout or a project on disk: reading the hook input, the protected
 * files, the PreToolUse phase gate, the Stop and PostToolUse filters, the
 * SessionStart output and the AskUserQuestion step.
 *
 * The git-guard predicates now live in `@eserstack/agents/guards` (the canonical
 * home, shared with the agent driving loop's safety policy); they are re-exported
 * here so existing importers keep working and the two never drift.
 *
 * @module
 */

import * as yaml from "@eemeli/yaml";
import * as gitGuard from "@eserstack/agents/guards";
import type * as schema from "../state/schema.ts";
import * as persistence from "../state/persistence.ts";
import * as compiler from "../context/compiler.ts";
import * as questions from "../context/questions.ts";
import * as questionSimilarity from "../context/question-similarity.ts";
import type * as askToken from "../state/ask-token.ts";
import * as gitWrapper from "./git-wrapper.ts";

// =============================================================================
// Hook input: the JSON a hook reads on stdin
// =============================================================================

/** A hook's stdin JSON, or one object inside it, with no field checked yet. */
export type HookInput = Readonly<Record<string, unknown>>;

const isRecord = (value: unknown): value is HookInput =>
  value instanceof Object && !Array.isArray(value);

/**
 * Parses a hook's stdin text. Text that is not a JSON object gives an empty
 * input, which every hook treats as a call with nothing to check.
 */
export const parseHookInput = (text: string): HookInput => {
  try {
    const parsed: unknown = JSON.parse(text);

    return isRecord(parsed) ? parsed : {};
  } catch {
    return {};
  }
};

/** The string a field holds, or "" when it is missing or not a string. */
export const stringField = (record: HookInput, key: string): string => {
  const value = record[key];

  return typeof value === "string" ? value : "";
};

/**
 * A tool input as an object: an object as it is, a string that holds a JSON
 * object parsed, and any other string kept as `input`, the way a patch tool's
 * text may arrive. Null for anything else.
 */
const toolArgumentsOf = (value: unknown): HookInput | null => {
  if (isRecord(value)) return value;
  if (typeof value !== "string") return null;

  try {
    const parsed: unknown = JSON.parse(value);
    if (isRecord(parsed)) return parsed;
  } catch {
    // Not JSON: the text itself is the argument.
  }

  return { input: value };
};

/**
 * The name of the tool a tool hook guards: `tool_name`, as Claude Code,
 * Codex, Kiro, the OpenCode plugin and Copilot CLI's PascalCase events send
 * it, or Copilot CLI's camelCase `toolName`. "" when the input names none.
 */
export const toolNameOf = (input: HookInput): string => {
  const toolName = stringField(input, "tool_name");

  return toolName !== "" ? toolName : stringField(input, "toolName");
};

/**
 * The input of the tool call a tool hook guards, or an empty object:
 * `tool_input`, or Copilot CLI's camelCase `toolArgs`. Copilot CLI sends the
 * arguments as a JSON string when it cannot parse them
 * (docs.github.com/en/copilot/reference/hooks-configuration), so a string is
 * parsed here.
 */
export const toolInputOf = (input: HookInput): HookInput =>
  toolArgumentsOf(input["tool_input"]) ??
  toolArgumentsOf(input["toolArgs"]) ??
  {};

/**
 * The file a file tool's input names: `file_path` (Claude Code), `filePath`
 * (OpenCode) or `path` (Copilot CLI, Kiro). "" when it names none.
 */
export const filePathOf = (toolInput: HookInput): string => {
  for (const key of ["file_path", "filePath", "path"]) {
    const filePath = stringField(toolInput, key);
    if (filePath !== "") return filePath;
  }

  return "";
};

/**
 * The project a hook works in: the `cwd` the tool sends, then
 * NOSKILLS_PROJECT_ROOT (`envRoot`), then the hook's own working directory.
 */
export const hookRoot = (
  input: HookInput,
  envRoot: string | undefined,
  processCwd: string,
): string => {
  const cwd = stringField(input, "cwd");
  if (cwd !== "") return cwd;

  return envRoot !== undefined && envRoot !== "" ? envRoot : processCwd;
};

// =============================================================================
// Tool calls: each agent tool's names and inputs, in the checks' terms
// =============================================================================
//
// What each tool sends a PreToolUse hook, from its documentation:
// - Claude Code: `tool_name` Bash, Write, Edit or MultiEdit with `tool_input`
//   (code.claude.com/docs/en/hooks).
// - Codex: `tool_name` Bash for shell commands and exec_command, apply_patch
//   for file edits; both carry `tool_input.command`, the patch text for
//   apply_patch (developers.openai.com/codex/hooks, "PreToolUse").
// - Copilot CLI: camelCase events send `toolName` (bash, powershell, create,
//   edit, ...) and `toolArgs`; PascalCase events send `tool_name` as Claude's
//   name for the tool, so bash is Bash, create is Write and edit,
//   str_replace_editor and apply_patch are Edit
//   (docs.github.com/en/copilot/reference/hooks-configuration). The shell
//   tools take `command`; the arguments of create and edit are not documented.
// - Kiro: `tool_name` and `tool_input` (kiro.dev/docs/hooks/types). Its shell
//   tool is execute_bash (aliases shell, execute_cmd) and its write tools are
//   fs_write (aliases write, fsWrite), fs_append, str_replace and delete_file
//   (kiro.dev/docs/tools); the fields of their inputs are not documented.
// - OpenCode: the generated plugin passes `tool.execute.before`'s tool and
//   args as `tool_name` and `tool_input` (opencode.ai/docs/plugins). bash
//   takes `command`, apply_patch takes `patchText` (opencode.ai/docs/tools),
//   write takes `filePath` and `content`, and edit takes `filePath`,
//   `oldString`, `newString` and `replaceAll` (the tool definitions in
//   packages/opencode/src/tool/ of github.com/sst/opencode).
//
// Where a write tool's input does not say what the file holds afterwards,
// the change counts as unknown, and the protected-file check refuses an
// unknown change to a protected file.

/** The tools that run a shell command from `tool_input.command`. */
const SHELL_TOOLS: ReadonlySet<string> = new Set([
  "Bash",
  "bash",
  "powershell",
  "shell",
  "execute_bash",
  "execute_cmd",
]);

/** The tools that create, change or delete files. */
const FILE_TOOLS: ReadonlySet<string> = new Set([
  "Write",
  "Edit",
  "MultiEdit",
  "write",
  "edit",
  "create",
  "str_replace_editor",
  "apply_patch",
  "fs_write",
  "fsWrite",
  "fs_append",
  "str_replace",
  "delete_file",
]);

/** File tools whose input never gives a file's whole new content. */
const PARTIAL_FILE_TOOLS: ReadonlySet<string> = new Set([
  "fs_append",
  "delete_file",
]);

/** The Claude Code file tools `contentAfterEdit` works out the result of. */
export type FileEditTool = "Write" | "Edit" | "MultiEdit";

/**
 * One file a tool call changes. `edit` is the call as the input of a Claude
 * Code Write, Edit or MultiEdit call, from which `contentAfterEdit` works out
 * the file's new content, or null when the call does not say what the file
 * holds afterwards: a patch, an append, a delete, or an input of another shape.
 */
export type FileChange = {
  readonly path: string;
  readonly edit: {
    readonly tool: FileEditTool;
    readonly input: HookInput;
  } | null;
};

/**
 * A tool call in the terms the PreToolUse checks use: a shell command, the
 * files a file tool changes, or another tool, which the checks leave alone.
 */
export type ToolCall =
  | { readonly kind: "shell"; readonly command: string }
  | { readonly kind: "file"; readonly changes: readonly FileChange[] }
  | { readonly kind: "other" };

/**
 * One text replacement in Claude Code's field names, from Claude Code's
 * `old_string`, OpenCode's `oldString` or the `old_str` of Copilot CLI and
 * Kiro, or null when the object holds none.
 */
const replacementInputOf = (value: unknown): HookInput | null => {
  if (!isRecord(value)) return null;

  const pairs = [
    ["old_string", "new_string", "replace_all"],
    ["oldString", "newString", "replaceAll"],
    ["old_str", "new_str", "replace_all"],
  ] as const;

  for (const [oldKey, newKey, allKey] of pairs) {
    const oldString = value[oldKey];
    const newString = value[newKey];
    if (typeof oldString === "string" && typeof newString === "string") {
      return {
        old_string: oldString,
        new_string: newString,
        replace_all: value[allKey] === true,
      };
    }
  }

  return null;
};

/**
 * The call as a Claude Code Write, Edit or MultiEdit input, or null when its
 * input does not say what the file holds afterwards.
 */
const fileEditOf = (
  toolName: string,
  toolInput: HookInput,
): FileChange["edit"] => {
  if (PARTIAL_FILE_TOOLS.has(toolName)) return null;

  // Kiro's write tool may name its operation; append and insert keep the
  // rest of the file, which the input does not hold.
  const operation = stringField(toolInput, "command");
  if (operation === "append" || operation === "insert") return null;

  const edits = toolInput["edits"];
  if (Array.isArray(edits)) {
    const replacements = edits.map(replacementInputOf);

    return replacements.every((r) => r !== null)
      ? { tool: "MultiEdit", input: { edits: replacements } }
      : null;
  }

  const replacement = replacementInputOf(toolInput);
  if (replacement !== null) return { tool: "Edit", input: replacement };

  for (const key of ["content", "file_text"]) {
    const content = toolInput[key];
    if (typeof content === "string") {
      return { tool: "Write", input: { content } };
    }
  }

  return null;
};

const PATCH_FILE_LINE =
  /^\*\*\* (?:Add File|Update File|Delete File|Move to): (.+)$/gm;

/**
 * The patch text a patch tool's input holds: Codex's `command`, OpenCode's
 * `patchText`, or another text field that holds file markers. Null when the
 * input holds no patch.
 */
const patchTextOf = (toolInput: HookInput): string | null => {
  for (const key of ["patchText", "command", "patch", "input"]) {
    const text = stringField(toolInput, key);
    if (text.match(PATCH_FILE_LINE) !== null) return text;
  }

  return null;
};

/**
 * The files a patch adds, updates, deletes or moves to, as its marker lines
 * name them (`*** Update File: src/a.ts`).
 */
export const patchPaths = (patch: string): readonly string[] => {
  const paths = [...patch.matchAll(PATCH_FILE_LINE)]
    .map((match) => (match[1] ?? "").trim())
    .filter((path) => path !== "");

  return [...new Set(paths)];
};

/**
 * One tool call in the checks' terms, from the tool's own name and input,
 * whichever agent tool sent it (see the list above this section).
 */
export const toolCallOf = (
  toolName: string,
  toolInput: HookInput,
): ToolCall => {
  if (SHELL_TOOLS.has(toolName)) {
    return { kind: "shell", command: stringField(toolInput, "command") };
  }
  if (!FILE_TOOLS.has(toolName)) return { kind: "other" };

  const patch = patchTextOf(toolInput);
  if (patch !== null) {
    return {
      kind: "file",
      changes: patchPaths(patch).map((path) => ({ path, edit: null })),
    };
  }

  const path = filePathOf(toolInput);

  return {
    kind: "file",
    changes:
      path === "" ? [] : [{ path, edit: fileEditOf(toolName, toolInput) }],
  };
};

/** The tool call a tool hook's input describes (`toolCallOf`). */
export const hookToolCall = (input: HookInput): ToolCall =>
  toolCallOf(toolNameOf(input), toolInputOf(input));

/**
 * How the tool that ran the hook reads a PreToolUse answer:
 * - `claude`: JSON with `hookSpecificOutput`. Claude Code, Codex, Copilot
 *   CLI's PascalCase events and the OpenCode plugin.
 * - `copilot`: Copilot CLI's camelCase events, JSON with a top-level
 *   `permissionDecision`.
 * - `kiro`: Kiro, which sends camelCase event names and reads the exit code
 *   and stderr.
 *
 * Every one of them takes exit code 2 with the reason on stderr as a denial,
 * so the hook refuses a call that way whatever this returns.
 */
export type HookDialect = "claude" | "copilot" | "kiro";

/** The dialect of the tool that sent `input` (see `HookDialect`). */
export const hookDialectOf = (input: HookInput): HookDialect => {
  if (input["tool_name"] === undefined && input["toolName"] !== undefined) {
    return "copilot";
  }
  if (stringField(input, "hook_event_name") === "preToolUse") return "kiro";

  return "claude";
};

// =============================================================================
// noskills command detection (control plane whitelist)
// =============================================================================

/** Check if a Bash command is a noskills/nos CLI command (control plane). */
export const isNoskillsCommand = (command: string): boolean => {
  const trimmed = command.trim();

  return (
    trimmed.includes("noskills") ||
    trimmed.includes(" nos ") ||
    trimmed.endsWith(" nos") ||
    trimmed.startsWith("nos ")
  );
};

// =============================================================================
// Git Allowlist — read-only commands only (canonical: @eserstack/agents/guards)
// =============================================================================

export {
  containsGitWriteBypass,
  extractGitInvocations,
  feedsShellFromStdin,
  hasGitWrite,
  isGitAllowed,
  isGitReadOnly,
  shellScriptTargets,
  stripFlagValues,
  writesFile,
} from "@eserstack/agents/guards";

// =============================================================================
// Protected files: only the user and the noskills CLI change them
// =============================================================================

/**
 * A file that controls the git guards, so an agent that could change it could
 * turn them off:
 * - `manifest`: `.eser/manifest.yml`. Its noskills section holds allowGit and
 *   the command the git wrapper runs; the file's other sections stay editable.
 * - `git-wrapper`: the generated wrapper directory, `.eser/.state/bin/`.
 */
export type ProtectedFile = "manifest" | "git-wrapper";

const MANIFEST_PATH = persistence.paths.manifestFile;
const MANIFEST_NAME = MANIFEST_PATH.split("/").pop() ?? MANIFEST_PATH;
// The wrapper directory without the leading `.eser/`, as a command run inside
// `.eser` names it.
const WRAPPER_TAIL = gitWrapper.WRAPPER_DIR.slice(
  persistence.paths.eserDir.length + 1,
);

/**
 * The protected file an absolute path names, or null. Any `.eser` directory
 * counts, not only the one in the project root, and case is ignored because
 * the default macOS and Windows file systems ignore it.
 */
export const protectedFileAt = (absolutePath: string): ProtectedFile | null => {
  const path = absolutePath.replaceAll("\\", "/").toLowerCase();
  const wrapperDir = `/${gitWrapper.WRAPPER_DIR}`.toLowerCase();

  if (path.endsWith(`/${MANIFEST_PATH}`.toLowerCase())) return "manifest";
  if (path.endsWith(wrapperDir) || path.includes(`${wrapperDir}/`)) {
    return "git-wrapper";
  }

  return null;
};

/** One replacement, as Claude Code's Edit and MultiEdit tools take it. */
type TextReplacement = {
  readonly oldString: string;
  readonly newString: string;
  readonly replaceAll: boolean;
};

const readReplacement = (value: unknown): TextReplacement | null => {
  if (!(value instanceof Object)) return null;

  const fields = value as Readonly<Record<string, unknown>>;
  const oldString = fields["old_string"];
  const newString = fields["new_string"];
  if (typeof oldString !== "string" || typeof newString !== "string") {
    return null;
  }

  return { oldString, newString, replaceAll: fields["replace_all"] === true };
};

const applyReplacement = (
  content: string | null,
  replacement: TextReplacement,
): string | null => {
  // An empty old_string creates the file; the tool refuses it on an existing one.
  if (replacement.oldString === "") {
    return content === null ? replacement.newString : null;
  }
  if (content === null || !content.includes(replacement.oldString)) {
    return null;
  }

  // A replacer function, because a replacement string would expand `$&`.
  const insert = (): string => replacement.newString;

  return replacement.replaceAll
    ? content.replaceAll(replacement.oldString, insert)
    : content.replace(replacement.oldString, insert);
};

/**
 * The content a Write, Edit or MultiEdit call leaves in a file that now holds
 * `current` (null when the file does not exist). Returns null when that cannot
 * be worked out: another tool, an input of another shape, or an edit whose
 * text is not in the file, which the tool itself rejects.
 */
export const contentAfterEdit = (
  toolName: string,
  toolInput: Readonly<Record<string, unknown>>,
  current: string | null,
): string | null => {
  switch (toolName) {
    case "Write": {
      const content = toolInput["content"];
      return typeof content === "string" ? content : null;
    }
    case "Edit": {
      const replacement = readReplacement(toolInput);
      return replacement === null
        ? null
        : applyReplacement(current, replacement);
    }
    case "MultiEdit": {
      const edits = toolInput["edits"];
      if (!Array.isArray(edits) || edits.length === 0) return null;

      let content = current;
      for (const edit of edits) {
        const replacement = readReplacement(edit);
        if (replacement === null) return null;
        content = applyReplacement(content, replacement);
        if (content === null) return null;
      }
      return content;
    }
    default:
      return null;
  }
};

type ManifestSection =
  | { readonly parsed: true; readonly value: unknown }
  | { readonly parsed: false };

/** The noskills section as `persistence.readManifest` would see it. */
const noskillsSectionOf = (manifestText: string): ManifestSection => {
  try {
    const document: unknown = yaml.parse(manifestText);
    if (!(document instanceof Object) || Array.isArray(document)) {
      return { parsed: true, value: undefined };
    }

    return {
      parsed: true,
      value: (document as Readonly<Record<string, unknown>>)["noskills"],
    };
  } catch {
    return { parsed: false };
  }
};

/** JSON with object keys sorted, so key order does not count as a change. */
const canonicalJson = (value: unknown): string | undefined =>
  JSON.stringify(value, (_key, item: unknown) =>
    item instanceof Object && !Array.isArray(item)
      ? Object.fromEntries(
          Object.entries(item).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)),
        )
      : item,
  );

/**
 * True if the manifest text `after` gives the noskills section another value
 * than `before` does (null when the file did not exist), or cannot be parsed,
 * which would leave noskills with no settings at all. Comments, key order and
 * the other sections do not count.
 */
export const changesNoskillsSection = (
  before: string | null,
  after: string,
): boolean => {
  const afterSection = noskillsSectionOf(after);
  if (!afterSection.parsed) return true;

  // A manifest that does not parse gives noskills no section, as a missing one.
  const beforeSection = before === null ? undefined : noskillsSectionOf(before);
  const beforeValue =
    beforeSection !== undefined && beforeSection.parsed
      ? beforeSection.value
      : undefined;

  return canonicalJson(beforeValue) !== canonicalJson(afterSection.value);
};

// Programs that write no file of their own. Redirections of their output are
// checked separately.
const READ_ONLY_PROGRAMS: ReadonlySet<string> = new Set([
  "[",
  "basename",
  "cat",
  "cd",
  "cmp",
  "cut",
  "diff",
  "dirname",
  "echo",
  "egrep",
  "fgrep",
  "file",
  "grep",
  "head",
  "jq",
  "less",
  "ls",
  "md5",
  "md5sum",
  "more",
  "nl",
  "printf",
  "pwd",
  "readlink",
  "realpath",
  "rg",
  "sha1sum",
  "sha256sum",
  "shasum",
  "stat",
  "tail",
  "test",
  "tr",
  "true",
  "wc",
]);

// Programs that read unless an in-place flag makes them rewrite their input.
const IN_PLACE_PROGRAMS: ReadonlySet<string> = new Set(["sed", "yq"]);

const isInPlaceFlag = (word: string): boolean =>
  word === "--in-place" ||
  word.startsWith("--in-place=") ||
  word === "--inplace" ||
  /^-[a-zA-Z]*i/.test(word);

// Redirections that write no file: `>&2`, `2>&1`, `>/dev/null`, `&>/dev/null`.
const NON_FILE_REDIRECT = /\d*>&\d+|&?\d*>>?\s*\/dev\/null\b/g;

/**
 * True if every part of a shell command only reads files: each program is
 * read-only (git by the git allowlist) and no output goes to a file. Command
 * and process substitutions run programs this check does not see, so they
 * count as writes.
 */
const isReadOnlyShellCommand = (command: string): boolean => {
  if (/\$\(|`|<\(|>\(/.test(command)) return false;

  const withoutNonFileRedirects = command.replace(NON_FILE_REDIRECT, " ");
  if (withoutNonFileRedirects.includes(">")) return false;

  return withoutNonFileRedirects.split(/&&|\|\||[;|&\n]/).every((part) => {
    const words = part
      .trim()
      .split(/\s+/)
      .filter((word) => word !== "");
    const programIndex = words.findIndex((word) => !/^\w+=/.test(word));
    if (programIndex === -1) return true;

    const program = words[programIndex]!.split("/").pop() ?? "";
    const args = words.slice(programIndex + 1);

    if (program === "git") {
      return gitGuard.isGitAllowed(words.slice(programIndex).join(" "));
    }
    if (IN_PLACE_PROGRAMS.has(program)) return !args.some(isInPlaceFlag);

    return READ_ONLY_PROGRAMS.has(program);
  });
};

// A path that ends at a directory holding the wrapper: `.eser`, `.eser/.state`
// or, from inside `.eser`, `.state`, with an optional trailing `/` or `/*`.
// `rm -rf .eser/.state` or `cd .eser/.state && rm -rf bin` removes the wrapper
// without naming `.state/bin`. Paths below these directories do not match.
const WRAPPER_ANCESTOR_PATH =
  /(?:^|[\s'"=:(])(?:[^\s'"=:(;&|<>]*\/)?(?:\.eser(?:\/\.state)?|\.state)\/?\*?(?=$|[\s'";&|)<>])/;

/**
 * The protected file a Bash command may change, or null when it names none or
 * only reads it. The command text names the manifest when it mentions
 * `manifest.yml` and `.eser` (a command run inside `.eser` names the file
 * alone), and the wrapper when it mentions `.state/bin` or a directory that
 * holds it (`.eser`, `.eser/.state`). Quoted flag values (`--answer="..."`)
 * are text, not paths, unless they hold a substitution.
 */
export const bashProtectedFile = (command: string): ProtectedFile | null => {
  const scanned = /\$\(|`/.test(command)
    ? command
    : gitGuard.stripFlagValues(command);
  const text = scanned.replaceAll("\\", "/").toLowerCase();

  let named: ProtectedFile | null = null;
  if (text.includes(WRAPPER_TAIL.toLowerCase())) {
    named = "git-wrapper";
  } else if (
    text.includes(MANIFEST_NAME.toLowerCase()) &&
    text.includes(persistence.paths.eserDir)
  ) {
    named = "manifest";
  } else if (WRAPPER_ANCESTOR_PATH.test(text)) {
    named = "git-wrapper";
  }

  if (named === null || isReadOnlyShellCommand(scanned)) return null;

  return named;
};

/**
 * The reason the agent reads when a change to a protected file is refused:
 * for a file tool whose result is known (`edit`), a file tool whose result
 * noskills cannot work out, such as a patch, an append or a delete
 * (`unknown-edit`), or a shell command (`command`).
 */
export const protectedFileDenial = (
  file: ProtectedFile,
  via: "edit" | "unknown-edit" | "command",
): string => {
  if (file === "git-wrapper") {
    const action =
      via === "command"
        ? `This command may change ${gitWrapper.WRAPPER_DIR}/ or a directory that holds it. That directory holds`
        : `${gitWrapper.WRAPPER_DIR}/ holds`;

    return `${action} the git wrapper that noskills writes when a session starts; the agent may not change it. Ask the user if git has to work differently.`;
  }

  const actions = {
    edit: `This edit changes the noskills section of ${MANIFEST_PATH}`,
    "unknown-edit": `This change to ${MANIFEST_PATH} does not show what the file holds afterwards, so it may change the noskills section`,
    command: `This command may change ${MANIFEST_PATH}`,
  } as const;
  const action = actions[via];

  return `${action}, and that section is not the agent's to change: it holds allowGit and the command the git wrapper runs. Ask the user to change it. The file's other sections may be changed with a text replacement or a full write that leaves the noskills section as it is.`;
};

// =============================================================================
// PreToolUse context: what the agent reads next to an allowed file edit
// =============================================================================

/**
 * Reminder shown once per iteration, on the first file edit in EXECUTING.
 * Only hook-capable tools run this hook, and each of them can delegate to the
 * noskills-executor sub-agent.
 */
export const EXECUTOR_REMINDER =
  "[noskills] Implementation work goes to the noskills-executor sub-agent. If you are the orchestrating agent, delegate this edit instead of making it yourself. If you are that sub-agent, continue.";

/**
 * Joins the executor reminder and the file-specific rules into the
 * `additionalContext` of a PreToolUse allow. Returns null when there is
 * nothing to say, so the hook writes no output.
 */
export const preToolUseContext = (
  reminder: string | null,
  fileRules: readonly string[],
): string | null => {
  const parts: string[] = [];

  if (reminder !== null) {
    parts.push(reminder);
  }

  if (fileRules.length > 0) {
    parts.push(
      "[noskills] Rules for this file:\n" +
        fileRules.map((rule) => `- ${rule}`).join("\n"),
    );
  }

  return parts.length === 0 ? null : parts.join("\n\n");
};

// =============================================================================
// PreToolUse phase gate: which phases allow file edits
// =============================================================================

/**
 * True for a path under `.eser/` or `.claude/`: noskills' own files and the
 * agent tool's settings. The phase gate lets edits there through (the
 * protected files among them are refused before the gate runs), and the
 * PostToolUse file log leaves them out.
 */
export const isToolConfigPath = (filePath: string): boolean =>
  filePath.includes(".eser/") || filePath.includes(".claude/");

// How much each phase restricts file edits; a phase not listed restricts none.
const PHASE_RESTRICTION: ReadonlyMap<string, number> = new Map([
  ["DISCOVERY", 10],
  ["DISCOVERY_REFINEMENT", 10],
  ["SPEC_PROPOSAL", 10],
  ["SPEC_APPROVED", 8],
  ["BLOCKED", 8],
  ["EXECUTING", 2],
]);

/**
 * The phase among the sessions' phases that restricts file edits most, or
 * IDLE when none restricts them. The PreToolUse hook gates edits by it when
 * sessions exist but NOSKILLS_SESSION does not say which one is running.
 */
export const mostRestrictivePhase = (
  phases: readonly (string | null)[],
): string => {
  let mostRestrictive = "IDLE";
  let maxRestriction = 0;

  for (const phase of phases) {
    const restriction =
      phase === null ? 0 : (PHASE_RESTRICTION.get(phase) ?? 0);
    if (phase !== null && restriction > maxRestriction) {
      maxRestriction = restriction;
      mostRestrictive = phase;
    }
  }

  return mostRestrictive;
};

/** What the phase gate reads from a spec's state or a session. */
export type GateState = {
  /** The phase, or null when the state names none. */
  readonly phase: string | null;
  /** The spec, or null when the state names none (a session-only state). */
  readonly spec: string | null;
  /** `execution.criteriaScope`, "review-gate" while the review gate runs. */
  readonly criteriaScope: string | null;
};

const nonEmpty = (value: string): string | null =>
  value === "" ? null : value;

/** Reads the phase gate's fields from state JSON whose shape is unchecked. */
export const gateStateOf = (state: HookInput): GateState => {
  const execution = state["execution"];

  return {
    phase: nonEmpty(stringField(state, "phase")),
    spec: nonEmpty(stringField(state, "spec")),
    criteriaScope: isRecord(execution)
      ? nonEmpty(stringField(execution, "criteriaScope"))
      : null,
  };
};

/**
 * What the phase gate does with a file edit:
 * - `allow`: the edit goes ahead with nothing to add.
 * - `execute`: the edit goes ahead in EXECUTING, and the hook adds the
 *   executor reminder and the file's rules for the agent to read.
 * - `deny`: the edit is refused with `reason`.
 */
export type FileEditVerdict =
  | { readonly kind: "allow" }
  | { readonly kind: "execute" }
  | { readonly kind: "deny"; readonly reason: string };

// The phases in which the agent talks with the user and does not edit files.
type ConversationPhase = Extract<
  schema.Phase,
  | "DISCOVERY"
  | "DISCOVERY_REFINEMENT"
  | "SPEC_PROPOSAL"
  | "SPEC_APPROVED"
  | "BLOCKED"
>;

const CONVERSATION_PHASES: ReadonlySet<string> = new Set<ConversationPhase>([
  "DISCOVERY",
  "DISCOVERY_REFINEMENT",
  "SPEC_PROPOSAL",
  "SPEC_APPROVED",
  "BLOCKED",
]);

const isConversationPhase = (phase: string): phase is ConversationPhase =>
  CONVERSATION_PHASES.has(phase);

const conversationDenial = (
  phase: ConversationPhase,
  specCommand: (sub: string) => string,
): string => {
  const modeDirective = `\n  modeDirective: ${
    compiler.getPhaseModeDirective(phase) ?? ""
  }`;
  const thinking = `You are in ${phase}: this is a thinking phase, not an implementation phase. Read and discuss only.`;

  switch (phase) {
    case "DISCOVERY":
      return `${thinking} To write code, complete discovery and get the spec approved first. Run \`${specCommand(
        "next",
      )}\` to continue.${modeDirective}`;
    case "DISCOVERY_REFINEMENT":
      return `${thinking} To write code, complete discovery and get the spec approved first. Run \`${specCommand(
        'next --answer="approve"',
      )}\` or revise answers.${modeDirective}`;
    case "SPEC_PROPOSAL":
      return `${thinking} To write code, approve the spec first. Run \`${specCommand(
        "approve",
      )}\`${modeDirective}`;
    case "SPEC_APPROVED":
      return `You are in SPEC_APPROVED. Start execution first: \`${specCommand(
        'next --answer="start"',
      )}\``;
    case "BLOCKED":
      return `Execution blocked. Resolve with \`${specCommand(
        'next --answer="resolution"',
      )}\`${modeDirective}`;
  }
};

/**
 * The phase gate's verdict on a file edit. Edits under `.eser/` and
 * `.claude/` pass; IDLE and COMPLETED allow edits; EXECUTING allows them
 * outside the review gate; the conversation phases refuse them. A state with
 * no phase is refused as well, since the gate cannot tell what it allows.
 * `commandPrefix` starts every command a denial names.
 */
export const fileEditVerdict = (
  filePath: string,
  state: GateState,
  commandPrefix: string,
): FileEditVerdict => {
  if (isToolConfigPath(filePath)) return { kind: "allow" };

  const command = (sub: string): string => `${commandPrefix} ${sub}`;
  // Spec-scoped commands need the spec name; a session-only state lacks it.
  const specCommand = (sub: string): string =>
    state.spec === null ? command(sub) : command(`spec ${state.spec} ${sub}`);
  const deny = (reason: string): FileEditVerdict => ({ kind: "deny", reason });

  if (state.phase === null) {
    return deny(
      `Phase unknown, so the file edit is blocked. Run \`${command(
        "status",
      )}\` to check state.`,
    );
  }
  if (state.phase === "IDLE" || state.phase === "COMPLETED") {
    return { kind: "allow" };
  }
  if (state.phase === "EXECUTING") {
    // The review gate is a read-only pass: the agent evaluates evidence and
    // edits no code.
    return state.criteriaScope === "review-gate"
      ? deny(
          `Review gate active: file edits are blocked. Evaluate concern dimensions against the existing implementation and submit findings via \`${specCommand(
            'next --answer=\'{"completed":[...],"remaining":[]}\'',
          )}\`.`,
        )
      : { kind: "execute" };
  }
  if (isConversationPhase(state.phase)) {
    return deny(conversationDenial(state.phase, specCommand));
  }

  return deny(`Run \`${specCommand("next")}\` first.`);
};

// =============================================================================
// PostToolUse: which calls the logs record
// =============================================================================

/**
 * True when the PostToolUse file log records an edit of `filePath`: a named
 * file outside noskills' and the agent tool's own directories.
 */
export const isLoggedFileWrite = (filePath: string): boolean =>
  filePath !== "" && !isToolConfigPath(filePath);

// =============================================================================
// Stop: whether the hook records an iteration
// =============================================================================

/**
 * True when the Stop hook should record an iteration for a spec in `phase`:
 * only in EXECUTING, and never for a stop that the Stop hook itself caused
 * (`stop_hook_active`), which would loop.
 */
export const stopRecordsIteration = (
  input: HookInput,
  phase: string,
): boolean => input["stop_hook_active"] !== true && phase === "EXECUTING";

// =============================================================================
// SessionStart: the instruction the agent starts the session with
// =============================================================================

/**
 * The SessionStart hook's stdout: the compiled noskills output, the JSON
 * `noskills next` prints, as `hookSpecificOutput.additionalContext`, the field
 * Claude Code and Codex add to the agent's context. The compiled JSON printed
 * on its own does not reach the agent: Claude Code reads stdout that starts
 * with `{` as hook output, and the compiled fields are not hook output fields.
 *
 * Copilot CLI's camelCase `sessionStart` reads a top-level `additionalContext`
 * instead (docs.github.com/en/copilot/reference/hooks-configuration), so
 * `dialect` `copilot` gives that shape.
 */
export const sessionStartOutput = (
  compiled: unknown,
  dialect: HookDialect = "claude",
): HookInput => {
  const additionalContext = `[noskills] The current noskills state and instruction for this project:\n${JSON.stringify(
    compiled,
  )}`;

  return dialect === "copilot"
    ? { additionalContext }
    : {
        hookSpecificOutput: {
          hookEventName: "SessionStart",
          additionalContext,
        },
      };
};

// =============================================================================
// PostToolUse (AskUserQuestion): the step a question belongs to
// =============================================================================

/**
 * The questions an AskUserQuestion call asks: the text of each entry of
 * `questions`, as Claude Code sends them, or the older single `question`
 * field. Entries without text are left out.
 */
export const askedQuestionsOf = (toolInput: HookInput): readonly string[] => {
  const asked = toolInput["questions"];

  if (Array.isArray(asked) && asked.length > 0) {
    return asked
      .map((entry: unknown) =>
        isRecord(entry) ? stringField(entry, "question") : "",
      )
      .filter((question) => question !== "");
  }

  const single = stringField(toolInput, "question");

  return single === "" ? [] : [single];
};

/**
 * The step of an AskUserQuestion call that asks no base discovery question:
 * `discovery` in DISCOVERY (the context, mode, premise and follow-up
 * questions), `refinement` and `approval` in the two review phases,
 * `unknown` otherwise. Base questions get their steps from
 * discoveryAskSteps.
 */
export const askStepOf = (phase: string): string => {
  switch (phase) {
    case "DISCOVERY":
      return "discovery";
    case "DISCOVERY_REFINEMENT":
      return "refinement";
    case "SPEC_PROPOSAL":
      return "approval";
    default:
      return "unknown";
  }
};

/**
 * The base discovery questions an AskUserQuestion call asks. Each asked
 * question goes to the open question it shares the most words with, or, when
 * it shares none, to the first open question left; an open question takes
 * one asked question at most. `open` holds the base questions with neither an
 * answer nor a recorded step, in the order noskills lists them.
 */
export const discoveryAskSteps = (
  open: readonly questions.Question[],
  asked: readonly string[],
): readonly askToken.AskTokenStep[] => {
  const left = [...open];
  const steps: askToken.AskTokenStep[] = [];

  for (const askedQuestion of asked) {
    if (left.length === 0) break;

    let best = 0;
    let bestScore = 0;
    for (let i = 0; i < left.length; i++) {
      const score = questionSimilarity.compareQuestions(
        left[i]!.text,
        askedQuestion,
      );
      if (score > bestScore) {
        best = i;
        bestScore = score;
      }
    }

    const question = left.splice(best, 1)[0]!;
    steps.push({
      stepId: question.id,
      match: askMatch(question.text, askedQuestion),
      originalQuestion: question.text,
      askedQuestion,
    });
  }

  return steps;
};

/**
 * The steps the ask token holds after an AskUserQuestion call that asked
 * `asked` (one question or more). `state` is the project's state, or null
 * when it could not be read; `prior` holds the steps of a still valid token
 * for the same spec. While discovery collects the base answers, the call adds
 * a step for each base question it asks to those of the earlier calls, since
 * six questions take two calls; it returns null, to keep the token as it is,
 * when it asks no open base question and earlier calls recorded theirs. Any
 * other call gets the one step askStepOf names, which no base answer takes.
 */
export const askTokenStepsAfter = (
  state: schema.StateFile | null,
  prior: readonly askToken.AskTokenStep[],
  asked: readonly string[],
): readonly askToken.AskTokenStep[] | null => {
  if (
    state !== null &&
    state.phase === "DISCOVERY" &&
    questions.discoveryStageOf(state) === "questions"
  ) {
    const recorded = new Set([
      ...state.discovery.answers.map((a) => a.questionId),
      ...prior.map((step) => step.stepId),
    ]);
    const open = questions.QUESTIONS.filter((q) => !recorded.has(q.id));
    const added = discoveryAskSteps(open, asked);

    if (added.length > 0) return [...prior, ...added];
    if (prior.length > 0) return null;
  }

  // These steps have no question of noskills' own to compare with.
  return [
    {
      stepId: askStepOf(state?.phase ?? ""),
      match: "modified",
      originalQuestion: "",
      askedQuestion: asked[0] ?? "",
    },
  ];
};

/**
 * "exact" when the agent asked the expected question, in words close enough
 * (`questionSimilarity.SIMILARITY_EXACT_THRESHOLD`); "modified" when it
 * rephrased it, or when the step has no expected question to compare with.
 */
export const askMatch = (
  expectedQuestion: string,
  askedQuestion: string,
): "exact" | "modified" =>
  questionSimilarity.compareQuestions(expectedQuestion, askedQuestion) >=
  questionSimilarity.SIMILARITY_EXACT_THRESHOLD
    ? "exact"
    : "modified";

// =============================================================================
// Stop: user-facing iteration notice
// =============================================================================

/** The restart threshold when the manifest does not set one. */
export const DEFAULT_RESTART_THRESHOLD = 15;

/**
 * The manifest's `maxIterationsBeforeRestart`, or
 * {@link DEFAULT_RESTART_THRESHOLD} when the manifest is missing, lacks it or
 * holds something other than a positive whole number.
 *
 * @param config - The noskills section of the manifest, or null
 * @returns The iteration count at which the restart notice shows
 */
export const restartThreshold = (
  config: { readonly maxIterationsBeforeRestart?: unknown } | null,
): number => {
  const value = config?.maxIterationsBeforeRestart;

  return typeof value === "number" && Number.isInteger(value) && value > 0
    ? value
    : DEFAULT_RESTART_THRESHOLD;
};

/**
 * The real git binary NOSKILLS_REAL_GIT names, or undefined when it is unset
 * or empty, so the caller resolves git from PATH instead.
 *
 * @param value - The variable's value
 * @returns The path, or undefined
 */
export const explicitRealGit = (
  value: string | undefined,
): string | undefined =>
  value === undefined || value === "" ? undefined : value;

/**
 * The stderr notice the Stop hook prints for the user once a spec reaches
 * `maxIterationsBeforeRestart` iterations, or null below it. The agent does
 * not see this notice; its prompt carries no iteration countdown.
 */
export const restartNotice = (
  iteration: number,
  maxIterations: number,
): string | null =>
  iteration >= maxIterations
    ? `noskills: iteration ${iteration} reached threshold (${maxIterations}). Consider starting a fresh conversation.\n`
    : null;
