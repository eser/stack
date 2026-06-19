// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.
// Transport-agnostic mux browser renderer.
//
// Shared by the local WebSocket client (client.js) and the remote WebTransport
// client (mux-remote.js): both feed it neutral mux server→frontend frames
// (`scene` / `output`) and let it emit frontend→server frames (`action` /
// `resize`) through a caller-supplied `send`. It knows nothing about the
// transport, so the exact same rendering drives a local socket or a remote
// HTTP/3 daemon. Plain browser globals (no build step): exposes `globalThis.MuxRender`.

(() => {
  "use strict";

  function measureCell(fontFamily, fontSize) {
    const span = document.createElement("span");
    span.style.cssText =
      `position:absolute;visibility:hidden;white-space:pre;font-family:${fontFamily};font-size:${fontSize}px;line-height:normal;`;
    span.textContent = "W".repeat(50);
    document.body.appendChild(span);
    const rect = span.getBoundingClientRect();
    document.body.removeChild(span);
    return { w: Math.max(1, rect.width / 50), h: Math.max(1, rect.height) };
  }

  const esc = (s) =>
    String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");

  /**
   * @param {object} opts
   *   root      — container element panes are positioned within (position:relative)
   *   cell      — { w, h } pixel size of one character cell
   *   send      — (frame) => void; sends a FrontendToServer frame ({t:"action"|...})
   *   tabBar    — optional element to render the tab list into
   *   fontFamily, fontSize — xterm font
   */
  function createRenderer(opts) {
    const { root, cell, send } = opts;
    const fontFamily = opts.fontFamily ||
      "'SF Mono', 'Cascadia Code', 'Fira Code', monospace";
    const fontSize = opts.fontSize || 13;

    let scene = null;
    const panes = new Map(); // paneId → { term, el }
    const pending = new Map(); // paneId → string[] (output before pane exists)

    const sendAction = (action) => send({ t: "action", action });

    function viewport() {
      return {
        cols: Math.max(20, Math.floor(root.clientWidth / cell.w)),
        rows: Math.max(6, Math.floor(root.clientHeight / cell.h)),
      };
    }

    function ensurePane(id) {
      let entry = panes.get(id);
      if (entry !== undefined) return entry;

      const el = document.createElement("div");
      el.className = "mux-pane";
      el.style.position = "absolute";
      el.dataset.pane = id;
      el.addEventListener("mousedown", () => {
        if (scene && scene.focusedPane !== id) {
          sendAction({ type: "focusPane", pane: id });
        }
      });

      const term = new Terminal({
        fontFamily,
        fontSize,
        theme: {
          background: "#000000",
          foreground: "#e6edf3",
          cursor: "#58a6ff",
          selectionBackground: "#264f78",
        },
        allowProposedApi: true,
        scrollback: 5000,
      });
      if (typeof WebLinksAddon !== "undefined") {
        term.loadAddon(new WebLinksAddon.WebLinksAddon());
      }
      term.open(el);
      term.onData((data) => {
        if (scene && scene.focusedPane !== id) {
          sendAction({ type: "focusPane", pane: id });
        }
        sendAction({ type: "writeInput", data });
      });

      root.appendChild(el);
      entry = { term, el };
      panes.set(id, entry);

      const buf = pending.get(id);
      if (buf !== undefined) {
        for (const chunk of buf) term.write(chunk);
        pending.delete(id);
      }
      return entry;
    }

    function renderTabBar() {
      const bar = opts.tabBar;
      if (!bar || scene === null || !Array.isArray(scene.tabs)) return;

      const items = scene.tabs.map((t, i) => {
        const active = i === scene.activeTab ? " active" : "";
        return `<button class="tab${active}" data-tab="${
          esc(t.id)
        }" data-index="${i}">${
          esc(t.name)
        }<span class="tab-close" data-close="${
          esc(t.id)
        }">&times;</span></button>`;
      }).join("");
      bar.innerHTML = `${items}<button class="tab-add" id="add-tab">+</button>`;
    }

    function renderPanes() {
      if (scene === null || !Array.isArray(scene.panes)) return;
      const visible = new Set();

      for (const p of scene.panes) {
        visible.add(p.id);
        const { term, el } = ensurePane(p.id);
        const wasHidden = el.style.display === "none";
        const g = p.geom;

        // The server sizes each pane's PTY to (width-2)×(height-2) — the 1-cell
        // frame the TUI draws as a box border. Mirror that here.
        const cols = Math.max(1, g.width - 2);
        const rows = Math.max(1, g.height - 2);

        el.style.left = `${g.x * cell.w}px`;
        el.style.top = `${g.y * cell.h}px`;
        el.style.width = `${g.width * cell.w}px`;
        el.style.height = `${g.height * cell.h}px`;
        el.style.padding = `${cell.h / 2}px ${cell.w}px`;
        el.style.boxSizing = "border-box";
        el.classList.toggle("focused", p.focused);
        el.classList.toggle("exited", p.exited);
        el.style.display = "block";

        if (term.cols !== cols || term.rows !== rows) term.resize(cols, rows);
        if (wasHidden) term.refresh(0, term.rows - 1);
        if (p.focused) term.focus();
      }

      for (const [id, entry] of panes) {
        if (!visible.has(id)) entry.el.style.display = "none";
      }
    }

    function applyDelta(delta) {
      scene = scene === null ? {} : scene;
      for (const key of Object.keys(delta)) scene[key] = delta[key];
      if (delta.tabs !== undefined || delta.activeTab !== undefined) {
        renderTabBar();
      }
      if (
        delta.panes !== undefined || delta.focusedPane !== undefined ||
        delta.viewport !== undefined
      ) {
        renderPanes();
      }
    }

    function writeOutput(id, data) {
      const entry = panes.get(id);
      if (entry !== undefined) {
        entry.term.write(data);
        return;
      }
      const buf = pending.get(id);
      if (buf === undefined) pending.set(id, [data]);
      else buf.push(data);
    }

    function applyFrame(frame) {
      if (frame.t === "scene") applyDelta(frame.delta);
      else if (frame.t === "output") writeOutput(frame.pane, frame.data);
      // frame.t === "exit" → caller decides (transport teardown)
    }

    return {
      applyFrame,
      viewport,
      getScene: () => scene,
    };
  }

  globalThis.MuxRender = { measureCell, createRenderer };
})();
