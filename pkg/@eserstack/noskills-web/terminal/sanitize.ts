// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * Trust-boundary sanitizer for actions arriving over the network.
 *
 * `mux.Action` is shared by two very different callers. The local TUI is the
 * user driving their own terminal: naming a command to run is the entire point,
 * and restricting it there would be nonsense. A browser on the other end of a
 * WebSocket is a different trust level entirely -- there, `newTab` carrying
 * `command` / `args` / `cwd` is a request to execute arbitrary argv with the
 * server process's full environment.
 *
 * So the capability stays in the engine and is stripped at ingress: a remote
 * client names a pane *kind*, and the server resolves what that actually runs.
 * This is defence in depth behind the token and Origin checks in `../auth.ts`,
 * not a replacement for them.
 *
 * @module
 */

import type * as mux from "@eserstack/mux";
import type { Action } from "@eserstack/mux/engine";

/**
 * Strip process-spawning fields from an action received over the network.
 *
 * Returns the action unchanged when it carries no such fields, so the common
 * case allocates nothing.
 */
export const sanitizeRemoteAction = (action: Action): Action => {
  if (action.type !== "newTab") {
    return action;
  }

  if (
    action.command === undefined &&
    action.args === undefined &&
    action.cwd === undefined
  ) {
    return action;
  }

  // Keep only the fields a remote client is allowed to choose. `kind` selects
  // between the configured pane flavours; the runner resolves the argv.
  return {
    type: "newTab",
    ...(action.kind === undefined ? {} : { kind: action.kind }),
    ...(action.title === undefined ? {} : { title: action.title }),
    ...(action.meta === undefined ? {} : { meta: action.meta }),
  };
};

/** Apply {@link sanitizeRemoteAction} to any frontend message that carries one. */
export const sanitizeRemoteMessage = (
  msg: mux.FrontendToServer,
): mux.FrontendToServer => {
  if (msg.t !== "action") {
    return msg;
  }

  const sanitized = sanitizeRemoteAction(msg.action);

  return sanitized === msg.action ? msg : { ...msg, action: sanitized };
};
