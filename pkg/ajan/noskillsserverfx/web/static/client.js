// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.
// noskills web — local mux client (vanilla, no build step).
//
// Thin WebSocket adapter over the shared transport-agnostic renderer
// (mux-render.js): one /mux socket carries the whole multiplexer (the scene and
// each pane's screen in; actions and key, paste, mouse and focus input out).
// noskills-web glue (SSE dashboard feed, REST tab create/close, spec CTAs)
// lives here; all rendering is in MuxRender.

(() => {
  "use strict";

  // Browser globals come from globalThis: deno lint checks this file against
  // Deno's globals, which have no DOM and no MuxRender.
  const { document } = globalThis;

  // The per-process token the server embedded in the page head. Every mutating
  // call and the /mux upgrade must carry it: binding to 127.0.0.1 is not an
  // authorization boundary, and WebSockets ignore the same-origin policy.
  const AUTH_TOKEN =
    document.querySelector('meta[name="noskills-token"]')?.content ?? "";

  // fetch wrapper that attaches the token to anything that is not a plain read.
  const authedFetch = (url, init = {}) => {
    const method = (init.method ?? "GET").toUpperCase();
    if (method === "GET" || method === "HEAD") {
      return fetch(url, init);
    }
    return fetch(url, {
      ...init,
      headers: { ...(init.headers ?? {}), "x-noskills-token": AUTH_TOKEN },
    });
  };

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
      if (
        document.querySelector(".spec-list") !== null &&
        Array.isArray(state.specs)
      ) {
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
    if (ws !== null && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(frame));
    }
  }

  function connect() {
    // The spec detail page has no terminal container.
    const { MuxRender } = globalThis;
    if (root === null || MuxRender === undefined) return;

    if (renderer === null) {
      const cell = MuxRender.measureCell(
        MuxRender.FONT_FAMILY,
        MuxRender.FONT_SIZE_PX,
      );
      renderer = MuxRender.createRenderer({
        root,
        cell,
        send,
        tabBar: document.querySelector(".tab-bar"),
      });
    }

    const proto = location.protocol === "https:" ? "wss:" : "ws:";
    ws = new WebSocket(
      `${proto}//${location.host}/mux?token=${encodeURIComponent(AUTH_TOKEN)}`,
    );

    // Attach with the viewport: the server sends what each pane shows, and
    // the renderer paints it.
    ws.onopen = () => send(renderer.attachFrame());
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

  // The result of a spec action. The action routes answer JSON, but the guard
  // in front of them answers a refusal in plain text ("Forbidden: missing or
  // invalid token"), and so may a proxy; such a body becomes the error.
  async function readActionResult(res) {
    const text = await res.text();
    try {
      const parsed = JSON.parse(text);
      if (parsed !== null && typeof parsed === "object") return parsed;
    } catch {
      // Not JSON: a plain-text answer.
    }
    const reason = text.trim() !== "" ? text.trim() : res.statusText;
    return { ok: false, error: `${reason} (HTTP ${res.status})` };
  }

  // ── Click delegation: tab switch (mux), tab add/close (REST), spec CTAs ────
  document.addEventListener("click", async (e) => {
    const target = e.target;

    // Each tab is a select button and a close button side by side, so both
    // take keyboard focus; Enter and Space on a button arrive here as a click.
    const closeButton = target.closest(".tab-close");
    if (closeButton !== null && closeButton.dataset.close !== undefined) {
      await authedFetch(`/api/tab/${closeButton.dataset.close}`, {
        method: "DELETE",
      });
      return;
    }

    const tabButton = target.closest(".tab-select");
    if (tabButton !== null && tabButton.dataset.index !== undefined) {
      send({
        t: "action",
        action: { type: "gotoTab", index: Number(tabButton.dataset.index) },
      });
      return;
    }

    if (target.closest("#add-tab") !== null) {
      await authedFetch("/api/tab", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({}),
      });
      return;
    }

    if (target.classList.contains("cta-btn")) {
      const spec = target.dataset.spec;
      const action = target.dataset.action;
      if (
        spec === undefined || spec === "" || action === undefined ||
        action === ""
      ) {
        return;
      }

      let body = {};
      if (action === "note" || action === "question") {
        const text = prompt(
          action === "note" ? "Add a note:" : "Ask a question:",
        );
        // null is a cancelled prompt; an empty answer is not worth sending.
        if (text === null || text === "") return;
        body = { text };
      }
      if (action === "reply") {
        const text = prompt("Your reply:");
        if (text === null || text === "") return;
        // Dashboard mentions carry data-mention-id, spec questions
        // data-question-id; both name the thread the reply belongs to.
        const mentionId = target.dataset.mentionId ??
          target.dataset.questionId ?? "";
        body = { text, mentionId };
      }

      let result;
      try {
        const res = await authedFetch(`/api/spec/${spec}/${action}`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(body),
        });
        result = await readActionResult(res);
      } catch {
        alert("Action failed: the noskills web server did not answer");
        return;
      }
      if (result.ok === true) {
        location.reload();
        return;
      }
      // A fault carries the request id that its record in the server log has.
      const reference = typeof result.requestId === "string"
        ? ` (request ${result.requestId} in the noskills web log)`
        : "";
      alert(`Action failed: ${result.error ?? "Unknown error"}${reference}`);
      return;
    }
  });

  // ── Resize → recompute grid and tell the server ───────────────────────────
  let resizeTimer = null;
  globalThis.addEventListener("resize", () => {
    if (resizeTimer !== null) clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => {
      resizeTimer = null;
      if (renderer !== null) {
        send({ t: "resize", viewport: renderer.viewport() });
      }
    }, 150);
  });

  // ── Boot ──────────────────────────────────────────────────────────────────
  connect();

  fetch("/api/state")
    .then((r) => r.json())
    .then((state) => {
      const el = document.getElementById("user-info");
      if (el !== null && typeof state.currentUser?.name === "string") {
        el.textContent = state.currentUser.name;
      }
    })
    .catch(() => {});
})();
