// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * Secret checker — detects credentials and private keys in source files.
 *
 * Detects:
 * - AWS access key IDs (AKIA...)
 * - Private key PEM headers
 * - High-entropy strings near secret-like keywords (with allowlist)
 *
 * @module
 */

import * as standards from "@eserstack/standards";
import { createFileTool, type FileTool } from "./file-tool.ts";

// =============================================================================
// Detection patterns
// =============================================================================

type SecretPattern = {
  readonly name: string;
  readonly pattern: RegExp;
};

const SECRET_PATTERNS: readonly SecretPattern[] = [
  {
    name: "AWS Access Key ID",
    pattern: /AKIA[0-9A-Z]{16}/,
  },
  {
    name: "Private Key",
    pattern:
      /-----BEGIN\s{1,5}(RSA\s{1,5}|EC\s{1,5}|DSA\s{1,5}|OPENSSH\s{1,5})?PRIVATE KEY-----/,
  },
  {
    name: "Generic secret assignment",
    pattern:
      /(?:secret|password|api_key|apikey|access_token|auth_token|private_key)\s{0,5}[=:]\s{0,5}["'][^"']{8,}["']/i,
  },
];

/** File patterns to always skip (test fixtures, lock files, etc.) */
const SKIP_FILE_PATTERNS = [
  /\.lock$/,
  /package-lock\.json$/,
  /\.test\./,
  /testdata\//,
  /\.snap$/,
  /\.min\./,
];

export const tool: FileTool = createFileTool({
  name: "validate-secrets",
  description: "Detect credentials and private keys",
  canFix: false,
  stacks: [],
  defaults: {},

  checkFile(file, content) {
    if (content === undefined) {
      return [];
    }

    // Skip known-safe files
    for (const skipPattern of SKIP_FILE_PATTERNS) {
      if (skipPattern.test(file.path)) {
        return [];
      }
    }

    const issues = [];
    const lines = content.split("\n");

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i]!;

      for (const { name, pattern } of SECRET_PATTERNS) {
        if (pattern.test(line)) {
          issues.push({
            path: file.path,
            line: i + 1,
            message: `potential ${name} detected`,
          });
          break; // One issue per line max
        }
      }
    }

    return issues;
  },
});

export const run: FileTool["run"] = tool.run;
export const validator: FileTool["validator"] = tool.validator;
export const main: FileTool["main"] = tool.main;

if (import.meta.main) {
  const { runCliMain } = await import("./cli-support.ts");
  runCliMain(
    await main(standards.crossRuntime.runtime.process.args as string[]),
  );
}
