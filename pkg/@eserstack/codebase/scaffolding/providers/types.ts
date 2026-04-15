// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * Provider types for scaffolding template sources
 *
 * @module
 */

/**
 * Base provider reference (extended by specific providers)
 */
export type ProviderRef = {
  /** Provider name (e.g., "github", "npm", "jsr") */
  provider: string;
  /** Original specifier without prefix */
  raw: string;
};

/**
 * GitHub-specific reference
 */
export type GitHubRef = ProviderRef & {
  provider: "github";
  /** Repository owner */
  owner: string;
  /** Repository name */
  repo: string;
  /** Branch, tag, or commit (default: main) */
  ref?: string;
  /** Subdirectory path within the repository */
  path?: string;
};

/**
 * Provider interface for template sources
 */
export type Provider = {
  /** Provider name */
  readonly name: string;
  /** URL prefixes this provider handles (e.g., ["github", "gh"]) */
  readonly prefixes: readonly string[];
  /** Whether this is the default provider when no prefix is specified */
  readonly isDefault?: boolean;

  /**
   * Parse a specifier string into a provider reference
   * @param specifier - The specifier without prefix (e.g., "owner/repo#ref")
   */
  parse(specifier: string): ProviderRef;

  /**
   * Fetch template from the provider to the target directory
   * @param ref - The parsed provider reference
   * @param targetDir - Directory to extract the template into
   */
  fetch(ref: ProviderRef, targetDir: string): Promise<void>;
};

/**
 * Result of parsing a specifier
 */
export type ParsedSpecifier = {
  /** The resolved provider */
  provider: Provider;
  /** The parsed reference */
  ref: ProviderRef;
};
