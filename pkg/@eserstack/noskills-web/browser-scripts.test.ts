// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * Runs the browser scripts in static/ against stand-ins for the browser
 * globals they read, so their event handling is checked without a browser.
 * noskillsserverfx serves byte-identical copies, so these checks cover the Go
 * dashboard too.
 */

import * as assert from "@eserstack/test-kit/assert";
import { runtime } from "@eserstack/standards/cross-runtime";

// =============================================================================
// Harness
// =============================================================================

/**
 * Runs static/`name` as the browser runs a classic script, with `globals`
 * installed on globalThis. The returned function puts the previous globals
 * back; the script's listeners keep reading the stand-ins until then.
 */
const runScript = async (
  name: string,
  globals: Readonly<Record<string, unknown>>,
): Promise<() => void> => {
  const source = await runtime.fs.readTextFile(
    runtime.path.join(import.meta.dirname ?? ".", "static", name),
  );

  const saved = Object.keys(globals).map((key) =>
    [key, Object.getOwnPropertyDescriptor(globalThis, key)] as const
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

/** The part of a DOM element the click handlers read. */
type FakeElement = {
  readonly classList: { readonly contains: (name: string) => boolean };
  readonly dataset: Readonly<Record<string, string>>;
  readonly id: string;
  readonly closest: (selector: string) => FakeElement | null;
};

/**
 * An element with `classes`, `dataset` and `id` inside `parent`. closest()
 * matches a ".class" or "#id" selector, the only kinds the scripts use.
 */
const element = (opts: {
  readonly classes?: readonly string[];
  readonly dataset?: Readonly<Record<string, string>>;
  readonly id?: string;
  readonly parent?: FakeElement;
}): FakeElement => {
  const classes = new Set(opts.classes ?? []);
  const self: FakeElement = {
    classList: { contains: (name) => classes.has(name) },
    dataset: opts.dataset ?? {},
    id: opts.id ?? "",
    closest: (selector) => {
      const matches = selector.startsWith("#")
        ? self.id === selector.slice(1)
        : classes.has(selector.slice(1));
      if (matches) {
        return self;
      }

      return opts.parent?.closest(selector) ?? null;
    },
  };

  return self;
};

/** A request client.js made, with its method and token header. */
type SentRequest = {
  readonly url: string;
  readonly method: string;
  readonly token: string | null;
};

/** The dashboard page client.js runs in, with its requests, frames and alerts. */
type ClientPage = {
  readonly requests: SentRequest[];
  readonly frames: unknown[];
  readonly alerts: string[];
  readonly click: (target: FakeElement) => Promise<void>;
  readonly restore: () => void;
};

/**
 * Loads client.js into a dashboard page whose token is "page-token" and
 * whose /mux socket is open. `respond` answers every request but the boot
 * read of /api/state.
 */
const clientPage = async (
  respond: (url: string, init: RequestInit) => Promise<Response>,
): Promise<ClientPage> => {
  const requests: SentRequest[] = [];
  const frames: unknown[] = [];
  const alerts: string[] = [];
  const clickListeners: ((event: unknown) => unknown)[] = [];

  const document = {
    querySelector: (selector: string) =>
      selector === 'meta[name="noskills-token"]'
        ? { content: "page-token" }
        : null,
    getElementById: (id: string) => id === "terminal-container" ? {} : null,
    addEventListener: (type: string, listener: (event: unknown) => unknown) => {
      if (type === "click") {
        clickListeners.push(listener);
      }
    },
  };

  class FakeEventSource {
    onmessage: unknown = null;
    onerror: unknown = null;
  }

  class FakeWebSocket {
    static readonly OPEN = 1;
    readonly readyState = 1;
    onopen: unknown = null;
    onmessage: unknown = null;
    onclose: unknown = null;
    onerror: unknown = null;
    send(data: string): void {
      frames.push(JSON.parse(data));
    }
  }

  const fetch = (url: string, init: RequestInit = {}): Promise<Response> => {
    const method = init.method ?? "GET";
    if (url === "/api/state" && method === "GET") {
      return Promise.resolve(Response.json({}));
    }

    const headers = new Headers(init.headers);
    requests.push({ url, method, token: headers.get("x-noskills-token") });

    return respond(url, init);
  };

  const restore = await runScript("client.js", {
    document,
    fetch,
    location: { protocol: "http:", host: "127.0.0.1:3000" },
    EventSource: FakeEventSource,
    WebSocket: FakeWebSocket,
    Terminal: class {},
    MuxRender: {
      FONT_FAMILY: "monospace",
      FONT_SIZE_PX: 13,
      measureCell: () => ({ w: 8, h: 16 }),
      createRenderer: () => ({
        viewport: () => ({ cols: 80, rows: 24 }),
        applyFrame: () => {},
      }),
    },
    alert: (message: string) => {
      alerts.push(message);
    },
    prompt: () => null,
  });

  const click = async (target: FakeElement): Promise<void> => {
    for (const listener of clickListeners) {
      // The listeners run in order, as the browser runs them.
      // deno-lint-ignore no-await-in-loop
      await listener({ target, stopPropagation: () => {} });
    }
  };

  return { requests, frames, alerts, click, restore };
};

/** The deepest nesting of <button> elements in `html`. */
const buttonDepth = (html: string): number => {
  let depth = 0;
  let deepest = 0;

  for (const match of html.matchAll(/<(\/?)button\b/g)) {
    depth += match[1] === "/" ? -1 : 1;
    deepest = Math.max(deepest, depth);
  }

  return deepest;
};

// =============================================================================
// client.js: spec actions
// =============================================================================

const approveButton = element({
  classes: ["cta-btn"],
  dataset: { spec: "upload", action: "approve" },
});

Deno.test("client.js shows a plain-text refusal in the alert", async () => {
  const page = await clientPage(() =>
    Promise.resolve(
      new Response("Forbidden: missing or invalid token", { status: 403 }),
    )
  );

  try {
    await page.click(approveButton);

    assert.assertEquals(page.requests, [
      { url: "/api/spec/upload/approve", method: "POST", token: "page-token" },
    ]);
    assert.assertEquals(page.alerts, [
      "Action failed: Forbidden: missing or invalid token (HTTP 403)",
    ]);
  } finally {
    page.restore();
  }
});

Deno.test("client.js names the request id of a fault in the alert", async () => {
  const page = await clientPage(() =>
    Promise.resolve(
      Response.json(
        { ok: false, error: "Action could not be completed", requestId: "r-1" },
        { status: 400 },
      ),
    )
  );

  try {
    await page.click(approveButton);

    assert.assertEquals(page.alerts, [
      "Action failed: Action could not be completed (request r-1 in the noskills web log)",
    ]);
  } finally {
    page.restore();
  }
});

Deno.test("client.js tells the user when the server does not answer", async () => {
  const page = await clientPage(() =>
    Promise.reject(new TypeError("connection refused"))
  );

  try {
    await page.click(approveButton);

    assert.assertEquals(page.alerts, [
      "Action failed: the noskills web server did not answer",
    ]);
  } finally {
    page.restore();
  }
});

// =============================================================================
// client.js: tabs
// =============================================================================

const tab = element({ classes: ["tab"], dataset: { tab: "t2" } });

Deno.test("client.js closes the tab of a close button", async () => {
  const page = await clientPage(() =>
    Promise.resolve(Response.json({ ok: true }))
  );

  try {
    await page.click(
      element({
        classes: ["tab-close"],
        dataset: { close: "t2" },
        parent: tab,
      }),
    );

    assert.assertEquals(page.requests, [
      { url: "/api/tab/t2", method: "DELETE", token: "page-token" },
    ]);
    assert.assertEquals(page.frames, []);
  } finally {
    page.restore();
  }
});

Deno.test("client.js switches to the tab of a tab button", async () => {
  const page = await clientPage(() =>
    Promise.resolve(Response.json({ ok: true }))
  );

  try {
    await page.click(
      element({
        classes: ["tab-select"],
        dataset: { index: "1" },
        parent: tab,
      }),
    );

    assert.assertEquals(page.frames, [
      { t: "action", action: { type: "gotoTab", index: 1 } },
    ]);
    assert.assertEquals(page.requests, []);
  } finally {
    page.restore();
  }
});

// =============================================================================
// mux-render.js: tab bar
// =============================================================================

Deno.test("mux-render.js renders a close button beside each tab button", async () => {
  const restore = await runScript("mux-render.js", { document: {} });

  try {
    const { MuxRender } = globalThis as unknown as {
      MuxRender: {
        createRenderer: (opts: Record<string, unknown>) => {
          applyFrame: (frame: unknown) => void;
        };
      };
    };
    const bar = { innerHTML: "" };
    const renderer = MuxRender.createRenderer({
      root: { clientWidth: 800, clientHeight: 600 },
      cell: { w: 8, h: 16 },
      send: () => {},
      tabBar: bar,
    });

    renderer.applyFrame({
      t: "scene",
      delta: {
        tabs: [{ id: "t1", name: "upload" }, { id: "t2", name: '<b>"x"' }],
        activeTab: 0,
      },
    });

    assert.assertEquals(buttonDepth(bar.innerHTML), 1);
    assert.assertStringIncludes(
      bar.innerHTML,
      '<div class="tab active" data-tab="t1"><button type="button" class="tab-select" data-index="0">upload</button><button type="button" class="tab-close" data-close="t1" aria-label="Close upload">&times;</button></div>',
    );
    assert.assertStringIncludes(
      bar.innerHTML,
      'aria-label="Close &lt;b&gt;&quot;x&quot;"',
    );
    assert.assertStringIncludes(
      bar.innerHTML,
      '<button type="button" class="tab-add" id="add-tab" aria-label="New tab">+</button>',
    );
  } finally {
    restore();
    delete (globalThis as Record<string, unknown>)["MuxRender"];
  }
});

// =============================================================================
// sw-register.js
// =============================================================================

/** Loads sw-register.js on a page served over `protocol`. */
const registerServiceWorker = async (
  protocol: string,
): Promise<{ fetched: string[]; posted: unknown[]; registered: string[] }> => {
  const fetched: string[] = [];
  const posted: unknown[] = [];
  const registered: string[] = [];

  const restore = await runScript("sw-register.js", {
    location: { protocol },
    navigator: {
      serviceWorker: {
        register: (url: string) => {
          registered.push(url);
          return Promise.resolve({
            active: { postMessage: (message: unknown) => posted.push(message) },
          });
        },
      },
    },
    fetch: (url: string) => {
      fetched.push(url);
      return Promise.resolve(Response.json({ fingerprint: "ab12" }));
    },
  });

  try {
    // Lets the registration and the fingerprint request settle.
    await new Promise((resolve) => setTimeout(resolve, 10));
  } finally {
    restore();
  }

  return { fetched, posted, registered };
};

Deno.test("sw-register.js asks a plain-HTTP page for no certificate fingerprint", async () => {
  const result = await registerServiceWorker("http:");

  assert.assertEquals(result.registered, ["/sw.js"]);
  assert.assertEquals(result.fetched, []);
  assert.assertEquals(result.posted, []);
});

Deno.test("sw-register.js hands the service worker the fingerprint over HTTPS", async () => {
  const result = await registerServiceWorker("https:");

  assert.assertEquals(result.fetched, ["/api/cert-fingerprint"]);
  assert.assertEquals(result.posted, [
    { type: "store_cert_fingerprint", fingerprint: "ab12" },
  ]);
});
