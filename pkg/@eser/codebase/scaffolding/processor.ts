// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * Template file processing with variable substitution
 *
 * Handles walking files and replacing {{.variable}} placeholders with values.
 *
 * @module
 */

import { current, NotFoundError } from "@eser/standards/runtime";

/** Variable placeholder pattern: {{.variable_name}} (Go template style) */
const VARIABLE_PATTERN = /\{\{\s*\.(\w+)\s*\}\}/g;

/** Binary file extensions to skip */
const BINARY_EXTENSIONS = new Set([
  ".png",
  ".jpg",
  ".jpeg",
  ".gif",
  ".ico",
  ".webp",
  ".svg",
  ".woff",
  ".woff2",
  ".ttf",
  ".eot",
  ".otf",
  ".zip",
  ".tar",
  ".gz",
  ".bz2",
  ".xz",
  ".7z",
  ".pdf",
  ".doc",
  ".docx",
  ".xls",
  ".xlsx",
  ".ppt",
  ".pptx",
  ".exe",
  ".dll",
  ".so",
  ".dylib",
  ".mp3",
  ".mp4",
  ".avi",
  ".mov",
  ".webm",
]);

/**
 * Check if a file should be treated as binary
 */
const isBinaryFile = (filepath: string): boolean => {
  const ext = current.path.extname(filepath).toLowerCase();
  return BINARY_EXTENSIONS.has(ext);
};

/**
 * Check if a path matches any of the ignore patterns
 */
const shouldIgnore = (
  relativePath: string,
  ignorePatterns: readonly string[],
): boolean => {
  for (const pattern of ignorePatterns) {
    // Simple glob matching
    if (pattern.startsWith("*")) {
      // Extension match like "*.md"
      const ext = pattern.slice(1);
      if (relativePath.endsWith(ext)) {
        return true;
      }
    } else if (pattern.includes("*")) {
      // Convert glob to regex - escape all regex metacharacters first
      const regexPattern = pattern
        .replace(/[.+?^${}()|[\]\\]/g, "\\$&") // codeql[js/incomplete-sanitization]
        .replace(/\*\*/g, ".*")
        .replace(/\*/g, "[^/]*");
      const regex = new RegExp(`^${regexPattern}$`);
      if (regex.test(relativePath)) {
        return true;
      }
    } else {
      // Exact match or directory match
      if (relativePath === pattern || relativePath.startsWith(pattern + "/")) {
        return true;
      }
    }
  }
  return false;
};

/**
 * Substitute variables in a string
 *
 * @param content - String content with {{.variable}} placeholders
 * @param variables - Variable values to substitute
 * @returns Content with placeholders replaced
 */
export const substituteVariables = (
  content: string,
  variables: Record<string, string>,
): string => {
  return content.replace(VARIABLE_PATTERN, (_match, varName: string) => {
    const value = variables[varName];
    if (value === undefined) {
      // Keep original placeholder if variable not found
      return `{{.${varName}}}`;
    }
    return value;
  });
};

/**
 * Check if a string contains variable placeholders
 */
export const hasVariables = (content: string): boolean => {
  return VARIABLE_PATTERN.test(content);
};

export type ProcessOptions = {
  /** Variable values to substitute */
  variables: Record<string, string>;
  /** Glob patterns for files to ignore */
  ignore: readonly string[];
};

/**
 * Process all files in a template directory
 *
 * - Substitutes {{.variable}} placeholders in file contents
 * - Renames files with {{.variable}} in their names
 * - Skips binary files and ignored patterns
 *
 * @param dir - Directory to process
 * @param options - Processing options
 */
export const processTemplate = async (
  dir: string,
  options: ProcessOptions,
): Promise<void> => {
  const { variables, ignore } = options;

  // Collect files to process (avoiding modification during iteration)
  const filesToProcess: string[] = [];
  const dirsToRename: string[] = [];

  for await (const entry of current.fs.walk(dir, { includeDirs: true })) {
    const relativePath = current.path.relative(dir, entry.path);

    // Skip root
    if (relativePath === "") {
      continue;
    }

    // Skip ignored paths
    if (shouldIgnore(relativePath, ignore)) {
      continue;
    }

    if (entry.isDirectory) {
      // Check if directory name needs renaming
      if (hasVariables(entry.name)) {
        dirsToRename.push(entry.path);
      }
    } else if (entry.isFile) {
      filesToProcess.push(entry.path);
    }
  }

  // Process files
  for (const filepath of filesToProcess) {
    const filename = current.path.basename(filepath);
    const dirPath = current.path.dirname(filepath);

    // Process file content (skip binary files)
    if (!isBinaryFile(filepath)) {
      try {
        const content = await current.fs.readTextFile(filepath);

        if (hasVariables(content)) {
          const processed = substituteVariables(content, variables);
          await current.fs.writeTextFile(filepath, processed);
        }
      } catch (error) {
        // Log but don't fail on individual file errors
        // InvalidData usually means binary file detected as text
        if (
          !(error instanceof Error && error.name === "InvalidData")
        ) {
          throw error;
        }
      }
    }

    // Rename file if name contains variables
    if (hasVariables(filename)) {
      const newFilename = substituteVariables(filename, variables);
      const newPath = current.path.join(dirPath, newFilename);

      if (newPath !== filepath) {
        await current.fs.rename(filepath, newPath);
      }
    }
  }

  // Rename directories (process deepest first to avoid path issues)
  dirsToRename.sort((a, b) =>
    b.split(current.path.sep).length - a.split(current.path.sep).length
  );

  for (const dirPath of dirsToRename) {
    const dirname = current.path.basename(dirPath);
    const parentDir = current.path.dirname(dirPath);
    const newDirname = substituteVariables(dirname, variables);
    const newPath = current.path.join(parentDir, newDirname);

    if (newPath !== dirPath) {
      await current.fs.rename(dirPath, newPath);
    }
  }
};

/**
 * Remove the template config file from the processed directory
 */
export const removeConfigFile = async (filepath: string): Promise<void> => {
  try {
    await current.fs.remove(filepath);
  } catch (error) {
    if (!(error instanceof NotFoundError)) {
      throw error;
    }
  }
};
