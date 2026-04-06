// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * `noskills purge` — Remove noskills-related content with interactive category selection.
 *
 * @module
 */

import * as yaml from "yaml";
import * as results from "@eser/primitives/results";
import type * as shellArgs from "@eser/shell/args";
import * as tui from "@eser/shell/tui";
import * as persistence from "../state/persistence.ts";
import * as mode from "../output/mode.ts";
import * as crossRuntime from "@eser/standards/cross-runtime";

// =============================================================================
// Types
// =============================================================================

type TuiCtx = tui.TuiContext;

type CategoryId = "concerns" | "specs" | "rules" | "agent-integration";

type CategoryDetection = {
  readonly id: CategoryId;
  readonly exists: boolean;
  readonly message: string;
};

type CategoryAnswer = {
  readonly id: CategoryId;
  readonly confirmed: boolean;
};

// =============================================================================
// Main
// =============================================================================

export const main = async (
  args?: readonly string[],
): Promise<shellArgs.CliResult<void>> => {
  const root = crossRuntime.runtime.process.cwd();
  const currentMode = mode.detectMode(args);
  const ctx = tui.createTuiContext({
    target: currentMode === "agent" ? "non-interactive" : "interactive",
  });
  const cleanArgs = mode.stripModeFlag(args);
  const force = cleanArgs.includes("--force");

  // Agent mode without --force: fail
  if (!force && currentMode === "agent") {
    tui.log.error(ctx, "Purge requires `--force` flag in agent mode.");

    return results.fail({ exitCode: 1 });
  }

  // --force mode: delete everything unconditionally
  if (force) {
    tui.log.step(ctx, "Purging noskills content...");
    await deleteAllCategories(root, ctx);
    tui.log.success(ctx, "Purge complete.");

    return results.ok(undefined);
  }

  // Interactive mode: detect, prompt, collect-then-delete
  const detections = await detectCategories(root);
  const existing = detections.filter((d) => d.exists);

  if (existing.length === 0) {
    tui.log.info(ctx, "Nothing to remove.");

    return results.ok(undefined);
  }

  // Collect all answers first
  const answers: CategoryAnswer[] = [];

  for (const cat of existing) {
    const answer = await tui.confirm(ctx, { message: cat.message });

    if (tui.isCancel(answer)) {
      tui.log.info(ctx, "Aborted.");

      return results.ok(undefined);
    }

    answers.push({ id: cat.id, confirmed: answer === true });
  }

  const confirmed = answers.filter((a) => a.confirmed);
  const kept = answers.filter((a) => !a.confirmed);

  if (confirmed.length === 0) {
    tui.log.info(ctx, "Nothing selected for removal.");

    return results.ok(undefined);
  }

  // Execute deletions for confirmed categories
  const confirmedIds = new Set(confirmed.map((a) => a.id));
  const errors: string[] = [];

  for (const cat of confirmed) {
    const ok = await deleteCategory(root, cat.id);

    if (ok) {
      tui.log.step(ctx, `  Removed ${categoryLabel(cat.id)}`);
    } else {
      errors.push(cat.id);
      tui.log.step(ctx, `  Failed to remove ${categoryLabel(cat.id)}`);
    }
  }

  for (const cat of kept) {
    tui.log.step(ctx, `  Kept ${categoryLabel(cat.id)}`);
  }

  // Remove manifest section silently when any category was removed
  if (confirmedIds.size > 0) {
    await removeManifestSection(root);
  }

  const successCount = confirmed.length - errors.length;
  tui.log.success(
    ctx,
    `Purge complete (${successCount} of ${existing.length} categories removed).`,
  );

  return results.ok(undefined);
};

// =============================================================================
// Detection
// =============================================================================

const detectCategories = async (
  root: string,
): Promise<readonly CategoryDetection[]> => {
  const [concerns, specs, rules, agentIntegration] = await Promise.all([
    detectConcerns(root),
    detectSpecs(root),
    detectRules(root),
    detectAgentIntegration(root),
  ]);

  return [concerns, specs, rules, agentIntegration];
};

const detectConcerns = async (root: string): Promise<CategoryDetection> => {
  const concerns = await persistence.listConcerns(root);
  const names = concerns.map((c) => c.id).join(", ");

  return {
    id: "concerns",
    exists: concerns.length > 0,
    message: `Remove concerns? (${names})`,
  };
};

const detectSpecs = async (root: string): Promise<CategoryDetection> => {
  const specStates = await persistence.listSpecStates(root);

  // Also check specs directory for specs without state files
  let specDirCount = 0;

  try {
    for await (
      const entry of crossRuntime.runtime.fs.readDir(
        `${root}/${persistence.paths.specsDir}`,
      )
    ) {
      if (entry.isDirectory) {
        specDirCount++;
      }
    }
  } catch {
    // Directory doesn't exist
  }

  const totalCount = Math.max(specStates.length, specDirCount);

  if (totalCount === 0) {
    return { id: "specs", exists: false, message: "" };
  }

  const details = specStates.map((s) => `${s.name} ${s.state.phase}`).join(
    ", ",
  );
  const message = specStates.length > 0
    ? `Remove specs? (${totalCount} specs: ${details})`
    : `Remove specs? (${totalCount} spec directories)`;

  return { id: "specs", exists: true, message };
};

const detectRules = async (root: string): Promise<CategoryDetection> => {
  let count = 0;

  try {
    for await (
      const entry of crossRuntime.runtime.fs.readDir(
        `${root}/${persistence.paths.rulesDir}`,
      )
    ) {
      if (entry.isFile) {
        count++;
      }
    }
  } catch {
    // Directory doesn't exist
  }

  return {
    id: "rules",
    exists: count > 0,
    message: `Remove rules? (${count} active rules)`,
  };
};

const detectAgentIntegration = async (
  root: string,
): Promise<CategoryDetection> => {
  let hasHooks = false;
  let hasClaudeMd = false;
  let hasAgentFiles = false;

  // Check hooks in settings.json
  try {
    const content = await crossRuntime.runtime.fs.readTextFile(
      `${root}/.claude/settings.json`,
    );
    const settings = JSON.parse(content) as Record<string, unknown>;
    hasHooks = settings["hooks"] !== undefined;
  } catch {
    // No settings file
  }

  // Check noskills section in CLAUDE.md
  try {
    const content = await crossRuntime.runtime.fs.readTextFile(
      `${root}/CLAUDE.md`,
    );
    hasClaudeMd = content.includes("<!-- noskills:start -->");
  } catch {
    // No CLAUDE.md
  }

  // Check agent files in .claude/agents/
  const agentFiles = [
    `${root}/.claude/agents/noskills-executor.md`,
    `${root}/.claude/agents/noskills-verifier.md`,
  ];
  for (const f of agentFiles) {
    try {
      await crossRuntime.runtime.fs.stat(f);
      hasAgentFiles = true;
      break;
    } catch {
      // File doesn't exist
    }
  }

  const exists = hasHooks || hasClaudeMd || hasAgentFiles;

  return {
    id: "agent-integration",
    exists,
    message:
      "Remove agent integration? (.claude/settings.json, CLAUDE.md, .claude/agents/noskills-*.md)",
  };
};

// =============================================================================
// Category Labels
// =============================================================================

const categoryLabel = (id: CategoryId): string => {
  const labels: Record<CategoryId, string> = {
    concerns: "concerns",
    specs: "specs",
    rules: "rules",
    "agent-integration": "agent integration",
  };

  return labels[id];
};

// =============================================================================
// Deletion — individual categories (return success boolean)
// =============================================================================

const deleteCategory = (
  root: string,
  id: CategoryId,
): Promise<boolean> => {
  switch (id) {
    case "concerns":
      return removeDir(`${root}/${persistence.paths.concernsDir}`);
    case "specs":
      // Follow-parent: also remove .eser/.state/progresses/ (the workflow
      // state sub-tree). Sessions and events are intentionally preserved.
      return removeDirBatch([
        `${root}/${persistence.paths.specsDir}`,
        `${root}/${persistence.paths.progressesDir}`,
      ]);
    case "rules":
      return removeDir(`${root}/${persistence.paths.rulesDir}`);
    case "agent-integration":
      return removeAgentIntegration(root);
  }
};

// =============================================================================
// Deletion — force mode (delete everything)
// =============================================================================

const deleteAllCategories = async (
  root: string,
  ctx: TuiCtx,
): Promise<void> => {
  // 1. Concerns
  if (await removeDir(`${root}/${persistence.paths.concernsDir}`)) {
    tui.log.step(ctx, "  Removed `.eser/concerns/`");
  }

  // 2. Specs
  if (await removeDir(`${root}/${persistence.paths.specsDir}`)) {
    tui.log.step(ctx, "  Removed `.eser/specs/`");
  }

  // 3. Rules
  if (await removeDir(`${root}/${persistence.paths.rulesDir}`)) {
    tui.log.step(ctx, "  Removed `.eser/rules/`");
  }

  // 4. State (workflow progresses sub-tree only; sessions/events preserved)
  if (await removeDir(`${root}/${persistence.paths.progressesDir}`)) {
    tui.log.step(ctx, "  Removed `.eser/.state/progresses/`");
  }

  // 5. Manifest
  if (await removeManifestSection(root)) {
    tui.log.step(ctx, "  Removed noskills section from `manifest.yml`");
  }

  // 6. Agent integration (hooks, CLAUDE.md, agent files, tool files)
  if (await removeAgentIntegration(root)) {
    tui.log.step(ctx, "  Removed agent integration");
  }
};

// =============================================================================
// Low-level helpers (return success boolean)
// =============================================================================

const removeDir = async (dirPath: string): Promise<boolean> => {
  try {
    await crossRuntime.runtime.fs.stat(dirPath);
    const { rmSync } = await import("node:fs");
    rmSync(dirPath, { recursive: true, force: true });

    return true;
  } catch {
    return false;
  }
};

const removeDirBatch = async (dirs: readonly string[]): Promise<boolean> => {
  let anySuccess = false;

  for (const dir of dirs) {
    const ok = await removeDir(dir);

    if (ok) {
      anySuccess = true;
    }
  }

  return anySuccess;
};

const removeFile = async (filePath: string): Promise<boolean> => {
  try {
    await crossRuntime.runtime.fs.stat(filePath);
    const { unlinkSync } = await import("node:fs");
    unlinkSync(filePath);

    return true;
  } catch {
    return false;
  }
};

const removeManifestSection = async (root: string): Promise<boolean> => {
  const manifestPath = `${root}/${persistence.paths.manifestFile}`;

  try {
    const content = await crossRuntime.runtime.fs.readTextFile(manifestPath);
    const doc = yaml.parseDocument(content);

    if (doc.has("noskills")) {
      doc.delete("noskills");
      await crossRuntime.runtime.fs.writeTextFile(manifestPath, doc.toString());

      return true;
    }

    return false;
  } catch {
    return false;
  }
};

const removeClaudeMdSection = async (root: string): Promise<boolean> => {
  const claudePath = `${root}/CLAUDE.md`;
  const startMarker = "<!-- noskills:start -->";
  const endMarker = "<!-- noskills:end -->";

  try {
    let content = await crossRuntime.runtime.fs.readTextFile(claudePath);
    const startIdx = content.indexOf(startMarker);
    const endIdx = content.indexOf(endMarker);

    if (startIdx !== -1 && endIdx !== -1) {
      content = content.slice(0, startIdx).trimEnd() +
        "\n" +
        content.slice(endIdx + endMarker.length).trimStart();
      await crossRuntime.runtime.fs.writeTextFile(
        claudePath,
        content.trimEnd() + "\n",
      );

      return true;
    }

    return false;
  } catch {
    return false;
  }
};

const removeHooksFromSettings = async (root: string): Promise<boolean> => {
  const settingsPath = `${root}/.claude/settings.json`;

  try {
    const content = await crossRuntime.runtime.fs.readTextFile(settingsPath);
    const settings = JSON.parse(content) as Record<string, unknown>;

    if (settings["hooks"] !== undefined) {
      delete settings["hooks"];
      await crossRuntime.runtime.fs.writeTextFile(
        settingsPath,
        JSON.stringify(settings, null, 2) + "\n",
      );

      return true;
    }

    return false;
  } catch {
    return false;
  }
};

const removeAgentIntegration = async (root: string): Promise<boolean> => {
  let anySuccess = false;

  // Hooks from .claude/settings.json
  if (await removeHooksFromSettings(root)) {
    anySuccess = true;
  }

  // noskills section from CLAUDE.md
  if (await removeClaudeMdSection(root)) {
    anySuccess = true;
  }

  // Agent files
  const agentFiles = [
    `${root}/.claude/agents/noskills-executor.md`,
    `${root}/.claude/agents/noskills-verifier.md`,
  ];
  for (const filePath of agentFiles) {
    if (await removeFile(filePath)) {
      anySuccess = true;
    }
  }

  // Generated tool files
  const toolFiles = [
    `${root}/.cursorrules`,
    `${root}/.windsurfrules`,
    `${root}/.kiro/steering/conventions.md`,
    `${root}/.github/copilot-instructions.md`,
  ];
  for (const filePath of toolFiles) {
    if (await removeFile(filePath)) {
      anySuccess = true;
    }
  }

  return anySuccess;
};
