// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * Recording one execution iteration into state.
 *
 * This is the single writer for `execution.iteration`, `execution.modifiedFiles`
 * and `execution.lastProgress`. It has two callers, and they must never
 * disagree:
 *
 *   - `invoke-hook stop`, running INSIDE the agent process, when the agent
 *     drives itself and Claude Code's Stop hook is what notices a turn ended.
 *   - `noskills run`, running OUTSIDE it, when the loop drives the agent through
 *     a typed turn and knows the turn ended because the call returned.
 *
 * Only one of them may write per turn — see {@link isDriverAuthoritative}.
 * Having both write is not a redundancy, it is two processes racing on one file
 * with a read-modify-write each.
 *
 * @module
 */

import { runtime } from "@eserstack/standards/cross-runtime";

import * as persistence from "./persistence.ts";

/** What a single recorded iteration observed. */
export type IterationRecord = {
  readonly iteration: number;
  readonly modifiedFiles: readonly string[];
  /**
   * `git diff --stat` summary line. Empty when the turn changed nothing AND
   * when git could not be consulted at all — callers must not treat it as
   * prose to display without a fallback.
   */
  readonly gitStat: string;
};

/**
 * Who owns state updates for the turn currently in flight.
 *
 * `"acp"` means `noskills run` is driving through a typed turn and will record
 * the iteration itself when the call returns. The in-agent Stop hook must stand
 * down for the duration.
 *
 * Absent (the default) means nothing is driving from outside, so the Stop hook
 * is the only thing that can notice a turn ended, and it records.
 */
export type ExecutionDriver = "acp";

/**
 * Reports whether an external driver has claimed this turn, so the in-agent
 * Stop hook should not also write.
 */
export const isDriverAuthoritative = (
  execution: Record<string, unknown> | undefined,
): boolean => {
  if (execution?.["driver"] !== "acp") {
    return false;
  }

  // A claim is only honoured while its owner is alive.
  //
  // The claim is released in a `finally`, which does NOT run when the loop is
  // killed -- Ctrl-C during a turn, a closed terminal, an OOM. Without this
  // check a single interrupted run would leave "acp" in state.json forever and
  // permanently silence the Stop hook for that project, turning a transient
  // interruption into exactly the silent never-records failure this whole
  // mechanism exists to prevent.
  const owner = execution["driverPid"];

  if (typeof owner !== "number") {
    // No pid recorded: an older or hand-edited state file. Treat the claim as
    // unverifiable and therefore not binding, so the hook keeps working.
    return false;
  }

  return runtime.process.isAlive(owner);
};

/**
 * Reads the files the PostToolUse hook logged for this iteration.
 *
 * This is the agent's own account of what it touched, which catches edits that
 * `git diff` cannot see -- a file written and then reverted, or one inside a
 * path git ignores.
 */
const readTrackedFiles = async (root: string): Promise<string[]> => {
  const path = `${root}/${persistence.paths.progressesDir}/files-changed.jsonl`;

  try {
    const content = await runtime.fs.readTextFile(path);

    const files = content.trim().split("\n").filter(Boolean).map((entry) => {
      try {
        return (JSON.parse(entry) as { file: string }).file;
      } catch {
        return null;
      }
    }).filter((file): file is string => file !== null);

    return [...new Set(files)];
  } catch {
    return [];
  }
};

/**
 * Reads what git thinks changed.
 *
 * execSync rather than @eserstack/shell/exec deliberately: this runs inside the
 * Stop hook, a short-lived process spawned by the agent, and the extraction that
 * created this module was meant to remove a duplicate implementation, not to
 * also change how it shells out. Revisit as its own change.
 */
const readGitChanges = async (
  root: string,
): Promise<{ files: string[]; stat: string }> => {
  try {
    const { execSync } = await import("node:child_process");

    const diff = execSync("git diff --name-only", {
      cwd: root,
      encoding: "utf-8",
      timeout: 5000,
    });

    const stat = execSync("git diff --stat", {
      cwd: root,
      encoding: "utf-8",
      timeout: 5000,
    });

    const lines = stat.trim().split("\n");

    return {
      files: diff.trim().split("\n").filter(Boolean),
      stat: lines[lines.length - 1] ?? "",
    };
  } catch {
    // Empty, NOT a human-readable "no changes".
    //
    // The caller writes `gitStat || previousProgress`, so any non-empty string
    // here overwrites the note describing the last productive turn. Reporting
    // "no changes" when git merely could not be RUN therefore destroyed real
    // progress history on every machine without git, or outside a work tree --
    // stating something the code had not observed. Empty means "nothing to
    // report", which is true of both a clean tree and an unavailable git, and
    // preserves the note in both.
    return { files: [], stat: "" };
  }
};

/**
 * Records one completed iteration: bumps the counter, captures what changed,
 * writes the per-iteration log, and clears the tracking log for the next turn.
 *
 * Returns null when state could not be read, which is the same "do nothing
 * quietly" the Stop hook has always done -- a hook that throws would surface to
 * the user as an agent failure.
 */
export const recordIteration = async (
  root: string,
): Promise<IterationRecord | null> => {
  let state: Record<string, unknown>;

  try {
    const raw = await runtime.fs.readTextFile(
      `${root}/${persistence.paths.stateFile}`,
    );

    state = JSON.parse(raw) as Record<string, unknown>;
  } catch {
    return null;
  }

  const execution = (state["execution"] as Record<string, unknown>) ?? {};

  const [trackedFiles, git] = await Promise.all([
    readTrackedFiles(root),
    readGitChanges(root),
  ]);

  const modifiedFiles = [...new Set([...trackedFiles, ...git.files])];
  const iteration = ((execution["iteration"] as number) ?? 0) + 1;
  const gitStat = git.stat.trim();

  // Per-iteration log, best effort: it is a record for humans, and failing the
  // turn because a log could not be written would be worse than losing the log.
  const iterationsDir = `${root}/${persistence.paths.progressesDir}/iterations`;

  try {
    await runtime.fs.mkdir(iterationsDir, { recursive: true });
    await runtime.fs.writeTextFile(
      `${iterationsDir}/iteration-${iteration}.json`,
      JSON.stringify(
        {
          iteration,
          files: modifiedFiles,
          gitStat,
          timestamp: new Date().toISOString(),
        },
        null,
        2,
      ) + "\n",
    );
  } catch {
    // best effort
  }

  state["execution"] = {
    ...execution,
    iteration,
    modifiedFiles,
    // An empty stat means the turn changed nothing; keep the previous progress
    // note rather than overwriting it with emptiness, so the next prompt still
    // carries the last thing that actually happened.
    lastProgress: gitStat || (execution["lastProgress"] as string | null) ||
      null,
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

  // Reset the tracking log so the next iteration starts from empty.
  try {
    await runtime.fs.writeTextFile(
      `${root}/${persistence.paths.progressesDir}/files-changed.jsonl`,
      "",
    );
  } catch {
    // best effort
  }

  return { iteration, modifiedFiles, gitStat };
};

/**
 * Claims (or releases) the current turn for an external driver.
 *
 * Written straight into state.json rather than carried in an environment
 * variable: the agent is spawned through the FFI bridge, and the Go library
 * caches its environment at load time, so a variable exported afterwards is not
 * observed by the process it would need to reach. state.json is read by the
 * Stop hook already, so it is the one channel guaranteed to arrive.
 */
export const setDriver = async (
  root: string,
  driver: ExecutionDriver | null,
): Promise<void> => {
  let state: Record<string, unknown>;

  try {
    const raw = await runtime.fs.readTextFile(
      `${root}/${persistence.paths.stateFile}`,
    );

    state = JSON.parse(raw) as Record<string, unknown>;
  } catch {
    return;
  }

  const execution = {
    ...((state["execution"] as Record<string, unknown>) ?? {}),
  };

  if (driver === null) {
    delete execution["driver"];
    delete execution["driverPid"];
  } else {
    execution["driver"] = driver;
    // Recorded alongside the claim so a claim orphaned by a kill can be
    // detected rather than believed forever.
    execution["driverPid"] = runtime.process.pid;
  }

  state["execution"] = execution;

  try {
    await runtime.fs.writeTextFile(
      `${root}/${persistence.paths.stateFile}`,
      JSON.stringify(state, null, 2) + "\n",
    );
  } catch {
    // best effort
  }
};
