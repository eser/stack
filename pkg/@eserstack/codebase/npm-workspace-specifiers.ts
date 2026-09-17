// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * Resolves `workspace:` specifiers for a manifest that is published from
 * outside the workspace.
 *
 * `pnpm publish` rewrites `workspace:*` to the member's exact version — but
 * only for a package it recognises as a workspace member. The npm bundles are
 * built into `dist/` directories and published from there, so their generated
 * manifests never get that rewrite and would ship the protocol verbatim, which
 * npm, Bun and Deno consumers cannot install. This applies the same rule pnpm
 * does: `workspace:*` becomes the exact version, `workspace:^` and
 * `workspace:~` become caret and tilde ranges, and `workspace:<range>` keeps
 * the range.
 *
 * Every workspace member shares the root VERSION, so one version serves all.
 *
 * @module
 */

const WORKSPACE_PROTOCOL = "workspace:";

/**
 * Returns a copy of `dependencies` with every `workspace:` specifier replaced
 * by the concrete specifier `pnpm publish` would emit for `version`; other
 * entries are kept as they are.
 */
export const resolveWorkspaceSpecifiers = (
  dependencies: Readonly<Record<string, string>> | undefined,
  version: string,
): Record<string, string> | undefined => {
  if (dependencies === undefined) {
    return undefined;
  }

  return Object.fromEntries(
    Object.entries(dependencies).map(([name, spec]) => {
      if (!spec.startsWith(WORKSPACE_PROTOCOL)) {
        return [name, spec];
      }

      const range = spec.slice(WORKSPACE_PROTOCOL.length);

      switch (range) {
        case "*":
        case "":
          return [name, version];
        case "^":
        case "~":
          return [name, `${range}${version}`];
        default:
          return [name, range];
      }
    }),
  );
};
