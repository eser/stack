// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * Provider types for kit recipe sources.
 *
 * @module
 */

export type ParsedSpec = {
  /** Original specifier string */
  readonly specifier: string;
  /** Provider name */
  readonly providerName: string;
  /** How many leading tar path components to strip on extraction */
  readonly stripComponents: number;
  /** Optional subpath to filter within the tarball */
  readonly subpath?: string;
};

export type Provider = {
  readonly name: string;

  /**
   * Parse a specifier string into extraction metadata.
   * @param specifier - Full specifier including prefix (e.g., "gh:owner/repo")
   */
  parse(specifier: string): ParsedSpec;

  /**
   * Fetch the template as a tarball ReadableStream.
   * @param parsed - Result of parse()
   * @returns Gzip-compressed tarball stream
   */
  fetch(parsed: ParsedSpec): Promise<ReadableStream<Uint8Array>>;
};
