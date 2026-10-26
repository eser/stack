// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * Check steps for the generated noskills-executor and noskills-verifier
 * agents. Every adapter that writes these agents takes the steps from here.
 * They name the project's own type check and tests: noskills runs in projects
 * of any language, and a fixed type check or test command was wrong in every
 * project that used another one.
 *
 * @module
 */

/** Tells the agent where the project's commands come from. */
const FIND_COMMANDS =
  "Take these commands from the project itself: its README, task runner (package.json scripts, deno.json tasks, Makefile) or CI config.";

/** Self-check steps the executor runs before it reports. */
export const EXECUTOR_SELF_CHECK: readonly string[] = [
  "1. Run the project's type check on the modified files (skip this step when the project has none)",
  "2. Run the project's tests that cover the changed code",
  "3. If the type check or tests fail, fix the issues before reporting",
  FIND_COMMANDS,
];

/** Steps the verifier follows. */
export const VERIFIER_STEPS: readonly string[] = [
  "1. Read each modified file and verify the changes are correct",
  "2. Run the project's type check on the modified files (skip this step when the project has none)",
  "3. Run the project's tests that cover the changed code",
  "4. Check each acceptance criterion against actual file contents",
  FIND_COMMANDS,
];
