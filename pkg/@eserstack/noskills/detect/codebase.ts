// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * Detect project traits — language, framework, CI, test runner.
 *
 * @module
 */

import type * as schema from "../state/schema.ts";
import { runtime } from "@eserstack/standards/cross-runtime";

// =============================================================================
// Detection Helpers
// =============================================================================

const pathExists = async (path: string): Promise<boolean> => {
  try {
    await runtime.fs.stat(path);
    return true;
  } catch {
    return false;
  }
};

const readJsonField = async (
  path: string,
  field: string,
): Promise<Record<string, unknown> | null> => {
  try {
    const content = await runtime.fs.readTextFile(path);
    const parsed = JSON.parse(content);
    return parsed[field] ?? null;
  } catch {
    return null;
  }
};

// =============================================================================
// Language Detection
// =============================================================================

const detectLanguages = async (root: string): Promise<readonly string[]> => {
  const languages: string[] = [];

  if (
    await pathExists(`${root}/package.json`) ||
    await pathExists(`${root}/deno.json`)
  ) {
    languages.push("typescript");
  }
  if (await pathExists(`${root}/go.mod`)) {
    languages.push("go");
  }
  if (await pathExists(`${root}/Cargo.toml`)) {
    languages.push("rust");
  }
  if (
    await pathExists(`${root}/pyproject.toml`) ||
    await pathExists(`${root}/setup.py`)
  ) {
    languages.push("python");
  }

  return languages;
};

// =============================================================================
// Framework Detection
// =============================================================================

const detectFrameworks = async (root: string): Promise<readonly string[]> => {
  const frameworks: string[] = [];
  const deps = await readJsonField(`${root}/package.json`, "dependencies");

  if (deps !== null) {
    if ("react" in deps) {
      frameworks.push("react");
    }
    if ("vue" in deps) {
      frameworks.push("vue");
    }
    if ("svelte" in deps) {
      frameworks.push("svelte");
    }
    if ("next" in deps) {
      frameworks.push("nextjs");
    }
    if ("express" in deps) {
      frameworks.push("express");
    }
    if ("hono" in deps) {
      frameworks.push("hono");
    }
  }

  return frameworks;
};

// =============================================================================
// CI Detection
// =============================================================================

const detectCI = async (root: string): Promise<readonly string[]> => {
  const ci: string[] = [];

  if (await pathExists(`${root}/.github/workflows`)) {
    ci.push("github-actions");
  }
  if (await pathExists(`${root}/.gitlab-ci.yml`)) {
    ci.push("gitlab-ci");
  }
  if (await pathExists(`${root}/Jenkinsfile`)) {
    ci.push("jenkins");
  }
  if (await pathExists(`${root}/.circleci`)) {
    ci.push("circleci");
  }

  return ci;
};

// =============================================================================
// Test Runner Detection
// =============================================================================

const detectTestRunner = async (root: string): Promise<string | null> => {
  if (await pathExists(`${root}/deno.json`)) {
    return "deno";
  }

  const deps = await readJsonField(`${root}/package.json`, "devDependencies");

  if (deps !== null) {
    if ("vitest" in deps) {
      return "vitest";
    }
    if ("jest" in deps) {
      return "jest";
    }
    if ("playwright" in deps) {
      return "playwright";
    }
  }

  return null;
};

// =============================================================================
// Full Detection
// =============================================================================

export const detectProject = async (
  root: string,
): Promise<schema.ProjectTraits> => {
  const [languages, frameworks, ci, testRunner] = await Promise.all([
    detectLanguages(root),
    detectFrameworks(root),
    detectCI(root),
    detectTestRunner(root),
  ]);

  return { languages, frameworks, ci, testRunner };
};
