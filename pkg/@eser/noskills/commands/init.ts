// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * `noskills init` — Initialize .eser/ in project with guided onboarding.
 *
 * @module
 */

import * as results from "@eser/primitives/results";
import type * as shellArgs from "@eser/shell/args";
import * as tui from "@eser/shell/tui";
import * as schema from "../state/schema.ts";
import * as persistence from "../state/persistence.ts";
import * as toolDetect from "../detect/tools.ts";
import * as codebaseDetect from "../detect/codebase.ts";
import * as concernDefs from "../context/concerns.ts";
import * as compiler from "../context/compiler.ts";
import * as syncEngine from "../sync/engine.ts";
import * as formatter from "../output/formatter.ts";
import { cmd } from "../output/cmd.ts";
import { detectMode, stripModeFlag } from "../output/mode.ts";
import { detectAgentTool } from "@eser/shell/env";
import { runtime } from "@eser/standards/cross-runtime";

export const main = async (
  args?: readonly string[],
): Promise<shellArgs.CliResult<void>> => {
  const root = runtime.process.cwd();
  const mode = detectMode(args);
  const ctx = tui.createTuiContext({
    target: mode === "agent" ? "non-interactive" : "interactive",
  });
  const cleanArgs = stripModeFlag(args);

  // Parse flags
  const parsedConcerns = parseListFlag(cleanArgs, "--concerns");
  const parsedTools = parseListFlag(cleanArgs, "--tools");
  const nonInteractive = cleanArgs.includes("--non-interactive") ||
    mode === "agent";

  // Check if already initialized
  if (await persistence.isInitialized(root)) {
    const existingConfig = await persistence.readManifest(root);
    tui.log.warn(ctx, "noskills is already initialized in this project.");
    tui.log.info(
      ctx,
      `Run \`${cmd("sync", existingConfig)}\` to regenerate tool files.`,
    );

    return results.ok(undefined);
  }

  tui.intro(ctx, "noskills init");

  // ── Step 1: Detect project traits ──
  const scanSpinner = tui.createSpinner(ctx, "Scanning project...");
  scanSpinner.start();
  const project = await codebaseDetect.detectProject(root);
  scanSpinner.succeed("Project scanned");

  for (const lang of project.languages) {
    tui.log.step(ctx, `  ${lang}`);
  }
  for (const fw of project.frameworks) {
    tui.log.step(ctx, `  ${fw}`);
  }
  for (const ci of project.ci) {
    tui.log.step(ctx, `  ${ci}`);
  }
  if (project.testRunner !== null) {
    tui.log.step(ctx, `  test runner: ${project.testRunner}`);
  }

  // ── Step 2: Detect coding tools ──
  const toolSpinner = tui.createSpinner(ctx, "Detecting coding tools...");
  toolSpinner.start();
  const detectedTools = await toolDetect.detectCodingTools(root);

  // Auto-inject the agent we're currently running inside
  const currentAgent = detectAgentTool();
  const guaranteed: schema.CodingToolId[] = currentAgent !== null &&
      !detectedTools.includes(currentAgent)
    ? [currentAgent]
    : [];
  const allDetected: schema.CodingToolId[] = [
    ...new Set([...guaranteed, ...detectedTools]),
  ];

  toolSpinner.succeed(`${allDetected.length} coding tool(s) detected`);

  for (const tool of allDetected) {
    const suffix = tool === currentAgent ? " (current)" : "";
    tui.log.step(ctx, `  ${tool}${suffix}`);
  }

  let codingTools: schema.CodingToolId[];

  if (parsedTools !== null) {
    // Explicit --tools flag — still guarantee current agent
    const valid: schema.CodingToolId[] = [
      "claude-code",
      "cursor",
      "kiro",
      "copilot",
      "windsurf",
    ];
    const parsed = parsedTools.filter((t): t is schema.CodingToolId =>
      valid.includes(t as schema.CodingToolId)
    );
    codingTools = [...new Set([...guaranteed, ...parsed])];
  } else if (nonInteractive) {
    codingTools = [...allDetected];
  } else {
    // Interactive: let user confirm/add tools (current agent non-deselectable)
    codingTools = await pickCodingTools(ctx, allDetected, currentAgent);
  }

  // ── Step 3: Detect AI providers ──
  const providerSpinner = tui.createSpinner(
    ctx,
    "Detecting AI providers...",
  );
  providerSpinner.start();
  const providers = await toolDetect.detectProviders();
  const availableProviders = providers.filter((p) => p.available).map((p) =>
    p.name
  );
  providerSpinner.succeed(`${availableProviders.length} provider(s) detected`);

  // ── Step 4: Concern picker ──
  const allConcerns = await concernDefs.loadDefaultConcerns();
  let selectedConcernIds: string[];

  if (parsedConcerns !== null) {
    // Non-interactive: use --concerns flag, sorted by canonical order
    const canonicalOrder = allConcerns.map((c) => c.id);
    selectedConcernIds = parsedConcerns
      .filter((id) => canonicalOrder.includes(id))
      .sort((a, b) => canonicalOrder.indexOf(a) - canonicalOrder.indexOf(b));
  } else if (nonInteractive) {
    selectedConcernIds = [];
  } else {
    // Interactive concern picker via tui.multiselect
    const options = allConcerns.map((c) => ({
      value: c.id,
      label: c.name,
      hint: c.description.slice(0, 60),
    }));

    const selected = await tui.multiselect(ctx, {
      message:
        "What kind of project is this? (space to toggle, enter to confirm)",
      options,
    });

    selectedConcernIds = tui.isCancel(selected)
      ? []
      : [...selected as string[]];
  }

  if (selectedConcernIds.length > 0) {
    tui.log.success(ctx, `Concerns: ${selectedConcernIds.join(", ")}`);
  } else {
    tui.log.info(
      ctx,
      "No concerns selected. Add later with `concern add <id>`.",
    );
  }

  // ── Step 5: Detect invocation command ──
  const detectedCommand = detectInvocation();

  // ── Step 6: Scaffold directories ──
  const initSpinner = tui.createSpinner(ctx, "Initializing...");
  initSpinner.start();

  await persistence.scaffoldEserDir(root);

  // Write only selected concerns to .eser/concerns/
  const selectedConcerns = allConcerns.filter((c) =>
    selectedConcernIds.includes(c.id)
  );
  for (const concern of selectedConcerns) {
    await persistence.writeConcern(root, concern);
  }

  // ── Step 7: Write config ──
  const config: schema.NosManifest = {
    ...schema.createInitialManifest(
      selectedConcernIds,
      codingTools,
      availableProviders,
      project,
    ),
    command: detectedCommand,
  };
  await persistence.writeManifest(root, config);

  // Write initial state
  const state = schema.createInitialState();
  await persistence.writeState(root, state);

  initSpinner.succeed("Scaffolded `.eser/`");

  // ── Step 8: Auto-sync ──
  if (codingTools.length > 0) {
    const syncSpinner = tui.createSpinner(ctx, "Syncing tool files...");
    syncSpinner.start();
    const synced = await syncEngine.syncAll(root, codingTools, config);
    syncSpinner.succeed(`Synced ${synced.length} tool(s)`);
  } else {
    tui.log.warn(
      ctx,
      "No tools selected. noskills will work in agentless CLI mode only.",
    );
    tui.log.info(ctx, "Add tools later with `noskills sync`.");
  }

  // ── Summary ──
  tui.log.success(
    ctx,
    `Done. ${codingTools.length} tool(s), ${availableProviders.length} provider(s), ${selectedConcernIds.length} concern(s).`,
  );
  tui.log.info(ctx, `Command prefix: ${detectedCommand}`);

  // In agent mode: output the IDLE instruction so the agent knows what to do next
  if (mode === "agent") {
    const allConcernDefs = await concernDefs.loadDefaultConcerns();
    const active = allConcernDefs.filter((c) =>
      selectedConcernIds.includes(c.id)
    );
    const rules = await syncEngine.loadRules(root);
    const output = compiler.compile(state, active, rules, config);
    await formatter.writeFormatted(output, "json");
  } else {
    tui.outro(ctx, `Start a spec with: ${cmd('spec new "..."', config)}`);
  }

  return results.ok(undefined);
};

// =============================================================================
// Helpers
// =============================================================================

const ALL_TOOLS: readonly {
  value: schema.CodingToolId;
  label: string;
}[] = [
  { value: "claude-code", label: "Claude Code" },
  { value: "cursor", label: "Cursor" },
  { value: "kiro", label: "Kiro" },
  { value: "copilot", label: "GitHub Copilot" },
  { value: "windsurf", label: "Windsurf" },
];

/** Interactive tool picker — pre-selects auto-detected tools, lets user add more. */
const pickCodingTools = async (
  ctx: tui.TuiContext,
  detected: readonly schema.CodingToolId[],
  currentAgent: schema.CodingToolId | null,
): Promise<schema.CodingToolId[]> => {
  const message = detected.length === 0
    ? "No coding tools detected. Which tools do you use? (space to toggle)"
    : "Any additional tools? (space to toggle, enter to skip)";

  const detectedSet = new Set(detected);

  const selected = await tui.multiselect(ctx, {
    message,
    options: ALL_TOOLS.map((t) => ({
      ...t,
      hint: t.value === currentAgent
        ? "you're running inside it"
        : detectedSet.has(t.value)
        ? "detected"
        : undefined,
      disabled: t.value === currentAgent,
    })),
    initialValues: [...detected],
    required: false,
  });

  if (tui.isCancel(selected)) {
    return [...detected];
  }

  // Ensure current agent is always included (disabled items aren't in selection)
  const result = [...selected as schema.CodingToolId[]];

  if (currentAgent !== null && !result.includes(currentAgent)) {
    result.unshift(currentAgent);
  }

  return result;
};

/** Parse comma-separated list from --flag=a,b,c */
const parseListFlag = (
  args: readonly string[] | undefined,
  flag: string,
): string[] | null => {
  if (args === undefined) return null;

  for (const arg of args) {
    if (arg.startsWith(`${flag}=`)) {
      return arg.slice(flag.length + 1).split(",").map((s) => s.trim()).filter(
        Boolean,
      );
    }
  }

  return null;
};

/** Detect how noskills was invoked from process args */
const detectInvocation = (): string => {
  try {
    const args = runtime.process.args;
    const joined = args.join(" ");

    if (joined.includes("jsr:@eser/noskills")) {
      return "deno run jsr:@eser/noskills";
    }
    if (joined.includes("noskills/main.ts")) {
      return "deno run --allow-all ./pkg/@eser/noskills/main.ts";
    }
    if (
      joined.includes("eser") && joined.includes("nos") &&
      !joined.includes("noskills")
    ) {
      return "eser nos";
    }
    if (joined.includes("eser") && joined.includes("noskills")) {
      return "eser noskills";
    }
  } catch {
    // args detection not available
  }

  return "npx eser noskills";
};
