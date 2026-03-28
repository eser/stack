// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * `noskills purge` — Remove all noskills-related content.
 *
 * @module
 */

import * as yaml from "yaml";
import * as results from "@eser/primitives/results";
import type * as shellArgs from "@eser/shell/args";
import * as tui from "@eser/shell/tui";
import * as persistence from "../state/persistence.ts";
import { detectMode, stripModeFlag } from "../output/mode.ts";
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
  const force = cleanArgs.includes("--force");

  if (!force) {
    if (mode === "agent") {
      tui.log.error(ctx, "Purge requires `--force` flag in agent mode.");

      return results.fail({ exitCode: 1 });
    }

    const confirmed = await tui.confirm(ctx, {
      message:
        "This will remove all noskills specs, rules, concerns, and hooks. Continue?",
    });

    if (tui.isCancel(confirmed) || confirmed !== true) {
      tui.log.info(ctx, "Aborted.");

      return results.ok(undefined);
    }
  }

  tui.log.step(ctx, "Purging noskills content...");

  // 1. Remove .eser/concerns/
  await removeDir(
    `${root}/${persistence.paths.concernsDir}`,
    ctx,
    "`.eser/concerns/`",
  );

  // 2. Remove .eser/specs/
  await removeDir(
    `${root}/${persistence.paths.specsDir}`,
    ctx,
    "`.eser/specs/`",
  );

  // 3. Remove .eser/rules/
  await removeDir(
    `${root}/${persistence.paths.rulesDir}`,
    ctx,
    "`.eser/rules/`",
  );

  // 4. Remove .eser/.state/
  await removeDir(
    `${root}/${persistence.paths.stateDir}`,
    ctx,
    "`.eser/.state/`",
  );

  // 5. Remove noskills section from manifest.yml
  await removeManifestSection(root, ctx);

  // 6. Remove noskills section from CLAUDE.md
  await removeClaudeMdSection(root, ctx);

  // 7. Remove generated tool files
  await removeFile(`${root}/.cursorrules`, ctx, "`.cursorrules`");
  await removeFile(`${root}/.windsurfrules`, ctx, "`.windsurfrules`");
  await removeFile(
    `${root}/.kiro/steering/conventions.md`,
    ctx,
    "`.kiro/steering/conventions.md`",
  );
  await removeFile(
    `${root}/.github/copilot-instructions.md`,
    ctx,
    "`.github/copilot-instructions.md`",
  );

  // 8. Remove noskills hooks from .claude/settings.json
  await removeHooksFromSettings(root, ctx);

  tui.log.success(ctx, "Purge complete.");

  return results.ok(undefined);
};

// =============================================================================
// Helpers
// =============================================================================

type TuiCtx = tui.TuiContext;

const removeDir = async (
  dirPath: string,
  ctx: TuiCtx,
  label: string,
): Promise<void> => {
  try {
    await runtime.fs.stat(dirPath);
    const { rmSync } = await import("node:fs");
    rmSync(dirPath, { recursive: true, force: true });
    tui.log.step(ctx, `  Removed ${label}`);
  } catch {
    // Doesn't exist
  }
};

const removeFile = async (
  filePath: string,
  ctx: TuiCtx,
  label: string,
): Promise<void> => {
  try {
    await runtime.fs.stat(filePath);
    const { unlinkSync } = await import("node:fs");
    unlinkSync(filePath);
    tui.log.step(ctx, `  Removed ${label}`);
  } catch {
    // Doesn't exist
  }
};

const removeManifestSection = async (
  root: string,
  ctx: TuiCtx,
): Promise<void> => {
  const manifestPath = `${root}/${persistence.paths.manifestFile}`;

  try {
    const content = await runtime.fs.readTextFile(manifestPath);
    const doc = yaml.parseDocument(content);

    if (doc.has("noskills")) {
      doc.delete("noskills");
      await runtime.fs.writeTextFile(manifestPath, doc.toString());
      tui.log.step(ctx, "  Removed noskills section from `manifest.yml`");
    }
  } catch {
    // File doesn't exist or parse error
  }
};

const removeClaudeMdSection = async (
  root: string,
  ctx: TuiCtx,
): Promise<void> => {
  const claudePath = `${root}/CLAUDE.md`;
  const startMarker = "<!-- noskills:start -->";
  const endMarker = "<!-- noskills:end -->";

  try {
    let content = await runtime.fs.readTextFile(claudePath);
    const startIdx = content.indexOf(startMarker);
    const endIdx = content.indexOf(endMarker);

    if (startIdx !== -1 && endIdx !== -1) {
      content = content.slice(0, startIdx).trimEnd() +
        "\n" +
        content.slice(endIdx + endMarker.length).trimStart();
      await runtime.fs.writeTextFile(claudePath, content.trimEnd() + "\n");
      tui.log.step(ctx, "  Removed noskills section from `CLAUDE.md`");
    }
  } catch {
    // File doesn't exist
  }
};

const removeHooksFromSettings = async (
  root: string,
  ctx: TuiCtx,
): Promise<void> => {
  const settingsPath = `${root}/.claude/settings.json`;

  try {
    const content = await runtime.fs.readTextFile(settingsPath);
    const settings = JSON.parse(content) as Record<string, unknown>;

    if (settings["hooks"] !== undefined) {
      delete settings["hooks"];
      await runtime.fs.writeTextFile(
        settingsPath,
        JSON.stringify(settings, null, 2) + "\n",
      );
      tui.log.step(ctx, "  Removed hooks from `.claude/settings.json`");
    }
  } catch {
    // File doesn't exist
  }
};
