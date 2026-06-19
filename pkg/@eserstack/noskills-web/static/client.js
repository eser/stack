// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.
// noskills web — local mux client (vanilla, no build step).
//
// Thin WebSocket adapter over the shared transport-agnostic renderer
// (mux-render.js): one /mux socket carries the whole multiplexer (neutral scene
// + per-pane output in, actions out). noskills-web glue (SSE dashboard feed,
// REST tab create/close, spec CTAs) lives here; all rendering is in MuxRender.

(() => {
  "use strict";

  // ── SSE — dashboard event stream ──────────────────────────────────────────
  const events = new EventSource("/events");
  events.onmessage = (e) => {
    try {
      const event = JSON.parse(e.data);
      if (
        event.type === "phase-change" || event.type === "spec-created" ||
        event.type === "task-completed"
      ) {
        refreshSpecList();
      }
    } catch {
      // ignore malformed events
    }
  };
  events.onerror = () => {/* EventSource auto-reconnects */};

  async function refreshSpecList() {
    try {
      const res = await fetch("/api/state");
      const state = await res.json();
      if (document.querySelector(".spec-list") && state.specs) {
        location.reload();
      }
    } catch {
      // ignore — SSE will retry
    }
  }

  // ── Mux renderer + WebSocket transport ────────────────────────────────────
  const root = document.getElementById("terminal-container");
  let ws = null;
  let renderer = null;
  let reconnectTimer = null;

  function send(frame) {
    if (ws && ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(frame));
  }

  function connect() {
    if (!root || typeof Terminal === "undefined" || !globalThis.MuxRender) {
      return;
    }

    if (renderer === null) {
      const cell = MuxRender.measureCell(
        "'SF Mono', 'Cascadia Code', 'Fira Code', monospace",
        13,
      );
      renderer = MuxRender.createRenderer({
        root,
        cell,
        send,
        tabBar: document.querySelector(".tab-bar"),
      });
    }

    const proto = location.protocol === "https:" ? "wss:" : "ws:";
    ws = new WebSocket(`${proto}//${location.host}/mux`);

    ws.onopen = () => send({ t: "attach", viewport: renderer.viewport() });
    ws.onmessage = (ev) => {
      let frame;
      try {
        frame = JSON.parse(ev.data);
      } catch {
        return;
      }
      renderer.applyFrame(frame);
    };
    ws.onclose = () => {
      if (reconnectTimer === null) {
        reconnectTimer = setTimeout(() => {
          reconnectTimer = null;
          connect();
        }, 1000);
      }
    };
    ws.onerror = () => {/* close handler retries */};
  }

  // ── Click delegation: tab switch (mux), tab add/close (REST), spec CTAs ────
  document.addEventListener("click", async (e) => {
    const target = e.target;

    if (target.classList.contains("tab") && target.dataset.index) {
      send({
        t: "action",
        action: { type: "gotoTab", index: Number(target.dataset.index) },
      });
      return;
    }

    if (target.classList.contains("tab-close") && target.dataset.close) {
      e.stopPropagation();
      await fetch(`/api/tab/${target.dataset.close}`, { method: "DELETE" });
      return;
    }

    if (target.id === "add-tab" || target.closest("#add-tab")) {
      await fetch("/api/tab", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({}),
      });
      return;
    }

    if (target.classList.contains("cta-btn")) {
      const spec = target.dataset.spec;
      const action = target.dataset.action;
      if (!spec || !action) return;

      let body = {};
      if (action === "note" || action === "question") {
        const text = prompt(
          action === "note" ? "Add a note:" : "Ask a question:",
        );
        if (!text) return;
        body = { text };
      }
      if (action === "reply") {
        const text = prompt("Your reply:");
        if (!text) return;
        body = { text, mentionId: target.dataset.questionId || "" };
      }

      const res = await fetch(`/api/spec/${spec}/${action}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      const result = await res.json();
      if (result.ok) location.reload();
      else alert(`Action failed: ${result.error || "Unknown error"}`);
      return;
    }
  });

  // ── Resize → recompute grid and tell the server ───────────────────────────
  let resizeTimer = null;
  globalThis.addEventListener("resize", () => {
    if (resizeTimer !== null) clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => {
      resizeTimer = null;
      if (renderer) send({ t: "resize", viewport: renderer.viewport() });
    }, 150);
  });

  // ── Boot ──────────────────────────────────────────────────────────────────
  connect();

  fetch("/api/state")
    .then((r) => r.json())
    .then((state) => {
      const el = document.getElementById("user-info");
      if (el && state.currentUser) el.textContent = state.currentUser.name;
    })
    .catch(() => {});
})();
