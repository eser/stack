// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * `noskills invoke-hook` — Internal hook handlers invoked by agents.
 *
 * Subcommands:
 *   invoke-hook pre-tool-use    — PreToolUse: phase gate + git write guard
 *   invoke-hook stop            — Stop: iteration increment + git snapshot
 *   invoke-hook post-file-write — PostToolUse: log modified files
 *   invoke-hook post-bash       — PostToolUse: log noskills CLI calls
 *   invoke-hook session-start   — SessionStart: output current noskills instruction
 *                                 and put the git wrapper on the session's PATH
 *                                 (`--tool=copilot-cli` for Copilot CLI's output)
 *   invoke-hook git-exec <args> — the agent-session git wrapper's check
 *
 * The hooks read the hook JSON of the tool that runs them from stdin, perform
 * their logic and write the answer to stdout. Claude Code, Codex, Copilot
 * CLI, Kiro and the OpenCode plugin each name tools and their inputs their own
 * way; `hookDecisions.toolCallOf` maps them all to the checks' terms. A
 * PreToolUse denial exits with code 2 and the reason on stderr, which every
 * one of these tools takes as a denial. `git-exec` takes git's arguments
 * instead and answers with its exit code. The LLM is completely unaware these
 * exist.
 *
 * This module does the I/O: it reads the input, loads state and writes the
 * answer. The decisions are pure functions in hook-decisions.ts, and
 * `decidePreToolUse` and `processAskUserQuestionHook` take a parsed input, so
 * tests reach both without stdin.
 *
 * pre-tool-use also refuses agent changes to the files the git guards read:
 * the noskills section of `.eser/manifest.yml` (allowGit) and the wrapper in
 * `.eser/.state/bin/`.
 *
 * @module
 */

import * as results from "@eserstack/primitives/results";
import type * as shellArgs from "@eserstack/shell/args";
import type * as schema from "../state/schema.ts";
import * as persistence from "../state/persistence.ts";
import * as iteration_ from "../state/iteration.ts";
import * as askToken from "../state/ask-token.ts";
import * as compiler from "../context/compiler.ts";
import * as syncEngine from "../sync/engine.ts";
import * as hookDecisions from "./hook-decisions.ts";
import * as folderRules from "../context/folder-rules.ts";
import * as concerns from "../context/concerns.ts";
import * as cmd from "../output/cmd.ts";
import * as gitWrapper from "./git-wrapper.ts";
import * as gitWrapperInstall from "./git-wrapper-install.ts";
import { runtime } from "@eserstack/standards/cross-runtime";

// =============================================================================
// Stdin reader
// =============================================================================

const readHookInput = async (): Promise<hookDecisions.HookInput> => {
  const reader = runtime.process.stdin.getReader();
  const chunks: Uint8Array[] = [];

  try {
    while (true) {
      // A stream is read one chunk at a time; each read waits for the last.
      // oxlint-disable-next-line no-await-in-loop
      const { done, value } = await reader.read();
      if (done || value === undefined) break;
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }

  // Reassemble chunks
  let offset = 0;
  const merged = new Uint8Array(chunks.reduce((acc, c) => acc + c.length, 0));
  for (const chunk of chunks) {
    merged.set(chunk, offset);
    offset += chunk.length;
  }

  return hookDecisions.parseHookInput(new TextDecoder().decode(merged));
};

/** The project root for a hook call: see `hookDecisions.hookRoot`. */
const rootOf = (input: hookDecisions.HookInput): string =>
  hookDecisions.hookRoot(
    input,
    runtime.env.get("NOSKILLS_PROJECT_ROOT"),
    runtime.process.cwd(),
  );

const writeStdoutText = async (text: string): Promise<void> => {
  const writer = runtime.process.stdout.getWriter();
  await writer.write(new TextEncoder().encode(text));
  writer.releaseLock();
};

const writeStdout = async (data: unknown): Promise<void> => {
  await writeStdoutText(JSON.stringify(data));
};

const writeStderr = async (text: string): Promise<void> => {
  const writer = runtime.process.stderr.getWriter();
  await writer.write(new TextEncoder().encode(text));
  writer.releaseLock();
};

// =============================================================================
// Main dispatcher
// =============================================================================

export const main = async (
  args?: readonly string[],
): Promise<shellArgs.CliResult<void>> => {
  const subcommand = args?.[0];

  switch (subcommand) {
    case "pre-tool-use":
      return await handlePreToolUse();
    case "stop":
      return await handleStop();
    case "post-file-write":
      return await handlePostFileWrite();
    case "post-bash":
      return await handlePostBash();
    case "session-start":
      return await handleSessionStart(args?.slice(1) ?? []);
    case "post-ask-user-question":
      return await handlePostAskUserQuestion();
    case "git-exec":
      return await handleGitExec(args?.slice(1) ?? []);
    default:
      return results.ok(undefined);
  }
};

// =============================================================================
// Shared helpers for hook handlers
// =============================================================================

/**
 * What the PreToolUse hook answers for one tool call:
 * - `none`: no output, so the tool call goes ahead.
 * - `deny`: the call is refused with `reason`.
 * - `allow-with-context`: the call goes ahead and the agent reads `context`.
 */
export type PreToolUseDecision =
  | { readonly kind: "none" }
  | { readonly kind: "deny"; readonly reason: string }
  | { readonly kind: "allow-with-context"; readonly context: string };

const NO_DECISION: PreToolUseDecision = { kind: "none" };

const deny = (reason: string): PreToolUseDecision => ({ kind: "deny", reason });

/** The exit code of a PreToolUse denial, which every supported tool honors. */
export const PRE_TOOL_USE_DENIED_EXIT_CODE = 2;

/** What `invoke-hook pre-tool-use` writes and the code it exits with. */
export type PreToolUseAnswer = {
  /** Text for stdout, or "" for none. */
  readonly stdout: string;
  /** Text for stderr, or "" for none. */
  readonly stderr: string;
  readonly exitCode: 0 | typeof PRE_TOOL_USE_DENIED_EXIT_CODE;
};

/**
 * The PreToolUse answer for `decision` in the form the tool that ran the hook
 * reads (`hookDecisions.HookDialect`).
 *
 * A denial exits with code 2 and the reason on stderr: Claude Code, Codex,
 * Copilot CLI and Kiro all refuse the call on that exit code, and the
 * OpenCode plugin throws the reason. stdout also carries the denial as JSON
 * where the tool reads one, so Copilot CLI shows the agent the reason.
 *
 * Context next to an allowed call goes out only where the tool adds it to the
 * agent's context: as `hookSpecificOutput.additionalContext` for the claude
 * dialect, and as plain text for Kiro. Copilot CLI's preToolUse output has no
 * such field, and its `allow` would skip the user's permission prompt, so
 * Copilot CLI gets no output.
 */
export const preToolUseAnswer = (
  decision: PreToolUseDecision,
  dialect: hookDecisions.HookDialect,
): PreToolUseAnswer => {
  switch (decision.kind) {
    case "none":
      return { stdout: "", stderr: "", exitCode: 0 };
    case "deny": {
      const reason = `noskills: ${decision.reason}`;
      const json =
        dialect === "claude"
          ? {
              hookSpecificOutput: {
                hookEventName: "PreToolUse",
                permissionDecision: "deny",
                permissionDecisionReason: reason,
              },
            }
          : { permissionDecision: "deny", permissionDecisionReason: reason };

      return {
        stdout: dialect === "kiro" ? "" : JSON.stringify(json),
        stderr: `${reason}\n`,
        exitCode: PRE_TOOL_USE_DENIED_EXIT_CODE,
      };
    }
    case "allow-with-context":
      switch (dialect) {
        case "claude":
          return {
            stdout: JSON.stringify({
              hookSpecificOutput: {
                hookEventName: "PreToolUse",
                permissionDecision: "allow",
                additionalContext: decision.context,
              },
            }),
            stderr: "",
            exitCode: 0,
          };
        case "kiro":
          return { stdout: decision.context, stderr: "", exitCode: 0 };
        case "copilot":
          return { stdout: "", stderr: "", exitCode: 0 };
      }
  }
};

/**
 * Appends JSON lines to a log under `.eser/.state/progresses/`. The log is
 * bookkeeping, so a failure is left out of the agent's way.
 */
const appendProgressLog = async (
  root: string,
  fileName: string,
  entries: readonly Readonly<Record<string, unknown>>[],
): Promise<void> => {
  if (entries.length === 0) return;

  const dir = `${root}/${persistence.paths.progressesDir}`;

  try {
    await runtime.fs.mkdir(dir, { recursive: true });
    // Appending, rather than reading the log and writing it back, keeps the
    // entries of two hooks that run at once.
    await runtime.fs.writeTextFile(
      `${dir}/${fileName}`,
      entries.map((entry) => `${JSON.stringify(entry)}\n`).join(""),
      { append: true },
    );
  } catch {
    // best effort
  }
};

/**
 * Returns the executor reminder on the first file edit of an iteration and
 * null on later ones. A flag file records that it was shown; the Stop hook
 * removes the flag when the iteration ends.
 */
export const takeExecutorReminder = async (
  root: string,
): Promise<string | null> => {
  const dir = `${root}/${persistence.paths.progressesDir}`;
  const flagFile = `${dir}/executor-warned.flag`;

  try {
    await runtime.fs.stat(flagFile);
    return null;
  } catch {
    // No flag yet: this is the first edit of the iteration.
  }

  try {
    await runtime.fs.mkdir(dir, { recursive: true });
    await runtime.fs.writeTextFile(flagFile, new Date().toISOString());
  } catch {
    // Without the flag the reminder would repeat on every edit, so skip it.
    return null;
  }

  return hookDecisions.EXECUTOR_REMINDER;
};

/**
 * Collects the rules that apply to one file during execution: scoped rules,
 * folder rules and concern reminders for its file type. Collection is best
 * effort; a failure returns no rules rather than blocking the edit.
 */
const collectFileRules = async (
  root: string,
  state: hookDecisions.HookInput,
  filePath: string,
): Promise<readonly string[]> => {
  try {
    const notes: string[] = [];

    // 1. Scoped rules matching this file
    const scopedRules = await syncEngine.loadScopedRules(root);
    notes.push(
      ...syncEngine.getTier2RulesForFile(scopedRules, "EXECUTING", filePath),
    );

    // 2. Folder rules (walk up from file's directory)
    const fRules = await folderRules.collectFolderRules(root, [filePath]);
    for (const fr of fRules) {
      notes.push(`(${fr.folder}/) ${fr.rule}`);
    }

    // 3. Concern reminders by file type
    const classification =
      (state["classification"] as schema.SpecClassification | null) ?? null;
    const activeConcerns = await persistence.listConcerns(root);
    const manifest = await persistence.readManifest(root);
    const activeConcernDefs = activeConcerns.filter(
      (c) => manifest !== null && manifest.concerns.includes(c.id),
    );
    notes.push(
      ...concerns.getTier2RemindersForFile(
        activeConcernDefs,
        filePath,
        classification,
      ),
    );

    return notes;
  } catch {
    return [];
  }
};

const GIT_WRITE_DENIAL =
  "Git write operations are not allowed. Only read commands (log, diff, status, show, blame, branch, tag) are permitted. The user controls git, the agent controls files.";

// Script files larger than this are not read; the command is denied instead.
const MAX_SCRIPT_BYTES = 256 * 1024;

/**
 * Checks shell scripts the command runs (`sh run.sh`, `source x.sh`), whose
 * content is not in the command text. A script written by the same command
 * cannot be read ahead of time, so it is denied; an existing script is read
 * and scanned; a missing or unreadable one is left to the shell.
 */
const checkShellScripts = async (
  command: string,
  root: string,
): Promise<string | null> => {
  // Scripts are checked in order and the first denial returns, so later
  // scripts are not read once one is refused.
  for (const target of hookDecisions.shellScriptTargets(command)) {
    if (hookDecisions.writesFile(command, target)) {
      return "Running a shell script that this same command writes is not allowed while git is read-only: its content cannot be checked for git writes.";
    }

    const path = target.startsWith("/") ? target : `${root}/${target}`;
    let content: string;
    try {
      // oxlint-disable-next-line no-await-in-loop
      const info = await runtime.fs.stat(path);
      if (info.size > MAX_SCRIPT_BYTES) {
        return `Shell script ${target} is too large to check for git writes.`;
      }
      // oxlint-disable-next-line no-await-in-loop
      content = await runtime.fs.readTextFile(path);
    } catch {
      continue;
    }

    if (hookDecisions.hasGitWrite(content)) {
      return `${GIT_WRITE_DENIAL} (found in ${target})`;
    }
  }

  return null;
};

/**
 * Check git guard and return denial reason, or null if allowed.
 *
 * This classifies command text. It catches quoting, case, env-prefix,
 * subshell, pipe and stdin-fed shell forms, and scripts it can read, but it
 * cannot decide what an interpreter computes at run time (for example
 * `python -c` building "git" from parts). The git wrapper (git-wrapper.ts)
 * covers that case where it is installed; see README "Git is read-only".
 */
export const checkGitGuard = async (
  command: string,
  allowGit: boolean,
  root: string,
): Promise<string | null> => {
  if (allowGit) return null;

  // Strip flag values so user text like "digital" or "git strategy" doesn't trigger
  const commandToScan = hookDecisions.stripFlagValues(command);

  // Primary: extract every git invocation from multi-line scripts, &&/||/; chains,
  // and $() / `` subshells. Handles \n separators that the old split missed.
  const invocations = hookDecisions.extractGitInvocations(commandToScan);
  for (const inv of invocations) {
    if (!hookDecisions.isGitAllowed(inv)) {
      return GIT_WRITE_DENIAL;
    }
  }

  // Fallback: catch bash -c "git..." and eval patterns that extractGitInvocations
  // cannot reach (git inside fully-quoted strings).
  if (hookDecisions.containsGitWriteBypass(commandToScan)) {
    return "Git write operations detected in subshell or pipe. Only read commands are permitted. The user controls git, the agent controls files.";
  }

  return await checkShellScripts(commandToScan, root);
};

// =============================================================================
// Protected files: the manifest's noskills section and the git wrapper
// =============================================================================

/**
 * The absolute forms of a path a tool names: as written, and with symlinks
 * resolved, so a link to the manifest counts as the manifest. A file that does
 * not exist yet is resolved through the directory it would be created in.
 */
const absolutePathForms = async (
  root: string,
  filePath: string,
): Promise<readonly string[]> => {
  const absolute = runtime.path.resolve(root, filePath);

  try {
    return [absolute, await runtime.fs.realPath(absolute)];
  } catch {
    // Not there yet: the Write tool would create it.
  }

  try {
    const dir = await runtime.fs.realPath(runtime.path.dirname(absolute));
    return [absolute, runtime.path.join(dir, runtime.path.basename(absolute))];
  } catch {
    // The directory is missing too; the path as written is all there is.
    return [absolute];
  }
};

/**
 * The denial for one file change when it touches a protected file, or null.
 * A change whose result is unknown (a patch, an append, a delete) is refused
 * on the manifest as a whole, since noskills cannot tell whether it leaves
 * the noskills section alone.
 */
const protectedChangeDenial = async (
  change: hookDecisions.FileChange,
  root: string,
): Promise<string | null> => {
  if (change.path === "") return null;

  const forms = await absolutePathForms(root, change.path);
  const file =
    forms.map(hookDecisions.protectedFileAt).find((found) => found !== null) ??
    null;
  if (file === null) return null;
  if (file === "git-wrapper") {
    return hookDecisions.protectedFileDenial(file, "edit");
  }
  if (change.edit === null) {
    return hookDecisions.protectedFileDenial(file, "unknown-edit");
  }

  let current: string | null = null;
  try {
    current = await runtime.fs.readTextFile(forms[forms.length - 1]!);
  } catch {
    // Missing, or unreadable and so not writable either: the edit is judged
    // as one that creates the file.
  }

  const after = hookDecisions.contentAfterEdit(
    change.edit.tool,
    change.edit.input,
    current,
  );
  if (after === null || hookDecisions.changesNoskillsSection(current, after)) {
    return hookDecisions.protectedFileDenial(file, "edit");
  }

  return null;
};

/**
 * Refuses an agent's change to a file that controls the git guards
 * (`hookDecisions.ProtectedFile`): the noskills section of
 * `.eser/manifest.yml`, which holds allowGit, and the git wrapper directory.
 * It applies in every phase and session mode, and whatever allowGit says.
 * `toolName` and `toolInput` are the tool's own, as any supported agent tool
 * sends them (`hookDecisions.toolCallOf`). Returns the denial reason, or null
 * when the tool call may go on to the other checks. Edits to the manifest's
 * other sections pass.
 */
export const checkProtectedFiles = async (
  toolName: string,
  toolInput: Readonly<Record<string, unknown>>,
  root: string,
): Promise<string | null> => {
  const call = hookDecisions.toolCallOf(toolName, toolInput);

  if (call.kind === "shell") {
    const file = hookDecisions.bashProtectedFile(call.command);

    return file === null
      ? null
      : hookDecisions.protectedFileDenial(file, "command");
  }
  if (call.kind === "other") return null;

  // The changes are independent; the first denial in the call's order wins.
  const denials = await Promise.all(
    call.changes.map((change) => protectedChangeDenial(change, root)),
  );

  return denials.find((denial) => denial !== null) ?? null;
};

// =============================================================================
// PreToolUse: protected files, git write guard, phase gate
// =============================================================================

/** What `decidePreToolUse` needs besides the hook input. */
export type PreToolUseEnv = {
  /** The project root (`hookDecisions.hookRoot`). */
  readonly root: string;
  /** NOSKILLS_SESSION, or null when it is not set. */
  readonly sessionId: string | null;
  /** Shows the user a notice on stderr; the agent does not see it. */
  readonly warn: (notice: string) => Promise<void>;
};

/**
 * The state the phase gate reads, as unchecked JSON, or null when file edits
 * are not phase-gated: a free-mode session, a spec session that has no spec
 * yet, or a spec whose state cannot be read. A NOSKILLS_SESSION that names no
 * readable session gates like no session at all.
 */
const loadGateState = async (
  env: PreToolUseEnv,
  commandPrefix: string,
): Promise<hookDecisions.HookInput | null> => {
  const { root, sessionId } = env;

  const session =
    sessionId === null ? null : await persistence.readSession(root, sessionId);

  if (session !== null) {
    if (session.mode === "free") return null;
    // A spec session caches its phase; one without it loads its spec's state.
    if (session.phase !== null) return { phase: session.phase };
    if (session.spec === null) return null;

    try {
      return await persistence.resolveState(root, session.spec, commandPrefix);
    } catch {
      return null;
    }
  }

  // Without a session to go by, any of the active sessions may have made this
  // call, so the most restrictive phase among them applies.
  const sessions = await persistence.listSessions(root);
  if (sessions.length > 0) {
    const phase = hookDecisions.mostRestrictivePhase(
      sessions.map((s) => s.phase),
    );
    await env.warn(
      `noskills: ${sessions.length} session(s) are active but NOSKILLS_SESSION does not name one, so file edits follow the most restrictive phase (${phase}). Set NOSKILLS_SESSION for per-instance enforcement.\n`,
    );

    return { phase };
  }

  try {
    const stateFile = await persistence.readState(root);

    // When the global store names a spec, the per-spec file is the
    // authoritative copy of its phase. Spec-scoped commands write there and
    // the global copy goes stale, so reading the global store alone could
    // still report EXECUTING after a `spec revisit` and let this gate permit
    // file edits the state machine no longer allows. resolveState prefers
    // the per-spec file and falls back to the global one itself.
    if (stateFile.spec !== null && stateFile.spec !== undefined) {
      try {
        return await persistence.resolveState(
          root,
          stateFile.spec,
          commandPrefix,
        );
      } catch {
        // The spec directory is gone; the global store is all there is.
      }
    }

    return stateFile;
  } catch {
    // The state cannot be read, so noskills does not gate this project.
    return null;
  }
};

/**
 * The phase gate for a file tool call that changes `paths`. Each path goes
 * through the gate of the spec the session works on
 * (`hookDecisions.fileEditVerdict`), and the first refusal refuses the call.
 * A call that names no path is gated as an edit of an unnamed file.
 */
const decideFileEdit = async (
  paths: readonly string[],
  env: PreToolUseEnv,
): Promise<PreToolUseDecision> => {
  const { root } = env;

  // noskills and tool configuration are not phase-gated. The protected files
  // among them were refused before the gate.
  const gated = (paths.length === 0 ? [""] : paths).filter(
    (path) => !hookDecisions.isToolConfigPath(path),
  );
  if (gated.length === 0) return NO_DECISION;

  const commandPrefix = await cmd.loadCommandPrefix(root);
  const state = await loadGateState(env, commandPrefix);
  if (state === null) return NO_DECISION;

  const gateState = hookDecisions.gateStateOf(state);
  const executing: string[] = [];
  for (const path of gated) {
    const verdict = hookDecisions.fileEditVerdict(
      path,
      gateState,
      commandPrefix,
    );
    if (verdict.kind === "deny") return deny(verdict.reason);
    if (verdict.kind === "execute") executing.push(path);
  }
  if (executing.length === 0) return NO_DECISION;

  // Both go out as additionalContext, which the agent reads. A message on
  // stderr with exit code 0 is shown to the user only, so the reminder used
  // to miss the agent it was written for.
  const reminder = await takeExecutorReminder(root);
  const rulesPerFile = await Promise.all(
    executing
      .filter((path) => path !== "")
      .map((path) => collectFileRules(root, state, path)),
  );
  const context = hookDecisions.preToolUseContext(reminder, [
    ...new Set(rulesPerFile.flat()),
  ]);

  return context === null
    ? NO_DECISION
    : { kind: "allow-with-context", context };
};

/**
 * The PreToolUse decision for one tool call, without the stdin and stdout
 * plumbing. Changes to the protected files are refused first, and shell
 * commands go through the git guard; both apply in every phase and session
 * mode. A file tool call then goes through the phase gate
 * (`decideFileEdit`). The input may come from any supported agent tool
 * (`hookDecisions.hookToolCall`).
 */
export const decidePreToolUse = async (
  input: hookDecisions.HookInput,
  env: PreToolUseEnv,
): Promise<PreToolUseDecision> => {
  const { root } = env;
  const toolName = hookDecisions.toolNameOf(input);
  const toolInput = hookDecisions.toolInputOf(input);

  // Checked before any phase or session logic: a free-mode session, or a
  // project with no state yet, must not be able to turn the guards off either.
  const protectedDenial = await checkProtectedFiles(toolName, toolInput, root);
  if (protectedDenial !== null) return deny(protectedDenial);

  const call = hookDecisions.toolCallOf(toolName, toolInput);
  switch (call.kind) {
    case "other":
      return NO_DECISION;
    case "shell": {
      const config = await persistence.readManifest(root);
      const gitDenial = await checkGitGuard(
        call.command.trim(),
        config?.allowGit === true,
        root,
      );

      return gitDenial === null ? NO_DECISION : deny(gitDenial);
    }
    case "file":
      return await decideFileEdit(
        call.changes.map((change) => change.path),
        env,
      );
  }
};

const handlePreToolUse = async (): Promise<shellArgs.CliResult<void>> => {
  const input = await readHookInput();
  const sessionId = runtime.env.get("NOSKILLS_SESSION") ?? "";

  const decision = await decidePreToolUse(input, {
    root: rootOf(input),
    sessionId: sessionId === "" ? null : sessionId,
    warn: writeStderr,
  });
  const answer = preToolUseAnswer(decision, hookDecisions.hookDialectOf(input));

  if (answer.stdout !== "") await writeStdoutText(answer.stdout);
  if (answer.stderr !== "") await writeStderr(answer.stderr);

  return answer.exitCode === 0
    ? results.ok(undefined)
    : results.fail({ exitCode: answer.exitCode });
};

// =============================================================================
// Stop: iteration increment + git snapshot + threshold check
// =============================================================================

const handleStop = async (): Promise<shellArgs.CliResult<void>> => {
  const input = await readHookInput();
  const root = rootOf(input);

  let state: hookDecisions.HookInput;
  try {
    state = hookDecisions.parseHookInput(
      await runtime.fs.readTextFile(`${root}/${persistence.paths.stateFile}`),
    );
  } catch {
    return results.ok(undefined);
  }

  const phase = hookDecisions.stringField(state, "phase");
  if (!hookDecisions.stopRecordsIteration(input, phase)) {
    return results.ok(undefined);
  }

  // Stand down when `noskills run` is driving the turn.
  //
  // It records the iteration itself once its typed call returns, so writing
  // here too would mean two processes doing a read-modify-write on state.json
  // for the same turn -- a lost update, not a redundant one. The loop clears
  // the flag when it finishes, so an ordinary agent-driven session is
  // unaffected.
  if (
    iteration_.isDriverAuthoritative(
      state["execution"] as Record<string, unknown> | undefined,
    )
  ) {
    return results.ok(undefined);
  }

  // Everything below used to live here inline. It is shared with `noskills run`
  // so the two callers cannot drift on what an iteration means.
  const record = await iteration_.recordIteration(root);

  if (record === null) return results.ok(undefined);

  // Reset executor warning flag for fresh iteration
  try {
    await runtime.fs.remove(
      `${root}/${persistence.paths.progressesDir}/executor-warned.flag`,
    );
  } catch {
    // best effort — may not exist
  }

  let maxIter = hookDecisions.DEFAULT_RESTART_THRESHOLD;
  try {
    maxIter = hookDecisions.restartThreshold(
      await persistence.readManifest(root),
    );
  } catch {
    // use default
  }

  const notice = hookDecisions.restartNotice(record.iteration, maxIter);
  if (notice !== null) {
    // stderr on exit 0 reaches the user, not the agent: the threshold is the
    // user's call, and the agent's prompt carries no countdown.
    await writeStderr(notice);
  }

  return results.ok(undefined);
};

// =============================================================================
// PostToolUse (Write|Edit|MultiEdit): log modified files
// =============================================================================

const handlePostFileWrite = async (): Promise<shellArgs.CliResult<void>> => {
  const input = await readHookInput();
  const call = hookDecisions.hookToolCall(input);
  if (call.kind !== "file") return results.ok(undefined);

  const tool = hookDecisions.toolNameOf(input);
  const ts = new Date().toISOString();
  const entries = call.changes
    .filter((change) => hookDecisions.isLoggedFileWrite(change.path))
    .map((change) => ({ file: change.path, tool, ts }));

  await appendProgressLog(rootOf(input), "files-changed.jsonl", entries);

  return results.ok(undefined);
};

// =============================================================================
// PostToolUse (Bash): log noskills CLI calls
// =============================================================================

const handlePostBash = async (): Promise<shellArgs.CliResult<void>> => {
  const input = await readHookInput();
  const call = hookDecisions.hookToolCall(input);
  const command = call.kind === "shell" ? call.command : "";

  if (!hookDecisions.isNoskillsCommand(command)) {
    return results.ok(undefined);
  }

  await appendProgressLog(rootOf(input), "noskills-calls.jsonl", [
    {
      command,
      ts: new Date().toISOString(),
    },
  ]);

  return results.ok(undefined);
};

// =============================================================================
// SessionStart: output current noskills instruction
// =============================================================================

/**
 * Puts the current noskills instruction into the agent's context and the git
 * wrapper on its PATH. The hook reads no stdin: OpenCode plugins generated
 * before the plugin passed stdin ran it with the terminal as stdin, where a
 * read would wait for input. So the tool that runs it names itself in `args`:
 * `--tool=copilot-cli` gives Copilot CLI's output shape.
 */
const handleSessionStart = async (
  args: readonly string[],
): Promise<shellArgs.CliResult<void>> => {
  const root =
    runtime.env.get("NOSKILLS_PROJECT_ROOT") ?? runtime.process.cwd();

  // Not initialized — silently skip
  if (!(await persistence.isInitialized(root))) {
    return results.ok(undefined);
  }

  // The compiled commands and the git wrapper use the manifest's command.
  const commandPrefix = await cmd.loadCommandPrefix(root);
  const state = await persistence.readState(root);
  const config = await persistence.readManifest(root);

  await exportGitWrapper(root, config, commandPrefix);

  // Load concerns and rules
  const allConcerns = await persistence.listConcerns(root);
  const activeConcerns = allConcerns.filter(
    (c) => config !== null && config.concerns.includes(c.id),
  );
  const rules = await syncEngine.loadRules(root);

  // Compile and output the current instruction
  const hints = syncEngine.resolveInteractionHints(config?.tools ?? []);
  const output = await compiler.compile(
    state,
    activeConcerns,
    rules,
    config,
    undefined,
    undefined,
    undefined,
    hints,
  );
  await writeStdout(
    hookDecisions.sessionStartOutput(
      output,
      args.includes("--tool=copilot-cli") ? "copilot" : "claude",
    ),
  );

  return results.ok(undefined);
};

/**
 * Writes the git wrapper while allowGit is false. In a Claude Code session it
 * also goes first on the PATH of every Bash command, through
 * `CLAUDE_ENV_FILE`. Codex, OpenCode, Copilot CLI and Kiro call this hook too
 * but have no such file; for them the wrapper is written so that a tool
 * started with its directory first on PATH runs git through it (README "Git
 * is read-only"). A failure is reported to the user and does not stop the
 * session: the PreToolUse guard still applies.
 */
const exportGitWrapper = async (
  root: string,
  config: schema.NosManifest | null,
  commandPrefix: string,
): Promise<void> => {
  if (config?.allowGit === true) return;

  try {
    const wrapper = await gitWrapperInstall.installGitWrapper(
      root,
      commandPrefix,
    );
    if (wrapper === null) return;

    const envFile = runtime.env.get("CLAUDE_ENV_FILE") ?? "";
    if (envFile === "") return;

    await gitWrapperInstall.exportFromEnvFile(envFile, wrapper.binDir);
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    await writeStderr(
      `noskills: the git wrapper was not installed in ${gitWrapperInstall.wrapperDir(
        root,
      )}: ${detail}. Git writes are still refused by the PreToolUse hook, but not when a program builds the git command itself.\n`,
    );
  }
};

// =============================================================================
// git-exec: the check behind the agent-session git wrapper
// =============================================================================

/**
 * Called by the wrapper with git's arguments. Exits 0 when the command may
 * run; otherwise prints the reason on stderr and exits with
 * GIT_EXEC_DENIED_EXIT_CODE. The wrapper passes the project root, the real
 * git binary and the directory git would run in; a call without them resolves
 * them itself.
 */
const handleGitExec = async (
  args: readonly string[],
): Promise<shellArgs.CliResult<void>> => {
  const root =
    runtime.env.get("NOSKILLS_PROJECT_ROOT") ??
    (await persistence.resolveProjectRoot()).root;
  const realGit =
    hookDecisions.explicitRealGit(runtime.env.get("NOSKILLS_REAL_GIT")) ??
    (await gitWrapperInstall.resolveRealGit(
      runtime.env.get("PATH") ?? "",
      gitWrapperInstall.wrapperDir(root),
    ));

  if (realGit === null) {
    await writeStderr(
      "noskills: no git binary found on PATH outside the noskills wrapper directory.\n",
    );
    return results.fail({ exitCode: 1 });
  }

  const denial = await gitWrapperInstall.checkGitExec(args, {
    root,
    realGit,
    cwd: runtime.env.get("NOSKILLS_GIT_CWD") ?? runtime.process.cwd(),
  });

  if (denial === null) return results.ok(undefined);

  await writeStderr(`${denial}\n`);
  return results.fail({ exitCode: gitWrapper.GIT_EXEC_DENIED_EXIT_CODE });
};

// =============================================================================
// PostToolUse (AskUserQuestion): record a token mapping the asked question
// to the expected discovery step. Best-effort — never blocks the agent.
// =============================================================================

/**
 * The core of the AskUserQuestion hook, without stdin: writes the
 * ask-token.json that `noskills next` later takes to mark discovery answers
 * STATED rather than INFERRED. The token names the steps the call's
 * questions belong to and whether the agent asked each as written ("exact")
 * or rephrased it ("modified"). While discovery collects the base answers, a
 * call adds its questions to those an earlier call of the same set recorded.
 */
export const processAskUserQuestionHook = async (
  input: hookDecisions.HookInput,
  root: string,
): Promise<void> => {
  if (hookDecisions.stringField(input, "tool_name") !== "AskUserQuestion") {
    return;
  }

  const asked = hookDecisions.askedQuestionsOf(
    hookDecisions.toolInputOf(input),
  );
  if (asked.length === 0) return;

  const tokenPath = `${root}/${persistence.paths.askTokenFile}`;
  const now = new Date();

  // Without a readable state the token still records the question, under the
  // "unknown" step that no answer matches.
  let state: schema.StateFile | null = null;
  try {
    state = await persistence.readState(root);
  } catch {
    // best effort; the token records the "unknown" step
  }
  const specName = state?.spec ?? null;

  let prior: readonly askToken.AskTokenStep[] = [];
  try {
    const raw = await runtime.fs.readTextFile(tokenPath);
    prior = askToken.validStepsOf(raw, specName, now.getTime()) ?? [];
  } catch {
    // no token yet
  }

  const steps = hookDecisions.askTokenStepsAfter(state, prior, asked);
  if (steps === null) return;

  const payload: askToken.AskToken = {
    token: crypto.randomUUID().slice(0, 8),
    spec: specName,
    steps,
    createdAt: now.toISOString(),
  };

  // Best-effort write — never throw
  try {
    await runtime.fs.mkdir(`${root}/${persistence.paths.progressesDir}`, {
      recursive: true,
    });
    await runtime.fs.writeTextFile(tokenPath, JSON.stringify(payload) + "\n");
  } catch {
    // Silently swallow — hook failure must never break the agent.
  }
};

const handlePostAskUserQuestion = async (): Promise<
  shellArgs.CliResult<void>
> => {
  const input = await readHookInput();
  await processAskUserQuestionHook(input, rootOf(input));
  return results.ok(undefined);
};
