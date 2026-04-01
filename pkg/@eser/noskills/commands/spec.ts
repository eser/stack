// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * `noskills spec` — Manage specs (new, list, split).
 *
 * @module
 */

import * as results from "@eser/primitives/results";
import * as streams from "@eser/streams";
import * as span from "@eser/streams/span";
import type * as shellArgs from "@eser/shell/args";
import * as persistence from "../state/persistence.ts";
import * as schema from "../state/schema.ts";
import * as machine from "../state/machine.ts";
import * as splitDetector from "../context/split-detector.ts";
import * as identity from "../state/identity.ts";
import { cmd, cmdPrefix } from "../output/cmd.ts";
import { runtime } from "@eser/standards/cross-runtime";

// Reserved names that cannot be used as spec names
const RESERVED_NAMES = new Set([
  "new",
  "list",
  "help",
  "next",
  "approve",
  "done",
  "block",
  "reset",
  "cancel",
  "wontfix",
  "reopen",
  "revisit",
  "split",
  "ac",
  "task",
  "note",
]);

// Subcommands that can appear after spec <name>
const SPEC_SUBCOMMANDS: ReadonlyMap<
  string,
  () => Promise<
    { main: (args?: readonly string[]) => Promise<shellArgs.CliResult<void>> }
  >
> = new Map([
  ["next", () => import("./next.ts")],
  ["approve", () => import("./approve.ts")],
  ["done", () => import("./done.ts")],
  ["block", () => import("./block.ts")],
  ["reset", () => import("./reset.ts")],
  ["cancel", () => import("./cancel.ts")],
  ["wontfix", () => import("./wontfix.ts")],
  ["reopen", () => import("./reopen.ts")],
]);

export { RESERVED_NAMES };

export const main = async (
  args?: readonly string[],
): Promise<shellArgs.CliResult<void>> => {
  const arg1 = args?.[0];

  // noskills spec new <name> "description"
  if (arg1 === "new") {
    return await specNew(args?.slice(1));
  }

  // noskills spec list
  if (arg1 === "list") {
    return await specList(args?.slice(1));
  }

  // noskills spec help
  if (arg1 === "help" || arg1 === undefined) {
    const prefix = cmdPrefix();
    const out = streams.output({
      renderer: streams.renderers.ansi(),
      sink: streams.sinks.stdout(),
    });
    out.writeln(
      `Usage: ${prefix} spec <new <name> "desc" | list | <name> <command>>`,
    );
    out.writeln("");
    out.writeln(span.dim("  Commands for a spec:"));
    out.writeln(
      span.dim(
        "    next, approve, done, block, reset, cancel, wontfix, reopen, revisit, split, ac, task, note",
      ),
    );
    out.writeln("");
    out.writeln(span.dim("  Examples:"));
    out.writeln(
      span.dim(`    ${prefix} spec new my-feature "Add upload support"`),
    );
    out.writeln(
      span.dim(`    ${prefix} spec my-feature next`),
    );
    out.writeln(
      span.dim(`    ${prefix} spec my-feature next --answer="approve"`),
    );
    await out.close();

    return results.ok(undefined);
  }

  // Otherwise: arg1 is a spec name, arg2 is the subcommand
  // noskills spec <specName> <subcommand> [args...]
  const specName = arg1;
  const subcommand = args?.[1];

  if (subcommand === undefined) {
    // noskills spec <name> with no subcommand — show spec info via status
    const statusMod = await import("./status.ts");
    return await statusMod.main([`--spec=${specName}`]);
  }

  // Handle spec-scoped commands that live in spec.ts itself
  if (subcommand === "split") {
    return await specSplit([`--spec=${specName}`, ...(args?.slice(2) ?? [])]);
  }

  if (subcommand === "revisit") {
    return await specRevisit([
      `--spec=${specName}`,
      ...(args?.slice(2) ?? []),
    ]);
  }

  // Check for spec-specific sub-commands: ac, task, note
  if (subcommand === "ac") return await specAC(specName, args?.slice(2));
  if (subcommand === "task") return await specTask(specName, args?.slice(2));
  if (subcommand === "note") return await specNote(specName, args?.slice(2));

  // Delegate to command modules (next, approve, done, block, etc.)
  const loader = SPEC_SUBCOMMANDS.get(subcommand);
  if (loader !== undefined) {
    const mod = await loader();
    // Inject --spec=<name> as first arg for backward compat with existing commands
    return await mod.main([`--spec=${specName}`, ...(args?.slice(2) ?? [])]);
  }

  // Unknown subcommand
  const out = streams.output({
    renderer: streams.renderers.ansi(),
    sink: streams.sinks.stdout(),
  });
  out.writeln(
    span.red(`Unknown command: spec ${specName} ${subcommand}`),
  );
  out.writeln(
    span.dim(
      `  Valid: next, approve, done, block, reset, cancel, wontfix, reopen, revisit, split, ac, task, note`,
    ),
  );
  await out.close();

  return results.fail({ exitCode: 1 });
};

// =============================================================================
// spec new
// =============================================================================

const specNew = async (
  args?: readonly string[],
): Promise<shellArgs.CliResult<void>> => {
  const out = streams.output({
    renderer: streams.renderers.ansi(),
    sink: streams.sinks.stdout(),
  });

  const root = runtime.process.cwd();

  if (!(await persistence.isInitialized(root))) {
    out.writeln(
      span.red("noskills is not initialized."),
      " Run: ",
      span.bold(cmd("init")),
    );
    await out.close();

    return results.fail({ exitCode: 1 });
  }

  // Positional: spec new <name> "description"
  // Also supports old --name= format for backward compat
  let specName: string | null = null;
  const descWords: string[] = [];

  if (args !== undefined) {
    let nameConsumed = false;
    for (const arg of args) {
      if (arg.startsWith("--name=")) {
        // Backward compat
        specName = arg.slice("--name=".length);
        nameConsumed = true;
      } else if (!arg.startsWith("-")) {
        if (!nameConsumed && specName === null) {
          specName = arg;
          nameConsumed = true;
        } else {
          descWords.push(arg);
        }
      }
    }
  }

  // Parse --from-plan flag
  let planPath: string | null = null;
  if (args !== undefined) {
    for (const arg of args) {
      if (arg.startsWith("--from-plan=")) {
        planPath = arg.slice("--from-plan=".length);
      }
    }
  }

  const description = descWords.join(" ");

  if (specName === null || specName.length === 0) {
    out.writeln(
      span.red("Error: spec name is required."),
    );
    out.writeln(
      span.dim("Example: "),
      span.bold(
        `${cmdPrefix()} spec new photo-upload "photo upload feature"`,
      ),
    );
    await out.close();

    return results.fail({ exitCode: 1 });
  }

  // Check reserved names
  if (RESERVED_NAMES.has(specName)) {
    out.writeln(
      span.red(`"${specName}" is a reserved name.`),
      span.dim(" Choose a different spec name."),
    );
    await out.close();

    return results.fail({ exitCode: 1 });
  }

  // Validate name: lowercase, hyphens, numbers only. Max 50 chars.
  const NAME_REGEX = /^[a-z0-9][a-z0-9-]*[a-z0-9]$/;
  if (
    specName.length > 50 ||
    (specName.length > 1 && !NAME_REGEX.test(specName)) ||
    (specName.length === 1 && !/^[a-z0-9]$/.test(specName))
  ) {
    out.writeln(
      span.red("Invalid spec name: "),
      span.bold(specName),
    );
    out.writeln(
      span.dim(
        "Must be lowercase, hyphens, numbers only. Max 50 chars. Regex: /^[a-z0-9][a-z0-9-]*[a-z0-9]$/",
      ),
    );
    await out.close();

    return results.fail({ exitCode: 1 });
  }

  if (description.length === 0) {
    out.writeln(
      span.red("Please provide a description: "),
      span.bold(
        `${cmdPrefix()} spec new --name=${specName} "photo upload feature"`,
      ),
    );
    await out.close();

    return results.fail({ exitCode: 1 });
  }
  // Validate plan file if provided
  if (planPath !== null) {
    try {
      const stat = await runtime.fs.stat(planPath);
      // Check file size (50KB max)
      if (stat.size > 50 * 1024) {
        out.writeln(span.red("Plan file too large. Maximum 50KB."));
        await out.close();
        return results.fail({ exitCode: 1 });
      }
    } catch {
      out.writeln(span.red(`Plan file not found: ${planPath}`));
      await out.close();
      return results.fail({ exitCode: 1 });
    }
  }

  const branch = `spec/${specName}`;

  // Check if spec name already exists
  const specDir = `${root}/${persistence.paths.specDir(specName)}`;
  try {
    await runtime.fs.stat(specDir);
    out.writeln(
      span.red(`Spec "${specName}" already exists.`),
      span.dim(
        ` Use a different --name or run \`${cmdPrefix()} reset --spec=${specName}\` first.`,
      ),
    );
    await out.close();

    return results.fail({ exitCode: 1 });
  } catch {
    // Directory doesn't exist — good, proceed
  }

  // Create a fresh state for the new spec (independent of other specs)
  const freshState = schema.createInitialState();
  const newState = machine.startSpec(freshState, specName, branch, description);

  // Record the transition with user identity
  const user = await identity.resolveUser(root);
  const withTransition = machine.recordTransition(
    newState,
    "IDLE",
    "DISCOVERY",
    user,
  );

  // Inject planPath into discovery state if provided
  let stateToSave = withTransition;
  if (planPath !== null) {
    stateToSave = {
      ...newState,
      discovery: {
        ...newState.discovery,
        planPath,
      },
    };
  }

  // Create spec directory and save state
  await runtime.fs.mkdir(
    `${root}/${persistence.paths.specDir(specName)}`,
    {
      recursive: true,
    },
  );
  await persistence.writeSpecState(root, specName, stateToSave);

  out.writeln(span.green("✔"), " Spec started: ", span.bold(specName));
  out.writeln(
    "  Directory: ",
    span.dim(persistence.paths.specDir(specName)),
  );
  out.writeln("  Branch:    ", span.dim(branch));
  out.writeln("  Phase:     ", span.yellow("DISCOVERY"));
  if (planPath !== null) {
    out.writeln("  Plan:      ", span.dim(planPath));
  }
  out.writeln("");
  out.writeln(
    "Run ",
    span.bold(cmd(`next --spec=${specName}`)),
    " to begin discovery questions.",
  );
  await out.close();

  return results.ok(undefined);
};

// =============================================================================
// spec list
// =============================================================================

import * as formatter from "../output/formatter.ts";

const specList = async (
  args?: readonly string[],
): Promise<shellArgs.CliResult<void>> => {
  const root = runtime.process.cwd();
  const fmt = formatter.parseOutputFormat(args);
  const specStates = await persistence.listSpecStates(root);

  // Also check spec directories that might not have state files yet
  const specsDir = `${root}/${persistence.paths.specsDir}`;
  const knownNames = new Set(specStates.map((s) => s.name));
  const allSpecs: {
    name: string;
    phase: string;
    iteration: number;
  }[] = [];

  for (const ss of specStates) {
    allSpecs.push({
      name: ss.name,
      phase: ss.state.phase,
      iteration: ss.state.execution.iteration,
    });
  }

  // Pick up spec directories without state files
  try {
    for await (const entry of runtime.fs.readDir(specsDir)) {
      if (entry.isDirectory && !knownNames.has(entry.name)) {
        allSpecs.push({
          name: entry.name,
          phase: "IDLE",
          iteration: 0,
        });
      }
    }
  } catch {
    // No specs directory
  }

  if (fmt === "json") {
    await formatter.writeFormatted(allSpecs, "json");

    return results.ok(undefined);
  }

  // ANSI output
  const out = streams.output({
    renderer: streams.renderers.ansi(),
    sink: streams.sinks.stdout(),
  });

  out.writeln(span.bold("Specs"));
  out.writeln("");

  if (allSpecs.length === 0) {
    out.writeln(span.dim("  No specs yet."));
  } else {
    for (const spec of allSpecs) {
      const phaseStr = spec.phase === "COMPLETED"
        ? span.green(spec.phase)
        : spec.phase === "EXECUTING"
        ? span.cyan(spec.phase)
        : spec.phase === "BLOCKED"
        ? span.red(spec.phase)
        : span.yellow(spec.phase);

      const iterStr = spec.phase === "EXECUTING"
        ? span.dim(` iteration ${spec.iteration}`)
        : "";

      out.writeln("  ", span.dim("○"), " ", spec.name, "  ", phaseStr, iterStr);
    }
  }

  await out.close();

  return results.ok(undefined);
};

// =============================================================================
// spec split
// =============================================================================

type IntoEntry = {
  readonly name: string;
  readonly description: string;
};

/**
 * Parse --into flags from args.
 * Format: --into name1 "desc1" --into name2 "desc2"
 */
const parseIntoFlags = (
  args: readonly string[],
): readonly IntoEntry[] => {
  const entries: IntoEntry[] = [];
  let i = 0;

  while (i < args.length) {
    if (args[i] === "--into" && i + 1 < args.length) {
      const name = args[i + 1]!;
      // Next non-flag arg is the description (optional)
      let description = name;
      if (i + 2 < args.length && !args[i + 2]!.startsWith("-")) {
        description = args[i + 2]!;
        i += 3;
      } else {
        i += 2;
      }
      entries.push({ name, description });
    } else {
      i += 1;
    }
  }

  return entries;
};

const specSplit = async (
  args?: readonly string[],
): Promise<shellArgs.CliResult<void>> => {
  const out = streams.output({
    renderer: streams.renderers.ansi(),
    sink: streams.sinks.stdout(),
  });

  const root = runtime.process.cwd();

  if (!(await persistence.isInitialized(root))) {
    out.writeln(
      span.red("noskills is not initialized."),
      " Run: ",
      span.bold(cmd("init")),
    );
    await out.close();

    return results.fail({ exitCode: 1 });
  }

  // Parse --spec flag
  const specFlag = persistence.parseSpecFlag(args ?? []);
  if (specFlag === null) {
    out.writeln(
      span.red("Error: --spec=<name> is required."),
    );
    out.writeln(
      span.dim("Example: "),
      span.bold(
        `${cmdPrefix()} spec split --spec=parent --into name1 "desc1" --into name2 "desc2"`,
      ),
    );
    await out.close();

    return results.fail({ exitCode: 1 });
  }

  // Load parent state
  let parentState: schema.StateFile;
  try {
    parentState = await persistence.resolveState(root, specFlag);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    out.writeln(span.red(`Error: ${msg}`));
    await out.close();

    return results.fail({ exitCode: 1 });
  }

  // Validate parent is in DISCOVERY or DISCOVERY_REVIEW
  if (
    parentState.phase !== "DISCOVERY" &&
    parentState.phase !== "DISCOVERY_REVIEW"
  ) {
    out.writeln(
      span.red(
        `Cannot split spec in phase ${parentState.phase}. Must be in DISCOVERY or DISCOVERY_REVIEW.`,
      ),
    );
    await out.close();

    return results.fail({ exitCode: 1 });
  }

  // Parse --into flags
  const intoEntries = parseIntoFlags(args ?? []);

  if (intoEntries.length < 2) {
    // If no --into flags, try auto-detect from split detector
    const proposal = splitDetector.analyzeForSplit(
      parentState.discovery.answers,
    );

    if (!proposal.detected || proposal.proposals.length < 2) {
      out.writeln(
        span.red(
          "Error: at least 2 --into entries required, or discovery answers must contain 2+ independent areas.",
        ),
      );
      await out.close();

      return results.fail({ exitCode: 1 });
    }

    // Use auto-detected proposals
    const childNames: string[] = [];

    for (const item of proposal.proposals) {
      const specDir = `${root}/${persistence.paths.specDir(item.name)}`;
      await runtime.fs.mkdir(specDir, { recursive: true });

      const relevantAnswers = parentState.discovery.answers.filter(
        (a) => item.relevantAnswers.includes(a.questionId),
      );

      const childState = machine.startSpec(
        schema.createInitialState(),
        item.name,
        `spec/${item.name}`,
      );

      let filledState = childState;
      for (const a of relevantAnswers) {
        filledState = machine.addDiscoveryAnswer(
          filledState,
          a.questionId,
          a.answer,
        );
      }

      filledState = machine.completeDiscovery(filledState);
      await persistence.writeSpecState(root, item.name, filledState);
      childNames.push(item.name);
    }

    // Cancel parent
    const parentCompleted = machine.completeSpec(
      parentState,
      "cancelled",
      `Split into: ${childNames.join(", ")}`,
    );
    await persistence.writeSpecState(root, specFlag, parentCompleted);

    out.writeln(
      span.green("Split complete."),
      ` Created ${childNames.length} sub-specs:`,
    );
    for (const name of childNames) {
      out.writeln("  ", span.dim("○"), " ", span.bold(name));
    }
    out.writeln(
      "",
      span.dim(`Parent spec "${specFlag}" cancelled.`),
    );
    await out.close();

    return results.ok(undefined);
  }

  // Manual split: use --into entries
  const childNames: string[] = [];

  for (const entry of intoEntries) {
    const specDir = `${root}/${persistence.paths.specDir(entry.name)}`;
    await runtime.fs.mkdir(specDir, { recursive: true });

    const childState = machine.startSpec(
      schema.createInitialState(),
      entry.name,
      `spec/${entry.name}`,
    );

    // Copy all parent discovery answers to each child
    let filledState = childState;
    for (const a of parentState.discovery.answers) {
      filledState = machine.addDiscoveryAnswer(
        filledState,
        a.questionId,
        a.answer,
      );
    }

    filledState = machine.completeDiscovery(filledState);
    await persistence.writeSpecState(root, entry.name, filledState);
    childNames.push(entry.name);
  }

  // Cancel parent
  const parentCompleted = machine.completeSpec(
    parentState,
    "cancelled",
    `Split into: ${childNames.join(", ")}`,
  );
  await persistence.writeSpecState(root, specFlag, parentCompleted);

  out.writeln(
    span.green("Split complete."),
    ` Created ${childNames.length} sub-specs:`,
  );
  for (const name of childNames) {
    out.writeln("  ", span.dim("○"), " ", span.bold(name));
  }
  out.writeln(
    "",
    span.dim(`Parent spec "${specFlag}" cancelled.`),
  );
  await out.close();

  return results.ok(undefined);
};

// =============================================================================
// spec revisit
// =============================================================================

const specRevisit = async (
  args?: readonly string[],
): Promise<shellArgs.CliResult<void>> => {
  const out = streams.output({
    renderer: streams.renderers.ansi(),
    sink: streams.sinks.stdout(),
  });

  const root = runtime.process.cwd();

  if (!(await persistence.isInitialized(root))) {
    out.writeln(
      span.red("noskills is not initialized."),
      " Run: ",
      span.bold(cmd("init")),
    );
    await out.close();

    return results.fail({ exitCode: 1 });
  }

  const specFlag = persistence.parseSpecFlag(args ?? []);
  if (specFlag === null) {
    out.writeln(span.red("Error: --spec=<name> is required."));
    out.writeln(
      span.dim("Example: "),
      span.bold(
        `${cmdPrefix()} spec revisit --spec=my-spec "reason for revisit"`,
      ),
    );
    await out.close();

    return results.fail({ exitCode: 1 });
  }

  // Parse reason — positional arg that isn't a flag
  const reason = (args ?? []).find((a) =>
    !a.startsWith("--") && a !== specFlag
  );
  if (reason === undefined || reason.trim().length === 0) {
    out.writeln(
      span.red(
        'Error: Reason is required: noskills spec revisit --spec=X "reason"',
      ),
    );
    await out.close();

    return results.fail({ exitCode: 1 });
  }

  let specState: schema.StateFile;
  try {
    specState = await persistence.resolveState(root, specFlag);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    out.writeln(span.red(`Error: ${msg}`));
    await out.close();

    return results.fail({ exitCode: 1 });
  }

  // Phase validation
  if (
    specState.phase === "DISCOVERY" || specState.phase === "DISCOVERY_REVIEW" ||
    specState.phase === "SPEC_DRAFT" || specState.phase === "SPEC_APPROVED"
  ) {
    out.writeln(
      span.red("Already in planning phase, no need to revisit."),
    );
    await out.close();

    return results.fail({ exitCode: 1 });
  }

  if (specState.phase === "COMPLETED") {
    out.writeln(
      span.red(
        `Spec is completed. Use \`${cmdPrefix()} reopen --spec=${specFlag}\` instead.`,
      ),
    );
    await out.close();

    return results.fail({ exitCode: 1 });
  }

  if (specState.phase === "IDLE" || specState.phase === "FREE") {
    out.writeln(span.red("No active spec to revisit."));
    await out.close();

    return results.fail({ exitCode: 1 });
  }

  const completedCount = specState.execution.completedTasks.length;
  const newState = machine.revisitSpec(specState, reason.trim());
  await persistence.writeSpecState(root, specFlag, newState);

  out.writeln(span.green("Revisit complete."));
  out.writeln(
    "  Phase: ",
    span.bold("DISCOVERY"),
    span.dim(` (revisited from ${specState.phase})`),
  );
  if (completedCount > 0) {
    out.writeln(
      "  Previous progress: ",
      span.bold(`${completedCount} tasks completed`),
    );
  }
  out.writeln("  Reason: ", span.dim(`"${reason.trim()}"`));
  out.writeln("  Discovery answers preserved — revise or re-approve.");
  await out.close();

  return results.ok(undefined);
};

// =============================================================================
// spec <name> ac
// =============================================================================

const specAC = async (
  specName?: string,
  args?: readonly string[],
): Promise<shellArgs.CliResult<void>> => {
  const out = streams.output({
    renderer: streams.renderers.ansi(),
    sink: streams.sinks.stdout(),
  });
  const root = runtime.process.cwd();
  const action = args?.[0];

  if (specName === undefined || action === undefined) {
    out.writeln(
      `Usage: ${cmdPrefix()} spec <name> ac <add "text" | list>`,
    );
    await out.close();
    return results.ok(undefined);
  }

  if (action === "add") {
    const text = (args?.slice(1) ?? [])
      .filter((a) => !a.startsWith("-"))
      .join(" ");
    if (text.length === 0) {
      out.writeln(span.red("Please provide AC text."));
      await out.close();
      return results.fail({ exitCode: 1 });
    }

    const state = await persistence.resolveState(root, specName);
    const user = await identity.resolveUser(root);

    // Warn if adding during EXECUTING
    if (state.phase === "EXECUTING") {
      out.writeln(
        span.yellow("Warning: Adding ACs during execution is scope creep."),
      );
    }

    const newState = machine.addCustomAC(state, text, user);
    await persistence.writeSpecState(root, specName, newState);

    out.writeln(
      span.green("AC added: "),
      `"${text}"`,
      span.dim(` (by ${identity.shortUser(user)})`),
    );
    await out.close();
    return results.ok(undefined);
  }

  if (action === "list") {
    const state = await persistence.resolveState(root, specName);
    const acs = state.customACs ?? [];

    out.writeln(span.bold(`Custom ACs for ${specName}`));
    out.writeln("");
    if (acs.length === 0) {
      out.writeln(span.dim("  No custom ACs."));
    } else {
      for (const ac of acs) {
        out.writeln(
          `  - ${ac.text}`,
          span.dim(` -- ${ac.user}, ${ac.addedInPhase}`),
        );
      }
    }
    await out.close();
    return results.ok(undefined);
  }

  out.writeln(
    `Usage: ${cmdPrefix()} spec <name> ac <add "text" | list>`,
  );
  await out.close();
  return results.ok(undefined);
};

// =============================================================================
// spec <name> task
// =============================================================================

const specTask = async (
  specName?: string,
  args?: readonly string[],
): Promise<shellArgs.CliResult<void>> => {
  const out = streams.output({
    renderer: streams.renderers.ansi(),
    sink: streams.sinks.stdout(),
  });
  const root = runtime.process.cwd();
  const action = args?.[0];

  if (specName === undefined || action === undefined) {
    out.writeln(
      `Usage: ${cmdPrefix()} spec <name> task <add "text" | list>`,
    );
    await out.close();
    return results.ok(undefined);
  }

  if (action === "add") {
    const text = (args?.slice(1) ?? [])
      .filter((a) => !a.startsWith("-"))
      .join(" ");
    if (text.length === 0) {
      out.writeln(span.red("Please provide task text."));
      await out.close();
      return results.fail({ exitCode: 1 });
    }

    const state = await persistence.resolveState(root, specName);

    if (state.phase === "EXECUTING" || state.phase === "BLOCKED") {
      out.writeln(
        span.red(
          "Cannot add tasks during execution. Use `spec revisit` to go back to discovery.",
        ),
      );
      await out.close();
      return results.fail({ exitCode: 1 });
    }

    // Task addition reuses the note mechanism with a convention prefix
    const user = await identity.resolveUser(root);
    const newState = machine.addSpecNote(state, `[TASK] ${text}`, user);
    await persistence.writeSpecState(root, specName, newState);

    out.writeln(
      span.green("Task added: "),
      `"${text}"`,
      span.dim(` (by ${identity.shortUser(user)})`),
    );
    await out.close();
    return results.ok(undefined);
  }

  if (action === "list") {
    const state = await persistence.resolveState(root, specName);
    const notes = (state.specNotes ?? []).filter((n) =>
      n.text.startsWith("[TASK] ")
    );

    out.writeln(span.bold(`Custom tasks for ${specName}`));
    out.writeln("");
    if (notes.length === 0) {
      out.writeln(span.dim("  No custom tasks."));
    } else {
      for (const n of notes) {
        out.writeln(
          `  - ${n.text.replace("[TASK] ", "")}`,
          span.dim(` -- ${n.user}, ${n.phase}`),
        );
      }
    }
    await out.close();
    return results.ok(undefined);
  }

  out.writeln(
    `Usage: ${cmdPrefix()} spec <name> task <add "text" | list>`,
  );
  await out.close();
  return results.ok(undefined);
};

// =============================================================================
// spec <name> note
// =============================================================================

const specNote = async (
  specName?: string,
  args?: readonly string[],
): Promise<shellArgs.CliResult<void>> => {
  const out = streams.output({
    renderer: streams.renderers.ansi(),
    sink: streams.sinks.stdout(),
  });
  const root = runtime.process.cwd();
  const action = args?.[0];

  if (specName === undefined || action === undefined) {
    out.writeln(
      `Usage: ${cmdPrefix()} spec <name> note <add "text" | list>`,
    );
    await out.close();
    return results.ok(undefined);
  }

  if (action === "add") {
    const text = (args?.slice(1) ?? [])
      .filter((a) => !a.startsWith("-"))
      .join(" ");
    if (text.length === 0) {
      out.writeln(span.red("Please provide note text."));
      await out.close();
      return results.fail({ exitCode: 1 });
    }

    const state = await persistence.resolveState(root, specName);
    const user = await identity.resolveUser(root);
    const newState = machine.addSpecNote(state, text, user);
    await persistence.writeSpecState(root, specName, newState);

    out.writeln(
      span.green("Note added: "),
      `"${text}"`,
      span.dim(` (by ${identity.shortUser(user)})`),
    );
    await out.close();
    return results.ok(undefined);
  }

  if (action === "list") {
    const state = await persistence.resolveState(root, specName);
    const notes = (state.specNotes ?? []).filter((n) =>
      !n.text.startsWith("[TASK] ")
    );

    out.writeln(span.bold(`Notes for ${specName}`));
    out.writeln("");
    if (notes.length === 0) {
      out.writeln(span.dim("  No notes."));
    } else {
      for (const n of notes) {
        out.writeln(
          `  - ${n.text}`,
          span.dim(` -- ${n.user}, ${n.phase}`),
        );
      }
    }
    await out.close();
    return results.ok(undefined);
  }

  out.writeln(
    `Usage: ${cmdPrefix()} spec <name> note <add "text" | list>`,
  );
  await out.close();
  return results.ok(undefined);
};
