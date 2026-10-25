// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

import * as bdd from "@std/testing/bdd";
import * as assert from "@eserstack/test-kit/assert";
import * as persistence from "@eserstack/noskills/persistence";
import * as noskills from "@eserstack/noskills/mod";
import * as dashboard from "@eserstack/noskills/dashboard";
import { runtime } from "@eserstack/standards/cross-runtime";
import type * as mux from "@eserstack/mux";
import * as pages from "./routes/pages.ts";
import * as api from "./routes/api.ts";
import * as sse from "./routes/sse.ts";
import * as requestContext from "./request-context.ts";
import * as server from "./server.ts";
import * as muxHost from "./terminal/mux-host.ts";
import * as components from "./templates/components.ts";
import * as dashboardTemplate from "./templates/dashboard.ts";
import * as specDetail from "./templates/spec-detail.ts";

// =============================================================================
// Helpers
// =============================================================================

let tempCounter = 0;
const makeTempDir = async (): Promise<string> => {
  const base = await runtime.fs.makeTempDir();
  const dir = `${base}/noskills-web-test-${tempCounter++}`;
  await persistence.scaffoldEserDir(dir);
  // Write minimal manifest
  await persistence.writeManifest(
    dir,
    noskills.createInitialManifest(
      [],
      ["claude-code"],
      [],
      { languages: ["typescript"], frameworks: [], ci: [], testRunner: null },
    ),
  );
  await persistence.writeState(dir, noskills.createInitialState());
  return dir;
};

// MuxHost options that keep tab-creation tests pure API-contract checks: a no-op
// PTY host (no real spawn) and a stubbed agent discovery (the real one shells
// out via `where`/`which`, which goes through the native ajan FFI). This mirrors
// the fake host used in @eserstack/mux's own server tests. Pass `writes` to
// collect what reaches the PTYs.
const fakeHostOpts = (writes: string[] = []): {
  createHost: (cb: mux.PtyHostCallbacks) => mux.PtyHost;
  resolveCommand: () => Promise<string>;
} => ({
  createHost: () => ({
    spawn: () => Promise.resolve(),
    write: (_pane, data) => {
      writes.push(data);
    },
    resize: () => {},
    kill: () => {},
    forget: () => {},
    killAll: () => Promise.resolve(),
    has: () => true,
  }),
  resolveCommand: () => Promise.resolve("claude"),
});

/** One error record a {@link recordingLogger} kept. */
type ErrorRecord = {
  readonly message: string;
  readonly fields: Readonly<Record<string, unknown>>;
};

/** A logger that keeps its error records in `records`, with their fields. */
const recordingLogger = (
  records: ErrorRecord[],
  fields: Readonly<Record<string, unknown>> = {},
): requestContext.RequestLogger => ({
  with: (properties) => recordingLogger(records, { ...fields, ...properties }),
  error: (message) => {
    records.push({ message, fields });
    return Promise.resolve();
  },
});

/** The context of a POST to the action route, logging into `records`. */
const actionContext = (
  specName: string,
  action: string,
  records: ErrorRecord[] = [],
): requestContext.RequestContext =>
  requestContext.createRequestContext(
    new Request(`http://localhost:3000/api/spec/${specName}/${action}`, {
      method: "POST",
    }),
    recordingLogger(records),
  );

/** Writes a spec directory and its state, as `noskills spec new` leaves it. */
const writeSpec = async (
  root: string,
  specName: string,
  state: ReturnType<typeof noskills.createInitialState>,
): Promise<void> => {
  await runtime.fs.mkdir(`${root}/.eser/specs/${specName}`, {
    recursive: true,
  });
  await persistence.writeSpecState(root, specName, state);
};

/** A spec state that has reached SPEC_PROPOSAL. */
const proposedSpec = (
  specName: string,
): ReturnType<typeof noskills.createInitialState> => {
  let state = noskills.createInitialState();
  state = noskills.machine.startSpec(
    state,
    specName,
    `spec/${specName}`,
    "test",
  );
  state = noskills.machine.completeDiscovery(state);

  return noskills.machine.approveDiscoveryReview(state);
};

// =============================================================================
// API: GET /api/state
// =============================================================================

bdd.describe("GET /api/state", () => {
  bdd.it("returns valid DashboardState JSON", async () => {
    const root = await makeTempDir();
    const response = await api.handleGetState(root);

    assert.assertEquals(response.status, 200);
    const data = await response.json();
    assert.assert(Array.isArray(data.specs));
    assert.assert("currentUser" in data);
    assert.assert("recentEvents" in data);
  });

  bdd.it("includes specs when they exist", async () => {
    const root = await makeTempDir();

    // Create a spec
    const state = noskills.createInitialState();
    const specState = noskills.machine.startSpec(
      state,
      "test-web",
      "spec/test-web",
      "Web test spec",
    );
    await runtime.fs.mkdir(`${root}/.eser/specs/test-web`, { recursive: true });
    await persistence.writeSpecState(root, "test-web", specState);

    const response = await api.handleGetState(root);
    const data = await response.json();

    assert.assertEquals(data.specs.length, 1);
    assert.assertEquals(data.specs[0].name, "test-web");
  });
});

// =============================================================================
// Dashboard page: GET /
// =============================================================================

bdd.describe("GET / (dashboard page)", () => {
  bdd.it("returns HTML with spec list", async () => {
    const root = await makeTempDir();
    const host = new muxHost.MuxHost(root);

    const response = await pages.handleDashboard(root, host);

    assert.assertEquals(response.status, 200);
    const html = await response.text();
    assert.assert(html.includes("<!DOCTYPE html>"));
    assert.assert(html.includes("noskills"));
    assert.assert(html.includes("Specs"));
  });
});

// =============================================================================
// Spec detail page: GET /spec/:name
// =============================================================================

bdd.describe("GET /spec/:name", () => {
  bdd.it("returns spec detail HTML", async () => {
    const root = await makeTempDir();

    const state = noskills.createInitialState();
    const specState = noskills.machine.startSpec(
      state,
      "detail-test",
      "spec/detail-test",
      "Test spec for detail page",
    );
    await runtime.fs.mkdir(`${root}/.eser/specs/detail-test`, {
      recursive: true,
    });
    await persistence.writeSpecState(root, "detail-test", specState);

    const response = await pages.handleSpecDetail(root, "detail-test");

    assert.assertEquals(response.status, 200);
    const html = await response.text();
    assert.assert(html.includes("detail-test"));
    assert.assert(html.includes("Test spec for detail page"));
  });

  bdd.it("returns 404 for nonexistent spec", async () => {
    const root = await makeTempDir();
    const response = await pages.handleSpecDetail(root, "nonexistent");
    assert.assertEquals(response.status, 404);
  });
});

// =============================================================================
// API: POST /api/spec/:name/:action
// =============================================================================

bdd.describe("POST /api/spec/:name/approve", () => {
  bdd.it("changes phase and writes event", async () => {
    const root = await makeTempDir();

    let state = noskills.createInitialState();
    state = noskills.machine.startSpec(
      state,
      "approve-web",
      "spec/approve-web",
      "test",
    );
    state = noskills.machine.completeDiscovery(state);
    state = noskills.machine.approveDiscoveryReview(state);
    // Now in SPEC_PROPOSAL

    await runtime.fs.mkdir(`${root}/.eser/specs/approve-web`, {
      recursive: true,
    });
    await persistence.writeSpecState(root, "approve-web", state);

    const host = new muxHost.MuxHost(root);
    const response = await api.handleAction(
      root,
      "approve-web",
      "approve",
      { user: { name: "Tester", email: "t@test.com" } },
      host,
      actionContext("approve-web", "approve"),
    );

    const result = await response.json();
    assert.assertEquals(result.ok, true);

    // Verify state changed
    const updated = await persistence.readSpecState(root, "approve-web");
    assert.assertEquals(updated.phase, "SPEC_APPROVED");

    // Verify event written
    const events = await dashboard.readEvents(root);
    assert.assert(events.length >= 1);
    assert.assertEquals(events[0]!.type, "phase-change");
  });
});

bdd.describe("POST /api/spec/:name/note", () => {
  bdd.it("adds note via dashboard action", async () => {
    const root = await makeTempDir();

    let state = noskills.createInitialState();
    state = noskills.machine.startSpec(
      state,
      "note-web",
      "spec/note-web",
      "test",
    );
    await runtime.fs.mkdir(`${root}/.eser/specs/note-web`, { recursive: true });
    await persistence.writeSpecState(root, "note-web", state);

    const host = new muxHost.MuxHost(root);
    const response = await api.handleAction(
      root,
      "note-web",
      "note",
      { text: "Important note from web" },
      host,
      actionContext("note-web", "note"),
    );

    const result = await response.json();
    assert.assertEquals(result.ok, true);
  });
});

bdd.describe("POST /api/spec/:name/:action notifies the spec's tab", () => {
  bdd.it("types the notice without the name's control characters", async () => {
    const root = await makeTempDir();

    let state = noskills.createInitialState();
    state = noskills.machine.startSpec(
      state,
      "notify-web",
      "spec/notify-web",
      "test",
    );
    await runtime.fs.mkdir(`${root}/.eser/specs/notify-web`, {
      recursive: true,
    });
    await persistence.writeSpecState(root, "notify-web", state);

    const writes: string[] = [];
    const host = new muxHost.MuxHost(root, fakeHostOpts(writes));

    try {
      await host.createTab("notify-web");
      const response = await api.handleAction(
        root,
        "notify-web",
        "note",
        {
          text: "hello",
          user: { name: "Eve\r/exit\u001b[2J", email: "eve@example.com" },
        },
        host,
        actionContext("notify-web", "note"),
      );
      const result = await response.json();

      assert.assertEquals(result.ok, true);
      assert.assertEquals(writes, [
        "\n[noskills: spec notify-web note by Eve/exit[2J]\n",
      ]);
    } finally {
      await host.killAll();
    }
  });
});

bdd.describe("POST /api/spec/:name/start", () => {
  // The dashboard layer has no action that starts execution, so the spec page
  // offers no Start Execution button and the API refuses the action by name.
  bdd.it("is refused as unknown and leaves the spec approved", async () => {
    const root = await makeTempDir();
    await writeSpec(
      root,
      "start-web",
      noskills.machine.approveSpec(proposedSpec("start-web")),
    );

    const records: ErrorRecord[] = [];
    const response = await api.handleAction(
      root,
      "start-web",
      "start",
      {},
      new muxHost.MuxHost(root),
      actionContext("start-web", "start", records),
    );

    assert.assertEquals(response.status, 400);
    assert.assertEquals(await response.json(), {
      ok: false,
      error: "Unknown action: start",
    });

    const state = await persistence.readSpecState(root, "start-web");
    assert.assertEquals(state.phase, "SPEC_APPROVED");
    assert.assertEquals(records, []);
  });
});

bdd.describe("Spec page actions", () => {
  const phases = [
    {
      phase: "SPEC_PROPOSAL",
      state: (name: string) => proposedSpec(name),
    },
    {
      phase: "SPEC_APPROVED",
      state: (name: string) => noskills.machine.approveSpec(proposedSpec(name)),
    },
    {
      phase: "EXECUTING",
      state: (name: string) =>
        noskills.machine.startExecution(
          noskills.machine.approveSpec(proposedSpec(name)),
        ),
    },
  ];

  for (const { phase, state } of phases) {
    bdd.it(`every ${phase} button is an action the API handles`, async () => {
      const root = await makeTempDir();
      await writeSpec(root, "page-actions", state("page-actions"));

      const spec = await dashboard.getSpecSummary(root, "page-actions");
      assert.assertEquals(spec.phase, phase);

      const html = specDetail.renderSpecDetail(spec, "", null);
      const actions = [...html.matchAll(/data-action="([^"]+)"/g)].map((
        match,
      ) => match[1]!);
      assert.assertNotEquals(actions, []);

      const host = new muxHost.MuxHost(root);
      for (const action of actions) {
        // One spec state file takes every action, so they run one at a time.
        // deno-lint-ignore no-await-in-loop
        const response = await api.handleAction(
          root,
          "page-actions",
          action,
          { text: "from the spec page", mentionId: "mention-1" },
          host,
          actionContext("page-actions", action),
        );
        // deno-lint-ignore no-await-in-loop
        const body = await response.json();

        assert.assertNotEquals(body.error, `Unknown action: ${action}`);
      }
    });
  }
});

bdd.describe("POST /api/spec/:name/:action failures", () => {
  bdd.it(
    "logs a fault with the request context and answers with its request id",
    async () => {
      const root = await makeTempDir();
      const records: ErrorRecord[] = [];

      // No such spec: the dashboard layer reports a caught NotFound-style fault,
      // not a rejection it decided on.
      const response = await api.handleAction(
        root,
        "missing-spec",
        "approve",
        {},
        new muxHost.MuxHost(root),
        actionContext("missing-spec", "approve", records),
      );
      const body = await response.json();

      assert.assertEquals(response.status, 400);
      assert.assertEquals(body.ok, false);
      assert.assertEquals(body.error, "Action could not be completed");
      assert.assertEquals(body.detail, undefined);

      assert.assertEquals(records.length, 1);
      const [record] = records;
      assert.assertEquals(record!.message, "Action could not be completed");
      assert.assertEquals(record!.fields["requestId"], body.requestId);
      assert.assertEquals(record!.fields["method"], "POST");
      assert.assertEquals(
        record!.fields["path"],
        "/api/spec/missing-spec/approve",
      );
      assert.assertEquals(record!.fields["spec"], "missing-spec");
      assert.assertEquals(record!.fields["action"], "approve");
      assert.assertInstanceOf(record!.fields["error"], Error);
    },
  );

  bdd.it(
    "answers a rejection the dashboard decided on without a log record",
    async () => {
      const root = await makeTempDir();
      await writeSpec(root, "early-complete", proposedSpec("early-complete"));
      const records: ErrorRecord[] = [];

      const response = await api.handleAction(
        root,
        "early-complete",
        "complete",
        {},
        new muxHost.MuxHost(root),
        actionContext("early-complete", "complete", records),
      );

      assert.assertEquals(response.status, 400);
      assert.assertEquals(await response.json(), {
        ok: false,
        error: "Cannot complete in phase: SPEC_PROPOSAL",
      });
      assert.assertEquals(records, []);
    },
  );
});

bdd.describe("withFaultBoundary", () => {
  bdd.it(
    "logs a thrown error under the request id and answers 500 with it",
    async () => {
      const records: ErrorRecord[] = [];
      const handler = server.withFaultBoundary(
        () =>
          Promise.reject(new Error("state.json unreadable at /home/someone")),
        recordingLogger(records),
      );

      const response = await handler(
        new Request("http://localhost:3000/mux?token=secret-token-value"),
      );
      const text = await response.text();
      const body = JSON.parse(text);

      assert.assertEquals(response.status, 500);
      assert.assertEquals(body.ok, false);
      assert.assertEquals(body.error, "Request could not be completed");
      assert.assertMatch(body.requestId, /^[0-9a-f-]{36}$/);
      assert.assertFalse(text.includes("/home/someone"));

      assert.assertEquals(records.length, 1);
      const [record] = records;
      assert.assertEquals(record!.message, "Request could not be completed");
      assert.assertEquals(record!.fields["requestId"], body.requestId);
      assert.assertEquals(record!.fields["method"], "GET");
      assert.assertEquals(record!.fields["path"], "/mux");
      assert.assertInstanceOf(record!.fields["error"], Error);
      assert.assertFalse(
        JSON.stringify(records).includes("secret-token-value"),
      );
    },
  );

  bdd.it(
    "hands the handler its context and passes its response through",
    async () => {
      const records: ErrorRecord[] = [];
      const seen: requestContext.RequestContext[] = [];
      const handler = server.withFaultBoundary(
        (_request, context) => {
          seen.push(context);
          return Promise.resolve(new Response("fine", { status: 202 }));
        },
        recordingLogger(records),
      );

      const first = await handler(new Request("http://localhost:3000/"));
      const second = await handler(new Request("http://localhost:3000/"));

      assert.assertEquals(first.status, 202);
      assert.assertEquals(await first.text(), "fine");
      await second.body?.cancel();
      assert.assertEquals(records, []);
      assert.assertEquals(seen.length, 2);
      assert.assertNotEquals(seen[0]!.requestId, seen[1]!.requestId);
    },
  );
});

// =============================================================================
// API: Tab management
// =============================================================================

bdd.describe(
  "Tab management API",
  { sanitizeResources: false, sanitizeOps: false },
  () => {
    bdd.it("lists tabs (initially empty)", async () => {
      const root = await makeTempDir();
      const host = new muxHost.MuxHost(root);

      const response = api.handleListTabs(host);
      const tabs = await response.json();
      assert.assertEquals(tabs.length, 0);
    });

    // Tab creation goes through a fake PTY host so these stay pure API-contract
    // tests — no `claude` binary, no native PTY spawn.

    bdd.it("create tab returns ok with tabId", async () => {
      const root = await makeTempDir();
      const host = new muxHost.MuxHost(root, fakeHostOpts());

      try {
        const response = await api.handleCreateTab(host, {});
        const result = await response.json();

        assert.assertEquals(result.ok, true);
        assert.assert(typeof result.tabId === "string");
        assert.assertEquals(result.specName, null);
      } finally {
        await host.killAll();
      }
    });

    bdd.it("create tab ignores a spec that is not a string", async () => {
      const root = await makeTempDir();
      const host = new muxHost.MuxHost(root, fakeHostOpts());

      try {
        const response = await api.handleCreateTab(host, { spec: 42 });
        const result = await response.json();

        assert.assertEquals(result.ok, true);
        assert.assertEquals(result.specName, null);
      } finally {
        await host.killAll();
      }
    });

    bdd.it("create tab with spec assignment", async () => {
      const root = await makeTempDir();
      const host = new muxHost.MuxHost(root, fakeHostOpts());

      try {
        const response = await api.handleCreateTab(host, {
          spec: "my-feature",
        });
        const result = await response.json();

        assert.assertEquals(result.ok, true);
        assert.assertEquals(result.specName, "my-feature");
      } finally {
        await host.killAll();
      }
    });

    bdd.it("close tab removes it from list", async () => {
      const root = await makeTempDir();
      const host = new muxHost.MuxHost(root, fakeHostOpts());

      try {
        const createRes = await api.handleCreateTab(host, {});
        const { tabId } = await createRes.json();

        await api.handleCloseTab(host, tabId);

        const listRes = api.handleListTabs(host);
        const tabs = await listRes.json();
        assert.assertEquals(tabs.length, 0);
      } finally {
        await host.killAll();
      }
    });
  },
);

// =============================================================================
// SSE: GET /events
// =============================================================================

bdd.describe("GET /events (SSE)", () => {
  const decoder = new TextDecoder();

  // A watcher that hands the test its callback and counts unsubscribes, so the
  // stream can be driven without polling an events file.
  const fakeWatch = () => {
    const watch = {
      emit: null as ((event: dashboard.DashboardEvent) => void) | null,
      unsubscribed: 0,
      watchEvents: (
        _root: string,
        callback: (event: dashboard.DashboardEvent) => void,
      ) => {
        watch.emit = callback;
        return () => {
          watch.unsubscribed++;
        };
      },
    };
    return watch;
  };

  bdd.it("sends SSE headers, a connect comment and each event", async () => {
    const watch = fakeWatch();
    const response = sse.handleSSE("unused-root", watch.watchEvents);

    assert.assertEquals(
      response.headers.get("content-type"),
      "text/event-stream",
    );
    assert.assertEquals(response.headers.get("cache-control"), "no-cache");

    const reader = response.body!.getReader();
    try {
      const connected = await reader.read();
      assert.assertEquals(decoder.decode(connected.value), ": connected\n\n");

      const event: dashboard.DashboardEvent = {
        ts: "2026-01-01T00:00:00.000Z",
        type: "phase-change",
        spec: "sse-test",
        user: "Tester",
      };
      watch.emit!(event);

      const forwarded = await reader.read();
      assert.assertEquals(
        decoder.decode(forwarded.value),
        `data: ${JSON.stringify(event)}\n\n`,
      );
    } finally {
      await reader.cancel();
    }
  });

  bdd.it("stops watching as soon as the client disconnects", async () => {
    const watch = fakeWatch();
    const response = sse.handleSSE("unused-root", watch.watchEvents);
    const reader = response.body!.getReader();
    await reader.read();

    assert.assertEquals(watch.unsubscribed, 0);

    // Cancelling is what a closed browser tab does.
    await reader.cancel();

    assert.assertEquals(watch.unsubscribed, 1);
  });
});

// =============================================================================
// Static file serving
// =============================================================================

bdd.describe("Static files", () => {
  bdd.it("style.css exists and is valid CSS", async () => {
    const css = await runtime.fs.readTextFile(
      runtime.path.join(import.meta.dirname ?? ".", "static", "style.css"),
    );
    assert.assert(css.includes(":root"));
    assert.assert(css.includes("--bg"));
  });

  bdd.it("client.js exists and is valid JS", async () => {
    const js = await runtime.fs.readTextFile(
      runtime.path.join(import.meta.dirname ?? ".", "static", "client.js"),
    );
    assert.assert(js.includes("EventSource"));
    assert.assert(js.includes("WebSocket"));
  });
});

// =============================================================================
// Template rendering
// =============================================================================

bdd.describe("Templates", () => {
  bdd.it("dashboard template includes terminal scripts", async () => {
    const root = await makeTempDir();
    const state = await dashboard.getState(root);

    const html = dashboardTemplate.renderDashboard(state, [], null);
    assert.assert(html.includes("xterm@5.3.0/lib/xterm.js"));
    assert.assert(html.includes("xterm@5.3.0/css/xterm.css"));
  });

  bdd.it("dashboard template includes spec list section", async () => {
    const root = await makeTempDir();
    const state = await dashboard.getState(root);

    const html = dashboardTemplate.renderDashboard(state, [], null);
    assert.assert(html.includes("spec-list"));
    assert.assert(html.includes("sidebar"));
    assert.assert(html.includes("tab-bar"));
  });

  bdd.it("components phaseBadge renders correct color", () => {
    const badge = components.phaseBadge("EXECUTING");
    assert.assert(badge.includes("#22c55e")); // green
    assert.assert(badge.includes("EXECUTING"));
  });

  bdd.it("components tabBar renders tabs with active state", () => {
    const html = components.tabBar(
      [
        { id: "t1", specName: "upload", phase: "EXECUTING" },
        { id: "t2", specName: null, phase: null },
      ],
      "t1",
    );
    assert.assert(html.includes('class="tab active"'));
    assert.assert(html.includes("upload"));
    assert.assert(html.includes("IDLE")); // null spec → IDLE label
  });

  bdd.it("components tabBar gives each tab a close button of its own", () => {
    const html = components.tabBar(
      [{ id: "t1", specName: "upload", phase: "EXECUTING" }],
      "t1",
    );

    assert.assertEquals(
      html,
      '<div class="tab-bar"><div class="tab active" data-tab="t1"><button type="button" class="tab-select" data-index="0">upload (EXECUTING)</button><button type="button" class="tab-close" data-close="t1" aria-label="Close upload (EXECUTING)">&times;</button></div><button type="button" class="tab-add" id="add-tab" aria-label="New tab">+</button></div>',
    );
  });

  bdd.it("spec detail template includes CTAs for SPEC_PROPOSAL", async () => {
    const root = await makeTempDir();

    let s = noskills.createInitialState();
    s = noskills.machine.startSpec(s, "cta-test", "spec/cta-test", "test");
    s = noskills.machine.completeDiscovery(s);
    s = noskills.machine.approveDiscoveryReview(s);

    await runtime.fs.mkdir(`${root}/.eser/specs/cta-test`, { recursive: true });
    await persistence.writeSpecState(root, "cta-test", s);

    const spec = await dashboard.getSpecSummary(root, "cta-test");
    const html = specDetail.renderSpecDetail(spec, "", null);

    assert.assert(html.includes('data-action="approve"'));
    assert.assert(html.includes("Approve Spec"));
  });

  bdd.it(
    "spec detail template offers no Start Execution for SPEC_APPROVED",
    async () => {
      const root = await makeTempDir();
      await writeSpec(
        root,
        "approved-page",
        noskills.machine.approveSpec(proposedSpec("approved-page")),
      );

      const spec = await dashboard.getSpecSummary(root, "approved-page");
      const html = specDetail.renderSpecDetail(spec, "", null);

      assert.assertFalse(html.includes('data-action="start"'));
      assert.assertFalse(html.includes("Start Execution"));
      assert.assert(html.includes('data-action="note"'));
    },
  );
});
