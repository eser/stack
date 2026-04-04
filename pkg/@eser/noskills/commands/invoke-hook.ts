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
 *
 * Each reads Claude Code hook JSON from stdin, performs logic, outputs
 * JSON to stdout. The LLM is completely unaware these exist.
 *
 * @module
 */

import * as results from "@eser/primitives/results";
import type * as shellArgs from "@eser/shell/args";
import * as persistence from "../state/persistence.ts";
import * as compiler from "../context/compiler.ts";
import * as syncEngine from "../sync/engine.ts";
import * as hookDecisions from "./hook-decisions.ts";
import * as folderRules from "../context/folder-rules.ts";
import * as concerns from "../context/concerns.ts";
import { cmd } from "../output/cmd.ts";
import { runtime } from "@eser/standards/cross-runtime";

// =============================================================================
// Stdin reader
// =============================================================================

const readStdin = async (): Promise<Record<string, unknown>> => {
  const reader = runtime.process.stdin.getReader();
  const chunks: Uint8Array[] = [];

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done || value === undefined) break;
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }

  // Reassemble chunks
  let offset = 0;
  const merged = new Uint8Array(
    chunks.reduce((acc, c) => acc + c.length, 0),
  );
  for (const chunk of chunks) {
    merged.set(chunk, offset);
    offset += chunk.length;
  }

  const decoded = new TextDecoder().decode(merged);

  try {
    return JSON.parse(decoded) as Record<string, unknown>;
  } catch {
    return {};
  }
};

const writeStdout = async (data: unknown): Promise<void> => {
  const encoder = new TextEncoder();
  const writer = runtime.process.stdout.getWriter();
  await writer.write(encoder.encode(JSON.stringify(data)));
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
      return await handleSessionStart();
    default:
      return results.ok(undefined);
  }
};

// =============================================================================
// Shared helpers for hook handlers
// =============================================================================

const writeDeny = async (reason: string): Promise<void> => {
  await writeStdout({
    hookSpecificOutput: {
      hookEventName: "PreToolUse",
      permissionDecision: "deny",
      permissionDecisionReason: `noskills: ${reason}`,
    },
  });
};

/** Allow tool use with advisory context the agent sees. */
const writeAllowWithContext = async (context: string): Promise<void> => {
  await writeStdout({
    hookSpecificOutput: {
      hookEventName: "PreToolUse",
      permissionDecision: "allow",
      additionalContext: context,
    },
  });
};

/** Check git guard and return denial reason, or null if allowed. */
const checkGitGuard = (command: string, allowGit: boolean): string | null => {
  if (allowGit) return null;
  if (!command.includes("git")) return null;

  const segments = command.split(/\s*(?:&&|;)\s*/);
  for (const seg of segments) {
    const trimmed = seg.trim();
    if (trimmed.startsWith("git") && !hookDecisions.isGitAllowed(trimmed)) {
      return "Git write operations are not allowed. Only read commands (log, diff, status, show, blame, branch, tag) are permitted. The user controls git, the agent controls files.";
    }
  }

  if (hookDecisions.containsGitWriteBypass(command)) {
    return "Git write operations detected in subshell or pipe. Only read commands are permitted. The user controls git, the agent controls files.";
  }

  return null;
};

// =============================================================================
// PreToolUse: phase gate + git write guard
// =============================================================================

const handlePreToolUse = async (): Promise<shellArgs.CliResult<void>> => {
  const input = await readStdin();
  const toolName = (input["tool_name"] as string) ?? "unknown";
  const toolInput = (input["tool_input"] as Record<string, unknown>) ?? {};

  const root = (input["cwd"] as string) ??
    runtime.env.get("NOSKILLS_PROJECT_ROOT") ?? runtime.process.cwd();
  const config = await persistence.readManifest(root);

  // ── Session-based enforcement ──
  const sessionId = runtime.env.get("NOSKILLS_SESSION") ?? null;

  if (sessionId !== null) {
    const session = await persistence.readSession(root, sessionId);
    if (session !== null) {
      // Free mode sessions → pass everything (git guard still applies)
      if (session.mode === "free") {
        // Still apply git guard even in free mode
        if (toolName === "Bash") {
          const command = ((toolInput["command"] as string) ?? "").trim();
          const allowGit = config?.allowGit ?? false;
          if (!allowGit && command.includes("git")) {
            const gitResult = checkGitGuard(command, allowGit);
            if (gitResult !== null) {
              await writeDeny(gitResult);
              return results.ok(undefined);
            }
          }
        }
        return results.ok(undefined);
      }

      // Spec mode → use session's cached phase for enforcement
      // (fall through to normal phase enforcement with session phase)
    }
  }

  // Read state — prefer session phase if available, otherwise global state
  let state: Record<string, unknown> = {};

  if (sessionId !== null) {
    const session = await persistence.readSession(root, sessionId);
    if (session !== null && session.mode === "spec" && session.phase !== null) {
      state = { phase: session.phase };
    } else {
      // Session exists but no valid phase — load spec state
      if (session !== null && session.spec !== null) {
        try {
          const specState = await persistence.resolveState(root, session.spec);
          state = specState as unknown as Record<string, unknown>;
        } catch {
          return results.ok(undefined);
        }
      } else {
        return results.ok(undefined);
      }
    }
  } else {
    // No session — backward compat: load global state
    // Warn if sessions exist but NOSKILLS_SESSION not set
    const sessions = await persistence.listSessions(root);
    if (sessions.length > 0) {
      // Use most restrictive phase found
      const phaseOrder: Record<string, number> = {
        DISCOVERY: 10,
        DISCOVERY_REVIEW: 10,
        SPEC_DRAFT: 10,
        SPEC_APPROVED: 8,
        BLOCKED: 8,
        EXECUTING: 2,
        IDLE: 0,
        COMPLETED: 0,
      };
      let mostRestrictive = "IDLE";
      let maxRestriction = 0;
      for (const s of sessions) {
        const p = s.phase ?? "IDLE";
        const restriction = phaseOrder[p] ?? 0;
        if (restriction > maxRestriction) {
          maxRestriction = restriction;
          mostRestrictive = p;
        }
      }
      state = { phase: mostRestrictive };

      // Write warning to stderr
      const encoder = new TextEncoder();
      const writer = runtime.process.stderr.getWriter();
      await writer.write(
        encoder.encode(
          `noskills: WARNING — ${sessions.length} session(s) active but NOSKILLS_SESSION not set. Using most restrictive phase (${mostRestrictive}). Set NOSKILLS_SESSION for correct per-instance enforcement.\n`,
        ),
      );
      writer.releaseLock();
    } else {
      try {
        const stateFile = await persistence.readState(root);
        state = stateFile as unknown as Record<string, unknown>;
      } catch {
        // No state — noskills not initialized, allow everything
        return results.ok(undefined);
      }
    }
  }

  // ── Git write guard ──
  if (toolName === "Bash") {
    const command = ((toolInput["command"] as string) ?? "").trim();
    const allowGit = config?.allowGit ?? false;

    const gitDenial = checkGitGuard(command, allowGit);
    if (gitDenial !== null) {
      await writeDeny(gitDenial);
      return results.ok(undefined);
    }

    // Non-git or allowed git commands — allow
    return results.ok(undefined);
  }

  // ── File edit phase guard ──
  const gatedTools = ["Write", "Edit", "MultiEdit"];
  if (!gatedTools.includes(toolName)) return results.ok(undefined);

  const filePath = (toolInput["file_path"] as string) ??
    (toolInput["path"] as string) ?? "";
  if (filePath.includes(".eser/") || filePath.includes(".claude/")) {
    return results.ok(undefined);
  }

  const phase = (state["phase"] as string) ?? "UNKNOWN";

  // UNKNOWN phase = default-deny (Jidoka: if phase can't be determined, block)
  if (phase === "UNKNOWN") {
    await writeDeny(
      "Phase unknown — file edit blocked. Run `noskills status` to check state.",
    );
    return results.ok(undefined);
  }

  // Allow writes in phases where the agent should be free to work
  if (
    phase === "EXECUTING" || phase === "IDLE" ||
    phase === "COMPLETED"
  ) {
    // Sub-agent spawning reminder (once per session, non-blocking)
    if (phase === "EXECUTING" && gatedTools.includes(toolName)) {
      const flagFile =
        `${root}/${persistence.paths.stateDir}/executor-warned.flag`;
      try {
        await runtime.fs.readTextFile(flagFile);
        // Flag exists — already warned this session
      } catch {
        // First write attempt in EXECUTING — show reminder
        try {
          await runtime.fs.mkdir(
            `${root}/${persistence.paths.stateDir}`,
            { recursive: true },
          );
          await runtime.fs.writeTextFile(flagFile, new Date().toISOString());
          const encoder = new TextEncoder();
          const writer = runtime.process.stderr.getWriter();
          await writer.write(
            encoder.encode(
              "noskills: REMINDER — You should be spawning a noskills-executor sub-agent for implementation work. If you're the main orchestrator agent, delegate to a sub-agent instead of editing directly. If you ARE a sub-agent, ignore this message and continue.\n",
            ),
          );
          writer.releaseLock();
        } catch {
          // best effort
        }
      }
    }

    // Tier 2: deliver file-specific rules via additionalContext
    if (phase === "EXECUTING" && filePath.length > 0) {
      try {
        const notes: string[] = [];

        // 1. Scoped rules matching this file
        const scopedRules = await syncEngine.loadScopedRules(root);
        const tier2Rules = syncEngine.getTier2RulesForFile(
          scopedRules,
          "EXECUTING",
          filePath,
        );
        notes.push(...tier2Rules);

        // 2. Folder rules (walk up from file's directory)
        const fRules = await folderRules.collectFolderRules(root, [filePath]);
        for (const fr of fRules) {
          notes.push(`(${fr.folder}/) ${fr.rule}`);
        }

        // 3. Concern reminders by file type
        const stateFile = state as Record<string, unknown>;
        const classification = (stateFile["classification"] as
          | import("../state/schema.ts").SpecClassification
          | null) ?? null;
        const activeConcerns = await persistence.listConcerns(root);
        const manifest = await persistence.readManifest(root);
        const activeConcernDefs = activeConcerns.filter((c) =>
          manifest !== null && manifest.concerns.includes(c.id)
        );
        const tier2Reminders = concerns.getTier2RemindersForFile(
          activeConcernDefs,
          filePath,
          classification,
        );
        notes.push(...tier2Reminders);

        if (notes.length > 0) {
          const context = "[noskills] Rules for this file:\n" +
            notes.map((n) => `- ${n}`).join("\n");
          await writeAllowWithContext(context);
          return results.ok(undefined);
        }
      } catch {
        // best effort — don't block the tool on rule collection failure
      }
    }

    return results.ok(undefined);
  }

  // Block writes only in conversation phases (DISCOVERY, DISCOVERY_REVIEW, SPEC_DRAFT, SPEC_APPROVED, BLOCKED)
  const reasons: Record<string, string> = {
    DISCOVERY:
      `You are in DISCOVERY — this is a thinking phase, not an implementation phase. Read and discuss only. To write code, complete discovery and get the spec approved first. Run \`${
        cmd("next")
      }\` to continue.`,
    DISCOVERY_REVIEW:
      `You are in DISCOVERY_REVIEW — this is a thinking phase, not an implementation phase. Read and discuss only. To write code, complete discovery and get the spec approved first. Run \`${
        cmd('next --answer="approve"')
      }\` or revise answers.`,
    SPEC_DRAFT:
      `You are in SPEC_DRAFT — this is a thinking phase, not an implementation phase. Read and discuss only. To write code, approve the spec first. Run \`${
        cmd("approve")
      }\``,
    SPEC_APPROVED: `You are in SPEC_APPROVED — start execution first: \`${
      cmd('next --answer="start"')
    }\``,
    BLOCKED: `Execution blocked. Resolve with \`${
      cmd('next --answer="resolution"')
    }\``,
  };

  await writeDeny(reasons[phase] ?? `Run \`${cmd("next")}\` first.`);
  return results.ok(undefined);
};

// =============================================================================
// Stop: iteration increment + git snapshot + threshold check
// =============================================================================

const handleStop = async (): Promise<shellArgs.CliResult<void>> => {
  const input = await readStdin();

  // Guard: prevent infinite loop
  if (input["stop_hook_active"] === true) return results.ok(undefined);

  const root = (input["cwd"] as string) ??
    runtime.env.get("NOSKILLS_PROJECT_ROOT") ?? runtime.process.cwd();

  // Read state
  let state: Record<string, unknown>;
  try {
    const raw = await runtime.fs.readTextFile(
      `${root}/${persistence.paths.stateFile}`,
    );
    state = JSON.parse(raw) as Record<string, unknown>;
  } catch {
    return results.ok(undefined);
  }

  if (state["phase"] !== "EXECUTING") return results.ok(undefined);

  const execution = state["execution"] as Record<string, unknown> ?? {};

  // Read tracked files from hook log
  const filesChangedPath =
    `${root}/${persistence.paths.stateDir}/files-changed.jsonl`;
  let trackedFiles: string[] = [];
  try {
    const logContent = await runtime.fs.readTextFile(filesChangedPath);
    const entries = logContent.trim().split("\n").filter(Boolean);
    trackedFiles = [
      ...new Set(
        entries.map((e) => {
          try {
            return (JSON.parse(e) as { file: string }).file;
          } catch {
            return null;
          }
        }).filter((f): f is string => f !== null),
      ),
    ];
  } catch {
    // No tracked files yet
  }

  // Git diff for completeness
  let gitFiles: string[] = [];
  let gitStat = "no changes";
  try {
    const { execSync } = await import("node:child_process");
    const diff = execSync("git diff --name-only", {
      cwd: root,
      encoding: "utf-8",
      timeout: 5000,
    });
    gitFiles = diff.trim().split("\n").filter(Boolean);
    const stat = execSync("git diff --stat", {
      cwd: root,
      encoding: "utf-8",
      timeout: 5000,
    });
    const lines = stat.trim().split("\n");
    gitStat = lines[lines.length - 1] ?? "no changes";
  } catch {
    // git not available
  }

  const allFiles = [...new Set([...trackedFiles, ...gitFiles])];
  const iteration = ((execution["iteration"] as number) ?? 0) + 1;

  // Write per-iteration log
  const iterDir = `${root}/${persistence.paths.stateDir}/iterations`;
  try {
    await runtime.fs.mkdir(iterDir, { recursive: true });
    await runtime.fs.writeTextFile(
      `${iterDir}/iteration-${iteration}.json`,
      JSON.stringify(
        {
          iteration,
          files: allFiles,
          gitStat: gitStat.trim(),
          timestamp: new Date().toISOString(),
        },
        null,
        2,
      ) + "\n",
    );
  } catch {
    // best effort
  }

  // Check threshold
  let maxIter = 15;
  try {
    const config = await persistence.readManifest(root);
    if (config !== null) {
      maxIter = config.maxIterationsBeforeRestart;
    }
  } catch {
    // use default
  }

  // Update state
  state["execution"] = {
    ...execution,
    iteration,
    modifiedFiles: allFiles,
    lastProgress: gitStat.trim() ||
      (execution["lastProgress"] as string | null) || null,
  };
  state["lastCalledAt"] = new Date().toISOString();

  try {
    await runtime.fs.writeTextFile(
      `${root}/${persistence.paths.stateFile}`,
      JSON.stringify(state, null, 2) + "\n",
    );
  } catch {
    // best effort
  }

  // Reset files-changed log for next iteration
  try {
    await runtime.fs.writeTextFile(filesChangedPath, "");
  } catch {
    // best effort
  }

  // Reset executor warning flag for fresh iteration
  try {
    await runtime.fs.remove(
      `${root}/${persistence.paths.stateDir}/executor-warned.flag`,
    );
  } catch {
    // best effort — may not exist
  }

  if (iteration >= maxIter) {
    // Write to stderr (user sees, agent doesn't)
    const encoder = new TextEncoder();
    const writer = runtime.process.stderr.getWriter();
    await writer.write(
      encoder.encode(
        `noskills: iteration ${iteration} reached threshold (${maxIter}). Consider starting a fresh conversation.\n`,
      ),
    );
    writer.releaseLock();
  }

  return results.ok(undefined);
};

// =============================================================================
// PostToolUse (Write|Edit|MultiEdit): log modified files
// =============================================================================

const handlePostFileWrite = async (): Promise<shellArgs.CliResult<void>> => {
  const input = await readStdin();
  const toolInput = (input["tool_input"] as Record<string, unknown>) ?? {};
  const filePath = (toolInput["file_path"] as string) ??
    (toolInput["path"] as string) ?? "";

  if (
    !filePath || filePath.includes(".eser/") || filePath.includes(".claude/")
  ) {
    return results.ok(undefined);
  }

  const root = (input["cwd"] as string) ??
    runtime.env.get("NOSKILLS_PROJECT_ROOT") ?? runtime.process.cwd();
  const logFile = `${root}/${persistence.paths.stateDir}/files-changed.jsonl`;

  const entry = JSON.stringify({
    file: filePath,
    tool: input["tool_name"],
    ts: new Date().toISOString(),
  });

  try {
    await runtime.fs.mkdir(
      `${root}/${persistence.paths.stateDir}`,
      { recursive: true },
    );
    // Append
    let existing = "";
    try {
      existing = await runtime.fs.readTextFile(logFile);
    } catch {
      // File doesn't exist
    }
    await runtime.fs.writeTextFile(logFile, existing + entry + "\n");
  } catch {
    // best effort
  }

  return results.ok(undefined);
};

// =============================================================================
// PostToolUse (Bash): log noskills CLI calls
// =============================================================================

const handlePostBash = async (): Promise<shellArgs.CliResult<void>> => {
  const input = await readStdin();
  const toolInput = (input["tool_input"] as Record<string, unknown>) ?? {};
  const command = (toolInput["command"] as string) ?? "";

  if (!command.includes("noskills")) return results.ok(undefined);

  const root = (input["cwd"] as string) ??
    runtime.env.get("NOSKILLS_PROJECT_ROOT") ?? runtime.process.cwd();
  const logFile = `${root}/${persistence.paths.stateDir}/noskills-calls.jsonl`;

  const entry = JSON.stringify({
    command,
    ts: new Date().toISOString(),
  });

  try {
    await runtime.fs.mkdir(
      `${root}/${persistence.paths.stateDir}`,
      { recursive: true },
    );
    let existing = "";
    try {
      existing = await runtime.fs.readTextFile(logFile);
    } catch {
      // File doesn't exist
    }
    await runtime.fs.writeTextFile(logFile, existing + entry + "\n");
  } catch {
    // best effort
  }

  return results.ok(undefined);
};

// =============================================================================
// SessionStart: output current noskills instruction
// =============================================================================

const handleSessionStart = async (): Promise<shellArgs.CliResult<void>> => {
  const root = runtime.env.get("NOSKILLS_PROJECT_ROOT") ??
    runtime.process.cwd();

  // Not initialized — silently skip
  if (!(await persistence.isInitialized(root))) {
    return results.ok(undefined);
  }

  const state = await persistence.readState(root);
  const config = await persistence.readManifest(root);

  // Load concerns and rules
  const allConcerns = await persistence.listConcerns(root);
  const activeConcerns = allConcerns.filter((c) =>
    config !== null && config.concerns.includes(c.id)
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
  await writeStdout(output);

  return results.ok(undefined);
};
