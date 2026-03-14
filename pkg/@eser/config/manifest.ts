// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * Shared manifest file loader for `.manifest.yml` / `.manifest.yaml`.
 * Used by both @eser/workflows (for workflow config) and @eser/codebase (for hook installation).
 * @module
 */

import * as yaml from "@std/yaml";
import { current, NotFoundError } from "@eser/standards/runtime";

/** Manifest filenames to search for (in order of priority). */
export const MANIFEST_FILENAMES = [".manifest.yml", ".manifest.yaml"];

/**
 * Load and parse a manifest file from a directory.
 * Returns the raw parsed YAML object, or null if no file found.
 */
export const loadManifest = async (
  dir: string,
): Promise<Record<string, unknown> | null> => {
  for (const filename of MANIFEST_FILENAMES) {
    const filepath = current.path.join(dir, filename);
    try {
      const content = await current.fs.readTextFile(filepath);
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
    const filepath = current.path.join(dir, filename);
    try {
      await current.fs.stat(filepath);
      return filepath;
    } catch {
      continue;
    }
  }
  return null;
};
