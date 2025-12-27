// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * Tailwind CSS processor with standalone binary management.
 *
 * Provides utilities for:
 * - Downloading and caching Tailwind CSS standalone binary
 * - Processing CSS with Tailwind CLI
 * - Watch mode for development
 *
 * @module
 */

import * as posix from "@std/path/posix";
import * as fs from "@std/fs";
import type { TailwindProcessOptions, TailwindWatchOptions } from "./types.ts";
import { transformWithLightningCss } from "./lightning.ts";

/** Default Tailwind CSS version for standalone binary. */
export const DEFAULT_TAILWIND_VERSION = "4.1.17";

/**
 * Get platform-specific Tailwind CSS standalone binary name.
 *
 * @returns Binary name for current platform
 */
export function getTailwindBinaryName(): string {
  const { os, arch } = Deno.build;

  let platform: string;
  if (os === "darwin") {
    platform = arch === "aarch64" ? "macos-arm64" : "macos-x64";
  } else if (os === "linux") {
    platform = arch === "aarch64" ? "linux-arm64" : "linux-x64";
  } else if (os === "windows") {
    platform = arch === "aarch64" ? "windows-arm64.exe" : "windows-x64.exe";
  } else {
    throw new Error(`Unsupported platform: ${os}-${arch}`);
  }

  return `tailwindcss-${platform}`;
}

/**
 * Get the download URL for Tailwind CSS standalone binary.
 *
 * @param version - Tailwind CSS version
 * @returns Download URL
 */
export function getTailwindDownloadUrl(
  version: string = DEFAULT_TAILWIND_VERSION,
): string {
  const binaryName = getTailwindBinaryName();
  return `https://github.com/tailwindlabs/tailwindcss/releases/download/v${version}/${binaryName}`;
}

/**
 * Ensure Tailwind CSS standalone binary is available.
 *
 * Downloads it if not present, caches for future use.
 *
 * @param projectRoot - Project root directory
 * @param version - Tailwind CSS version
 * @returns Path to the Tailwind binary
 */
export async function ensureTailwindBinary(
  projectRoot: string,
  version: string = DEFAULT_TAILWIND_VERSION,
): Promise<string> {
  const binaryName = getTailwindBinaryName();
  const binDir = posix.resolve(projectRoot, ".bin");
  const binPath = posix.resolve(binDir, binaryName);

  // Check if binary already exists and is executable
  try {
    await Deno.stat(binPath);
    return binPath;
  } catch {
    // Binary doesn't exist, download it
  }

  // Ensure .bin directory exists
  await fs.ensureDir(binDir);

  // Download from GitHub releases
  const url = getTailwindDownloadUrl(version);

  const response = await fetch(url);
  if (!response.ok) {
    // Fallback: try to use npm-based binary if available
    const npmBinary = posix.resolve(
      projectRoot,
      "node_modules/.bin/tailwindcss",
    );
    try {
      await Deno.stat(npmBinary);
      return npmBinary;
    } catch {
      throw new Error(
        `Failed to download Tailwind standalone binary (HTTP ${response.status}) and no npm fallback available`,
      );
    }
  }

  const binary = await response.arrayBuffer();
  await Deno.writeFile(binPath, new Uint8Array(binary));

  // Make binary executable (Unix-like systems)
  if (Deno.build.os !== "windows") {
    await Deno.chmod(binPath, 0o755);
  }

  return binPath;
}

/**
 * Process CSS file with Tailwind CSS.
 *
 * Uses the standalone CLI which works without Node.js.
 * Optionally post-processes with Lightning CSS for advanced optimization.
 *
 * @param options - Processing options
 * @param postProcess - Whether to post-process with Lightning CSS (default: true)
 * @returns Processed CSS content
 */
export async function processTailwindCss(
  options: TailwindProcessOptions,
  postProcess: boolean = true,
): Promise<string> {
  const { input, output, minify = false, projectRoot, version } = options;

  // Check if input file exists
  if (!(await fs.exists(input))) {
    throw new Error(`CSS input file not found: ${input}`);
  }

  // Ensure output directory exists
  const outputDir = posix.dirname(output);
  await fs.ensureDir(outputDir);

  // Get Tailwind standalone binary (downloads if needed)
  const tailwindBin = await ensureTailwindBinary(projectRoot, version);

  const args = [
    "--input",
    input,
    "--output",
    output,
    "--cwd",
    projectRoot,
    "--no-color",
  ];

  if (minify) {
    args.push("--minify");
  }

  // Run Tailwind CLI
  const command = new Deno.Command(tailwindBin, {
    args,
    stdout: "piped",
    stderr: "piped",
  });

  const process = command.spawn();
  const { code, stderr } = await process.output();

  if (code !== 0) {
    const decoder = new TextDecoder();
    const stderrText = decoder.decode(stderr);
    throw new Error(`Tailwind CSS processing failed: ${stderrText}`);
  }

  // Read output CSS
  let cssContent = await Deno.readTextFile(output);

  // Post-process with Lightning CSS for advanced optimization
  if (postProcess) {
    const result = transformWithLightningCss(cssContent, {
      filename: posix.basename(output),
      minify,
    });
    cssContent = result.code;
    await Deno.writeTextFile(output, cssContent);
  }

  return cssContent;
}

/**
 * Process CSS with Tailwind in watch mode for development.
 *
 * Spawns a long-running Tailwind CLI process in watch mode.
 *
 * @param options - Watch options
 * @returns Process handle with stop method
 */
export async function watchTailwindCss(
  options: TailwindWatchOptions,
): Promise<{ stop: () => void }> {
  const { input, output, minify = false, projectRoot, version, onChange } =
    options;

  // Get Tailwind standalone binary (downloads if needed)
  const tailwindBin = await ensureTailwindBinary(projectRoot, version);

  const args = [
    "--input",
    input,
    "--output",
    output,
    "--cwd",
    projectRoot,
    "--watch",
    "--no-color",
  ];

  if (minify) {
    args.push("--minify");
  }

  // Spawn watch process
  const command = new Deno.Command(tailwindBin, {
    args,
    stdout: "piped",
    stderr: "piped",
  });

  const process = command.spawn();

  // Log output in background and trigger onChange
  (async () => {
    const decoder = new TextDecoder();
    for await (const chunk of process.stdout) {
      const text = decoder.decode(chunk);
      if (text.includes("Done in")) {
        // Tailwind finished rebuilding
        if (onChange !== undefined) {
          await onChange(output);
        }
      }
    }
  })();

  return {
    stop: () => {
      process.kill("SIGTERM");
    },
  };
}

/**
 * Expand Tailwind @apply directives in CSS content.
 *
 * Useful for CSS Modules that use @apply.
 *
 * @param cssContent - CSS content with @apply directives
 * @param projectRoot - Project root for Tailwind config
 * @param referenceFile - Optional CSS file to @reference for utilities
 * @returns CSS with expanded utilities
 */
export async function expandTailwindApply(
  cssContent: string,
  projectRoot: string,
  referenceFile?: string,
): Promise<string> {
  // Check if CSS contains @apply directives
  if (!cssContent.includes("@apply")) {
    return cssContent;
  }

  // Auto-inject @reference directive if provided
  let processedContent = cssContent;
  if (referenceFile !== undefined && !/@reference\s+/m.test(cssContent)) {
    processedContent = `@reference "${referenceFile}";\n\n${cssContent}`;
  }

  // Create temp files for processing
  const tempDir = await Deno.makeTempDir({ prefix: "tailwind-apply-" });
  const tempInput = posix.join(tempDir, "input.css");
  const tempOutput = posix.join(tempDir, "output.css");

  try {
    // Write content to temp file
    await Deno.writeTextFile(tempInput, processedContent);

    // Get Tailwind standalone binary (downloads if needed)
    const tailwindBin = await ensureTailwindBinary(projectRoot);

    const command = new Deno.Command(tailwindBin, {
      args: [
        "--input",
        tempInput,
        "--output",
        tempOutput,
        "--cwd",
        projectRoot,
        "--no-color",
      ],
      stdout: "piped",
      stderr: "piped",
      env: {
        ...Deno.env.toObject(),
        NO_COLOR: "1",
        FORCE_COLOR: "0",
      },
    });

    const process = command.spawn();
    const { code, stderr } = await process.output();

    if (code !== 0) {
      const decoder = new TextDecoder();
      const stderrText = decoder.decode(stderr);
      throw new Error(`Tailwind @apply expansion failed: ${stderrText}`);
    }

    // Read expanded CSS
    return await Deno.readTextFile(tempOutput);
  } finally {
    // Cleanup temp files
    try {
      await Deno.remove(tempDir, { recursive: true });
    } catch {
      // Ignore cleanup errors
    }
  }
}
