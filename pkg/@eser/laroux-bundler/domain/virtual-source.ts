// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.
/**
 * Virtual Source Directory Handler
 *
 * Creates a temporary copy of source files for bundling.
 * This allows CSS module imports to be rewritten without modifying original source.
 *
 * The virtual source is created in dist/_bundle_src/ and cleaned up after bundling.
 */

import { current } from "@eser/standards/runtime";
import { JS_FILE_EXTENSIONS } from "@eser/standards/patterns";
import { copy, emptyDir, ensureDir, walk } from "@std/fs"; // emptyDir, copy, walk not available in runtime
import * as logging from "@eser/logging";

// Pattern to ignore node_modules and hidden files
const IGNORE_PATTERN = /(?:node_modules|\/\.|^\.|\\\.)/;

const vsLogger = logging.logger.getLogger(["laroux-bundler", "virtual-source"]);

export const VIRTUAL_SRC_DIR = "_bundle_src";

export interface VirtualSourceOptions {
  projectRoot: string;
  distDir: string;
  srcDir: string;
  /** Changed files for incremental update (absolute paths) */
  changedFiles?: Set<string>;
}

/**
 * Get the srcDir name relative to projectRoot
 * e.g., if srcDir is "/project/src", returns "src"
 * e.g., if srcDir is "/project/source", returns "source"
 */
function getSrcDirName(srcDir: string, projectRoot: string): string {
  return current.path.relative(projectRoot, srcDir);
}

export interface VirtualSourceResult {
  virtualSrcDir: string;
  cleanup: () => Promise<void>;
}

/**
 * Create a virtual source directory by copying src/ to dist/_bundle_src/src/
 *
 * This creates an isolated copy where CSS imports can be rewritten
 * without modifying the original source files.
 *
 * The virtual source maintains the same directory structure as the original project:
 * - dist/_bundle_src/src/app/...  (mirrors src/app/...)
 *
 * This allows functions that expect projectRoot/src/ to work correctly.
 *
 * @param options - Virtual source options
 * @returns Virtual source result with cleanup function (virtualSrcDir is the virtual "project root")
 */
export async function createVirtualSource(
  options: VirtualSourceOptions,
): Promise<VirtualSourceResult> {
  const { projectRoot, distDir, srcDir, changedFiles } = options;
  // Get the srcDir name relative to projectRoot (e.g., "src" or "source")
  const srcDirName = getSrcDirName(srcDir, projectRoot);
  // virtualSrcDir acts as the "project root" for the virtual source
  const virtualSrcDir = current.path.resolve(distDir, VIRTUAL_SRC_DIR);
  // virtualSrcSubdir is where files are actually copied (maintains srcDir structure)
  const virtualSrcSubdir = current.path.resolve(virtualSrcDir, srcDirName);

  vsLogger.debug(`Creating virtual source: ${virtualSrcDir}`);
  vsLogger.debug(`  Virtual src subdir: ${virtualSrcSubdir}`);

  // Check if virtual source already exists for incremental update
  const virtualSourceExists = await current.fs.exists(virtualSrcSubdir);

  if (changedFiles && changedFiles.size > 0 && virtualSourceExists) {
    // INCREMENTAL MODE: Only update changed files
    vsLogger.debug(`Incremental update: ${changedFiles.size} file(s) changed`);
    await incrementalCopySourceFiles(changedFiles, srcDir, virtualSrcSubdir);
    vsLogger.debug(
      `Virtual source updated incrementally: ${changedFiles.size} file(s)`,
    );
  } else {
    // FULL COPY MODE: First build or no changed files specified
    // Clean any existing virtual source
    try {
      await emptyDir(virtualSrcDir);
    } catch {
      // Directory may not exist yet
    }

    // Copy src/ to virtual source's src/ subdirectory
    // This maintains the same structure as original project
    await copySourceFiles(srcDir, virtualSrcSubdir, projectRoot);
    vsLogger.debug(`Virtual source created: ${virtualSrcDir}`);
  }

  return {
    virtualSrcDir,
    cleanup: async () => {
      vsLogger.debug(`Cleaning up virtual source: ${virtualSrcDir}`);
      try {
        await current.fs.remove(virtualSrcDir, { recursive: true });
        vsLogger.debug("Virtual source cleaned up");
      } catch (error) {
        vsLogger.warn("Failed to clean up virtual source:", { error });
      }
    },
  };
}

/**
 * Incrementally copy only changed source files to virtual directory
 * Used for fast rebuilds in watch mode
 */
async function incrementalCopySourceFiles(
  changedFiles: Set<string>,
  srcDir: string,
  virtualDir: string,
): Promise<void> {
  // JS/TS extensions from standards + json and css for bundling
  const relevantExtensions = [
    ...JS_FILE_EXTENSIONS.map((ext) => `.${ext}`),
    ".json",
    ".css",
  ];

  let copiedCount = 0;
  let deletedCount = 0;

  for (const filePath of changedFiles) {
    // Only process files within srcDir
    if (!filePath.startsWith(srcDir)) {
      continue;
    }

    // Check if file has relevant extension
    const ext = current.path.extname(filePath);
    if (!relevantExtensions.includes(ext)) {
      continue;
    }

    // Calculate target path
    const relativePath = current.path.relative(srcDir, filePath);
    const targetPath = current.path.resolve(virtualDir, relativePath);

    // Check if source file exists
    try {
      await current.fs.stat(filePath);
      // File exists - copy it
      await ensureDir(current.path.dirname(targetPath));
      await copy(filePath, targetPath, { overwrite: true });
      copiedCount++;
    } catch {
      // File was deleted - remove from virtual source
      try {
        await current.fs.remove(targetPath);
        deletedCount++;
      } catch {
        // Target doesn't exist, that's fine
      }
    }
  }

  if (copiedCount > 0 || deletedCount > 0) {
    vsLogger.debug(
      `Incremental update: ${copiedCount} copied, ${deletedCount} deleted`,
    );
  }
}

/**
 * Copy source files to virtual directory
 * Preserves directory structure, only copies relevant files
 */
async function copySourceFiles(
  srcDir: string,
  virtualDir: string,
  _projectRoot: string,
): Promise<void> {
  let copiedCount = 0;

  // JS/TS extensions from standards + json and css for bundling
  const validExtensions = [
    ...JS_FILE_EXTENSIONS.map((ext) => `.${ext}`),
    ".json",
    ".css",
  ];

  // Use @std/fs walk to include all file types (walkFiles only supports JS files)
  for await (const entry of walk(srcDir, { includeDirs: false })) {
    // Check extension
    const ext = current.path.extname(entry.path);
    if (!validExtensions.includes(ext)) {
      continue;
    }

    // Check ignore pattern
    const relativePath = current.path.relative(srcDir, entry.path);
    if (IGNORE_PATTERN.test(relativePath)) {
      continue;
    }

    // Calculate target path
    const targetPath = current.path.resolve(virtualDir, relativePath);

    // Ensure directory exists
    await current.fs.ensureDir(current.path.dirname(targetPath));

    // Copy file
    await copy(entry.path, targetPath);
    copiedCount++;
  }

  vsLogger.debug(`Copied ${copiedCount} source file(s) to virtual source`);
}

/**
 * Translate a path from original source to virtual source
 *
 * @param originalPath - Path in original src/ (e.g., /project/src/app/page.tsx)
 * @param srcDir - Original src directory (e.g., /project/src)
 * @param virtualSrcDir - Virtual "project root" (e.g., /project/dist/_bundle_src)
 * @param srcDirName - Name of src directory relative to project (e.g., "src")
 * @returns Path in virtual source (e.g., /project/dist/_bundle_src/src/app/page.tsx)
 */
export function translateToVirtualPath(
  originalPath: string,
  srcDir: string,
  virtualSrcDir: string,
  srcDirName?: string,
): string {
  const relativePath = current.path.relative(srcDir, originalPath);
  // Files are in virtualSrcDir/{srcDirName}/ to maintain project structure
  // If srcDirName not provided, derive from srcDir basename
  const actualSrcDirName = srcDirName ?? current.path.basename(srcDir);
  return current.path.resolve(virtualSrcDir, actualSrcDirName, relativePath);
}

/**
 * Translate a path from virtual source back to original source
 *
 * @param virtualPath - Path in virtual source (e.g., /project/dist/_bundle_src/src/app/page.tsx)
 * @param srcDir - Original src directory (e.g., /project/src)
 * @param virtualSrcDir - Virtual "project root" (e.g., /project/dist/_bundle_src)
 * @param srcDirName - Name of src directory relative to project (e.g., "src")
 * @returns Path in original src/ (e.g., /project/src/app/page.tsx)
 */
export function translateFromVirtualPath(
  virtualPath: string,
  srcDir: string,
  virtualSrcDir: string,
  srcDirName?: string,
): string {
  // Files are in virtualSrcDir/{srcDirName}/
  // If srcDirName not provided, derive from srcDir basename
  const actualSrcDirName = srcDirName ?? current.path.basename(srcDir);
  const virtualSrcSubdir = current.path.resolve(
    virtualSrcDir,
    actualSrcDirName,
  );
  const relativePath = current.path.relative(virtualSrcSubdir, virtualPath);
  return current.path.resolve(srcDir, relativePath);
}

/**
 * Translate client component paths to use virtual source
 * Also updates relativePath to match the virtual source structure
 */
export function translateClientComponents<
  T extends { filePath: string; relativePath: string },
>(
  components: T[],
  srcDir: string,
  virtualSrcDir: string,
): T[] {
  return components.map((component) => {
    const newFilePath = translateToVirtualPath(
      component.filePath,
      srcDir,
      virtualSrcDir,
    );
    // Update relativePath to include _bundle_src prefix
    // Original: src/app/icon.tsx -> New: _bundle_src/src/app/icon.tsx
    const newRelativePath = `${VIRTUAL_SRC_DIR}/${component.relativePath}`;
    return {
      ...component,
      filePath: newFilePath,
      relativePath: newRelativePath,
    };
  });
}
