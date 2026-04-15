// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * Shared manifest file loader for `.eser/manifest.yml`.
 * Falls back to legacy `.manifest.yml` at repo root for migration.
 * Used by both @eserstack/workflows (for workflow config) and @eserstack/codebase (for hook installation).
 * @module
 */

import * as yaml from "yaml";
import { NotFoundError, runtime } from "@eserstack/standards/cross-runtime";

/** Manifest filenames to search for (in order of priority). */
export const MANIFEST_FILENAMES = [
  ".eser/manifest.yml",
  ".eser/manifest.yaml",
  ".manifest.yml", // legacy fallback
  ".manifest.yaml", // legacy fallback
];

/**
 * Load and parse a manifest file from a directory.
 * Returns the raw parsed YAML object, or null if no file found.
 */
export const loadManifest = async (
  dir: string,
): Promise<Record<string, unknown> | null> => {
  for (const filename of MANIFEST_FILENAMES) {
    const filepath = runtime.path.join(dir, filename);
    try {
      const content = await runtime.fs.readTextFile(filepath);
      return yaml.parse(content) as Record<string, unknown>;
    } catch (error) {
      if (error instanceof NotFoundError) {
        continue;
      }
      throw error;
    }
  }
  return null;
};

/**
 * Get the manifest file path in a directory (if it exists).
 */
export const getManifestPath = async (
  dir: string,
): Promise<string | null> => {
  for (const filename of MANIFEST_FILENAMES) {
    const filepath = runtime.path.join(dir, filename);
    try {
      await runtime.fs.stat(filepath);
      return filepath;
    } catch {
      continue;
    }
  }
  return null;
};
