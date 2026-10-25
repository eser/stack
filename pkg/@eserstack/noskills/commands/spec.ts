// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * `noskills spec` — Manage specs (new, list, split).
 *
 * @module
 */

import * as results from "@eserstack/primitives/results";
import * as streams from "@eserstack/streams";
import * as span from "@eserstack/streams/span";
import type * as shellArgs from "@eserstack/shell/args";
import * as persistence from "../state/persistence.ts";
import * as schema from "../state/schema.ts";
import * as machine from "../state/machine.ts";
import * as split from "../state/split.ts";
import * as splitDetector from "../context/split-detector.ts";
import * as identity from "../state/identity.ts";
import * as dashboardEvents from "../dashboard/events.ts";
import * as livingSpec from "../spec/living.ts";
import * as cmd from "../output/cmd.ts";
import { runtime } from "@eserstack/standards/cross-runtime";

// Agent-facing contract for interactive spec creation (no description provided)
export type SpecNewInteractiveResponse = {
  readonly phase: "IDLE";
  readonly action: "spec-new-interactive";
  readonly instruction: string;
  readonly prompt: string;
};

// Reserved names that cannot be used as spec names
export const RESERVED_NAMES: ReadonlySet<string> = new Set([
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
  "section",
  "review",
  "delegate",
  "followup",
  "plan-export",
  "ledger",
]);

// Lowercase letters, digits and inner hyphens: the spec name is a directory
// under .eser/specs/ and part of the `spec/<name>` branch.
const SPEC_NAME_PATTERN = /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/;
const SPEC_NAME_MAX_LENGTH = 50;

/**
 * True if `name` can name a spec: lowercase letters, digits and inner hyphens,
 * at most 50 characters, and not a reserved subcommand name.
 */
export const isValidSpecName = (name: string): boolean =>
  name.length <= SPEC_NAME_MAX_LENGTH && SPEC_NAME_PATTERN.test(name) &&
  !RESERVED_NAMES.has(name);

// Stop words to strip when generating slugs from descriptions
const SLUG_STOP_WORDS = new Set([
  "a",
  "an",
  "the",
  "and",
  "or",
  "but",
  "in",
  "on",
  "at",
  "to",
  "for",
  "of",
  "with",
  "by",
  "from",
  "is",
  "it",
  "its",
  "this",
  "that",
  "as",
  "be",
  "are",
  "was",
  "were",
  "been",
  "being",
  "have",
  "has",
  "had",
  "do",
  "does",
  "did",
  "will",
  "would",
  "could",
  "should",
  "may",
  "might",
  "shall",
  "can",
  "i",
  "we",
  "you",
  "they",
  "our",
  "my",
  "so",
  "if",
  "not",
  "no",
  "all",
]);

/**
 * Generate a slug from a description string.
 * Picks first 5–6 significant words, kebab-cases them, max 50 chars.
 */
/** Strip filesystem paths from description before slug generation. */
const stripPaths = (text: string): string =>
  text
    // Absolute, home, relative paths: /foo/bar, ~/foo/bar, ./foo, ../foo
    .replace(/(?:~|\.{1,2})?\/(?:[\w@.-]+\/)*[\w@.-]+/g, " ")
    // Remaining slash-heavy tokens (e.g. projects/playground/something)
    .replace(/(?:[\w@.-]+\/){2,}[\w@.-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();

export const slugFromDescription = (description: string): string => {
  const cleaned = stripPaths(description);
  const words = cleaned
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")
    .split(/\s+/)
    .filter((w) => w.length > 0 && !SLUG_STOP_WORDS.has(w));

  const significant = words.slice(0, 6);
  let slug = significant.join("-");

  // Truncate to 50 chars at a word boundary
  if (slug.length > 50) {
    slug = slug.slice(0, 50).replace(/-[^-]*$/, "");
  }

  // Ensure slug starts and ends with alphanumeric
  slug = slug.replace(/^-+|-+$/g, "");

  return slug === "" ? "spec" : slug;
};

/** Check if a string looks like a description rather than a slug name. */
export const looksLikeDescription = (value: string): boolean => {
  return value.includes(" ") || value.length > 50;
};

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
  ["review", () => import("./review.ts")],
  ["delegate", () => import("./delegate.ts")],
  ["followup", () => import("./followup.ts")],
  ["learn", () => import("./learn.ts")],
  ["plan-export", () => import("./plan-export.ts")],
  ["ledger", () => import("./ledger.ts")],
]);

export const main = async (
  args?: readonly string[],
): Promise<shellArgs.CliResult<void>> => {
  try {
    return await dispatch(args);
  } catch (error) {
    // `spec <name> ...` on a spec that does not exist: every subcommand that
    // reads the spec's state throws this, and it reached the user as an
    // uncaught stack trace.
    if (!(error instanceof persistence.SpecNotFoundError)) throw error;

    const out = streams.output({
      renderer: streams.renderers.ansi(),
      sink: streams.sinks.stdout(),
    });
    out.writeln(span.red(error.message));
    await out.close();

    return results.fail({ exitCode: 1 });
  }
};

const dispatch = async (
  args?: readonly string[],
): Promise<shellArgs.CliResult<void>> => {
  // The subcommands below build their command strings with this prefix.
  const { root } = await persistence.resolveProjectRoot();
  await cmd.loadCommandPrefix(root);

  const arg1 = args?.[0];

  // noskills spec new <name> "description"
  if (arg1 === "new") {
    return await specNew(args?.slice(1));
  }

  // noskills spec list
  if (arg1 === "list") {
    return await specList(args?.slice(1));
  }

  // noskills spec help (also --help and -h, which would otherwise be taken
  // for a spec name)
  if (
    arg1 === "help" || arg1 === "--help" || arg1 === "-h" || arg1 === undefined
  ) {
    const prefix = cmd.cmdPrefix();
    const out = streams.output({
      renderer: streams.renderers.ansi(),
      sink: streams.sinks.stdout(),
    });
    out.writeln(
      `Usage: ${prefix} spec <new "description" | list | <name> <command>>`,
    );
    out.writeln("");
    out.writeln(span.dim("  Commands for a spec:"));
    out.writeln(
      span.dim(
        "    next, approve, done, block, reset, cancel, wontfix, reopen, revisit, split, ac, task, note, section, ledger",
      ),
    );
    out.writeln("");
    out.writeln(span.dim("  Examples:"));
    out.writeln(
      span.dim(
        `    ${prefix} spec new "Add photo upload support"            # name auto-generated`,
      ),
    );
    out.writeln(
      span.dim(
        `    ${prefix} spec new my-feature "Add upload support"       # explicit name`,
      ),
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
  if (subcommand === "section") {
    return await specSection(specName, args?.slice(2) ?? []);
  }

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
      `  Valid: next, approve, done, block, reset, cancel, wontfix, reopen, revisit, split, ac, task, note, section, ledger`,
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

  const { root } = await persistence.resolveProjectRoot();

  if (!(await persistence.isInitialized(root))) {
    out.writeln(
      span.red("noskills is not initialized."),
      " Run: ",
      span.bold(cmd.cmd("init")),
    );
    await out.close();

    return results.fail({ exitCode: 1 });
  }

  // Positional: spec new <name> "description"
  //          or: spec new "description" (name auto-generated)
  // Also supports old --name= format for backward compat
  let specName: string | null = null;
  const descWords: string[] = [];

  if (args !== undefined) {
    let nameConsumed = false;
    const positionals: string[] = [];
    for (const arg of args) {
      if (arg.startsWith("--name=")) {
        specName = arg.slice("--name=".length);
        nameConsumed = true;
      } else if (!arg.startsWith("-")) {
        positionals.push(arg);
      }
    }

    // If --name was provided, rest of positionals are description
    if (nameConsumed) {
      descWords.push(...positionals);
    } else if (positionals.length >= 1) {
      const first = positionals[0]!;
      if (looksLikeDescription(first)) {
        // First arg is a description — auto-generate slug
        descWords.push(...positionals);
      } else {
        // First arg is a slug name, rest are description
        specName = first;
        descWords.push(...positionals.slice(1));
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

  // If no name provided but description exists, auto-generate slug
  if ((specName === null || specName.length === 0) && description.length > 0) {
    specName = slugFromDescription(description);

    // Deduplicate: if slug conflicts with existing spec, append -2, -3, etc.
    let candidate = specName;
    let suffix = 2;
    while (true) {
      if (RESERVED_NAMES.has(candidate)) {
        candidate = `${specName}-${suffix}`;
        suffix++;
        continue;
      }
      const candidateDir = `${root}/${persistence.paths.specDir(candidate)}`;
      try {
        // Suffixes are probed in order and the first free one wins.
        // deno-lint-ignore no-await-in-loop
        await runtime.fs.stat(candidateDir);
        // Exists — try next suffix
        candidate = `${specName}-${suffix}`;
        suffix++;
      } catch {
        // Doesn't exist — use this name
        break;
      }
    }
    specName = candidate;
  }

  if (specName === null || specName.length === 0) {
    const response: SpecNewInteractiveResponse = {
      phase: "IDLE",
      action: "spec-new-interactive",
      instruction:
        "Ask the user what they want to build. Accept any input — one sentence, detailed requirements, meeting notes, a Linear task. Then call spec new again with their description.",
      prompt: "What do you want to build?",
    };
    // Must close the ANSI stream before writeFormatted — both write to stdout,
    // and the ANSI renderer may flush escape codes after JSON starts without this.
    await out.close();
    await formatter.writeFormatted(response, "json");
    return results.ok(undefined);
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

  if (!isValidSpecName(specName)) {
    out.writeln(
      span.red("Invalid spec name: "),
      span.bold(specName),
    );
    out.writeln(
      span.dim(
        `Must be lowercase, hyphens, numbers only. Max ${SPEC_NAME_MAX_LENGTH} chars. Regex: ${SPEC_NAME_PATTERN}`,
      ),
    );
    await out.close();

    return results.fail({ exitCode: 1 });
  }

  if (description.length === 0) {
    out.writeln(
      span.red("Please provide a description: "),
      span.bold(
        `${cmd.cmdPrefix()} spec new "Add photo upload support"`,
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
        ` Use a different --name or run \`${cmd.cmdPrefix()} reset --spec=${specName}\` first.`,
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
      ...withTransition,
      discovery: {
        ...withTransition.discovery,
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
  // Materialize spec.md immediately (Living Spec feature)
  const allConcerns = await persistence.listConcerns(root);
  const config = await persistence.readManifest(root);
  const activeConcerns = allConcerns.filter((c) =>
    config?.concerns.includes(c.id) ?? false
  );
  const now = new Date();
  const creator = { name: user?.name ?? "unknown", email: user?.email ?? "" };
  const initial = livingSpec.generateInitialSpec({
    specName,
    activeConcerns,
    classification: null,
    creator,
    now,
  });
  const specFilePath = `${root}/${persistence.paths.specFile(specName)}`;
  await runtime.fs.writeTextFile(specFilePath, initial.content);

  // Update state to include spec.md path + initial placeholders + metadata
  const stateWithSpec = {
    ...stateToSave,
    specState: {
      path: persistence.paths.specFile(specName),
      status: "draft" as const,
      metadata: initial.metadata,
      placeholders: initial.placeholders,
    },
  };
  await persistence.writeSpecState(root, specName, stateWithSpec);

  // Log event
  await dashboardEvents.appendEvent(root, {
    ts: new Date().toISOString(),
    type: "spec-created",
    spec: specName,
    user: user?.name ?? "unknown",
    description: description ?? "",
  });

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
    span.bold(cmd.cmd(`spec ${specName} next`)),
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
  const { root } = await persistence.resolveProjectRoot();
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

  const { root } = await persistence.resolveProjectRoot();

  if (!(await persistence.isInitialized(root))) {
    out.writeln(
      span.red("noskills is not initialized."),
      " Run: ",
      span.bold(cmd.cmd("init")),
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
        `${cmd.cmdPrefix()} spec parent split --into name1 "desc1" --into name2 "desc2"`,
      ),
    );
    await out.close();

    return results.fail({ exitCode: 1 });
  }

  // Load parent state
  let parentState: schema.StateFile;
  try {
    parentState = await persistence.resolveState(
      root,
      specFlag,
      cmd.cmdPrefix(),
    );
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    out.writeln(span.red(`Error: ${msg}`));
    await out.close();

    return results.fail({ exitCode: 1 });
  }

  // Validate parent is in DISCOVERY or DISCOVERY_REFINEMENT
  if (
    parentState.phase !== "DISCOVERY" &&
    parentState.phase !== "DISCOVERY_REFINEMENT"
  ) {
    out.writeln(
      span.red(
        `Cannot split spec in phase ${parentState.phase}. Must be in DISCOVERY or DISCOVERY_REFINEMENT.`,
      ),
    );
    await out.close();

    return results.fail({ exitCode: 1 });
  }

  // Parse --into flags
  const intoEntries = parseIntoFlags(args ?? []);
  let children: split.ChildSpec[];

  if (intoEntries.length >= 2) {
    // Manual split: every child gets all of the parent's answers.
    const invalidNames = intoEntries
      .map((entry) => entry.name)
      .filter((name) => !isValidSpecName(name));
    if (invalidNames.length > 0) {
      out.writeln(
        span.red("Invalid child spec name: "),
        span.bold(invalidNames.join(", ")),
      );
      out.writeln(
        span.dim(
          `Use lowercase letters, numbers and hyphens, at most ${SPEC_NAME_MAX_LENGTH} chars, and not a subcommand name.`,
        ),
      );
      await out.close();

      return results.fail({ exitCode: 1 });
    }

    children = intoEntries.map((entry) => ({
      name: entry.name,
      description: entry.description === "" ? null : entry.description,
      answers: parentState.discovery.answers,
    }));
  } else {
    // No --into flags: use the areas the split detector finds, each with the
    // answers it came from.
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

    children = proposal.proposals.map((item) => ({
      name: item.name,
      description: item.description,
      answers: parentState.discovery.answers.filter((a) =>
        item.relevantAnswers.includes(a.questionId)
      ),
    }));
  }

  let parentCompleted: schema.StateFile;
  try {
    parentCompleted = await split.splitSpec(
      root,
      parentState,
      children,
      cmd.cmdPrefix(),
    );
  } catch (err: unknown) {
    if (!(err instanceof split.SplitRefusedError)) {
      await out.close();
      throw err;
    }
    out.writeln(span.red(`Error: ${err.message}`));
    await out.close();

    return results.fail({ exitCode: 1 });
  }
  await persistence.writeSpecState(root, specFlag, parentCompleted);

  out.writeln(
    span.green("Split complete."),
    ` Created ${children.length} sub-specs:`,
  );
  for (const child of children) {
    out.writeln("  ", span.dim("○"), " ", span.bold(child.name));
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

  const { root } = await persistence.resolveProjectRoot();

  if (!(await persistence.isInitialized(root))) {
    out.writeln(
      span.red("noskills is not initialized."),
      " Run: ",
      span.bold(cmd.cmd("init")),
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
        `${cmd.cmdPrefix()} spec my-spec revisit "reason for revisit"`,
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
        `Error: Reason is required: ${
          cmd.cmd(`spec ${specFlag} revisit "reason"`)
        }`,
      ),
    );
    await out.close();

    return results.fail({ exitCode: 1 });
  }

  let specState: schema.StateFile;
  try {
    specState = await persistence.resolveState(root, specFlag, cmd.cmdPrefix());
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    out.writeln(span.red(`Error: ${msg}`));
    await out.close();

    return results.fail({ exitCode: 1 });
  }

  // Phase validation
  if (
    specState.phase === "DISCOVERY" ||
    specState.phase === "DISCOVERY_REFINEMENT" ||
    specState.phase === "SPEC_PROPOSAL" || specState.phase === "SPEC_APPROVED"
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
        `Spec is completed. Use \`${cmd.cmdPrefix()} reopen --spec=${specFlag}\` instead.`,
      ),
    );
    await out.close();

    return results.fail({ exitCode: 1 });
  }

  if (specState.phase === "IDLE") {
    out.writeln(span.red("No active spec to revisit."));
    await out.close();

    return results.fail({ exitCode: 1 });
  }

  const completedCount = specState.execution.completedTasks.length;
  const newState = machine.revisitSpec(specState, reason.trim());
  // state.json moves with the spec it names, as every other transition does;
  // a state.json on another spec stays.
  if ((await persistence.readState(root)).spec === specFlag) {
    await persistence.writeStateAndSpec(root, newState);
  } else {
    await persistence.writeSpecState(root, specFlag, newState);
  }

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
  const { root } = await persistence.resolveProjectRoot();
  const action = args?.[0];

  if (specName === undefined || action === undefined) {
    out.writeln(
      `Usage: ${cmd.cmdPrefix()} spec <name> ac <add "text" | list>`,
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

    const state = await persistence.resolveState(
      root,
      specName,
      cmd.cmdPrefix(),
    );
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
    const state = await persistence.resolveState(
      root,
      specName,
      cmd.cmdPrefix(),
    );
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
    `Usage: ${cmd.cmdPrefix()} spec <name> ac <add "text" | list>`,
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
  const { root } = await persistence.resolveProjectRoot();
  const action = args?.[0];

  if (specName === undefined || action === undefined) {
    out.writeln(
      `Usage: ${cmd.cmdPrefix()} spec <name> task <add "text" | list>`,
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

    const state = await persistence.resolveState(
      root,
      specName,
      cmd.cmdPrefix(),
    );

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
    const state = await persistence.resolveState(
      root,
      specName,
      cmd.cmdPrefix(),
    );
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
    `Usage: ${cmd.cmdPrefix()} spec <name> task <add "text" | list>`,
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
  const { root } = await persistence.resolveProjectRoot();
  const action = args?.[0];

  if (specName === undefined || action === undefined) {
    out.writeln(
      `Usage: ${cmd.cmdPrefix()} spec <name> note <add "text" | list>`,
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

    const state = await persistence.resolveState(
      root,
      specName,
      cmd.cmdPrefix(),
    );
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
    const state = await persistence.resolveState(
      root,
      specName,
      cmd.cmdPrefix(),
    );
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
    `Usage: ${cmd.cmdPrefix()} spec <name> note <add "text" | list>`,
  );
  await out.close();
  return results.ok(undefined);
};

// =============================================================================
// spec <name> section
// =============================================================================

/**
 * The phases in which the completeness gate reads the spec's sections: it
 * runs when DISCOVERY_REFINEMENT moves to SPEC_PROPOSAL, so a section
 * changed after that would reach no gate.
 */
const SECTION_PHASES: ReadonlySet<schema.Phase> = new Set([
  "DISCOVERY",
  "DISCOVERY_REFINEMENT",
]);

/**
 * `spec <name> section [list]`, `section <id> fill "text"` and
 * `section <id> na "reason"`: list the sections the completeness gate
 * checks, or resolve one with what the user said, in spec.md and in the
 * state.
 */
const specSection = async (
  specName: string,
  args: readonly string[],
): Promise<shellArgs.CliResult<void>> => {
  const out = streams.output({
    renderer: streams.renderers.ansi(),
    sink: streams.sinks.stdout(),
  });
  const { root } = await persistence.resolveProjectRoot();
  const state = await persistence.resolveState(
    root,
    specName,
    cmd.cmdPrefix(),
  );
  const sectionId = args[0];

  if (sectionId === undefined || sectionId === "list") {
    writeSectionList(out, specName, state.specState.placeholders);
    await out.close();

    return results.ok(undefined);
  }

  const result = await resolveSection(root, specName, state, args);
  for (const line of result.lines) out.writeln(...line);
  await out.close();

  return result.ok ? results.ok(undefined) : results.fail({ exitCode: 1 });
};

type OutputLine = readonly streams.SpanInput[];

const writeSectionList = (
  out: streams.Output,
  specName: string,
  placeholders: readonly schema.PlaceholderStatus[],
): void => {
  out.writeln(span.bold(`Sections of ${specName}`));
  out.writeln("");
  if (placeholders.length === 0) {
    out.writeln(span.dim("  No sections."));
  }
  for (const p of placeholders) {
    const note = p.status === "na" && p.naReason !== undefined
      ? ` (N/A: ${p.naReason})`
      : p.status === "conditional-hidden"
      ? " (hidden: condition not met)"
      : "";
    out.writeln(
      `  ${livingSpec.placeholderSymbol(p.status)} ${p.sectionId}`,
      span.dim(`  ${p.sectionTitle}${note}`),
    );
  }
  out.writeln("");
  out.writeln(
    span.dim(
      `Fill: ${cmd.cmd(`spec ${specName} section <id> fill "text"`)}`,
    ),
  );
  out.writeln(
    span.dim(`N/A:  ${cmd.cmd(`spec ${specName} section <id> na "reason"`)}`),
  );
};

/**
 * Fills a section or marks it N/A, after the checks: the action and its
 * text, the phase, a known and visible section that is still open, and an
 * N/A reason the gate accepts. Returns the lines to print.
 */
const resolveSection = async (
  root: string,
  specName: string,
  state: schema.StateFile,
  args: readonly string[],
): Promise<{ readonly ok: boolean; readonly lines: readonly OutputLine[] }> => {
  const refuse = (...lines: OutputLine[]) => ({ ok: false, lines });
  const sectionId = args[0]!;
  const action = args[1];

  if (action !== "fill" && action !== "na") {
    return refuse([
      `Usage: ${cmd.cmdPrefix()} spec ${specName} section <list | <id> fill "text" | <id> na "reason">`,
    ]);
  }

  const text = args.slice(2).join(" ").trim();
  if (text.length === 0) {
    return refuse([
      span.red(
        action === "fill"
          ? "Please provide the section text."
          : "Please provide the reason the section does not apply.",
      ),
    ]);
  }

  if (!SECTION_PHASES.has(state.phase)) {
    return refuse(
      [span.red(`Cannot change spec sections in phase ${state.phase}.`)],
      [
        span.dim(
          "The completeness gate checks them during DISCOVERY and DISCOVERY_REFINEMENT.",
        ),
      ],
    );
  }

  const placeholders = state.specState.placeholders;
  const placeholder = placeholders.find((p) => p.sectionId === sectionId);
  if (placeholder === undefined) {
    const valid = placeholders
      .filter((p) => p.status !== "conditional-hidden")
      .map((p) => p.sectionId);
    return refuse(
      [span.red(`Unknown section: ${sectionId}`)],
      [span.dim(`  Valid: ${valid.length > 0 ? valid.join(", ") : "none"}`)],
    );
  }

  if (placeholder.status === "conditional-hidden") {
    return refuse([
      span.red(
        `Section ${sectionId} is hidden: its condition is not met, so the gate does not check it.`,
      ),
    ]);
  }

  const before = livingSpec.checkSpecCompleteness(state.specState);
  if (!before.unresolvedSections.some((s) => s.sectionId === sectionId)) {
    return refuse([span.red(`Section ${sectionId} is already resolved.`)]);
  }

  const user = await identity.resolveUser(root);
  const now = new Date();
  let updated: readonly schema.PlaceholderStatus[];
  try {
    updated = action === "fill"
      ? livingSpec.markPlaceholderFilled(
        placeholders,
        sectionId,
        user.name,
        now,
      )
      : livingSpec.markPlaceholderNa(
        placeholders,
        sectionId,
        text,
        user.name,
        now,
      );
  } catch (err) {
    // markPlaceholderNa refuses a reason the gate would not accept.
    return refuse([span.red((err as Error).message)]);
  }

  const metadata = livingSpec.applyMetadataAction(
    state.specState.metadata,
    { type: "answer", user: user.name, section: sectionId },
    now,
  );
  const newState: schema.StateFile = {
    ...state,
    specState: { ...state.specState, placeholders: updated, metadata },
  };

  // The state is the record the gate reads; spec.md is its view, and a
  // spec.md without the section's marker stays as it is.
  let fileUpdated = state.specState.path !== null;
  if (state.specState.path !== null) {
    const fileArgs = {
      path: `${root}/${state.specState.path}`,
      sectionId,
      attribution: { user: user.name, date: now },
      metadata,
      visiblePlaceholders: updated,
    };
    try {
      if (action === "fill") {
        await livingSpec.applyAnswerToFile({
          ...fileArgs,
          body: text,
          classificationChanged: false,
        });
      } else {
        await livingSpec.applyNaToFile({ ...fileArgs, reason: text });
      }
    } catch {
      fileUpdated = false;
    }
  }

  // state.json moves with the spec it names; a state.json on another spec
  // stays.
  if ((await persistence.readState(root)).spec === specName) {
    await persistence.writeStateAndSpec(root, newState);
  } else {
    await persistence.writeSpecState(root, specName, newState);
  }

  const lines: OutputLine[] = [[
    span.green(
      action === "fill" ? "Section filled: " : "Section marked N/A: ",
    ),
    placeholder.sectionTitle,
    span.dim(` (by ${identity.shortUser(user)})`),
  ]];
  if (!fileUpdated) {
    lines.push([
      span.yellow(
        `spec.md has no placeholder for ${sectionId}; only the state records it.`,
      ),
    ]);
  }

  const after = livingSpec.checkSpecCompleteness(newState.specState);
  if (after.unresolvedSections.length > 0) {
    lines.push([
      span.dim(
        `Still open: ${
          after.unresolvedSections.map((s) => s.sectionId).join(", ")
        }`,
      ),
    ]);
  } else if (after.pendingDecisions.length > 0) {
    lines.push([
      span.dim(
        `All sections resolved. Pending decisions: ${after.pendingDecisions.length}.`,
      ),
    ]);
  } else {
    lines.push([span.dim("All sections resolved.")]);
  }

  return { ok: true, lines };
};
