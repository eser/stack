// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * Re-export of the mux trust-boundary sanitizer.
 *
 * The implementation moved into `@eserstack/mux/engine`, next to the `Action`
 * type it strips, because there is more than one remote path into a mux server
 * and a sanitizer that only one of them calls is not a trust boundary: the
 * daemon's WebTransport route relayed frames to `mux-worker` untouched while
 * this module guarded the browser WebSocket.
 *
 * @module
 */

export {
  sanitizeRemoteAction,
  sanitizeRemoteMessage,
} from "@eserstack/mux/engine";
