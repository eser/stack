// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * GitHub provider for scaffolding templates
 *
 * Downloads templates from GitHub repositories using the codeload tarball API.
 *
 * @module
 */

import type { GitHubRef, Provider, ProviderRef } from "./types.ts";
import { extractTarball } from "../tar.ts";

const DEFAULT_REF = "main";

/**
 * Parse a GitHub specifier into a GitHubRef
 *
 * Supported formats:
 * - owner/repo
 * - owner/repo#ref
 * - owner/repo/path
 * - owner/repo/path#ref
 *
 * @param specifier - The specifier without provider prefix
 */
const parseGitHubSpecifier = (specifier: string): GitHubRef => {
  // Split off the ref (branch/tag/commit) if present
  const [pathPart, ref] = specifier.split("#");
  if (pathPart === undefined) {
    throw new Error(`Invalid GitHub specifier: ${specifier}`);
  }

  const parts = pathPart.split("/");

  if (parts.length < 2) {
    throw new Error(
      `Invalid GitHub specifier: ${specifier}. Expected format: owner/repo[/path][#ref]`,
    );
  }

  const [owner, repo, ...pathParts] = parts;

  if (owner === undefined || repo === undefined) {
    throw new Error(
      `Invalid GitHub specifier: ${specifier}. Expected format: owner/repo[/path][#ref]`,
    );
  }

  return {
    provider: "github",
    raw: specifier,
    owner,
    repo,
    ref: ref ?? DEFAULT_REF,
    path: pathParts.length > 0 ? pathParts.join("/") : undefined,
  };
};

/**
 * Fetch a template from GitHub to the target directory
 *
 * @param ref - Parsed GitHub reference
 * @param targetDir - Directory to extract the template into
 */
const fetchGitHub = async (
  ref: ProviderRef,
  targetDir: string,
): Promise<void> => {
  const githubRef = ref as GitHubRef;
  const { owner, repo, ref: gitRef, path: subpath } = githubRef;

  // GitHub codeload URL for tarball download
  const tarballUrl =
    `https://codeload.github.com/${owner}/${repo}/tar.gz/${gitRef}`;

  const response = await fetch(tarballUrl);

  if (!response.ok) {
    if (response.status === 404) {
      throw new Error(
        `Repository not found: ${owner}/${repo} (ref: ${gitRef})`,
      );
    }
    throw new Error(
      `Failed to fetch template: ${response.status} ${response.statusText}`,
    );
  }

  if (response.body === null) {
    throw new Error("Response body is empty");
  }

  // GitHub tarballs have a root folder named "{repo}-{ref}"
  // We need to strip this component when extracting
  await extractTarball(response.body, targetDir, {
    stripComponents: 1,
    subpath,
  });
};

/**
 * GitHub provider instance
 */
export const githubProvider: Provider = {
  name: "github",
  prefixes: ["github", "gh"],
  isDefault: true,

  parse: parseGitHubSpecifier,
  fetch: fetchGitHub,
};
