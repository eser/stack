// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * GitHub provider for kit recipe sources.
 *
 * Fetches templates from GitHub repositories using the codeload tarball API
 * and returns a raw ReadableStream for the consumer to extract.
 *
 * @module
 */

import type { ParsedSpec, Provider } from "./types.ts";

const TARBALL_DOWNLOAD_TIMEOUT_MS = 120_000;
const DEFAULT_REF = "main";

type GitHubParsedSpec = ParsedSpec & {
  readonly owner: string;
  readonly repo: string;
  readonly ref: string;
};

/**
 * Parse a GitHub specifier into extraction metadata.
 *
 * Supported formats:
 * - owner/repo
 * - gh:owner/repo
 * - github:owner/repo
 * - owner/repo#ref
 * - owner/repo/sub/path
 * - owner/repo/sub/path#ref
 */
const parseGitHub = (specifier: string): GitHubParsedSpec => {
  const raw = specifier.replace(/^(?:gh|github):/, "");

  const [pathPart, ref] = raw.split("#");
  if (pathPart === undefined) {
    throw new Error(`Invalid GitHub specifier: ${specifier}`);
  }

  const parts = pathPart.split("/");
  if (parts.length < 2) {
    throw new Error(
      `Invalid GitHub specifier: ${specifier}. Expected format: [gh:|github:]owner/repo[/path][#ref]`,
    );
  }

  const [owner, repo, ...pathParts] = parts;

  // Reject empty segments too (e.g. "gh:/repo" splits to ["", "repo"]), not
  // just missing ones — an empty owner or repo is not a valid specifier.
  if (!owner || !repo) {
    throw new Error(
      `Invalid GitHub specifier: ${specifier}. Expected format: [gh:|github:]owner/repo[/path][#ref]`,
    );
  }

  return {
    specifier,
    providerName: "github",
    stripComponents: 1,
    owner,
    repo,
    ref: ref ?? DEFAULT_REF,
    subpath: pathParts.length > 0 ? pathParts.join("/") : undefined,
  };
};

/**
 * Fetch a template tarball from GitHub, returning the raw stream.
 */
const fetchGitHub = async (
  parsed: ParsedSpec,
): Promise<ReadableStream<Uint8Array>> => {
  const { owner, repo, ref } = parsed as GitHubParsedSpec;

  const tarballUrl = `https://codeload.github.com/${owner}/${repo}/tar.gz/${ref}`;

  // Covers the whole download: the returned body is read under the same
  // signal.
  const response = await fetch(tarballUrl, {
    signal: AbortSignal.timeout(TARBALL_DOWNLOAD_TIMEOUT_MS),
  });

  if (!response.ok) {
    // The body is not read; cancel it so the connection is released.
    await response.body?.cancel();
    if (response.status === 404) {
      throw new Error(
        `download ${tarballUrl}: HTTP 404; check that the repository ${owner}/${repo} and the ref ${ref} exist`,
      );
    }
    throw new Error(
      `download ${tarballUrl}: HTTP ${response.status} ${response.statusText}; retry later, or check that the repository and ref exist`,
    );
  }

  if (response.body === null) {
    throw new Error(
      `download ${tarballUrl}: the response has no body; retry the clone`,
    );
  }

  return response.body;
};

export const provider: Provider = Object.freeze({
  name: "github",
  parse: parseGitHub,
  fetch: fetchGitHub,
});
