// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.
// Transport-agnostic mux browser renderer.
//
// Shared by the local WebSocket client (client.js) and the remote WebTransport
// client (mux-remote.js): both feed it mux server-to-frontend frames (`scene`
// and `screen`) and let it emit frontend-to-server frames (`action`, `key`,
// `paste`, `mouse`, `focus`) through a caller-supplied `send`. The server
// emulates every pane and sends what its screen shows (ADR 0006), so this file
// parses no terminal output: it paints rows of styled runs into the DOM, one
// element per row and one span per run, and keeps each pane's history for
// local scrolling. Plain browser globals (no build step): exposes
// `globalThis.MuxRender`.

(() => {
  "use strict";

  // Browser globals come from globalThis: deno lint checks this file against
  // Deno's globals, which have no DOM.
  const { document } = globalThis;

  // The terminal font. Callers measure the cell with the same values, so the
  // grid they report matches what the rows draw.
  const FONT_FAMILY = "'SF Mono', 'Cascadia Code', 'Fira Code', monospace";
  const FONT_SIZE_PX = 13;

  // The history lines a pane keeps for local scrolling, as xterm.js kept.
  const MAX_HISTORY = 5000;

  // The vt.Flags bits of a style.
  const FLAG_BOLD = 1;
  const FLAG_DIM = 2;
  const FLAG_ITALIC = 4;
  const FLAG_UNDERLINE = 8;
  const FLAG_BLINK = 16;
  const FLAG_INVERSE = 32;
  const FLAG_INVISIBLE = 64;
  const FLAG_STRIKETHROUGH = 128;
  const FLAG_OVERLINE = 256;

  // The vt.ColorMode values of a colour.
  const COLOR_PALETTE16 = 1;
  const COLOR_PALETTE256 = 2;
  const COLOR_RGB = 3;

  // The vt.UnderlineStyle values past single, as CSS text-decoration-style.
  const UNDERLINE_STYLES = [
    "solid",
    "solid",
    "double",
    "wavy",
    "dotted",
    "dashed",
  ];

  // The colours of the theme: the default foreground and background, and
  // xterm.js's default 16 ANSI colours.
  const THEME = {
    foreground: [0xe6, 0xed, 0xf3],
    background: [0x00, 0x00, 0x00],
    ansi: [
      [0x2e, 0x34, 0x36],
      [0xcc, 0x00, 0x00],
      [0x4e, 0x9a, 0x06],
      [0xc4, 0xa0, 0x00],
      [0x34, 0x65, 0xa4],
      [0x75, 0x50, 0x7b],
      [0x06, 0x98, 0x9a],
      [0xd3, 0xd7, 0xcf],
      [0x55, 0x57, 0x53],
      [0xef, 0x29, 0x29],
      [0x8a, 0xe2, 0x34],
      [0xfc, 0xe9, 0x4f],
      [0x72, 0x9f, 0xcf],
      [0xad, 0x7f, 0xa8],
      [0x34, 0xe2, 0xe2],
      [0xee, 0xee, 0xec],
    ],
  };

  // The key events that only change modifiers send nothing.
  const MODIFIER_KEYS = new Set([
    "Shift",
    "Control",
    "Alt",
    "AltGraph",
    "Meta",
    "CapsLock",
    "NumLock",
    "ScrollLock",
    "Fn",
    "FnLock",
    "Hyper",
    "Super",
    "OS",
  ]);

  // The schemes a link may open, as vt.IsSafeLinkURI allows them without
  // file: a page served over HTTP cannot open file URLs, and a program that
  // names one would point the user at their own disk.
  const SAFE_LINK_PROTOCOLS = new Set(["http:", "https:", "mailto:"]);

  // A plain URL in row text: http or https and the characters RFC 3986
  // allows, ASCII only, so a match never ends inside a wide character.
  const PLAIN_URL = /https?:\/\/[A-Za-z0-9\-._~:/?#[\]@!$&'()*+,;=%]+/g;
  const URL_TRAILING_PUNCTUATION = /[.,;:!?'")\]]+$/;

  const isMac = () =>
    /Mac|iPhone|iPad/.test(globalThis.navigator?.platform ?? "");

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

  // ── Links ─────────────────────────────────────────────────────────────────

  /** Whether a link's URI has a scheme the page may open. */
  function isSafeLinkURI(uri) {
    if (typeof uri !== "string" || uri === "") return false;
    try {
      return SAFE_LINK_PROTOCOLS.has(new URL(uri).protocol);
    } catch {
      return false;
    }
  }

  /**
   * The plain URLs in a row's text, as { start, end, uri } with UTF-16
   * offsets. Trailing punctuation is left out, so "see https://x.dev." links
   * only the address.
   */
  function findPlainLinks(text) {
    const found = [];
    for (const match of text.matchAll(PLAIN_URL)) {
      const uri = match[0].replace(URL_TRAILING_PUNCTUATION, "");
      if (isSafeLinkURI(uri) && uri.length > "https://".length) {
        found.push({ start: match.index, end: match.index + uri.length, uri });
      }
    }
    return found;
  }

  // ── Colours and styles ────────────────────────────────────────────────────

  /** The RGB of an xterm 256-colour index. */
  function paletteColor(index) {
    if (index < 16) return THEME.ansi[index];
    if (index < 232) {
      const levels = [0, 95, 135, 175, 215, 255];
      const i = index - 16;
      return [
        levels[Math.floor(i / 36)],
        levels[Math.floor(i / 6) % 6],
        levels[i % 6],
      ];
    }
    const gray = 8 + (index - 232) * 10;
    return [gray, gray, gray];
  }

  /** The RGB of a vt.Color, or null for the default colour. */
  function colorRGB(color, bold) {
    if (color === undefined || color === null) return null;
    const value = Number(color.value ?? 0);
    switch (color.mode) {
      case COLOR_PALETTE16: {
        const index = value & 15;
        // xterm.js draws bold text in the bright colours by default.
        return paletteColor(bold && index < 8 ? index + 8 : index);
      }
      case COLOR_PALETTE256:
        return paletteColor(value & 255);
      case COLOR_RGB:
        return [(value >> 16) & 255, (value >> 8) & 255, value & 255];
      default:
        return null;
    }
  }

  const cssColor = (rgb, alpha) =>
    alpha === 1
      ? `rgb(${rgb[0]}, ${rgb[1]}, ${rgb[2]})`
      : `rgba(${rgb[0]}, ${rgb[1]}, ${rgb[2]}, ${alpha})`;

  /**
   * The CSS of a screen message's style: { css, blink }, where css maps
   * CSSStyleDeclaration properties to values. Default colours are left to the
   * pane's stylesheet unless inverse or dim needs them.
   */
  function styleCSS(style) {
    const flags = Number(style?.flags ?? 0);
    const bold = (flags & FLAG_BOLD) !== 0;
    const inverse = (flags & FLAG_INVERSE) !== 0;
    const dim = (flags & FLAG_DIM) !== 0;
    const invisible = (flags & FLAG_INVISIBLE) !== 0;

    let fg = colorRGB(style?.fg, bold);
    let bg = colorRGB(style?.bg, false);
    if (inverse) {
      [fg, bg] = [bg ?? THEME.background, fg ?? THEME.foreground];
    }

    const css = {};
    if (invisible) {
      css.color = "transparent";
    } else if (fg !== null || dim) {
      css.color = cssColor(fg ?? THEME.foreground, dim ? 0.5 : 1);
    }
    if (bg !== null) css.backgroundColor = cssColor(bg, 1);
    if (bold) css.fontWeight = "bold";
    if ((flags & FLAG_ITALIC) !== 0) css.fontStyle = "italic";

    const lines = [];
    if ((flags & FLAG_UNDERLINE) !== 0) lines.push("underline");
    if ((flags & FLAG_STRIKETHROUGH) !== 0) lines.push("line-through");
    if ((flags & FLAG_OVERLINE) !== 0) lines.push("overline");
    if (lines.length > 0) css.textDecorationLine = lines.join(" ");
    if ((flags & FLAG_UNDERLINE) !== 0) {
      css.textDecorationStyle =
        UNDERLINE_STYLES[Number(style?.underline ?? 1)] ?? "solid";
      const underline = colorRGB(style?.underlineColor, false);
      if (underline !== null) css.textDecorationColor = cssColor(underline, 1);
    }

    return { css, blink: (flags & FLAG_BLINK) !== 0 };
  }

  // ── Lines ─────────────────────────────────────────────────────────────────

  const EMPTY_LINE = Object.freeze({ runs: Object.freeze([]), wrapped: false });

  const nonNegative = (n) => Number.isInteger(n) && n >= 0 ? n : 0;

  /**
   * A run as a screen message sends it (muxfx screen_wire.go): an array
   * [text, style, cells, width, cluster, link] without the trailing elements
   * that hold their defaults, or the number of blank cells in the default
   * style. The defaults are style 0, the text's cells (its code points times
   * the width, or the width for a cluster), width 1, no cluster and no link.
   * Anything else is no run.
   */
  function wireRun(run) {
    if (typeof run === "number") {
      return {
        text: "",
        style: 0,
        cells: nonNegative(run),
        width: 1,
        cluster: false,
        link: 0,
      };
    }
    if (!Array.isArray(run)) return null;

    const text = typeof run[0] === "string" ? run[0] : "";
    const width = run.length > 3 ? nonNegative(run[3]) : 1;
    const cluster = run[4] === 1;
    const cellWidth = width === 0 || width === 2 ? width : 1;
    let cells;
    if (run.length > 2) cells = nonNegative(run[2]);
    else if (text === "") cells = 0;
    else if (cluster) cells = cellWidth;
    else cells = [...text].length * cellWidth;

    return {
      text,
      style: run.length > 1 ? nonNegative(run[1]) : 0,
      cells,
      width,
      cluster,
      link: run.length > 5 ? run[5] : 0,
    };
  }

  /**
   * A text run's text cut to the code points that fit in cells, so a run
   * whose text is longer than the cells it claims cannot paint past them. A
   * cluster is one grapheme in its cells and is kept whole.
   */
  function fitText(run, cells) {
    if (run.cluster || run.width === 0) return run.text;
    const fits = Math.floor(cells / (run.width === 2 ? 2 : 1));
    const points = [...run.text];
    return points.length > fits ? points.slice(0, fits).join("") : run.text;
  }

  /**
   * A row or history line of a screen message, from its runs as the message
   * sends them and whether it wrapped, with each run's style and link
   * resolved from the message's tables, since the next message brings
   * tables of its own.
   */
  function convertLine(wireRuns, wrapped, styles, links, styleCache, cols) {
    const runs = [];
    let used = 0;
    for (const raw of Array.isArray(wireRuns) ? wireRuns : []) {
      const run = wireRun(raw);
      if (run === null) continue;
      const cells = Math.min(run.cells, cols - used);
      if (cells === 0) continue;
      used += cells;

      const text = run.text !== "" ? fitText(run, cells) : " ".repeat(cells);
      const style = styles[run.style] ?? {};
      const key = JSON.stringify(style);
      let resolved = styleCache.get(key);
      if (resolved === undefined) {
        resolved = styleCSS(style);
        styleCache.set(key, resolved);
      }

      const uri = run.link !== 0 ? links.get(run.link) : undefined;
      runs.push({
        text,
        cells,
        width: run.width === 2 ? 2 : 1,
        cluster: run.cluster || run.width === 0,
        style: resolved,
        uri: isSafeLinkURI(uri) ? uri : null,
      });
    }
    return { runs, wrapped };
  }

  /**
   * The pieces a row is painted from: runs split where a plain URL starts or
   * ends, each with the cells it covers and the link it opens. A wide run
   * becomes one piece per character, so each keeps its two columns.
   */
  function rowPieces(line) {
    const text = line.runs.map((run) => run.text).join("");
    const plain = findPlainLinks(text);
    const linkAt = (offset) => {
      for (const link of plain) {
        if (offset >= link.start && offset < link.end) return link;
      }
      return null;
    };

    const pieces = [];
    let offset = 0;
    for (const run of line.runs) {
      const start = offset;
      offset += run.text.length;

      if (run.cluster || run.uri !== null) {
        const link = run.uri === null ? linkAt(start) : null;
        const whole = link !== null && start + run.text.length <= link.end;
        pieces.push({ ...run, uri: run.uri ?? (whole ? link.uri : null) });
        continue;
      }

      if (run.width === 2) {
        for (const ch of run.text) pieces.push({ ...run, text: ch, cells: 2 });
        continue;
      }

      // Split a narrow run at the edges of the plain URLs it holds; each of
      // its characters is one cell.
      let segment = "";
      let segmentLink = linkAt(start);
      let at = start;
      for (const ch of run.text) {
        const link = linkAt(at);
        if (link !== segmentLink && segment !== "") {
          pieces.push({
            ...run,
            text: segment,
            cells: [...segment].length,
            uri: segmentLink?.uri ?? null,
          });
          segment = "";
        }
        segmentLink = link;
        segment += ch;
        at += ch.length;
      }
      if (segment !== "") {
        pieces.push({
          ...run,
          text: segment,
          cells: [...segment].length,
          uri: segmentLink?.uri ?? null,
        });
      }
    }
    return pieces;
  }

  /**
   * @param {object} opts
   *   root: container element panes are positioned within (position:relative)
   *   cell: { w, h } pixel size of one character cell
   *   send: (frame) => void; sends a FrontendToServer frame
   *   tabBar: optional element to render the tab list into
   *   onLeave: optional function called when the user leaves a terminal with
   *     Ctrl+Shift+L; the default focuses the first tab button
   *   fontFamily, fontSize: the terminal font (default FONT_FAMILY, FONT_SIZE_PX)
   */
  function createRenderer(opts) {
    const { root, cell, send } = opts;
    const fontFamily = opts.fontFamily ?? FONT_FAMILY;
    const fontSize = opts.fontSize ?? FONT_SIZE_PX;

    let scene = null;
    const panes = new Map(); // paneId → pane
    const styleCache = new Map(); // JSON of a style → styleCSS of it

    const sendAction = (action) => send({ t: "action", action });

    // The keyboard help every terminal input points at.
    const hint = document.createElement("p");
    hint.id = "mux-input-hint";
    hint.className = "visually-hidden";
    hint.textContent =
      "Keys go to the program in the terminal. Press Ctrl+Shift+L to move focus out of it, and Shift+Page Up or Shift+Page Down to scroll its history.";
    root.appendChild(hint);

    function viewport() {
      return {
        cols: Math.max(20, Math.floor(root.clientWidth / cell.w)),
        rows: Math.max(6, Math.floor(root.clientHeight / cell.h)),
      };
    }

    /** The attach frame: the viewport; the server answers with screens. */
    const attachFrame = () => ({ t: "attach", viewport: viewport() });

    function leave() {
      if (typeof opts.onLeave === "function") {
        opts.onLeave();
        return;
      }
      const target = opts.tabBar?.querySelector?.(".tab-select, .tab-add") ??
        null;
      if (target !== null) target.focus();
      else document.activeElement?.blur?.();
    }

    // ── Panes ───────────────────────────────────────────────────────────────

    function ensurePane(id) {
      let pane = panes.get(id);
      if (pane !== undefined) return pane;

      const el = document.createElement("div");
      el.className = "mux-pane";
      el.dataset.pane = id;
      el.setAttribute("role", "region");
      el.setAttribute("aria-label", "Terminal");

      const screen = document.createElement("div");
      screen.className = "mux-screen";
      screen.style.fontFamily = fontFamily;
      screen.style.fontSize = `${fontSize}px`;
      screen.style.lineHeight = `${cell.h}px`;

      const cursor = document.createElement("div");
      cursor.className = "mux-cursor";
      cursor.setAttribute("aria-hidden", "true");
      cursor.style.width = `${cell.w}px`;
      cursor.style.height = `${cell.h}px`;
      screen.appendChild(cursor);

      const note = document.createElement("div");
      note.className = "mux-scroll-note";
      note.hidden = true;

      const input = document.createElement("textarea");
      input.className = "mux-input";
      input.setAttribute("aria-label", "Terminal input");
      input.setAttribute("aria-describedby", hint.id);
      input.setAttribute("autocomplete", "off");
      input.setAttribute("autocorrect", "off");
      input.setAttribute("autocapitalize", "off");
      input.setAttribute("spellcheck", "false");

      el.appendChild(screen);
      el.appendChild(note);
      el.appendChild(input);
      root.appendChild(el);

      pane = {
        id,
        el,
        screen,
        cursorEl: cursor,
        note,
        input,
        rowEls: [],
        shown: [],
        cols: 0,
        rows: 0,
        lines: [],
        history: [],
        scroll: 0,
        cursor: { x: 0, y: 0, visible: false },
        title: "",
        mouse: "none",
        altScreen: false,
        wheel: 0,
        lastMove: "",
        pressed: null,
      };
      panes.set(id, pane);
      bindInput(pane);
      bindMouse(pane);
      return pane;
    }

    /** Sets the pane's row elements to rows, keeping the ones it has. */
    function setRowCount(pane, rows) {
      while (pane.rowEls.length < rows) {
        const row = document.createElement("div");
        row.className = "mux-row";
        row.style.height = `${cell.h}px`;
        pane.screen.insertBefore(row, pane.cursorEl);
        pane.rowEls.push(row);
        pane.shown.push(null);
      }
      while (pane.rowEls.length > rows) {
        pane.screen.removeChild(pane.rowEls.pop());
        pane.shown.pop();
      }
    }

    function paintRow(rowEl, line) {
      const nodes = [];
      let anchor = null;
      for (const piece of rowPieces(line)) {
        const span = document.createElement("span");
        span.className = piece.style.blink ? "mux-run mux-blink" : "mux-run";
        span.style.width = `${piece.cells * cell.w}px`;
        for (const [property, value] of Object.entries(piece.style.css)) {
          span.style[property] = value;
        }
        span.appendChild(document.createTextNode(piece.text));

        if (piece.uri === null) {
          anchor = null;
          nodes.push(span);
          continue;
        }
        if (anchor === null || anchor.dataset.uri !== piece.uri) {
          anchor = document.createElement("a");
          anchor.className = "mux-link";
          anchor.dataset.uri = piece.uri;
          anchor.href = piece.uri;
          anchor.target = "_blank";
          anchor.rel = "noopener noreferrer";
          // The rows can hold thousands of links; Tab stays on the controls
          // and the terminal input.
          anchor.tabIndex = -1;
          nodes.push(anchor);
        }
        anchor.appendChild(span);
      }
      rowEl.replaceChildren(...nodes);
      rowEl.classList.toggle("wrapped", line.wrapped);
    }

    /**
     * Paints the rows the pane shows: the screen, or with scroll > 0 the
     * window of history and screen that many lines up. Only rows whose line
     * changed since they were painted are touched.
     */
    function paint(pane) {
      const top = pane.history.length - pane.scroll;
      for (let i = 0; i < pane.rows; i++) {
        const index = top + i;
        const line = index < pane.history.length
          ? pane.history[index]
          : pane.lines[index - pane.history.length] ?? EMPTY_LINE;
        if (pane.shown[i] === line) continue;
        pane.shown[i] = line;
        paintRow(pane.rowEls[i], line);
      }

      const { cursor } = pane;
      const x = Math.min(Math.max(0, cursor.x), Math.max(0, pane.cols - 1));
      const y = Math.min(Math.max(0, cursor.y), Math.max(0, pane.rows - 1));
      const shape = ["block", "underline", "bar"].includes(cursor.shape)
        ? cursor.shape
        : "block";
      pane.cursorEl.className = `mux-cursor ${shape}${
        cursor.blink === true ? " blink" : ""
      }`;
      pane.cursorEl.hidden = !cursor.visible || pane.scroll > 0;
      pane.cursorEl.style.left = `${x * cell.w}px`;
      pane.cursorEl.style.top = `${y * cell.h}px`;
      // The input follows the cursor, so an IME shows its candidates there.
      pane.input.style.left = `${x * cell.w}px`;
      pane.input.style.top = `${y * cell.h}px`;

      pane.note.hidden = pane.scroll === 0;
      pane.note.textContent = pane.scroll === 0
        ? ""
        : `History, ${pane.scroll} lines up. Type or press Shift+Page Down to return.`;

      const label = pane.title !== "" ? `Terminal: ${pane.title}` : "Terminal";
      pane.el.setAttribute("aria-label", label);
      pane.el.classList.toggle("mouse-reporting", pane.mouse !== "none");
    }

    function scrollBy(pane, lines) {
      const next = Math.min(
        Math.max(0, pane.scroll + lines),
        pane.history.length,
      );
      if (next === pane.scroll) return;
      pane.scroll = next;
      paint(pane);
    }

    function applyScreen(id, update) {
      if (update === null || typeof update !== "object") return;
      const pane = ensurePane(id);
      const cols = nonNegative(update.cols);
      const rows = nonNegative(update.rows);

      if (update.full === true || cols !== pane.cols || rows !== pane.rows) {
        pane.cols = cols;
        pane.rows = rows;
        pane.lines = Array.from({ length: rows }, () => EMPTY_LINE);
        pane.history = [];
        pane.scroll = 0;
        pane.shown = pane.shown.map(() => null);
        setRowCount(pane, rows);
        pane.screen.style.width = `${cols * cell.w}px`;
        pane.screen.style.height = `${rows * cell.h}px`;
      }

      const styles = Array.isArray(update.styles) ? update.styles : [];
      const links = new Map();
      for (const link of Array.isArray(update.links) ? update.links : []) {
        links.set(link.link, link.uri);
      }

      // History comes before the rows: it holds the lines that scrolled off
      // the top before the rows were drawn.
      const history = update.history;
      if (history !== undefined && history !== null) {
        // A history line is [runs] or [runs, 1] when it wrapped.
        const added = (Array.isArray(history.lines) ? history.lines : []).map((
          line,
        ) =>
          Array.isArray(line)
            ? convertLine(
              line[0],
              line[1] === 1,
              styles,
              links,
              styleCache,
              cols,
            )
            : EMPTY_LINE
        );
        if (history.reset === true) {
          pane.history = added;
          pane.scroll = 0;
        } else {
          pane.history.push(...added);
          // A pane scrolled back keeps showing the same lines.
          if (pane.scroll > 0) pane.scroll += added.length;
        }
        if (pane.history.length > MAX_HISTORY) {
          pane.history.splice(0, pane.history.length - MAX_HISTORY);
        }
        pane.scroll = Math.min(pane.scroll, pane.history.length);
      }

      // A row is [row, runs] or [row, runs, 1] when it wrapped.
      for (const line of Array.isArray(update.lines) ? update.lines : []) {
        const row = Array.isArray(line) ? line[0] : undefined;
        if (Number.isInteger(row) && row >= 0 && row < rows) {
          pane.lines[row] = convertLine(
            line[1],
            line[2] === 1,
            styles,
            links,
            styleCache,
            cols,
          );
        }
      }

      const cursor = update.cursor ?? {};
      pane.cursor = {
        x: nonNegative(cursor.x),
        y: nonNegative(cursor.y),
        visible: cursor.visible === true,
        shape: cursor.shape,
        blink: cursor.blink,
      };
      pane.title = typeof update.title === "string" ? update.title : "";
      pane.mouse = typeof update.mouse === "string" ? update.mouse : "none";
      pane.altScreen = update.altScreen === true;
      if (pane.altScreen) pane.scroll = 0;

      paint(pane);
    }

    // ── Input ───────────────────────────────────────────────────────────────

    function sendInput(pane, type, payload) {
      if (pane.scroll > 0) {
        pane.scroll = 0;
        paint(pane);
      }
      send({ t: type, pane: pane.id, [type]: payload });
    }

    function focusPaneAction(pane) {
      if (scene !== null && scene.focusedPane !== pane.id) {
        sendAction({ type: "focusPane", pane: pane.id });
      }
    }

    /** The key message of a keydown, or null for one the browser keeps. */
    function keyMessage(e) {
      const printable = [...e.key].length === 1;
      const altGraph = typeof e.getModifierState === "function" &&
        e.getModifierState("AltGraph");
      // AltGr and the macOS Option key compose characters: their text goes as
      // typed, with alt and ctrl cleared.
      if (printable && (altGraph || (isMac() && e.altKey && !e.ctrlKey))) {
        return { key: e.key, code: e.code, text: e.key };
      }

      const key = { key: e.key, code: e.code };
      if (e.shiftKey) key.shift = true;
      if (e.altKey) key.alt = true;
      if (e.ctrlKey) key.ctrl = true;
      if (printable && !e.ctrlKey && !e.altKey) key.text = e.key;
      return key;
    }

    function onKeyDown(pane, e) {
      if (e.isComposing === true || e.keyCode === 229) return;
      if (
        MODIFIER_KEYS.has(e.key) || e.key === "Dead" ||
        e.key === "Unidentified" || e.key === "Process"
      ) {
        return;
      }

      if (e.ctrlKey && e.shiftKey && !e.altKey && e.code === "KeyL") {
        e.preventDefault();
        leave();
        return;
      }

      const plainShift = e.shiftKey && !e.ctrlKey && !e.altKey && !e.metaKey;
      if (
        plainShift && !pane.altScreen &&
        (e.key === "PageUp" || e.key === "PageDown")
      ) {
        e.preventDefault();
        scrollBy(
          pane,
          (e.key === "PageUp" ? 1 : -1) * Math.max(1, pane.rows - 1),
        );
        return;
      }

      // Command and Windows key chords are the browser's and the system's:
      // copy, paste, find, reload.
      if (e.metaKey) return;

      if (e.ctrlKey && e.shiftKey && e.code === "KeyC") {
        e.preventDefault();
        copySelection();
        return;
      }
      // Ctrl+Shift+V pastes; the paste event sends the text.
      if (e.ctrlKey && e.shiftKey && e.code === "KeyV") return;

      e.preventDefault();
      sendInput(pane, "key", keyMessage(e));
    }

    function copySelection() {
      const text = selectedText();
      if (text !== "") {
        globalThis.navigator?.clipboard?.writeText(text).catch(() => {});
      }
    }

    // The selection as text, without the blanks that pad each row.
    function selectedText() {
      const selection = globalThis.getSelection?.()?.toString() ?? "";
      return selection.split("\n").map((line) => line.trimEnd()).join("\n");
    }

    function bindInput(pane) {
      const { input } = pane;

      input.addEventListener("keydown", (e) => onKeyDown(pane, e));

      input.addEventListener("paste", (e) => {
        e.preventDefault();
        const text = e.clipboardData?.getData("text/plain") ?? "";
        if (text !== "") sendInput(pane, "paste", { text });
      });

      // IME composition: the committed text goes as a paste.
      input.addEventListener("compositionend", (e) => {
        input.value = "";
        if (typeof e.data === "string" && e.data !== "") {
          sendInput(pane, "paste", { text: e.data });
        }
      });

      // Text that arrives without a usable keydown: on-screen keyboards and
      // dead keys. Composition text is sent at compositionend.
      input.addEventListener("input", (e) => {
        if (e.isComposing === true) return;
        const data = typeof e.data === "string" ? e.data : "";
        input.value = "";
        switch (e.inputType) {
          case "insertText":
            if ([...data].length === 1) {
              sendInput(pane, "key", { key: data, text: data });
            } else if (data !== "") {
              sendInput(pane, "paste", { text: data });
            }
            break;
          case "insertLineBreak":
          case "insertParagraph":
            sendInput(pane, "key", { key: "Enter", code: "Enter" });
            break;
          case "deleteContentBackward":
            sendInput(pane, "key", { key: "Backspace", code: "Backspace" });
            break;
          default:
            break;
        }
      });

      input.addEventListener("focus", () => {
        pane.el.classList.add("has-focus");
        focusPaneAction(pane);
        send({ t: "focus", pane: pane.id, focus: { focused: true } });
      });
      input.addEventListener("blur", () => {
        pane.el.classList.remove("has-focus");
        send({ t: "focus", pane: pane.id, focus: { focused: false } });
      });
    }

    // ── Mouse ───────────────────────────────────────────────────────────────

    const BUTTONS = ["left", "middle", "right"];

    /** The cell and pixel offset of a mouse event inside the pane's rows. */
    function mouseCell(pane, e) {
      const rect = pane.screen.getBoundingClientRect();
      const x = Math.max(0, Math.round(e.clientX - rect.left));
      const y = Math.max(0, Math.round(e.clientY - rect.top));
      return {
        col: Math.min(Math.floor(x / cell.w), Math.max(0, pane.cols - 1)),
        row: Math.min(Math.floor(y / cell.h), Math.max(0, pane.rows - 1)),
        x,
        y,
      };
    }

    const mouseModifiers = (e) => {
      const mods = {};
      if (e.shiftKey) mods.shift = true;
      if (e.altKey) mods.alt = true;
      if (e.ctrlKey) mods.ctrl = true;
      if (e.metaKey) mods.meta = true;
      return mods;
    };

    // The program takes mouse reports, and the user is not holding Shift,
    // which keeps the mouse for selecting text as in xterm.js.
    const reportsMouse = (pane, e) => pane.mouse !== "none" && !e.shiftKey;

    function sendMouse(pane, e, kind, button) {
      const at = mouseCell(pane, e);
      const mouse = {
        kind,
        row: at.row,
        col: at.col,
        x: at.x,
        y: at.y,
        ...mouseModifiers(e),
      };
      if (button !== null) mouse.button = button;
      if (kind === "wheel") mouse.wheel = e.deltaY < 0 ? "up" : "down";
      send({ t: "mouse", pane: pane.id, mouse });
    }

    function heldButton(e) {
      if ((e.buttons & 1) !== 0) return "left";
      if ((e.buttons & 4) !== 0) return "middle";
      if ((e.buttons & 2) !== 0) return "right";
      return null;
    }

    function bindMouse(pane) {
      const { screen } = pane;

      screen.addEventListener("mousedown", (e) => {
        focusPaneAction(pane);
        if (!reportsMouse(pane, e)) return;
        // The press is the program's: no selection, and the input keeps focus.
        e.preventDefault();
        pane.input.focus();
        const button = BUTTONS[e.button] ?? "left";
        pane.pressed = button;
        sendMouse(pane, e, "press", button);
        document.addEventListener("mouseup", (up) => {
          if (pane.pressed === null) return;
          pane.pressed = null;
          sendMouse(pane, up, "release", button);
        }, { once: true });
      });

      screen.addEventListener("mouseup", (e) => {
        if (pane.pressed !== null || reportsMouse(pane, e)) return;
        // A click that selected nothing gives the terminal the keyboard.
        if ((globalThis.getSelection?.()?.toString() ?? "") === "") {
          pane.input.focus();
        }
      });

      screen.addEventListener("mousemove", (e) => {
        if (!reportsMouse(pane, e)) return;
        const button = heldButton(e);
        if (
          pane.mouse === "any" || (pane.mouse === "drag" && button !== null)
        ) {
          const at = mouseCell(pane, e);
          const key = `${at.row}:${at.col}:${button}`;
          if (key === pane.lastMove) return;
          pane.lastMove = key;
          sendMouse(pane, e, "move", button);
        }
      });

      screen.addEventListener("contextmenu", (e) => {
        if (reportsMouse(pane, e)) e.preventDefault();
      });

      screen.addEventListener("wheel", (e) => {
        e.preventDefault();
        // Pixels, lines or pages, counted in rows; a trackpad's small steps
        // add up until they make a row.
        const unit = e.deltaMode === 1
          ? cell.h
          : e.deltaMode === 2
          ? cell.h * pane.rows
          : 1;
        pane.wheel += e.deltaY * unit;
        const steps = Math.trunc(pane.wheel / cell.h);
        if (steps === 0) return;
        pane.wheel -= steps * cell.h;
        const count = Math.min(
          Math.abs(steps),
          pane.rows === 0 ? 1 : pane.rows,
        );
        const up = steps < 0;

        if (reportsMouse(pane, e)) {
          for (let i = 0; i < count; i++) sendMouse(pane, e, "wheel", null);
          return;
        }
        if (pane.altScreen) {
          // A full-screen program without mouse reports scrolls by cursor keys.
          const key = up ? "ArrowUp" : "ArrowDown";
          for (let i = 0; i < count; i++) {
            sendInput(pane, "key", { key, code: key });
          }
          return;
        }
        scrollBy(pane, up ? count : -count);
      }, { passive: false });

      // With mouse reports a click on a link is the program's; Ctrl or
      // Command opens it anyway.
      screen.addEventListener("click", (e) => {
        const link = e.target?.closest?.("a.mux-link") ?? null;
        if (link === null) return;
        if (
          !isSafeLinkURI(link.href) ||
          (pane.mouse !== "none" && !e.ctrlKey && !e.metaKey)
        ) {
          e.preventDefault();
        }
      });

      screen.addEventListener("copy", (e) => {
        const text = selectedText();
        if (
          text === "" || e.clipboardData === undefined ||
          e.clipboardData === null
        ) return;
        e.preventDefault();
        e.clipboardData.setData("text/plain", text);
      });
    }

    // ── Scene ───────────────────────────────────────────────────────────────

    function renderTabBar() {
      const bar = opts.tabBar;
      if (
        bar === undefined || bar === null || scene === null ||
        !Array.isArray(scene.tabs)
      ) {
        return;
      }

      // Two sibling buttons per tab, so each takes keyboard focus; a button
      // inside a button is invalid HTML and cannot. Names are program
      // titles, so they become text nodes, never markup.
      const nodes = scene.tabs.map((tab, i) => {
        const name = String(tab.name ?? "");
        const item = document.createElement("div");
        item.className = i === scene.activeTab ? "tab active" : "tab";
        item.dataset.tab = String(tab.id);

        const select = document.createElement("button");
        select.type = "button";
        select.className = "tab-select";
        select.dataset.index = String(i);
        if (i === scene.activeTab) select.setAttribute("aria-current", "true");
        select.appendChild(document.createTextNode(name));

        const close = document.createElement("button");
        close.type = "button";
        close.className = "tab-close";
        close.dataset.close = String(tab.id);
        close.setAttribute("aria-label", `Close ${name}`);
        close.appendChild(document.createTextNode("×"));

        item.appendChild(select);
        item.appendChild(close);
        return item;
      });

      const add = document.createElement("button");
      add.type = "button";
      add.className = "tab-add";
      add.id = "add-tab";
      add.setAttribute("aria-label", "New tab");
      add.appendChild(document.createTextNode("+"));
      bar.replaceChildren(...nodes, add);
    }

    // Whether the keyboard is on the page or a terminal input, so a focus
    // change in the scene may move it to the focused pane.
    function keyboardIsFree() {
      const active = document.activeElement ?? null;
      if (active === null || active === document.body) return true;
      return [...panes.values()].some((pane) => pane.input === active);
    }

    function renderPanes() {
      if (scene === null || !Array.isArray(scene.panes)) return;
      const visible = new Set();

      for (const p of scene.panes) {
        visible.add(p.id);
        const pane = ensurePane(p.id);
        const g = p.geom;

        // The server sizes each pane's terminal to (width-2)×(height-2): the
        // 1-cell frame the TUI draws as a box border. Mirror that here.
        const { el } = pane;
        el.style.left = `${g.x * cell.w}px`;
        el.style.top = `${g.y * cell.h}px`;
        el.style.width = `${g.width * cell.w}px`;
        el.style.height = `${g.height * cell.h}px`;
        el.style.padding = `${cell.h / 2}px ${cell.w}px`;
        el.classList.toggle("focused", p.focused === true);
        el.classList.toggle("exited", p.exited === true);
        el.hidden = false;

        if (
          p.focused === true && keyboardIsFree() &&
          document.activeElement !== pane.input
        ) {
          pane.input.focus();
        }
      }

      for (const [id, pane] of panes) {
        if (!visible.has(id)) pane.el.hidden = true;
      }
    }

    function applyDelta(delta) {
      if (delta === null || typeof delta !== "object") return;
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

    function applyFrame(frame) {
      if (frame === null || typeof frame !== "object") return;
      if (frame.t === "scene") applyDelta(frame.delta);
      else if (frame.t === "screen") applyScreen(frame.pane, frame.screen);
      // "exit" is the caller's (transport teardown).
    }

    /** What a pane shows, for tests and tools: its rows' text and state. */
    function inspect(id) {
      const pane = panes.get(id);
      if (pane === undefined) return null;
      return {
        element: pane.el,
        rows: pane.rowEls.map((row) => row.textContent),
        cols: pane.cols,
        historyLength: pane.history.length,
        scroll: pane.scroll,
        mouse: pane.mouse,
        altScreen: pane.altScreen,
        cursor: { ...pane.cursor },
      };
    }

    return {
      applyFrame,
      attachFrame,
      viewport,
      inspect,
      getScene: () => scene,
    };
  }

  globalThis.MuxRender = {
    FONT_FAMILY,
    FONT_SIZE_PX,
    MAX_HISTORY,
    measureCell,
    createRenderer,
    isSafeLinkURI,
    findPlainLinks,
    styleCSS,
  };
})();
