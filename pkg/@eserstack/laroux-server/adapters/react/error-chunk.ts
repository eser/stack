// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * Builds the value of an RSC "E" (error) chunk.
 *
 * E chunks are streamed to the browser on the public /rsc and page routes, so
 * they carry only the error message. The stack names server file paths and
 * dependency internals; it stays in the server log, where the caller writes
 * the full error.
 */
export const toClientErrorValue = (error: unknown): { message: string } => ({
  message: error instanceof Error ? error.message : String(error),
});
