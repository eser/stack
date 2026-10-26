// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * Manager types.
 *
 * The PTY/widget/buffer fields are gone — @eserstack/mux owns the live panes.
 * What remains is the noskills-specific tab metadata the spec-list and monitor
 * decorations render. A tab's id is the mux tab id.
 *
 * @module
 */

export type ManagerTab = {
  readonly id: string;
  readonly spec: string | null;
  readonly mode: "spec" | "free";
  readonly sessionId: string;
  readonly phase: string | null;
};
