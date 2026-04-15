// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * Diagram registry — tracks diagrams in the project, detects staleness
 * when referenced files change during spec execution.
 *
 * @module
 */

import { runtime } from "@eserstack/standards/cross-runtime";

// =============================================================================
// Types
// =============================================================================

export type DiagramType = "mermaid" | "ascii" | "svg" | "plantuml";

export type DiagramEntry = {
  readonly file: string;
  readonly line: number;
  readonly type: DiagramType;
  readonly hash: string;
  readonly referencedFiles: readonly string[];
  readonly lastVerified: string;
};

export type StaleDiagram = {
  readonly file: string;
  readonly line: number;
  readonly type: DiagramType;
  readonly reason: string;
};

// =============================================================================
// Paths
// =============================================================================

const DIAGRAMS_FILE = ".eser/diagrams.json";

// =============================================================================
// Scanning
// =============================================================================

/** Simple hash for content comparison. */
const hashContent = (content: string): string => {
  let hash = 0;
  for (let i = 0; i < content.length; i++) {
    const chr = content.charCodeAt(i);
    hash = ((hash << 5) - hash) + chr;
    hash |= 0;
  }
  return Math.abs(hash).toString(36);
};

/** Extract file references from diagram content (file names, paths). */
const extractReferences = (content: string): readonly string[] => {
  const refs = new Set<string>();

  // Match file-like patterns: word.ext, path/to/file.ext
  const filePattern =
    /(?:[\w@.-]+\/)*[\w@.-]+\.(?:ts|tsx|js|jsx|go|py|rs|md|json|yaml|yml)/g;
  let match;
  while ((match = filePattern.exec(content)) !== null) {
    refs.add(match[0]);
  }

  // Match module-like references: @eserstack/noskills, dashboard/state
  const modulePattern = /(?:@[\w-]+\/[\w-]+|[\w-]+\/[\w-]+)/g;
  while ((match = modulePattern.exec(content)) !== null) {
    if (!match[0].includes(".")) {
      refs.add(match[0]);
    }
  }

  return [...refs];
};

/** Scan a markdown file for diagram blocks. */
const scanMarkdownFile = async (
  root: string,
  relPath: string,
): Promise<readonly DiagramEntry[]> => {
  const absPath = `${root}/${relPath}`;
  let content: string;
  try {
    content = await runtime.fs.readTextFile(absPath);
  } catch {
    return [];
  }

  const entries: DiagramEntry[] = [];
  const lines = content.split("\n");
  const now = new Date().toISOString();

  let inMermaid = false;
  let mermaidStart = 0;
  let mermaidContent = "";

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;

    // Mermaid blocks
    if (line.trim().startsWith("```mermaid")) {
      inMermaid = true;
      mermaidStart = i + 1;
      mermaidContent = "";
      continue;
    }
    if (inMermaid && line.trim() === "```") {
      inMermaid = false;
      entries.push({
        file: relPath,
        line: mermaidStart,
        type: "mermaid",
        hash: hashContent(mermaidContent),
        referencedFiles: extractReferences(mermaidContent),
        lastVerified: now,
      });
      continue;
    }
    if (inMermaid) {
      mermaidContent += line + "\n";
      continue;
    }

    // ASCII diagrams (lines with box-drawing characters)
    if (
      /[┌─┬┐│└┴┘╔═╗║╚╝╭╮╰╯]/.test(line) &&
      lines[i + 1] && /[┌─┬┐│└┴┘╔═╗║╚╝╭╮╰╯]/.test(lines[i + 1]!)
    ) {
      // Collect contiguous ASCII art lines
      let asciiContent = "";
      let j = i;
      while (
        j < lines.length &&
        /[┌─┬┐│└┴┘╔═╗║╚╝╭╮╰╯┼├┤▶→←↓↑\|+\-]/.test(lines[j]!)
      ) {
        asciiContent += lines[j] + "\n";
        j++;
      }
      if (asciiContent.length > 20) {
        entries.push({
          file: relPath,
          line: i + 1,
          type: "ascii",
          hash: hashContent(asciiContent),
          referencedFiles: extractReferences(asciiContent),
          lastVerified: now,
        });
      }
      // Skip processed lines (let the loop continue naturally)
    }
  }

  return entries;
};

/** Scan the project for all diagrams. */
export const scanProject = async (
  root: string,
): Promise<readonly DiagramEntry[]> => {
  const entries: DiagramEntry[] = [];

  // Scan markdown files
  const mdFiles: string[] = [];
  const scanDir = async (dir: string, prefix: string): Promise<void> => {
    try {
      for await (const entry of runtime.fs.readDir(dir)) {
        if (entry.name.startsWith(".") || entry.name === "node_modules") {
          continue;
        }
        if (entry.isFile && entry.name.endsWith(".md")) {
          mdFiles.push(prefix ? `${prefix}/${entry.name}` : entry.name);
        }
        if (entry.isDirectory && !entry.name.startsWith(".")) {
          await scanDir(
            `${dir}/${entry.name}`,
            prefix ? `${prefix}/${entry.name}` : entry.name,
          );
        }
      }
    } catch {
      // directory doesn't exist or not readable
    }
  };

  await scanDir(root, "");

  // Also check docs/ specifically
  for (const mdFile of mdFiles) {
    const diagrams = await scanMarkdownFile(root, mdFile);
    entries.push(...diagrams);
  }

  // Check for .puml files
  try {
    for await (const entry of runtime.fs.readDir(root)) {
      if (entry.isFile && entry.name.endsWith(".puml")) {
        const content = await runtime.fs.readTextFile(
          `${root}/${entry.name}`,
        );
        entries.push({
          file: entry.name,
          line: 1,
          type: "plantuml",
          hash: hashContent(content),
          referencedFiles: extractReferences(content),
          lastVerified: new Date().toISOString(),
        });
      }
    }
  } catch {
    // root not readable
  }

  return entries;
};

// =============================================================================
// Registry
// =============================================================================

/** Read the diagram registry. */
export const readRegistry = async (
  root: string,
): Promise<readonly DiagramEntry[]> => {
  try {
    const content = await runtime.fs.readTextFile(
      `${root}/${DIAGRAMS_FILE}`,
    );
    return JSON.parse(content) as DiagramEntry[];
  } catch {
    return [];
  }
};

/** Write the diagram registry. */
export const writeRegistry = async (
  root: string,
  entries: readonly DiagramEntry[],
): Promise<void> => {
  await runtime.fs.writeTextFile(
    `${root}/${DIAGRAMS_FILE}`,
    JSON.stringify(entries, null, 2) + "\n",
  );
};

/** Mark a diagram as verified (updates lastVerified). */
export const verifyDiagram = async (
  root: string,
  file: string,
  line?: number,
): Promise<boolean> => {
  const registry = await readRegistry(root);
  let found = false;

  const updated = registry.map((d) => {
    if (d.file === file && (line === undefined || d.line === line)) {
      found = true;
      return { ...d, lastVerified: new Date().toISOString() };
    }
    return d;
  });

  if (found) {
    await writeRegistry(root, updated);
  }
  return found;
};

// =============================================================================
// Staleness check
// =============================================================================

/** Check which diagrams are stale based on modified files. */
export const checkStaleness = async (
  root: string,
  modifiedFiles: readonly string[],
): Promise<readonly StaleDiagram[]> => {
  const registry = await readRegistry(root);
  if (registry.length === 0) return [];

  const modSet = new Set(
    modifiedFiles.map((f) => f.replace(/^\.\//, "")),
  );

  const stale: StaleDiagram[] = [];

  for (const diagram of registry) {
    for (const ref of diagram.referencedFiles) {
      // Check if any modified file matches a reference (partial match)
      for (const mod of modSet) {
        if (mod.includes(ref) || ref.includes(mod)) {
          stale.push({
            file: diagram.file,
            line: diagram.line,
            type: diagram.type,
            reason: `${mod} was modified but diagram references ${ref}`,
          });
          break; // one reason per diagram is enough
        }
      }
    }
  }

  return stale;
};
