// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * `noskills init` — Initialize and sync .eser/ in project. Idempotent.
 *
 * Creates directories, config, and tool files. Always safe to re-run.
 * Subsumes the old `sync` command — tool files are regenerated every time.
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
import { cmd, extractPrefix, setCommandPrefix } from "../output/cmd.ts";
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

  const alreadyInitialized = await persistence.isInitialized(root);

  tui.intro(ctx, "noskills init");

  // ── Step 1: Scaffold directories (idempotent) ──
  const scaffoldSpinner = tui.createSpinner(ctx, "Checking directories...");
  scaffoldSpinner.start();
  await persistence.scaffoldEserDir(root);
  scaffoldSpinner.succeed("Config: .eser/");

  // ── Step 2: Project detection ──
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

  tui.gap(ctx);

  // ── Step 3: Detect coding tools ──
  const toolSpinner = tui.createSpinner(ctx, "Detecting coding tools...");
  toolSpinner.start();
  const detectedTools = await toolDetect.detectCodingTools(root);

  const currentAgent = detectAgentTool();
  const guaranteed: schema.CodingToolId[] = currentAgent !== null &&
      !detectedTools.includes(currentAgent)
    ? [currentAgent]
    : [];
  const allDetected: schema.CodingToolId[] = [
    ...new Set([...guaranteed, ...detectedTools]),
  ];

  toolSpinner.succeed(`${allDetected.length} coding tool(s) detected`);

  let codingTools: schema.CodingToolId[];

  if (parsedTools !== null) {
    const valid: schema.CodingToolId[] = [
      "claude-code",
      "cursor",
      "kiro",
      "copilot",
      "windsurf",
      "opencode",
      "codex",
      "copilot-cli",
    ];
    const parsed = parsedTools.filter((t): t is schema.CodingToolId =>
      valid.includes(t as schema.CodingToolId)
    );
    codingTools = [...new Set([...guaranteed, ...parsed])];
  } else if (alreadyInitialized) {
    // Re-init: use tools from existing config
    const existingConfig = await persistence.readManifest(root);
    codingTools = existingConfig !== null
      ? [...existingConfig.tools]
      : [...allDetected];
  } else if (nonInteractive) {
    codingTools = [...allDetected];
  } else {
    tui.gap(ctx);
    codingTools = await pickCodingTools(ctx, allDetected, currentAgent);
  }

  tui.gap(ctx);

  // ── Step 4: Detect AI providers ──
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

  tui.gap(ctx);

  // ── Step 5: Concerns ──
  const allConcerns = await concernDefs.loadDefaultConcerns();
  let selectedConcernIds: string[];

  if (parsedConcerns !== null) {
    const canonicalOrder = allConcerns.map((c) => c.id);
    selectedConcernIds = parsedConcerns
      .filter((id) => canonicalOrder.includes(id))
      .sort((a, b) => canonicalOrder.indexOf(a) - canonicalOrder.indexOf(b));
  } else if (alreadyInitialized) {
    // Re-init: use concerns from existing config
    const existingConfig = await persistence.readManifest(root);
    selectedConcernIds = existingConfig !== null
      ? [...existingConfig.concerns]
      : [];
  } else if (nonInteractive) {
    selectedConcernIds = [];
  } else {
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
    tui.log.success(ctx, ` Concerns: ${selectedConcernIds.join(", ")}`);
  }

  tui.gap(ctx);

  // ── Step 6: Write concerns ──
  const selectedConcerns = allConcerns.filter((c) =>
    selectedConcernIds.includes(c.id)
  );
  for (const concern of selectedConcerns) {
    await persistence.writeConcern(root, concern);
  }

  // ── Step 7: Write config ──
  const commandPrefix = await extractPrefix();
  setCommandPrefix(commandPrefix);

  const config: schema.NosManifest = {
    ...schema.createInitialManifest(
      selectedConcernIds,
      codingTools,
      availableProviders,
      project,
    ),
    command: commandPrefix,
  };
  await persistence.writeManifest(root, config);

  // Write state only if not already initialized
  if (!alreadyInitialized) {
    const state = schema.createInitialState();
    await persistence.writeState(root, state);
  }

  // ── Step 8: Sync tool files (ALWAYS — this is the key idempotent step) ──
  if (codingTools.length > 0) {
    const syncSpinner = tui.createSpinner(ctx, "Syncing tool files...");
    syncSpinner.start();
    const synced = await syncEngine.syncAll(root, codingTools, config);
    syncSpinner.succeed(`Synced ${synced.length} tool(s)`);

    for (const id of synced) {
      tui.log.step(ctx, `  ${id}`);
    }
  }

  // ── Summary ──
  tui.outro(
    ctx,
    `Done. ${codingTools.length} tool(s), ${availableProviders.length} provider(s), ${selectedConcernIds.length} concern(s).`,
  );

  // In agent mode: output the IDLE instruction
  if (mode === "agent") {
    const state = await persistence.readState(root);
    const allConcernDefs = await concernDefs.loadDefaultConcerns();
    const active = allConcernDefs.filter((c) =>
      selectedConcernIds.includes(c.id)
    );
    const rules = await syncEngine.loadRules(root);
    const hints = syncEngine.resolveInteractionHints(config?.tools ?? []);
    const output = await compiler.compile(
      state,
      active,
      rules,
      config,
      undefined,
      undefined,
      undefined,
      hints,
    );
    await formatter.writeFormatted(output, "json");
  } else {
    tui.gapDetached(ctx);
    tui.messageDetached(ctx, `Start a spec with: ${cmd('spec new "..."')}`);
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
  { value: "opencode", label: "OpenCode" },
  { value: "codex", label: "Codex CLI" },
  { value: "copilot-cli", label: "Copilot CLI" },
];

/** Interactive tool picker. */
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
