// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * Main scaffolding orchestrator
 *
 * Coordinates fetching, configuration, processing, and post-install.
 *
 * @module
 */

import * as fs from "@std/fs";
import * as path from "@std/path";
import { exec } from "@eser/shell/exec";
import { runtime } from "@eser/standards/runtime";
import { fetchTemplate } from "./providers/mod.ts";
import {
  getConfigFilePath,
  loadTemplateConfig,
  resolveVariables,
} from "./config.ts";
import { processTemplate, removeConfigFile } from "./processor.ts";
import type { ScaffoldOptions, ScaffoldResult } from "./types.ts";

/**
 * Scaffold a template from a specifier
 *
 * @param options - Scaffolding options
 * @returns Result of the scaffolding operation
 */
export const scaffold = async (
  options: ScaffoldOptions,
): Promise<ScaffoldResult> => {
  const {
    specifier,
    targetDir,
    variables: providedVariables = {},
    force = false,
    skipPostInstall = false,
    interactive = false,
  } = options;

  // Resolve target directory to absolute path
  const absoluteTargetDir = path.isAbsolute(targetDir)
    ? targetDir
    : path.join(runtime.process.cwd(), targetDir);

  // Check if target directory exists and has content
  try {
    const entries = [];
    for await (const entry of Deno.readDir(absoluteTargetDir)) {
      entries.push(entry);
      break; // We only need to know if there's at least one entry
    }

    if (entries.length > 0 && !force) {
      throw new Error(
        `Target directory is not empty: ${absoluteTargetDir}. Use --force to overwrite.`,
      );
    }
  } catch (error) {
    if (!(error instanceof Deno.errors.NotFound)) {
      throw error;
    }
    // Directory doesn't exist, that's fine
  }

  // Ensure target directory exists
  await fs.ensureDir(absoluteTargetDir);

  // Fetch template from provider
  await fetchTemplate(specifier, absoluteTargetDir);

  // Load template configuration
  const config = await loadTemplateConfig(absoluteTargetDir);
  const templateName = config?.name ?? specifier;

  // Resolve variables
  const resolvedVariables = config !== null
    ? resolveVariables(config, {
      provided: providedVariables,
      interactive,
    })
    : providedVariables;

  // Build ignore list (always ignore common patterns)
  const ignorePatterns = [
    ".git",
    ".eser.yml",
    ".eser.yaml",
    ...(config?.ignore ?? []),
  ];

  // Process template files
  await processTemplate(absoluteTargetDir, {
    variables: resolvedVariables,
    ignore: ignorePatterns,
  });

  // Remove template config file
  const configFilePath = await getConfigFilePath(absoluteTargetDir);
  if (configFilePath !== null) {
    await removeConfigFile(configFilePath);
  }

  // Run post-install commands
  const postInstallCommands = config?.postInstall ?? [];
  const executedCommands: string[] = [];

  if (!skipPostInstall && postInstallCommands.length > 0) {
    for (const command of postInstallCommands) {
      try {
        const result = await exec`${command}`
          .cwd(absoluteTargetDir)
          .stdout("inherit")
          .stderr("inherit")
          .noThrow()
          .spawn();

        if (result.success) {
          executedCommands.push(command);
        } else {
          // Log but don't fail on post-install command failures
          // deno-lint-ignore no-console
          console.warn(`Post-install command failed: ${command}`);
        }
      } catch (error) {
        // deno-lint-ignore no-console
        console.warn(`Post-install command error: ${command}`, error);
      }
    }
  }

  return {
    templateName,
    targetDir: absoluteTargetDir,
    variables: resolvedVariables,
    postInstallCommands: executedCommands,
  };
};
