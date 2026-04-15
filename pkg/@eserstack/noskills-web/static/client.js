// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.
// noskills web — client-side JS (vanilla, no build step)

(() => {
  "use strict";

  // ==========================================================================
  // State
  // ==========================================================================

  let activeTabId = null;
  let terminal = null;
  let fitAddon = null;
  let ws = null;

  // ==========================================================================
  // SSE — real-time event stream
  // ==========================================================================

  const events = new EventSource("/events");

  events.onmessage = (e) => {
    try {
      const event = JSON.parse(e.data);
      // Refresh spec list on state changes
      if (
        event.type === "phase-change" || event.type === "spec-created" ||
        event.type === "task-completed"
      ) {
        refreshSpecList();
      }
    } catch {
      // Ignore malformed events
    }
  };

  events.onerror = () => {
    // SSE will auto-reconnect
  };

  // ==========================================================================
  // Terminal — xterm.js
  // ==========================================================================

  function connectTerminal(tabId) {
    const container = document.getElementById("terminal-container");
    if (!container) return;

    // Cleanup previous
    if (ws) {
      ws.close();
      ws = null;
    }
    if (terminal) {
      terminal.dispose();
      terminal = null;
    }

    container.innerHTML = "";
    activeTabId = tabId;

    // Check if xterm is loaded
    if (typeof Terminal === "undefined") {
      container.innerHTML =
        '<div class="terminal-placeholder">Terminal loading...</div>';
      return;
    }

    terminal = new Terminal({
      fontFamily: "'SF Mono', 'Cascadia Code', 'Fira Code', monospace",
      fontSize: 13,
      theme: {
        background: "#000000",
        foreground: "#e6edf3",
        cursor: "#58a6ff",
        selectionBackground: "#264f78",
      },
      allowProposedApi: true,
    });

    fitAddon = new FitAddon.FitAddon();
    terminal.loadAddon(fitAddon);

    if (typeof WebLinksAddon !== "undefined") {
      terminal.loadAddon(new WebLinksAddon.WebLinksAddon());
    }

    terminal.open(container);
    fitAddon.fit();

    // WebSocket connection
    const proto = location.protocol === "https:" ? "wss:" : "ws:";
    ws = new WebSocket(`${proto}//${location.host}/terminal/${tabId}`);

    ws.onopen = () => {
      // Send initial size
      ws.send(
        JSON.stringify({
          type: "resize",
          cols: terminal.cols,
          rows: terminal.rows,
        }),
      );
    };

    ws.onmessage = (event) => {
      terminal.write(event.data);
    };

    ws.onclose = () => {
      terminal.write("\r\n[connection closed]\r\n");
    };

    // Terminal input → WebSocket
    terminal.onData((data) => {
      if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(data);
      }
    });

    // Resize handling
    terminal.onResize(({ cols, rows }) => {
      if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: "resize", cols, rows }));
      }
    });

    globalThis.addEventListener("resize", () => {
      if (fitAddon) fitAddon.fit();
    });
  }

  // ==========================================================================
  // Tab management
  // ==========================================================================

  document.addEventListener("click", async (e) => {
    const target = e.target;

    // Tab click
    if (target.classList.contains("tab") && target.dataset.tab) {
      document.querySelectorAll(".tab").forEach((t) =>
        t.classList.remove("active")
      );
      target.classList.add("active");
      connectTerminal(target.dataset.tab);
      return;
    }

    // Tab close
    if (target.classList.contains("tab-close") && target.dataset.close) {
      e.stopPropagation();
      const tabId = target.dataset.close;
      await fetch(`/api/tab/${tabId}`, { method: "DELETE" });
      target.parentElement.remove();
      if (activeTabId === tabId) {
        const remaining = document.querySelector(".tab[data-tab]");
        if (remaining) {
          remaining.click();
        } else {
          activeTabId = null;
          if (terminal) {
            terminal.dispose();
            terminal = null;
          }
        }
      }
      return;
    }

    // Add tab
    if (target.id === "add-tab" || target.closest("#add-tab")) {
      const res = await fetch("/api/tab", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({}),
      });
      const data = await res.json();
      if (data.ok) {
        // Reload to show new tab
        location.reload();
      }
      return;
    }

    // CTA button click
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
      if (result.ok) {
        // Refresh the page to show updated state
        location.reload();
      } else {
        alert(`Action failed: ${result.error || "Unknown error"}`);
      }
      return;
    }
  });

  // ==========================================================================
  // Spec list refresh
  // ==========================================================================

  async function refreshSpecList() {
    try {
      const res = await fetch("/api/state");
      const state = await res.json();
      // Update spec count in sidebar if available
      const specList = document.querySelector(".spec-list");
      if (specList && state.specs) {
        // Full refresh — simpler than DOM diffing
        location.reload();
      }
    } catch {
      // Ignore — SSE will retry
    }
  }

  // ==========================================================================
  // Auto-connect to first tab on load
  // ==========================================================================

  const firstTab = document.querySelector(".tab[data-tab]");
  if (firstTab) {
    connectTerminal(firstTab.dataset.tab);
  }

  // Load user info
  fetch("/api/state")
    .then((r) => r.json())
    .then((state) => {
      const el = document.getElementById("user-info");
      if (el && state.currentUser) {
        el.textContent = state.currentUser.name;
      }
    })
    .catch(() => {});
})();
