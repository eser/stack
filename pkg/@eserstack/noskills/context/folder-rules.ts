// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * Folder rules — scoped backpressure from `.folder-rules.md` files.
 *
 * For monorepos: different packages have different constraints.
 * When files are touched, noskills walks up the directory chain for
 * each file, collects `.folder-rules.md` rules, and adds them to
 * the status report criteria.
 *
 * Zero LLM tokens — purely filesystem-driven.
 *
 * @module
 */

import { runtime } from "@eserstack/standards/cross-runtime";

// =============================================================================
// Types
// =============================================================================

export type FolderRule = {
  readonly folder: string;
  readonly rule: string;
};

// =============================================================================
// Reader
// =============================================================================

/** Parse a `.folder-rules.md` file — each bullet or non-empty line is a rule. */
const parseRulesFile = (content: string): readonly string[] => {
  return content
    .split("\n")
    .map((line) => line.replace(/^[-*]\s+/, "").trim())
    .filter((line) => line.length > 0 && !line.startsWith("#"));
};

/**
 * Walk up from a file path collecting `.folder-rules.md` rules.
 * Stops at the project root (where `.eser/` lives).
 */
const collectRulesForFile = async (
  root: string,
  filePath: string,
): Promise<readonly FolderRule[]> => {
  // Normalize: remove root prefix to get relative path
  const relative = filePath.startsWith(root)
    ? filePath.slice(root.length + 1)
    : filePath;

  // Walk up directory chain
  const parts = relative.split("/");
  parts.pop(); // remove filename

  // Depths from the file's own directory up to the root, deepest first. The
  // directories are read concurrently and the result keeps that order.
  const depths = Array.from(
    { length: parts.length + 1 },
    (_, k) => parts.length - k,
  );

  const rulesPerDir = await Promise.all(depths.map(async (i) => {
    const dir = i === 0 ? root : `${root}/${parts.slice(0, i).join("/")}`;
    const rulesFile = `${dir}/.folder-rules.md`;
    const folderLabel = i === 0 ? "." : parts.slice(0, i).join("/");

    try {
      const content = await runtime.fs.readTextFile(rulesFile);

      return parseRulesFile(content).map((rule) => ({
        folder: folderLabel,
        rule,
      }));
    } catch {
      // No .folder-rules.md in this directory
      return [];
    }
  }));

  return rulesPerDir.flat();
};

/**
 * Collect folder rules for all touched files.
 * Deduplicates: same folder+rule pair only appears once.
 */
export const collectFolderRules = async (
  root: string,
  touchedFiles: readonly string[],
): Promise<readonly FolderRule[]> => {
  const seen = new Set<string>();
  const allRules: FolderRule[] = [];

  // Files are walked one at a time: a turn can touch many files, and this
  // bounds the reads in flight to one directory chain.
  for (const file of touchedFiles) {
    // deno-lint-ignore no-await-in-loop
    const fileRules = await collectRulesForFile(root, file);

    for (const fr of fileRules) {
      const key = `${fr.folder}::${fr.rule}`;
      if (!seen.has(key)) {
        seen.add(key);
        allRules.push(fr);
      }
    }
  }

  return allRules;
};
