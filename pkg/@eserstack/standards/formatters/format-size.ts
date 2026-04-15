// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

const BYTES_PER_KB = 1024;

/**
 * Format file size in bytes to human readable string.
 *
 * @param bytes - Size in bytes (must be >= 0)
 * @returns Human readable size string
 * @throws Error if bytes is negative or not a finite number
 *
 * @example
 * ```typescript
 * formatSize(500);        // "500.00 B"
 * formatSize(1536);       // "1.50 KB"
 * formatSize(1048576);    // "1.00 MB"
 * formatSize(1073741824); // "1.00 GB"
 * ```
 */
export const formatSize = (bytes: number): string => {
  if (!Number.isFinite(bytes) || bytes < 0) {
    throw new Error("Size must be a non-negative finite number");
  }
  const units = ["B", "KB", "MB", "GB"];
  let size = bytes;
  let unitIndex = 0;

  while (size >= BYTES_PER_KB && unitIndex < units.length - 1) {
    size /= BYTES_PER_KB;
    unitIndex++;
  }

  return `${size.toFixed(2)} ${units[unitIndex]}`;
};
