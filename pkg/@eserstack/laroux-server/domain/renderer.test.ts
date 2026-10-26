// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.
/**
 * Tests for Renderer port interface
 */

import * as nodeTest from "node:test";
import * as assert from "@eserstack/test-kit/assert";
import * as renderer from "./renderer.ts";
import type { RenderContext, Renderer } from "./renderer.ts";

// Mock render context for testing
function createMockRenderContext(): RenderContext {
  return {
    pathname: "/test",
    config: {} as unknown as RenderContext["config"],
    bundler: {
      getBundle: () =>
        Promise.resolve({
          clientCode: null,
          moduleMap: {},
          chunkManifest: {
            version: "1.0",
            buildId: "test",
            timestamp: Date.now(),
            chunks: {},
            files: {},
            entrypoint: "client.js",
            logLevel: "info",
          },
          entrypoint: "client.js",
        }),
    },
    params: {},
    request: new Request("http://localhost:3000/test"),
  };
}

nodeTest.test("Renderer - noopRenderer", async (t) => {
  await t.test("has correct name", () => {
    assert.assertEquals(renderer.noopRenderer.name, "noop");
  });

  await t.test("renderPage returns empty html", async () => {
    const context = createMockRenderContext();
    const Layout = () => null;
    const Page = () => null;

    const result = await renderer.noopRenderer.renderPage(
      Layout,
      Page,
      context,
    );

    assert.assertEquals(result.html, "");
    assert.assertEquals(result.rscPayload, undefined);
  });

  await t.test("renderRSC returns empty response", async () => {
    const context = createMockRenderContext();
    const Layout = () => null;
    const Page = () => null;

    const response = await renderer.noopRenderer.renderRSC(
      Layout,
      Page,
      context,
    );

    assert.assertExists(response);
    const text = await response.text();
    assert.assertEquals(text, "");
  });

  await t.test("generateBootstrapScript returns empty string", () => {
    const context = createMockRenderContext();
    const script = renderer.noopRenderer.generateBootstrapScript(context);

    assert.assertEquals(script, "");
  });
});

nodeTest.test("Renderer interface compliance", async (t) => {
  await t.test("noopRenderer implements Renderer interface", () => {
    const port: Renderer = renderer.noopRenderer;

    // Verify all required properties exist
    assert.assertEquals(typeof port.name, "string");
    assert.assertEquals(typeof port.renderPage, "function");
    assert.assertEquals(typeof port.renderRSC, "function");
    assert.assertEquals(typeof port.generateBootstrapScript, "function");
  });

  await t.test("renderPage is async function", () => {
    const result = renderer.noopRenderer.renderPage(
      null,
      null,
      createMockRenderContext(),
    );

    // Verify it returns a Promise
    assert.assertExists(result.then);
    assert.assertEquals(typeof result.then, "function");
  });

  await t.test("renderRSC is async function", () => {
    const result = renderer.noopRenderer.renderRSC(
      null,
      null,
      createMockRenderContext(),
    );

    // Verify it returns a Promise
    assert.assertExists(result.then);
    assert.assertEquals(typeof result.then, "function");
  });
});

nodeTest.test("RenderContext", async (t) => {
  await t.test("accepts all required properties", () => {
    const context: RenderContext = {
      pathname: "/page",
      config: {} as RenderContext["config"],
      bundler: {
        getBundle: () =>
          Promise.resolve(
            {} as Awaited<ReturnType<RenderContext["bundler"]["getBundle"]>>,
          ),
      },
      params: { id: "123" },
      request: new Request("http://localhost:3000/page?id=123"),
    };

    assert.assertEquals(context.pathname, "/page");
    assert.assertEquals(context.params["id"], "123");
  });

  await t.test("params can have array values", () => {
    const context: RenderContext = {
      pathname: "/tags",
      config: {} as RenderContext["config"],
      bundler: {
        getBundle: () =>
          Promise.resolve(
            {} as Awaited<ReturnType<RenderContext["bundler"]["getBundle"]>>,
          ),
      },
      params: { tags: ["react", "typescript"] },
      request: new Request("http://localhost:3000/tags"),
    };

    assert.assertEquals(context.params["tags"], ["react", "typescript"]);
  });
});

nodeTest.test("Custom Renderer implementation", async (t) => {
  // Example of how a framework adapter would implement the Renderer interface
  const customRenderer: Renderer = {
    name: "custom",
    renderPage: (_Layout, _Page, context) => {
      return Promise.resolve({
        html: `<html><body>Page: ${context.pathname}</body></html>`,
        rscPayload: JSON.stringify({ pathname: context.pathname }),
      });
    },
    renderRSC: (_Layout, _Page, context) => {
      const payload = JSON.stringify({ pathname: context.pathname });
      return Promise.resolve(
        new Response(payload, {
          headers: { "Content-Type": "application/json" },
        }),
      );
    },
    generateBootstrapScript: (context) => {
      return `<script>window.__INITIAL_PATHNAME__ = "${context.pathname}";</script>`;
    },
  };

  await t.test("custom renderer has correct name", () => {
    assert.assertEquals(customRenderer.name, "custom");
  });

  await t.test(
    "custom renderer renderPage returns html and payload",
    async () => {
      const context = createMockRenderContext();
      const result = await customRenderer.renderPage(null, null, context);

      assert.assertEquals(result.html.includes("/test"), true);
      assert.assertExists(result.rscPayload);
      assert.assertEquals(JSON.parse(result.rscPayload).pathname, "/test");
    },
  );

  await t.test("custom renderer renderRSC returns Response", async () => {
    const context = createMockRenderContext();
    const response = await customRenderer.renderRSC(null, null, context);

    assert.assertEquals(
      response.headers.get("Content-Type"),
      "application/json",
    );
    const data = await response.json();
    assert.assertEquals(data.pathname, "/test");
  });

  await t.test("custom renderer generateBootstrapScript returns script", () => {
    const context = createMockRenderContext();
    const script = customRenderer.generateBootstrapScript(context);

    assert.assertEquals(script.includes("__INITIAL_PATHNAME__"), true);
    assert.assertEquals(script.includes("/test"), true);
  });
});
