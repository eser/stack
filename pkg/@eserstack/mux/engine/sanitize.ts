// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * Trust-boundary sanitizer for actions arriving over the network.
 *
 * {@link Action} is shared by two very different callers. The local TUI is the
 * user driving their own terminal: naming a command to run is the entire point,
 * and restricting it there would be nonsense. A client on the far end of a
 * socket is a different trust level entirely — there, an action carrying
 * `command` / `args` / `cwd` is a request to execute arbitrary argv with the
 * server process's full environment.
 *
 * So the capability stays in the engine and is stripped at ingress: a remote
 * client names a pane *kind*, and the server's spawn resolver decides what that
 * actually runs. This is defence in depth behind whatever authentication the
 * transport applies, not a replacement for it.
 *
 * It lives in the engine rather than in one frontend because there is more than
 * one remote path into a mux server, and a sanitizer only one of them calls is
 * not a trust boundary. It previously sat in `@eserstack/noskills-web` and was
 * applied only on the in-process WebSocket bridge; the daemon relayed frames to
 * `mux-worker` untouched.
 *
 * @module
 */

import type { Action } from "./types.ts";
import type { FrontendToServer } from "../ipc/protocol.ts";

/**
 * Strip process-spawning fields from an action received over the network.
 *
 * Returns the action unchanged when it carries no such fields, so the common
 * case allocates nothing.
 *
 * Both spawning actions are covered. `newPane` carries the same
 * `command`/`args`/`cwd` triple as `newTab` and was previously passed through
 * untouched, so the guard on `newTab` could be walked straight around by
 * splitting a pane instead of opening a tab.
 */
export const sanitizeRemoteAction = (action: Action): Action => {
  if (action.type !== "newTab" && action.type !== "newPane") {
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
  // between the configured pane flavours; the resolver decides the argv.
  const base = {
    ...(action.kind === undefined ? {} : { kind: action.kind }),
    ...(action.title === undefined ? {} : { title: action.title }),
    ...(action.meta === undefined ? {} : { meta: action.meta }),
  };

  if (action.type === "newPane") {
    return {
      type: "newPane",
      ...(action.direction === undefined
        ? {}
        : { direction: action.direction }),
      ...base,
    };
  }

  return { type: "newTab", ...base };
};

/** Apply {@link sanitizeRemoteAction} to any frontend message that carries one. */
export const sanitizeRemoteMessage = (
  msg: FrontendToServer,
): FrontendToServer => {
  if (msg.t !== "action") {
    return msg;
  }

  const sanitized = sanitizeRemoteAction(msg.action);

  return sanitized === msg.action ? msg : { ...msg, action: sanitized };
};

/**
 * The inbound half of a transport, which is all sanitizing needs to see.
 *
 * Declared structurally rather than importing the full `Transport` type so this
 * module stays in the engine, with no dependency on the server package.
 */
export type InboundTransport<T> = {
  onMessage(handler: (msg: T) => void): void;
};

/**
 * Wrap a transport so every inbound message is sanitized before it reaches the
 * server.
 *
 * This exists because "remember to call the sanitizer" is not a trust boundary.
 * There are two remote routes into a mux server and only one of them called it;
 * the daemon's WebTransport route relayed frames through untouched for as long
 * as it has existed. Wrapping the transport puts the filter where the untrusted
 * bytes arrive, so a new remote route has to actively opt out of it rather than
 * silently forget to opt in.
 */
export const sanitizeRemoteTransport = <
  T extends InboundTransport<FrontendToServer>,
>(
  transport: T,
): T => ({
  ...transport,
  onMessage: (handler: (msg: FrontendToServer) => void): void => {
    transport.onMessage((msg) => handler(sanitizeRemoteMessage(msg)));
  },
});
