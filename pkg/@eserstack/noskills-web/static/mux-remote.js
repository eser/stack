// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.
// noskills — remote mux client over WebTransport (vanilla, no build step).
//
// The counterpart to client.js: instead of a local /mux WebSocket it attaches to
// a headless noskills-server over HTTP/3 + WebTransport and renders the same mux
// scene via the shared renderer (mux-render.js). The daemon wraps every mux
// server→frontend frame as {type:"mux", v, frame, seq}; this unwraps it and
// wraps outbound frames as {type:"mux", frame}. Tab management uses mux actions
// (the daemon has no REST tab endpoints).
//
// BEST-EFFORT / UNVERIFIED: needs a real noskills-server + a host HTML page that
// serves xterm + mux-render.js + this file and calls startRemoteMux(...). The
// daemon wire protocol mirrors @eserstack/noskills-client/attach.ts.
//
// Usage from a host page:
//   startRemoteMux({
//     baseUrl: "https://host:4433", slug, sid,
//     certHashes: [ArrayBuffer],   // self-signed pinning (optional)
//     token: "<bearer>",           // PIN-login token (optional)
//     root: document.getElementById("terminal-container"),
//     tabBar: document.querySelector(".tab-bar"),
//   });

(() => {
  "use strict";

  function startRemoteMux(cfg) {
    if (typeof WebTransport === "undefined") {
      throw new Error("WebTransport is not supported in this browser");
    }
    if (!globalThis.MuxRender) throw new Error("mux-render.js must load first");

    const root = cfg.root;
    const cell = MuxRender.measureCell(
      "'SF Mono', 'Cascadia Code', 'Fira Code', monospace",
      13,
    );

    let lastSeq = 0;
    let writer = null;
    let closed = false;
    let wt = null;

    // The renderer emits FrontendToServer frames; wrap each as a mux command.
    const send = (frame) => {
      if (writer === null) return;
      writer.write(
        new TextEncoder().encode(JSON.stringify({ type: "mux", frame }) + "\n"),
      ).catch(() => {});
    };

    const renderer = MuxRender.createRenderer({
      root,
      cell,
      send,
      tabBar: cfg.tabBar,
    });

    // ── Tab management via mux actions (no REST on the daemon) ──────────────
    document.addEventListener("click", (e) => {
      const t = e.target;
      if (t.classList.contains("tab") && t.dataset.index) {
        send({
          t: "action",
          action: { type: "gotoTab", index: Number(t.dataset.index) },
        });
      } else if (t.classList.contains("tab-close") && t.dataset.close) {
        e.stopPropagation();
        const scene = renderer.getScene();
        const idx = scene && Array.isArray(scene.tabs)
          ? scene.tabs.findIndex((tab) => tab.id === t.dataset.close)
          : -1;
        if (idx >= 0) {
          send({ t: "action", action: { type: "closeTab", index: idx } });
        }
      } else if (t.id === "add-tab" || t.closest("#add-tab")) {
        send({ t: "action", action: { type: "newTab" } });
      }
    });

    let resizeTimer = null;
    globalThis.addEventListener("resize", () => {
      if (resizeTimer !== null) clearTimeout(resizeTimer);
      resizeTimer = setTimeout(() => {
        resizeTimer = null;
        send({ t: "resize", viewport: renderer.viewport() });
      }, 150);
    });

    // ── Connect (with auto-reconnect that resumes from lastSeq) ──────────────
    const wtOpts = {};
    if (Array.isArray(cfg.certHashes) && cfg.certHashes.length > 0) {
      wtOpts.serverCertificateHashes = cfg.certHashes.map((value) => ({
        algorithm: "sha-256",
        value,
      }));
    }

    async function connect() {
      if (closed) return;

      // Build the URL per-attempt so a reconnect resumes from the last seq seen.
      const q = new URLSearchParams({ kind: "mux" });
      if (lastSeq > 0) q.set("after", String(lastSeq));
      if (cfg.token) q.set("token", cfg.token);
      const url = `${cfg.baseUrl}/attach/${encodeURIComponent(cfg.slug)}/${
        encodeURIComponent(cfg.sid)
      }?${q.toString()}`;

      try {
        wt = new WebTransport(url, wtOpts);
        await wt.ready;

        const stream = await wt.createBidirectionalStream();
        writer = stream.writable.getWriter();

        // Attach so the server lays panes out for our viewport.
        send({ t: "attach", viewport: renderer.viewport() });

        const reader = stream.readable.getReader();
        const decoder = new TextDecoder();
        let buf = "";

        for (;;) {
          const { value, done } = await reader.read();
          if (done) break;
          buf += decoder.decode(value, { stream: true });

          const lines = buf.split("\n");
          buf = lines.pop() ?? "";
          for (const line of lines) {
            const trimmed = line.trim();
            if (trimmed === "") continue;

            let evt;
            try {
              evt = JSON.parse(trimmed);
            } catch {
              continue;
            }
            if (typeof evt.seq === "number") lastSeq = evt.seq;
            if (evt.type === "mux" && evt.frame) renderer.applyFrame(evt.frame);
          }
        }
      } catch {
        // connection failed / dropped → fall through to reconnect
      }

      writer = null;
      if (!closed) setTimeout(connect, 1000);
    }

    void connect();

    return {
      close() {
        closed = true;
        try {
          wt?.close();
        } catch {
          // already closing
        }
      },
      get lastSeq() {
        return lastSeq;
      },
    };
  }

  globalThis.startRemoteMux = startRemoteMux;
})();
