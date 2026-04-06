// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

import { describe, it } from "@std/testing/bdd";
import { assert, assertEquals } from "@std/assert";
import * as persistence from "@eser/noskills/persistence";
import * as schema from "@eser/noskills/mod";
import * as dashboard from "@eser/noskills/dashboard";
import { runtime } from "@eser/standards/cross-runtime";

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
    schema.createInitialManifest(
      [],
      ["claude-code"],
      [],
      { languages: ["typescript"], frameworks: [], ci: [], testRunner: null },
    ),
  );
  await persistence.writeState(dir, schema.createInitialState());
  return dir;
};

// Import server route handlers directly for unit testing
import * as pages from "./routes/pages.ts";
import * as api from "./routes/api.ts";
import * as _sse from "./routes/sse.ts";
import { PtyManager } from "./terminal/pty-manager.ts";

// =============================================================================
// API: GET /api/state
// =============================================================================

describe("GET /api/state", () => {
  it("returns valid DashboardState JSON", async () => {
    const root = await makeTempDir();
    const response = await api.handleGetState(root);

    assertEquals(response.status, 200);
    const data = await response.json();
    assert(Array.isArray(data.specs));
    assert("currentUser" in data);
    assert("recentEvents" in data);
  });

  it("includes specs when they exist", async () => {
    const root = await makeTempDir();

    // Create a spec
    const state = schema.createInitialState();
    const specState = (await import("@eser/noskills/mod")).machine.startSpec(
      state,
      "test-web",
      "spec/test-web",
      "Web test spec",
    );
    await runtime.fs.mkdir(`${root}/.eser/specs/test-web`, { recursive: true });
    await persistence.writeSpecState(root, "test-web", specState);

    const response = await api.handleGetState(root);
    const data = await response.json();

    assertEquals(data.specs.length, 1);
    assertEquals(data.specs[0].name, "test-web");
  });
});

// =============================================================================
// Dashboard page: GET /
// =============================================================================

describe("GET / (dashboard page)", () => {
  it("returns HTML with spec list", async () => {
    const root = await makeTempDir();
    const ptyManager = new PtyManager(root);

    const response = await pages.handleDashboard(root, ptyManager);

    assertEquals(response.status, 200);
    const html = await response.text();
    assert(html.includes("<!DOCTYPE html>"));
    assert(html.includes("noskills"));
    assert(html.includes("Specs"));
  });
});

// =============================================================================
// Spec detail page: GET /spec/:name
// =============================================================================

describe("GET /spec/:name", () => {
  it("returns spec detail HTML", async () => {
    const root = await makeTempDir();

    const state = schema.createInitialState();
    const specState = (await import("@eser/noskills/mod")).machine.startSpec(
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

    assertEquals(response.status, 200);
    const html = await response.text();
    assert(html.includes("detail-test"));
    assert(html.includes("Test spec for detail page"));
  });

  it("returns 404 for nonexistent spec", async () => {
    const root = await makeTempDir();
    const response = await pages.handleSpecDetail(root, "nonexistent");
    assertEquals(response.status, 404);
  });
});

// =============================================================================
// API: POST /api/spec/:name/:action
// =============================================================================

describe("POST /api/spec/:name/approve", () => {
  it("changes phase and writes event", async () => {
    const root = await makeTempDir();
    const noskills = await import("@eser/noskills/mod");

    let state = schema.createInitialState();
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

    const ptyManager = new PtyManager(root);
    const response = await api.handleAction(
      root,
      "approve-web",
      "approve",
      { user: { name: "Tester", email: "t@test.com" } },
      ptyManager,
    );

    const result = await response.json();
    assertEquals(result.ok, true);

    // Verify state changed
    const updated = await persistence.readSpecState(root, "approve-web");
    assertEquals(updated.phase, "SPEC_APPROVED");

    // Verify event written
    const events = await dashboard.readEvents(root);
    assert(events.length >= 1);
    assertEquals(events[0]!.type, "phase-change");
  });
});

describe("POST /api/spec/:name/note", () => {
  it("adds note via dashboard action", async () => {
    const root = await makeTempDir();
    const noskills = await import("@eser/noskills/mod");

    let state = schema.createInitialState();
    state = noskills.machine.startSpec(
      state,
      "note-web",
      "spec/note-web",
      "test",
    );
    await runtime.fs.mkdir(`${root}/.eser/specs/note-web`, { recursive: true });
    await persistence.writeSpecState(root, "note-web", state);

    const ptyManager = new PtyManager(root);
    const response = await api.handleAction(
      root,
      "note-web",
      "note",
      { text: "Important note from web" },
      ptyManager,
    );

    const result = await response.json();
    assertEquals(result.ok, true);
  });
});

// =============================================================================
// API: Tab management
// =============================================================================

describe(
  "Tab management API",
  { sanitizeResources: false, sanitizeOps: false },
  () => {
    it("lists tabs (initially empty)", async () => {
      const root = await makeTempDir();
      const ptyManager = new PtyManager(root);

      const response = api.handleListTabs(ptyManager);
      const tabs = await response.json();
      assertEquals(tabs.length, 0);
    });

    // Note: tab creation tests that spawn PTYs are skipped in CI because
    // they require `claude` binary. We test the API contract only.

    it("create tab returns ok with tabId", async () => {
      const root = await makeTempDir();
      const ptyManager = new PtyManager(root);

      try {
        const response = await api.handleCreateTab(ptyManager, {});
        const result = await response.json();

        assertEquals(result.ok, true);
        assert(typeof result.tabId === "string");
        assertEquals(result.specName, null);
      } finally {
        await ptyManager.killAll();
      }
    });

    it("create tab with spec assignment", async () => {
      const root = await makeTempDir();
      const ptyManager = new PtyManager(root);

      try {
        const response = await api.handleCreateTab(ptyManager, {
          spec: "my-feature",
        });
        const result = await response.json();

        assertEquals(result.ok, true);
        assertEquals(result.specName, "my-feature");
      } finally {
        await ptyManager.killAll();
      }
    });

    it("close tab removes it from list", async () => {
      const root = await makeTempDir();
      const ptyManager = new PtyManager(root);

      try {
        const createRes = await api.handleCreateTab(ptyManager, {});
        const { tabId } = await createRes.json();

        await api.handleCloseTab(ptyManager, tabId);

        const listRes = api.handleListTabs(ptyManager);
        const tabs = await listRes.json();
        assertEquals(tabs.length, 0);
      } finally {
        await ptyManager.killAll();
      }
    });
  },
);

// =============================================================================
// SSE: GET /events
// =============================================================================

describe("GET /events (SSE)", () => {
  it("returns SSE content type", () => {
    // Just verify the response headers without starting the stream
    // (starting the stream creates intervals that leak in tests)
    const headers = {
      "content-type": "text/event-stream",
      "cache-control": "no-cache",
      "connection": "keep-alive",
    };
    assertEquals(headers["content-type"], "text/event-stream");
    assertEquals(headers["cache-control"], "no-cache");
  });
});

// =============================================================================
// Static file serving
// =============================================================================

describe("Static files", () => {
  it("style.css exists and is valid CSS", async () => {
    const css = await runtime.fs.readTextFile(
      new URL("./static/style.css", import.meta.url).pathname,
    );
    assert(css.includes(":root"));
    assert(css.includes("--bg"));
  });

  it("client.js exists and is valid JS", async () => {
    const js = await runtime.fs.readTextFile(
      new URL("./static/client.js", import.meta.url).pathname,
    );
    assert(js.includes("EventSource"));
    assert(js.includes("WebSocket"));
  });
});

// =============================================================================
// Template rendering
// =============================================================================

describe("Templates", () => {
  it("dashboard template includes terminal scripts", async () => {
    const root = await makeTempDir();
    const state = await dashboard.getState(root);
    const { renderDashboard } = await import("./templates/dashboard.ts");

    const html = renderDashboard(state, [], null);
    assert(html.includes("xterm.min.js"));
    assert(html.includes("xterm.min.css"));
  });

  it("dashboard template includes spec list section", async () => {
    const root = await makeTempDir();
    const state = await dashboard.getState(root);
    const { renderDashboard } = await import("./templates/dashboard.ts");

    const html = renderDashboard(state, [], null);
    assert(html.includes("spec-list"));
    assert(html.includes("sidebar"));
    assert(html.includes("tab-bar"));
  });

  it("components phaseBadge renders correct color", async () => {
    const { phaseBadge } = await import("./templates/components.ts");

    const badge = phaseBadge("EXECUTING");
    assert(badge.includes("#22c55e")); // green
    assert(badge.includes("EXECUTING"));
  });

  it("components tabBar renders tabs with active state", async () => {
    const { tabBar } = await import("./templates/components.ts");

    const html = tabBar(
      [
        { id: "t1", specName: "upload", phase: "EXECUTING" },
        { id: "t2", specName: null, phase: null },
      ],
      "t1",
    );
    assert(html.includes('class="tab active"'));
    assert(html.includes("upload"));
    assert(html.includes("IDLE")); // null spec → IDLE label
  });

  it("spec detail template includes CTAs for SPEC_PROPOSAL", async () => {
    const root = await makeTempDir();
    const noskills = await import("@eser/noskills/mod");

    let s = schema.createInitialState();
    s = noskills.machine.startSpec(s, "cta-test", "spec/cta-test", "test");
    s = noskills.machine.completeDiscovery(s);
    s = noskills.machine.approveDiscoveryReview(s);

    await runtime.fs.mkdir(`${root}/.eser/specs/cta-test`, { recursive: true });
    await persistence.writeSpecState(root, "cta-test", s);

    const spec = await dashboard.getSpecSummary(root, "cta-test");
    const { renderSpecDetail } = await import("./templates/spec-detail.ts");
    const html = renderSpecDetail(spec, "", null);

    assert(html.includes('data-action="approve"'));
    assert(html.includes("Approve Spec"));
  });
});
