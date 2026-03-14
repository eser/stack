// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * Shared utilities for file-based codebase tools.
 *
 * Provides file walking, binary detection, content loading, and pattern matching.
 * Used by `createFileTool()` factory and individual tools.
 *
 * @module
 */

import { current } from "@eser/standards/runtime";
import * as shellExec from "@eser/shell/exec";

// =============================================================================
// Types
// =============================================================================

/**
 * File metadata entry — returned by the walker.
 * Content is loaded on demand via `loadContent()`.
 */
export type FileEntry = {
  /** Absolute path to the file */
  readonly path: string;
  /** File name (basename only) */
  readonly name: string;
  /** File size in bytes */
  readonly size: number;
  /** Whether this is a symlink */
  readonly isSymlink: boolean;
  /** Cached text content (populated by loadContent) */
  textContent?: string;
  /** Cached raw bytes (populated by loadBytes) */
  rawBytes?: Uint8Array;
};

/**
 * A mutation returned by a fixer tool.
 * Edit-tool-shaped: inspectable, diffable, approvable.
 */
export type FileMutation = {
  /** Path to the file */
  readonly path: string;
  /** Original content (for diff/preview) */
  readonly oldContent: string;
  /** New content after fix */
  readonly newContent: string;
};

/**
 * Options for walking source files.
 */
export type WalkOptions = {
  /** Root directory (default: ".") */
  readonly root?: string;
  /** File extensions to include (e.g., [".ts", ".json"]). Empty = all. */
  readonly extensions?: readonly string[];
  /** Glob/regex patterns to exclude */
  readonly exclude?: readonly (string | RegExp)[];
  /** Include directories in results (default: false) */
  readonly includeDirs?: boolean;
  /** When set, only include files matching these paths (incremental mode). */
  readonly includeOnly?: readonly string[];
};

// =============================================================================
// Default excludes
// =============================================================================

/** Directories always excluded from file tool scanning */
export const DEFAULT_EXCLUDES: readonly RegExp[] = [
  /node_modules/,
  /\.git\//,
  /\/dist\//,
  /etc\/coverage/,
  /etc\/temp/,
  /\.output\//,
];

// =============================================================================
// File walking
// =============================================================================

/**
 * Get list of files tracked by git (respects .gitignore).
 * Returns null if not in a git repo or git is unavailable.
 */
const getGitTrackedFiles = async (
  root: string,
): Promise<string[] | null> => {
  try {
    const files = await shellExec
      .exec`git ls-files --cached --others --exclude-standard`
      .cwd(root)
      .noThrow()
      .lines();
    return files.length > 0 ? files : null;
  } catch {
    return null;
  }
};

/**
 * Walk source files in a directory, respecting excludes.
 *
 * @param options - Walk options
 * @returns Array of file entries (metadata only, no content)
 */
export const walkSourceFiles = async (
  options: WalkOptions = {},
): Promise<FileEntry[]> => {
  const { root = ".", extensions, exclude = [] } = options;

  const allExcludes = [
    ...DEFAULT_EXCLUDES,
    ...exclude.map((e) => (typeof e === "string" ? new RegExp(e) : e)),
  ];

  const files: FileEntry[] = [];

  // Try git-aware file listing first (respects .gitignore)
  const gitFiles = await getGitTrackedFiles(root);

  if (gitFiles !== null) {
    // Git-aware path: iterate over git-tracked files
    for (const relativePath of gitFiles) {
      const fullPath = current.path.join(root, relativePath);
      const name = current.path.basename(relativePath);

      // Apply extension filter
      if (extensions !== undefined && extensions.length > 0) {
        const ext = current.path.extname(relativePath);
        if (!extensions.includes(ext)) {
          continue;
        }
      }

      // Apply exclude patterns
      if (
        allExcludes.some((re) => re.test(fullPath) || re.test(relativePath))
      ) {
        continue;
      }

      let size = 0;
      let isSymlink = false;
      try {
        const stat = await current.fs.lstat(fullPath);
        size = stat.size;
        isSymlink = stat.isSymlink;
        // Skip directories
        if (stat.isDirectory && !(options.includeDirs ?? false)) {
          continue;
        }
      } catch {
        continue;
      }

      files.push({ path: fullPath, name, size, isSymlink });
    }
  } else {
    // Fallback: filesystem walk (existing behavior)
    for await (
      const entry of current.fs.walk(root, {
        includeDirs: options.includeDirs ?? false,
        includeFiles: true,
        exts: extensions as string[] | undefined,
        skip: allExcludes,
      })
    ) {
      if (!entry.isFile && !entry.isSymlink) {
        continue;
      }

      let size = 0;
      try {
        const stat = await current.fs.stat(entry.path);
        size = stat.size;
      } catch {
        continue;
      }

      files.push({
        path: entry.path,
        name: entry.name,
        size,
        isSymlink: entry.isSymlink,
      });
    }
  }

  // Incremental mode: filter to only changed files when includeOnly is set
  if (
    options.includeOnly !== undefined && options.includeOnly.length > 0
  ) {
    const allowList = options.includeOnly;
    return files.filter((file) =>
      allowList.some((entry) =>
        file.path.endsWith(entry) || file.path.includes(entry)
      )
    );
  }

  return files;
};

// =============================================================================
// Content loading (two-phase)
// =============================================================================

/**
 * Load text content for a file entry. Caches the result.
 * Returns undefined for binary files.
 */
export const loadContent = async (
  file: FileEntry,
): Promise<string | undefined> => {
  if (file.textContent !== undefined) {
    return file.textContent;
  }

  try {
    const bytes = await loadBytes(file);
    if (isBinaryBytes(bytes)) {
      return undefined;
    }

    const text = new TextDecoder().decode(bytes);
    (file as { textContent?: string }).textContent = text;
    return text;
  } catch {
    return undefined;
  }
};

/**
 * Load raw bytes for a file entry. Caches the result.
 */
export const loadBytes = async (file: FileEntry): Promise<Uint8Array> => {
  if (file.rawBytes !== undefined) {
    return file.rawBytes;
  }

  const bytes = await current.fs.readFile(file.path);
  (file as { rawBytes?: Uint8Array }).rawBytes = bytes;
  return bytes;
};

// =============================================================================
// Binary detection
// =============================================================================

/**
 * Check if raw bytes represent a binary file.
 * Scans the first 8KB for null bytes.
 */
export const isBinaryBytes = (bytes: Uint8Array): boolean => {
  const scanLength = Math.min(bytes.length, 8192);
  for (let i = 0; i < scanLength; i++) {
    if (bytes[i] === 0) {
      return true;
    }
  }
  return false;
};

// =============================================================================
// Pattern matching
// =============================================================================

/**
 * Check if a file path matches any of the given patterns.
 */
export const matchesAnyPattern = (
  path: string,
  patterns: readonly (string | RegExp)[],
): boolean => {
  for (const pattern of patterns) {
    if (typeof pattern === "string") {
      if (path.includes(pattern) || path.endsWith(pattern)) {
        return true;
      }
    } else if (pattern.test(path)) {
      return true;
    }
  }
  return false;
};

/**
 * Apply mutations to the in-memory file list.
 * Updates textContent and rawBytes for mutated files.
 */
export const applyMutations = (
  files: FileEntry[],
  mutations: readonly FileMutation[],
): void => {
  const mutationMap = new Map<string, FileMutation>();
  for (const mutation of mutations) {
    mutationMap.set(mutation.path, mutation);
  }

  for (const file of files) {
    const mutation = mutationMap.get(file.path);
    if (mutation !== undefined) {
      (file as { textContent?: string }).textContent = mutation.newContent;
      (file as { rawBytes?: Uint8Array }).rawBytes = undefined; // invalidate bytes cache
    }
  }
};

/**
 * Write all accumulated mutations to disk.
 */
export const writeMutations = async (
  mutations: readonly FileMutation[],
): Promise<number> => {
  let written = 0;
  for (const mutation of mutations) {
    if (mutation.oldContent !== mutation.newContent) {
      await current.fs.writeTextFile(mutation.path, mutation.newContent);
      written++;
    }
  }
  return written;
};
