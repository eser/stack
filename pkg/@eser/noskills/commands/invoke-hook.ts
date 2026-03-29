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
// PreToolUse: phase gate + git write guard
// =============================================================================

const handlePreToolUse = async (): Promise<shellArgs.CliResult<void>> => {
  const input = await readStdin();
  const toolName = (input["tool_name"] as string) ?? "unknown";
  const toolInput = (input["tool_input"] as Record<string, unknown>) ?? {};

  const root = (input["cwd"] as string) ?? runtime.process.cwd();
  const config = await persistence.readManifest(root);

  // Read state
  let state: Record<string, unknown> = {};
  try {
    const stateFile = await persistence.readState(root);
    state = stateFile as unknown as Record<string, unknown>;
  } catch {
    // No state — noskills not initialized, allow everything
    return results.ok(undefined);
  }

  const deny = async (reason: string): Promise<void> => {
    await writeStdout({
      hookSpecificOutput: {
        hookEventName: "PreToolUse",
        permissionDecision: "deny",
        permissionDecisionReason: `noskills: ${reason}`,
      },
    });
  };

  // ── Git write guard ──
  if (toolName === "Bash") {
    const command = ((toolInput["command"] as string) ?? "").trim();
    const allowGit = config?.allowGit ?? false;

    if (!allowGit) {
      const gitWriteOps = [
        "git add",
        "git commit",
        "git push",
        "git merge",
        "git rebase",
        "git checkout",
        "git stash",
        "git reset",
        "git cherry-pick",
        "git tag",
        "git branch -d",
        "git branch -D",
        "git branch -m",
        "git revert",
        "git am",
        "git mv",
        "git rm",
      ];

      for (const op of gitWriteOps) {
        // Find which segment matched the write-op prefix
        let matchedSegment = "";

        if (command.startsWith(op)) {
          matchedSegment = command.split(/\s*&&\s*|\s*;\s*/)[0] ?? command;
        } else if (command.includes(` && ${op}`)) {
          matchedSegment = command.split(/\s*&&\s*/).find((s) =>
            s.trim().startsWith(op)
          ) ?? "";
        } else if (command.includes(`; ${op}`)) {
          matchedSegment = command.split(/\s*;\s*/).find((s) =>
            s.trim().startsWith(op)
          ) ?? "";
        } else {
          continue;
        }

        // Check if the matched segment is actually a read-only subcommand
        if (hookDecisions.isGitReadOnly(matchedSegment.trim())) continue;

        await deny(
          "git is read-only for agents. The user controls git. You may use `git log`, `git diff`, `git status`, `git show`, `git blame`.",
        );
        return results.ok(undefined);
      }
    }

    // Non-git bash commands — allow
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

  // Allow writes in phases where the agent should be free to work
  if (
    phase === "EXECUTING" || phase === "IDLE" || phase === "COMPLETED" ||
    phase === "UNKNOWN"
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
    return results.ok(undefined);
  }

  // Block writes only in conversation phases (DISCOVERY, DISCOVERY_REVIEW, SPEC_DRAFT, SPEC_APPROVED, BLOCKED)
  const reasons: Record<string, string> = {
    DISCOVERY: `Discovery in progress. Run \`${cmd("next")}\` to continue.`,
    DISCOVERY_REVIEW: `Discovery answers need review. Run \`${
      cmd('next --answer="approve"')
    }\` or revise answers.`,
    SPEC_DRAFT: `Spec needs review. Run \`${cmd("approve")}\``,
    SPEC_APPROVED: `Start execution first: \`${cmd('next --answer="start"')}\``,
    BLOCKED: `Execution blocked. Resolve with \`${
      cmd('next --answer="resolution"')
    }\``,
  };

  await deny(reasons[phase] ?? `Run \`${cmd("next")}\` first.`);
  return results.ok(undefined);
};

// =============================================================================
// Stop: iteration increment + git snapshot + threshold check
// =============================================================================

const handleStop = async (): Promise<shellArgs.CliResult<void>> => {
  const input = await readStdin();

  // Guard: prevent infinite loop
  if (input["stop_hook_active"] === true) return results.ok(undefined);

  const root = (input["cwd"] as string) ?? runtime.process.cwd();

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

  const root = (input["cwd"] as string) ?? runtime.process.cwd();
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

  const root = (input["cwd"] as string) ?? runtime.process.cwd();
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
  const root = runtime.process.cwd();

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
  const output = compiler.compile(state, activeConcerns, rules, config);
  await writeStdout(output);

  return results.ok(undefined);
};
