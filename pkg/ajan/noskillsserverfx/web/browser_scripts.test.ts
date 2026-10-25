// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * Runs the dashboard's browser scripts in static/ against stand-ins for the
 * browser globals they read, so painting and input are checked without a
 * browser. The screen messages of the Claude Code test come from the Go
 * tests (dashboard_screen_corpus_test.go), which record what the dashboard's
 * server sends for a recorded session; here mux-render.js paints them.
 */

import * as nodeTest from "node:test";
import * as assert from "@eserstack/test-kit/assert";

// =============================================================================
// Harness
// =============================================================================

/** The text of a file next to this one. */
const readText = async (path: string): Promise<string> => {
  const response = await fetch(new URL(path, import.meta.url));

  return await response.text();
};

/**
 * Runs static/`name` as the browser runs a classic script, with `globals`
 * installed on globalThis. The returned function puts the previous globals
 * back; the script's listeners keep reading the stand-ins until then.
 */
const runScript = async (
  name: string,
  globals: Readonly<Record<string, unknown>>,
): Promise<() => void> => {
  const source = await readText(`./static/${name}`);

  const saved = Object.keys(globals).map(
    (key) => [key, Object.getOwnPropertyDescriptor(globalThis, key)] as const,
  );
  const restore = (): void => {
    for (const [key, descriptor] of saved) {
      if (descriptor === undefined) {
        delete (globalThis as Record<string, unknown>)[key];
      } else {
        Object.defineProperty(globalThis, key, descriptor);
      }
    }
  };

  for (const [key, value] of Object.entries(globals)) {
    Object.defineProperty(globalThis, key, {
      value,
      configurable: true,
      writable: true,
    });
  }

  try {
    // The scripts are classic browser scripts, not modules, so they run as a
    // function body.
    new Function(source)();
  } catch (error) {
    restore();
    throw error;
  }

  return restore;
};

type Listener = (event: FakeEvent) => void;

/** An event a listener gets: the fields a test sets, and preventDefault. */
class FakeEvent {
  [field: string]: unknown;
  defaultPrevented = false;

  constructor(fields: Readonly<Record<string, unknown>>) {
    Object.assign(this, fields);
  }

  preventDefault(): void {
    this.defaultPrevented = true;
  }
}

class FakeText {
  parentNode: FakeElement | null = null;

  constructor(readonly data: string) {}

  get textContent(): string {
    return this.data;
  }
}

type FakeNode = FakeElement | FakeText;

/** Whether element matches a "tag", ".class", "tag.class" or "#id" selector. */
const matches = (element: FakeElement, selector: string): boolean =>
  selector.split(",").some((one) => {
    const [tag = "", ...classes] = one.trim().split(".");
    if (tag.startsWith("#")) {
      return element.id === tag.slice(1);
    }

    return (
      (tag === "" || element.tagName === tag) &&
      classes.every((name) => element.classList.contains(name))
    );
  });

/** The parts of a DOM element the scripts use, without HTML parsing. */
class FakeElement {
  parentNode: FakeElement | null = null;
  childNodes: FakeNode[] = [];
  className = "";
  id = "";
  hidden = false;
  value = "";
  type = "";
  href = "";
  target = "";
  rel = "";
  tabIndex = 0;
  clientWidth = 0;
  clientHeight = 0;
  readonly style: Record<string, string> = {};
  readonly dataset: Record<string, string> = {};
  readonly attributes = new Map<string, string>();
  readonly listeners = new Map<string, Listener[]>();

  constructor(
    readonly document: FakeDocument,
    readonly tagName: string,
  ) {}

  get classList() {
    const names = (): string[] =>
      this.className.split(" ").filter((name) => name !== "");
    const add = (name: string): void => {
      if (!names().includes(name)) {
        this.className = [...names(), name].join(" ");
      }
    };
    const remove = (name: string): void => {
      this.className = names()
        .filter((other) => other !== name)
        .join(" ");
    };

    return {
      contains: (name: string): boolean => names().includes(name),
      add,
      remove,
      toggle: (name: string, force?: boolean): boolean => {
        const on = force ?? !names().includes(name);
        if (on) {
          add(name);
        } else {
          remove(name);
        }

        return on;
      },
    };
  }

  get children(): FakeElement[] {
    return this.childNodes.filter((node) => node instanceof FakeElement);
  }

  get textContent(): string {
    return this.childNodes.map((node) => node.textContent).join("");
  }

  set textContent(text: string) {
    this.replaceChildren(new FakeText(text));
  }

  set innerHTML(_html: string) {
    throw new Error("a script set innerHTML");
  }

  appendChild<T extends FakeNode>(node: T): T {
    node.parentNode?.removeChild(node);
    node.parentNode = this;
    this.childNodes.push(node);

    return node;
  }

  insertBefore<T extends FakeNode>(node: T, ref: FakeNode | null): T {
    node.parentNode?.removeChild(node);
    node.parentNode = this;
    const index = ref === null ? -1 : this.childNodes.indexOf(ref);
    if (index === -1) {
      this.childNodes.push(node);
    } else {
      this.childNodes.splice(index, 0, node);
    }

    return node;
  }

  removeChild<T extends FakeNode>(node: T): T {
    this.childNodes = this.childNodes.filter((other) => other !== node);
    node.parentNode = null;

    return node;
  }

  replaceChildren(...nodes: FakeNode[]): void {
    for (const node of this.childNodes) {
      node.parentNode = null;
    }
    this.childNodes = [];
    for (const node of nodes) {
      this.appendChild(node);
    }
  }

  setAttribute(name: string, value: string): void {
    this.attributes.set(name, String(value));
  }

  getAttribute(name: string): string | null {
    return this.attributes.get(name) ?? null;
  }

  addEventListener(type: string, listener: Listener): void {
    this.listeners.set(type, [...(this.listeners.get(type) ?? []), listener]);
  }

  /** Runs the listeners of type with an event of fields aimed at this. */
  dispatch(
    type: string,
    fields: Readonly<Record<string, unknown>> = {},
  ): FakeEvent {
    const event = new FakeEvent({ target: this, ...fields });
    for (const listener of this.listeners.get(type) ?? []) {
      listener(event);
    }

    return event;
  }

  focus(): void {
    const previous = this.document.activeElement;
    if (previous === this) {
      return;
    }
    this.document.activeElement = this;
    previous?.dispatch("blur");
    this.dispatch("focus");
  }

  blur(): void {
    if (this.document.activeElement === this) {
      this.document.activeElement = this.document.body;
      this.dispatch("blur");
    }
  }

  getBoundingClientRect(): {
    left: number;
    top: number;
    width: number;
    height: number;
  } {
    return { left: 0, top: 0, width: 0, height: 0 };
  }

  closest(selector: string): FakeElement | null {
    return matches(this, selector)
      ? this
      : (this.parentNode?.closest(selector) ?? null);
  }

  querySelectorAll(selector: string): FakeElement[] {
    return this.children.flatMap((child) => [
      ...(matches(child, selector) ? [child] : []),
      ...child.querySelectorAll(selector),
    ]);
  }

  querySelector(selector: string): FakeElement | null {
    return this.querySelectorAll(selector)[0] ?? null;
  }
}

/** The document the scripts see: element factories, focus and listeners. */
class FakeDocument {
  readonly body: FakeElement;
  activeElement: FakeElement | null;
  readonly listeners: { type: string; listener: Listener; once: boolean }[] =
    [];

  constructor() {
    this.body = new FakeElement(this, "body");
    this.activeElement = this.body;
  }

  createElement(tag: string): FakeElement {
    return new FakeElement(this, tag);
  }

  createTextNode(text: string): FakeText {
    return new FakeText(text);
  }

  addEventListener(
    type: string,
    listener: Listener,
    options?: { once?: boolean },
  ): void {
    this.listeners.push({ type, listener, once: options?.once === true });
  }

  dispatch(type: string, fields: Readonly<Record<string, unknown>> = {}): void {
    const event = new FakeEvent(fields);
    for (const entry of [...this.listeners]) {
      if (entry.type !== type) {
        continue;
      }
      if (entry.once) {
        this.listeners.splice(this.listeners.indexOf(entry), 1);
      }
      entry.listener(event);
    }
  }
}

type Frame = Record<string, unknown>;

type PaneView = {
  readonly element: FakeElement;
  readonly rows: readonly string[];
  readonly historyLength: number;
  readonly scroll: number;
  readonly mouse: string;
  readonly altScreen: boolean;
};

type Renderer = {
  readonly applyFrame: (frame: Frame) => void;
  readonly attachFrame: () => Frame;
  readonly inspect: (pane: string) => PaneView | null;
};

type StyleCSS = {
  readonly css: Record<string, string>;
  readonly blink: boolean;
};

type MuxRenderGlobal = {
  readonly createRenderer: (opts: Record<string, unknown>) => Renderer;
  readonly isSafeLinkURI: (uri: string) => boolean;
  readonly findPlainLinks: (
    text: string,
  ) => { start: number; end: number; uri: string }[];
  readonly styleCSS: (style: Record<string, unknown>) => StyleCSS;
};

const CELL = { w: 8, h: 16 };

/** The item at index, which the test expects to be there. */
const at = <T>(list: readonly T[], index: number): NonNullable<T> => {
  const item = list[index];
  assert.assertExists(item, `no item ${index}`);

  return item;
};

/** A page with mux-render.js loaded and one renderer on a root element. */
type RenderPage = {
  readonly document: FakeDocument;
  readonly root: FakeElement;
  readonly tabBar: FakeElement;
  readonly renderer: Renderer;
  readonly mux: MuxRenderGlobal;
  readonly sent: Frame[];
  readonly selection: { text: string };
  readonly left: number[];
  readonly clipboard: string[];
};

const withRenderer = async (
  test: (page: RenderPage) => void | Promise<void>,
): Promise<void> => {
  const document = new FakeDocument();
  const selection = { text: "" };
  const clipboard: string[] = [];
  const restore = await runScript("mux_render.js", {
    document,
    navigator: {
      platform: "Linux x86_64",
      clipboard: {
        writeText: (text: string) => {
          clipboard.push(text);
          return Promise.resolve();
        },
      },
    },
    getSelection: () => ({ toString: () => selection.text }),
  });

  try {
    const mux = (globalThis as unknown as { MuxRender: MuxRenderGlobal })
      .MuxRender;
    const root = document.createElement("div");
    root.clientWidth = 800;
    root.clientHeight = 480;
    const tabBar = document.createElement("div");
    const sent: Frame[] = [];
    const left: number[] = [];
    const renderer = mux.createRenderer({
      root,
      cell: CELL,
      send: (frame: Frame) => sent.push(frame),
      tabBar,
      onLeave: () => left.push(1),
    });

    await test({
      document,
      root,
      tabBar,
      renderer,
      mux,
      sent,
      selection,
      left,
      clipboard,
    });
  } finally {
    restore();
    delete (globalThis as Record<string, unknown>)["MuxRender"];
  }
};

/** A full screen message of a 20 by 3 pane, with `fields` laid over it. */
const screen = (
  fields: Readonly<Record<string, unknown>> = {},
  pane = "pane-1",
): Frame => ({
  t: "screen",
  pane,
  screen: {
    full: true,
    cols: 20,
    rows: 3,
    cursor: { x: 0, y: 0, visible: true },
    title: "",
    mouse: "none",
    altScreen: false,
    styles: [{}],
    lines: [],
    ...fields,
  },
});

/** A patch of a 20 by 3 pane. */
const patch = (fields: Readonly<Record<string, unknown>>): Frame =>
  screen({ full: false, ...fields });

/** A row of one text run, as a screen message sends it: [row, [[text, style]]]. */
const textLine = (row: number, text: string, style?: number): unknown[] => [
  row,
  [style === undefined ? [text] : [text, style]],
];

const view = (page: RenderPage, pane = "pane-1"): PaneView => {
  const found = page.renderer.inspect(pane);
  assert.assertExists(found);

  return found;
};

const rowElements = (page: RenderPage, pane = "pane-1"): FakeElement[] =>
  view(page, pane).element.querySelectorAll("div.mux-row");

const runSpans = (row: FakeElement): FakeElement[] =>
  row.querySelectorAll("span.mux-run");

const input = (page: RenderPage, pane = "pane-1"): FakeElement => {
  const found = view(page, pane).element.querySelector("textarea.mux-input");
  assert.assertExists(found);

  return found;
};

const screenElement = (page: RenderPage, pane = "pane-1"): FakeElement => {
  const found = view(page, pane).element.querySelector("div.mux-screen");
  assert.assertExists(found);

  return found;
};

/** The CSS a span carries besides its width. */
const spanCSS = (span: FakeElement): Record<string, string> => {
  const { width: _width, ...css } = span.style;

  return css;
};

const cellsOf = (span: FakeElement): number =>
  Number.parseFloat(span.style["width"] ?? "0") / CELL.w;

// =============================================================================
// mux-render.js: Claude Code from the recorded session
// =============================================================================

type PaintedScene = {
  readonly cursor: { readonly X: number; readonly Y: number };
  readonly cursorHidden?: boolean;
  readonly alt?: boolean;
  readonly lines: readonly string[];
  readonly widths?: readonly (readonly [number, number, number])[];
  readonly styles?: readonly {
    readonly row: number;
    readonly col: number;
    readonly len: number;
    readonly style: string;
  }[];
  readonly title?: string;
};

type ScreensFixture = {
  readonly case: string;
  readonly pane: string;
  readonly cols: number;
  readonly rows: number;
  readonly steps: readonly {
    readonly frames: readonly Frame[];
    readonly expect: PaintedScene;
  }[];
};

const readScreensFixture = async (): Promise<ScreensFixture> => {
  const response = await fetch(
    new URL("../testdata/claude_code_screens.json.gz", import.meta.url),
  );
  assert.assertExists(response.body);
  const stream = response.body.pipeThrough(new DecompressionStream("gzip"));

  return (await new Response(stream).json()) as ScreensFixture;
};

/** A corpus colour key ("16:1", "256:208", "rgb:d77757") as a vt.Color. */
const parseColor = (key: string): { mode: number; value: number } => {
  const [kind, value] = key.split(":");
  if (kind === "16") {
    return { mode: 1, value: Number(value) };
  }
  if (kind === "256") {
    return { mode: 2, value: Number(value) };
  }

  return { mode: 3, value: Number.parseInt(value ?? "0", 16) };
};

const FLAG_NAMES: Readonly<Record<string, number>> = {
  bold: 1,
  dim: 2,
  italic: 4,
  underline: 8,
  blink: 16,
  inverse: 32,
  invisible: 64,
  strikethrough: 128,
  overline: 256,
};

/** A corpus style key as a screen message style. */
const parseStyleKey = (key: string): Record<string, unknown> => {
  const style: Record<string, unknown> = {};
  let flags = 0;
  for (const part of key.split(" ").filter((p) => p !== "")) {
    const [name = "", value] = part.split("=");
    if (name === "fg" || name === "bg") {
      style[name] = parseColor(value ?? "");
    } else if (name === "underline-color") {
      style["underlineColor"] = parseColor(value ?? "");
    } else if (name === "underline-style") {
      style["underline"] = Number(value);
    } else {
      flags |= FLAG_NAMES[name] ?? 0;
    }
  }
  if (flags !== 0) {
    style["flags"] = flags;
  }

  return style;
};

nodeTest.test(
  "mux-render.js paints Claude Code's start screen and /help as the corpus recorded them",
  async () => {
    const fixture = await readScreensFixture();

    await withRenderer((page) => {
      for (const [index, step] of fixture.steps.entries()) {
        for (const frame of step.frames) {
          page.renderer.applyFrame(frame);
        }

        const painted = view(page, fixture.pane);
        const want = step.expect;
        const label = `step ${index}`;

        // The text of every row, as the browser's text (and a screen reader)
        // reads it; the rows leave out the blank cells at their end.
        assert.assertEquals(
          painted.rows.map((row) => row.trimEnd()),
          want.lines.map((line) => line.trimEnd()),
          label,
        );
        assert.assertEquals(painted.altScreen, want.alt === true, label);
        assert.assertEquals(
          painted.element.getAttribute("aria-label"),
          want.title !== undefined && want.title !== ""
            ? `Terminal: ${want.title}`
            : "Terminal",
          label,
        );

        // Each cell's style, from the spans' widths and CSS.
        const keys = want.lines.map(() =>
          Array.from({ length: fixture.cols }, () => ""),
        );
        for (const run of want.styles ?? []) {
          for (let col = run.col; col < run.col + run.len; col++) {
            at(keys, run.row)[col] = run.style;
          }
        }
        const wide = new Set(
          (want.widths ?? [])
            .filter(([, , width]) => width === 2)
            .map(([row, col]) => `${row}:${col}`),
        );

        for (const [row, element] of rowElements(
          page,
          fixture.pane,
        ).entries()) {
          let col = 0;
          for (const span of runSpans(element)) {
            const cells = cellsOf(span);
            if (wide.has(`${row}:${col}`)) {
              assert.assertEquals(
                cells,
                2,
                `${label}: wide cell ${row}:${col}`,
              );
              assert.assertEquals([...span.textContent].length, 1, label);
            }
            for (let i = 0; i < cells; i++) {
              const key = at(keys, row)[col + i] ?? "";
              assert.assertEquals(
                spanCSS(span),
                page.mux.styleCSS(parseStyleKey(key)).css,
                `${label}: style of ${row}:${col + i} (${key})`,
              );
            }
            col += cells;
          }
          assert.assert(col <= fixture.cols, `${label}: row ${row} overflows`);
        }

        // The cursor.
        const cursor = painted.element.querySelector("div.mux-cursor");
        assert.assertExists(cursor);
        assert.assertEquals(cursor.hidden, want.cursorHidden === true, label);
        assert.assertEquals(
          cursor.style["left"],
          `${want.cursor.X * CELL.w}px`,
          label,
        );
        assert.assertEquals(
          cursor.style["top"],
          `${want.cursor.Y * CELL.h}px`,
          label,
        );
      }

      // The URL in the start screen's notice is a link that opens elsewhere.
      const links = view(page, fixture.pane).element.querySelectorAll(
        "a.mux-link",
      );
      assert.assert(links.length > 0, "no link in the /help screen");
      for (const link of links) {
        assert.assertStringIncludes(link.href, "https://code.claude.com/");
        assert.assertEquals(link.rel, "noopener noreferrer");
        assert.assertEquals(link.target, "_blank");
      }
    });
  },
);

// =============================================================================
// mux-render.js: painting
// =============================================================================

nodeTest.test(
  "mux-render.js repaints only the rows a patch changed",
  async () => {
    await withRenderer((page) => {
      page.renderer.applyFrame(
        screen({
          lines: [textLine(0, "one"), textLine(1, "two"), textLine(2, "three")],
        }),
      );
      const before = rowElements(page).map((row) => [...row.childNodes]);

      page.renderer.applyFrame(patch({ lines: [textLine(1, "TWO")] }));

      const after = rowElements(page).map((row) => [...row.childNodes]);
      assert.assertStrictEquals(at(at(after, 0), 0), at(at(before, 0), 0));
      assert.assertNotStrictEquals(at(at(after, 1), 0), at(at(before, 1), 0));
      assert.assertStrictEquals(at(at(after, 2), 0), at(at(before, 2), 0));
      assert.assertEquals(view(page).rows, ["one", "TWO", "three"]);
    });
  },
);

nodeTest.test(
  "mux-render.js gives each wide character two cells and keeps the grid",
  async () => {
    await withRenderer((page) => {
      page.renderer.applyFrame(
        screen({
          lines: [
            [
              0,
              [
                ["ok "],
                ["漢字", 0, 4, 2],
                2,
                ["é", 0, 1, 1, 1],
                ["", 0, 1, 0],
                ["|"],
              ],
            ],
          ],
        }),
      );

      const spans = runSpans(at(rowElements(page), 0));
      assert.assertEquals(
        spans.map((span) => [span.textContent, cellsOf(span)]),
        [
          ["ok ", 3],
          ["漢", 2],
          ["字", 2],
          ["  ", 2],
          ["é", 1],
          [" ", 1],
          ["|", 1],
        ],
      );
      assert.assertEquals(view(page).rows[0], "ok 漢字  é |");
    });
  },
);

nodeTest.test(
  "mux-render.js skips runs and rows of a shape the protocol does not have",
  async () => {
    await withRenderer((page) => {
      page.renderer.applyFrame(
        screen({
          cols: 10,
          lines: [
            [
              0,
              [
                ["ab", 99],
                { text: "old", width: 1, cells: 3 },
                -4,
                ["cd", "x"],
                ["fg", 0, 2, 7],
                "zz",
                null,
                3,
                ["h"],
                ["cut off"],
              ],
            ],
            { row: 1, runs: [["lost"]] },
            [7, [["lost"]]],
            [-1, [["lost"]]],
            [2, "runs", 1],
          ],
        }),
      );

      assert.assertEquals(view(page).rows, ["abcdfg   h", "", ""]);
    });
  },
);

nodeTest.test(
  "mux-render.js keeps a run's text inside the cells it claims",
  async () => {
    await withRenderer((page) => {
      page.renderer.applyFrame(
        screen({
          cols: 10,
          lines: [
            [0, [["abcdef", 0, 2], ["xyz"]]],
            [1, [["日本語", 0, 3, 2], ["ok"]]],
            [2, [["0123456789abc"]]],
          ],
        }),
      );

      assert.assertEquals(view(page).rows, ["abxyz", "日ok", "0123456789"]);
    });
  },
);

nodeTest.test(
  "mux-render.js paints 256 colours, truecolour and every attribute",
  async () => {
    await withRenderer((page) => {
      const { styleCSS } = page.mux;

      assert.assertEquals(styleCSS({}).css, {});
      assert.assertEquals(styleCSS({ fg: { mode: 1, value: 1 } }).css, {
        color: "rgb(204, 0, 0)",
      });
      // Bold draws the first eight colours bright, as xterm.js does.
      assert.assertEquals(
        styleCSS({ fg: { mode: 1, value: 1 }, flags: 1 }).css,
        {
          color: "rgb(239, 41, 41)",
          fontWeight: "bold",
        },
      );
      assert.assertEquals(styleCSS({ fg: { mode: 2, value: 208 } }).css, {
        color: "rgb(255, 135, 0)",
      });
      assert.assertEquals(styleCSS({ bg: { mode: 2, value: 244 } }).css, {
        backgroundColor: "rgb(128, 128, 128)",
      });
      assert.assertEquals(styleCSS({ fg: { mode: 3, value: 0xd77757 } }).css, {
        color: "rgb(215, 119, 87)",
      });
      assert.assertEquals(styleCSS({ flags: 2 }).css, {
        color: "rgba(230, 237, 243, 0.5)",
      });
      assert.assertEquals(styleCSS({ flags: 4 }).css, { fontStyle: "italic" });
      assert.assertEquals(
        styleCSS({
          flags: 8,
          underline: 3,
          underlineColor: { mode: 3, value: 0x00ff00 },
        }).css,
        {
          textDecorationLine: "underline",
          textDecorationStyle: "wavy",
          textDecorationColor: "rgb(0, 255, 0)",
        },
      );
      assert.assertEquals(styleCSS({ flags: 8, underline: 2 }).css, {
        textDecorationLine: "underline",
        textDecorationStyle: "double",
      });
      assert.assertEquals(styleCSS({ flags: 128 | 256 }).css, {
        textDecorationLine: "line-through overline",
      });
      // Inverse swaps the colours, the defaults included.
      assert.assertEquals(styleCSS({ flags: 32 }).css, {
        color: "rgb(0, 0, 0)",
        backgroundColor: "rgb(230, 237, 243)",
      });
      assert.assertEquals(
        styleCSS({ fg: { mode: 3, value: 0x112233 }, flags: 32 }).css,
        { color: "rgb(0, 0, 0)", backgroundColor: "rgb(17, 34, 51)" },
      );
      assert.assertEquals(styleCSS({ flags: 64 }).css, {
        color: "transparent",
      });
      assert.assertEquals(styleCSS({ flags: 16 }).blink, true);

      page.renderer.applyFrame(
        screen({
          styles: [{}, { fg: { mode: 2, value: 33 }, flags: 1 | 16 }],
          lines: [textLine(0, "hot", 1)],
        }),
      );
      const span = at(runSpans(at(rowElements(page), 0)), 0);
      assert.assertEquals(span.className, "mux-run mux-blink");
      assert.assertEquals(span.style["color"], "rgb(0, 135, 255)");
      assert.assertEquals(span.style["fontWeight"], "bold");
    });
  },
);

nodeTest.test(
  "mux-render.js draws the cursor's shape, blink and visibility",
  async () => {
    await withRenderer((page) => {
      const cursor = (): FakeElement => {
        const found = view(page).element.querySelector("div.mux-cursor");
        assert.assertExists(found);

        return found;
      };

      page.renderer.applyFrame(
        screen({
          cursor: { x: 4, y: 2, visible: true, shape: "bar", blink: true },
        }),
      );
      assert.assertEquals(cursor().className, "mux-cursor bar blink");
      assert.assertEquals(cursor().style["left"], "32px");
      assert.assertEquals(cursor().style["top"], "32px");
      assert.assertEquals(cursor().getAttribute("aria-hidden"), "true");
      assert.assertFalse(cursor().hidden);

      page.renderer.applyFrame(
        patch({
          cursor: {
            x: 0,
            y: 0,
            visible: true,
            shape: "underline",
            blink: false,
          },
        }),
      );
      assert.assertEquals(cursor().className, "mux-cursor underline");

      page.renderer.applyFrame(
        patch({ cursor: { x: 0, y: 0, visible: false } }),
      );
      assert.assertEquals(cursor().className, "mux-cursor block");
      assert.assert(cursor().hidden);
    });
  },
);

nodeTest.test(
  "mux-render.js builds text nodes, never markup, from row text and tab names",
  async () => {
    await withRenderer((page) => {
      page.renderer.applyFrame(
        screen({
          cols: 40,
          lines: [textLine(0, "<img src=x onerror=alert(1)>")],
        }),
      );
      const span = at(runSpans(at(rowElements(page), 0)), 0);
      assert.assertEquals(span.childNodes.length, 1);
      assert.assert(at(span.childNodes, 0) instanceof FakeText);
      assert.assertEquals(span.textContent, "<img src=x onerror=alert(1)>");

      page.renderer.applyFrame({
        t: "scene",
        delta: {
          tabs: [
            { id: "t1", name: "upload" },
            { id: "t2", name: '<b>"x"' },
          ],
          activeTab: 0,
        },
      });
      const tabs = page.tabBar.children;
      assert.assertEquals(tabs.length, 3);
      assert.assertEquals(at(tabs, 0).className, "tab active");
      assert.assertEquals(at(tabs, 0).dataset["tab"], "t1");
      const select = at(at(tabs, 1).children, 0);
      const close = at(at(tabs, 1).children, 1);
      assert.assertEquals(select.tagName, "button");
      assert.assertEquals(select.className, "tab-select");
      assert.assertEquals(select.dataset["index"], "1");
      assert.assertEquals(select.textContent, '<b>"x"');
      assert.assertEquals(close.getAttribute("aria-label"), 'Close <b>"x"');
      assert.assertEquals(at(tabs, 2).id, "add-tab");
      assert.assertEquals(at(tabs, 2).getAttribute("aria-label"), "New tab");
      assert.assertEquals(
        at(at(tabs, 0).children, 0).getAttribute("aria-current"),
        "true",
      );
    });
  },
);

// =============================================================================
// mux-render.js: links
// =============================================================================

nodeTest.test(
  "mux-render.js opens only http, https and mailto links",
  async () => {
    await withRenderer(({ mux }) => {
      assert.assert(mux.isSafeLinkURI("https://example.com/a"));
      assert.assert(mux.isSafeLinkURI("HTTP://example.com"));
      assert.assert(mux.isSafeLinkURI("mailto:someone@example.com"));
      for (const uri of [
        "javascript:alert(1)",
        "JaVaScRiPt:alert(1)",
        "data:text/html,<b>x</b>",
        "file:///etc/passwd",
        "vbscript:x",
        "custom-app://open",
        "/relative/path",
        "",
      ]) {
        assert.assertFalse(mux.isSafeLinkURI(uri), uri);
      }
    });
  },
);

nodeTest.test(
  "mux-render.js links OSC 8 hyperlinks with a safe scheme",
  async () => {
    await withRenderer((page) => {
      page.renderer.applyFrame(
        screen({
          links: [
            { link: 1, uri: "https://example.com/docs" },
            { link: 2, uri: "javascript:alert(1)" },
          ],
          lines: [
            [0, [["docs", 0, 4, 1, 0, 1], [" "], ["evil", 0, 4, 1, 0, 2]]],
          ],
        }),
      );

      const row = at(rowElements(page), 0);
      const links = row.querySelectorAll("a.mux-link");
      assert.assertEquals(links.length, 1);
      assert.assertEquals(at(links, 0).href, "https://example.com/docs");
      assert.assertEquals(at(links, 0).rel, "noopener noreferrer");
      assert.assertEquals(at(links, 0).target, "_blank");
      assert.assertEquals(at(links, 0).tabIndex, -1);
      assert.assertEquals(at(links, 0).textContent, "docs");
      assert.assertEquals(row.textContent, "docs evil");
    });
  },
);

nodeTest.test(
  "mux-render.js links plain URLs in row text without their trailing punctuation",
  async () => {
    await withRenderer((page) => {
      assert.assertEquals(
        page.mux.findPlainLinks(
          "see https://example.com/a?b=1. or http://x.dev)",
        ),
        [
          { start: 4, end: 29, uri: "https://example.com/a?b=1" },
          { start: 34, end: 46, uri: "http://x.dev" },
        ],
      );
      assert.assertEquals(page.mux.findPlainLinks("file:///etc/passwd"), []);

      page.renderer.applyFrame(
        screen({
          cols: 40,
          styles: [{}, { fg: { mode: 1, value: 4 } }],
          lines: [[0, [["go to https://exa"], ["mple.com/x.", 1]]]],
        }),
      );

      const row = at(rowElements(page), 0);
      const link = at(row.querySelectorAll("a.mux-link"), 0);
      assert.assertEquals(link.href, "https://example.com/x");
      assert.assertEquals(link.textContent, "https://example.com/x");
      assert.assertEquals(
        runSpans(row).map((span) => [span.textContent, cellsOf(span)]),
        [
          ["go to ", 6],
          ["https://exa", 11],
          ["mple.com/x", 10],
          [".", 1],
        ],
      );
    });
  },
);

nodeTest.test(
  "mux-render.js leaves a link click to the program that takes mouse reports",
  async () => {
    await withRenderer((page) => {
      page.renderer.applyFrame(
        screen({
          mouse: "any",
          links: [{ link: 1, uri: "https://example.com" }],
          lines: [[0, [["x", 0, 1, 1, 0, 1]]]],
        }),
      );
      const link = at(
        at(rowElements(page), 0).querySelectorAll("a.mux-link"),
        0,
      );
      const span = at(runSpans(link), 0);

      assert.assert(
        screenElement(page).dispatch("click", { target: span })
          .defaultPrevented,
      );
      assert.assertFalse(
        screenElement(page).dispatch("click", { target: span, ctrlKey: true })
          .defaultPrevented,
      );
    });
  },
);

// =============================================================================
// mux-render.js: keys, IME, paste and focus
// =============================================================================

const keydown = (
  page: RenderPage,
  fields: Readonly<Record<string, unknown>>,
): FakeEvent => input(page).dispatch("keydown", fields);

nodeTest.test("mux-render.js sends key presses as key messages", async () => {
  await withRenderer((page) => {
    page.renderer.applyFrame(screen());

    assert.assert(keydown(page, { key: "a", code: "KeyA" }).defaultPrevented);
    keydown(page, { key: "A", code: "KeyA", shiftKey: true });
    keydown(page, {
      key: "ArrowLeft",
      code: "ArrowLeft",
      shiftKey: true,
      ctrlKey: true,
    });
    keydown(page, { key: "c", code: "KeyC", ctrlKey: true });
    keydown(page, { key: "x", code: "KeyX", altKey: true });
    keydown(page, { key: "Tab", code: "Tab" });
    // AltGr composes the character it types.
    keydown(page, {
      key: "@",
      code: "KeyQ",
      ctrlKey: true,
      altKey: true,
      getModifierState: (name: string) => name === "AltGraph",
    });

    assert.assertEquals(page.sent, [
      { t: "key", pane: "pane-1", key: { key: "a", code: "KeyA", text: "a" } },
      {
        t: "key",
        pane: "pane-1",
        key: { key: "A", code: "KeyA", shift: true, text: "A" },
      },
      {
        t: "key",
        pane: "pane-1",
        key: { key: "ArrowLeft", code: "ArrowLeft", shift: true, ctrl: true },
      },
      { t: "key", pane: "pane-1", key: { key: "c", code: "KeyC", ctrl: true } },
      { t: "key", pane: "pane-1", key: { key: "x", code: "KeyX", alt: true } },
      { t: "key", pane: "pane-1", key: { key: "Tab", code: "Tab" } },
      { t: "key", pane: "pane-1", key: { key: "@", code: "KeyQ", text: "@" } },
    ]);
  });
});

nodeTest.test(
  "mux-render.js leaves browser chords, modifiers and composition alone",
  async () => {
    await withRenderer((page) => {
      page.renderer.applyFrame(screen());

      for (const fields of [
        { key: "Shift", code: "ShiftLeft", shiftKey: true },
        { key: "c", code: "KeyC", metaKey: true },
        { key: "v", code: "KeyV", metaKey: true },
        { key: "V", code: "KeyV", ctrlKey: true, shiftKey: true },
        { key: "Dead", code: "Quote" },
        { key: "a", code: "KeyA", isComposing: true },
        { key: "Process", code: "KeyA", keyCode: 229 },
      ]) {
        assert.assertFalse(keydown(page, fields).defaultPrevented, fields.key);
      }
      assert.assertEquals(page.sent, []);
    });
  },
);

nodeTest.test(
  "mux-render.js leaves the terminal with Ctrl+Shift+L and copies with Ctrl+Shift+C",
  async () => {
    await withRenderer(async (page) => {
      page.renderer.applyFrame(screen());

      assert.assert(
        keydown(page, { key: "L", code: "KeyL", ctrlKey: true, shiftKey: true })
          .defaultPrevented,
      );
      assert.assertEquals(page.left, [1]);

      page.selection.text = "ls -l   \ntotal 0  ";
      keydown(page, { key: "C", code: "KeyC", ctrlKey: true, shiftKey: true });
      await Promise.resolve();
      assert.assertEquals(page.clipboard, ["ls -l\ntotal 0"]);
      assert.assertEquals(page.sent, []);
    });
  },
);

nodeTest.test(
  "mux-render.js sends pastes and IME text as paste messages",
  async () => {
    await withRenderer((page) => {
      page.renderer.applyFrame(screen());
      const textarea = input(page);

      const pasted = textarea.dispatch("paste", {
        clipboardData: {
          getData: (type: string) => (type === "text/plain" ? "echo hi\n" : ""),
        },
      });
      assert.assert(pasted.defaultPrevented);

      textarea.value = "にほん";
      textarea.dispatch("input", {
        isComposing: true,
        inputType: "insertCompositionText",
        data: "にほん",
      });
      textarea.dispatch("compositionend", { data: "日本" });
      assert.assertEquals(textarea.value, "");

      // An on-screen keyboard sends text with no usable keydown.
      textarea.dispatch("input", { inputType: "insertText", data: "q" });
      textarea.dispatch("input", { inputType: "insertLineBreak", data: null });

      assert.assertEquals(page.sent, [
        { t: "paste", pane: "pane-1", paste: { text: "echo hi\n" } },
        { t: "paste", pane: "pane-1", paste: { text: "日本" } },
        { t: "key", pane: "pane-1", key: { key: "q", text: "q" } },
        { t: "key", pane: "pane-1", key: { key: "Enter", code: "Enter" } },
      ]);
    });
  },
);

nodeTest.test(
  "mux-render.js reports focus and focuses the pane in the scene",
  async () => {
    await withRenderer((page) => {
      page.renderer.applyFrame(screen());
      page.renderer.applyFrame(screen({}, "pane-2"));
      page.renderer.applyFrame({
        t: "scene",
        delta: {
          focusedPane: "pane-1",
          panes: [
            {
              id: "pane-1",
              focused: true,
              geom: { x: 0, y: 0, width: 22, height: 5 },
            },
            {
              id: "pane-2",
              focused: false,
              geom: { x: 22, y: 0, width: 22, height: 5 },
            },
          ],
        },
      });

      // The scene's focused pane takes the keyboard.
      assert.assertStrictEquals(
        page.document.activeElement,
        input(page, "pane-1"),
      );
      assert.assertEquals(page.sent, [
        { t: "focus", pane: "pane-1", focus: { focused: true } },
      ]);
      assert.assert(view(page, "pane-1").element.classList.contains("focused"));

      page.sent.length = 0;
      input(page, "pane-2").focus();
      assert.assertEquals(page.sent, [
        { t: "focus", pane: "pane-1", focus: { focused: false } },
        { t: "action", action: { type: "focusPane", pane: "pane-2" } },
        { t: "focus", pane: "pane-2", focus: { focused: true } },
      ]);

      const textarea = input(page, "pane-2");
      assert.assertEquals(
        textarea.getAttribute("aria-label"),
        "Terminal input",
      );
      assert.assertEquals(
        textarea.getAttribute("aria-describedby"),
        "mux-input-hint",
      );
      assert.assertEquals(
        view(page, "pane-2").element.getAttribute("role"),
        "region",
      );
    });
  },
);

// =============================================================================
// mux-render.js: mouse, wheel and local scrollback
// =============================================================================

const mouse = (
  page: RenderPage,
  type: string,
  fields: Readonly<Record<string, unknown>>,
): FakeEvent => screenElement(page).dispatch(type, fields);

nodeTest.test(
  "mux-render.js sends no mouse messages while the program asks for none",
  async () => {
    await withRenderer((page) => {
      page.renderer.applyFrame(screen());

      assert.assertFalse(
        mouse(page, "mousedown", { button: 0, clientX: 20, clientY: 20 })
          .defaultPrevented,
      );
      mouse(page, "mousemove", { buttons: 1, clientX: 30, clientY: 20 });
      mouse(page, "mouseup", { button: 0, clientX: 30, clientY: 20 });
      assert.assertEquals(
        page.sent.filter((frame) => frame["t"] === "mouse"),
        [],
      );
    });
  },
);

nodeTest.test(
  "mux-render.js sends mouse messages by the pane's mouse mode",
  async () => {
    await withRenderer((page) => {
      page.renderer.applyFrame(screen({ mouse: "drag" }));

      // Cell 2,1 (8 by 16 pixel cells), with the pixel offset for SGR pixels.
      const press = mouse(page, "mousedown", {
        button: 0,
        buttons: 1,
        clientX: 20,
        clientY: 20,
        altKey: true,
      });
      assert.assert(press.defaultPrevented);
      // Drag mode reports motion with a button held only.
      mouse(page, "mousemove", { buttons: 1, clientX: 36, clientY: 20 });
      mouse(page, "mousemove", { buttons: 1, clientX: 37, clientY: 20 });
      page.document.dispatch("mouseup", {
        button: 0,
        clientX: 36,
        clientY: 20,
      });
      mouse(page, "mousemove", { buttons: 0, clientX: 50, clientY: 20 });
      // Shift keeps the mouse for selecting text.
      assert.assertFalse(
        mouse(page, "mousedown", {
          button: 0,
          shiftKey: true,
          clientX: 0,
          clientY: 0,
        }).defaultPrevented,
      );
      mouse(page, "wheel", {
        deltaY: -16,
        deltaMode: 0,
        clientX: 0,
        clientY: 0,
      });

      assert.assertEquals(
        page.sent.filter((frame) => frame["t"] === "mouse"),
        [
          {
            t: "mouse",
            pane: "pane-1",
            mouse: {
              kind: "press",
              row: 1,
              col: 2,
              x: 20,
              y: 20,
              alt: true,
              button: "left",
            },
          },
          {
            t: "mouse",
            pane: "pane-1",
            mouse: {
              kind: "move",
              row: 1,
              col: 4,
              x: 36,
              y: 20,
              button: "left",
            },
          },
          {
            t: "mouse",
            pane: "pane-1",
            mouse: {
              kind: "release",
              row: 1,
              col: 4,
              x: 36,
              y: 20,
              button: "left",
            },
          },
          {
            t: "mouse",
            pane: "pane-1",
            mouse: { kind: "wheel", row: 0, col: 0, x: 0, y: 0, wheel: "up" },
          },
        ],
      );
    });
  },
);

/** History lines as a screen message sends them: [[[text]]]. */
const historyLines = (count: number): unknown[] =>
  Array.from({ length: count }, (_, i) => [[[`old ${i}`]]]);

nodeTest.test(
  "mux-render.js scrolls its own history with the wheel and the keyboard",
  async () => {
    await withRenderer((page) => {
      page.renderer.applyFrame(
        screen({
          history: { reset: true, lines: historyLines(10) },
          lines: [
            textLine(0, "now 0"),
            textLine(1, "now 1"),
            textLine(2, "now 2"),
          ],
        }),
      );
      assert.assertEquals(view(page).historyLength, 10);

      // Two rows up.
      const wheel = mouse(page, "wheel", { deltaY: -32, deltaMode: 0 });
      assert.assert(wheel.defaultPrevented);
      assert.assertEquals(view(page).rows, ["old 8", "old 9", "now 0"]);
      assert.assertEquals(page.sent, []);

      // Lines that scroll into the history keep the view where it is.
      page.renderer.applyFrame(
        patch({
          history: {
            lines: [[[["now 0"]]]],
          },
          lines: [
            textLine(0, "now 1"),
            textLine(1, "now 2"),
            textLine(2, "now 3"),
          ],
        }),
      );
      assert.assertEquals(view(page).rows, ["old 8", "old 9", "now 0"]);
      assert.assertEquals(view(page).scroll, 3);

      // Shift+Page Up and Down scroll by a page, without reaching the program.
      keydown(page, { key: "PageUp", code: "PageUp", shiftKey: true });
      assert.assertEquals(view(page).rows, ["old 6", "old 7", "old 8"]);
      keydown(page, { key: "PageDown", code: "PageDown", shiftKey: true });
      assert.assertEquals(view(page).scroll, 3);
      assert.assertEquals(page.sent, []);

      // Typing goes back to the live screen.
      keydown(page, { key: "a", code: "KeyA" });
      assert.assertEquals(view(page).scroll, 0);
      assert.assertEquals(view(page).rows, ["now 1", "now 2", "now 3"]);
    });
  },
);

nodeTest.test(
  "mux-render.js sends the wheel as cursor keys on the alternate screen",
  async () => {
    await withRenderer((page) => {
      page.renderer.applyFrame(
        screen({
          altScreen: true,
          history: { reset: true, lines: historyLines(4) },
        }),
      );

      mouse(page, "wheel", { deltaY: 3, deltaMode: 1 });
      assert.assertEquals(view(page).scroll, 0);
      assert.assertEquals(
        page.sent,
        Array.from({ length: 3 }, () => ({
          t: "key",
          pane: "pane-1",
          key: { key: "ArrowDown", code: "ArrowDown" },
        })),
      );

      // Shift+Page Up is the program's there.
      page.sent.length = 0;
      keydown(page, { key: "PageUp", code: "PageUp", shiftKey: true });
      assert.assertEquals(page.sent, [
        {
          t: "key",
          pane: "pane-1",
          key: { key: "PageUp", code: "PageUp", shift: true },
        },
      ]);
    });
  },
);

nodeTest.test(
  "mux-render.js copies the selection without the blanks that pad rows",
  async () => {
    await withRenderer((page) => {
      page.renderer.applyFrame(screen());
      page.selection.text = "first   \nsecond  ";

      const data: Record<string, string> = {};
      const copied = screenElement(page).dispatch("copy", {
        clipboardData: {
          setData: (type: string, text: string) => {
            data[type] = text;
          },
        },
      });
      assert.assert(copied.defaultPrevented);
      assert.assertEquals(data, { "text/plain": "first\nsecond" });
    });
  },
);

nodeTest.test("mux-render.js attaches with its viewport", async () => {
  await withRenderer((page) => {
    assert.assertEquals(page.renderer.attachFrame(), {
      t: "attach",
      viewport: { cols: 100, rows: 30 },
    });
  });
});

// =============================================================================
// client.js
// =============================================================================

nodeTest.test("client.js attaches /mux and feeds the renderer", async () => {
  const document = new FakeDocument();
  const root = document.createElement("div");
  const sockets: FakeWebSocket[] = [];
  const applied: unknown[] = [];

  class FakeWebSocket {
    static readonly OPEN = 1;
    readonly readyState = 1;
    readonly sent: unknown[] = [];
    onopen: (() => void) | null = null;
    onmessage: ((event: { data: string }) => void) | null = null;
    onclose: unknown = null;
    onerror: unknown = null;

    constructor(readonly url: string) {
      sockets.push(this);
    }

    send(data: string): void {
      this.sent.push(JSON.parse(data));
    }
  }

  const page = Object.assign(document, {
    querySelector: (selector: string) =>
      selector === 'meta[name="noskills-token"]'
        ? { content: "page-token" }
        : null,
    getElementById: (id: string) => (id === "terminal-container" ? root : null),
  });

  const restore = await runScript("client.js", {
    document: page,
    fetch: () => Promise.resolve(Response.json({})),
    location: { protocol: "http:", host: "127.0.0.1:3000" },
    EventSource: class {
      onmessage: unknown = null;
      onerror: unknown = null;
    },
    WebSocket: FakeWebSocket,
    MuxRender: {
      FONT_FAMILY: "monospace",
      FONT_SIZE_PX: 13,
      measureCell: () => ({ w: 8, h: 16 }),
      createRenderer: () => ({
        attachFrame: () => ({ t: "attach", viewport: { cols: 80, rows: 24 } }),
        viewport: () => ({ cols: 80, rows: 24 }),
        applyFrame: (frame: unknown) => applied.push(frame),
      }),
    },
  });

  try {
    assert.assertEquals(sockets.length, 1);
    assert.assertEquals(
      at(sockets, 0).url,
      "ws://127.0.0.1:3000/mux?token=page-token",
    );

    at(sockets, 0).onopen?.();
    at(sockets, 0).onmessage?.({ data: '{"t":"screen","pane":"pane-1"}' });
    at(sockets, 0).onmessage?.({ data: "not json" });

    assert.assertEquals(at(sockets, 0).sent, [
      {
        t: "attach",
        viewport: { cols: 80, rows: 24 },
      },
    ]);
    assert.assertEquals(applied, [{ t: "screen", pane: "pane-1" }]);
  } finally {
    restore();
  }
});
