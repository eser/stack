// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * Manager types — shared across all manager modules.
 *
 * @module
 */

import type * as exec from "@eser/shell/exec";
import type * as tui from "@eser/shell/tui";

export type ManagerTab = {
  readonly id: string;
  readonly spec: string | null;
  readonly mode: "spec" | "free";
  readonly sessionId: string;
  process: exec.PtyProcess | null;
  buffer: string[];
  widget: tui.VTermWidget | null;
  active: boolean;
  phase: string | null;
};

export type ManagerState = {
  tabs: ManagerTab[];
  selectedTabIndex: number;
  focus: "list" | "terminal";
  running: boolean;
  specsVisible: boolean;
  monitorVisible: boolean;
};

export const createInitialState = (): ManagerState => ({
  tabs: [],
  selectedTabIndex: -1,
  focus: "list",
  running: true,
  specsVisible: true,
  monitorVisible: true,
});
