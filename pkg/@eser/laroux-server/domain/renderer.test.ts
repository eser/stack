// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.
/**
 * Tests for Renderer port interface
 */

import { assertEquals, assertExists } from "@std/assert";
import { noopRenderer, type RenderContext, type Renderer } from "./renderer.ts";

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

Deno.test("Renderer - noopRenderer", async (t) => {
  await t.step("has correct name", () => {
    assertEquals(noopRenderer.name, "noop");
  });

  await t.step("renderPage returns empty html", async () => {
    const context = createMockRenderContext();
    const Layout = () => null;
    const Page = () => null;

    const result = await noopRenderer.renderPage(Layout, Page, context);

    assertEquals(result.html, "");
    assertEquals(result.rscPayload, undefined);
  });

  await t.step("renderRSC returns empty response", async () => {
    const context = createMockRenderContext();
    const Layout = () => null;
    const Page = () => null;

    const response = await noopRenderer.renderRSC(Layout, Page, context);

    assertExists(response);
    const text = await response.text();
    assertEquals(text, "");
  });

  await t.step("generateBootstrapScript returns empty string", () => {
    const context = createMockRenderContext();
    const script = noopRenderer.generateBootstrapScript(context);

    assertEquals(script, "");
  });
});

Deno.test("Renderer interface compliance", async (t) => {
  await t.step("noopRenderer implements Renderer interface", () => {
    const renderer: Renderer = noopRenderer;

    // Verify all required properties exist
    assertEquals(typeof renderer.name, "string");
    assertEquals(typeof renderer.renderPage, "function");
    assertEquals(typeof renderer.renderRSC, "function");
    assertEquals(typeof renderer.generateBootstrapScript, "function");
  });

  await t.step("renderPage is async function", () => {
    const result = noopRenderer.renderPage(
      null,
      null,
      createMockRenderContext(),
    );

    // Verify it returns a Promise
    assertExists(result.then);
    assertEquals(typeof result.then, "function");
  });

  await t.step("renderRSC is async function", () => {
    const result = noopRenderer.renderRSC(
      null,
      null,
      createMockRenderContext(),
    );

    // Verify it returns a Promise
    assertExists(result.then);
    assertEquals(typeof result.then, "function");
  });
});

Deno.test("RenderContext", async (t) => {
  await t.step("accepts all required properties", () => {
    const context: RenderContext = {
      pathname: "/page",
      config: {} as RenderContext["config"],
      bundler: {
        getBundle: () =>
          Promise.resolve({} as Awaited<
            ReturnType<RenderContext["bundler"]["getBundle"]>
          >),
      },
      params: { id: "123" },
      request: new Request("http://localhost:3000/page?id=123"),
    };

    assertEquals(context.pathname, "/page");
    assertEquals(context.params.id, "123");
  });

  await t.step("params can have array values", () => {
    const context: RenderContext = {
      pathname: "/tags",
      config: {} as RenderContext["config"],
      bundler: {
        getBundle: () =>
          Promise.resolve({} as Awaited<
            ReturnType<RenderContext["bundler"]["getBundle"]>
          >),
      },
      params: { tags: ["react", "typescript"] },
      request: new Request("http://localhost:3000/tags"),
    };

    assertEquals(context.params.tags, ["react", "typescript"]);
  });
});

Deno.test("Custom Renderer implementation", async (t) => {
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

  await t.step("custom renderer has correct name", () => {
    assertEquals(customRenderer.name, "custom");
  });

  await t.step(
    "custom renderer renderPage returns html and payload",
    async () => {
      const context = createMockRenderContext();
      const result = await customRenderer.renderPage(null, null, context);

      assertEquals(result.html.includes("/test"), true);
      assertExists(result.rscPayload);
      assertEquals(JSON.parse(result.rscPayload).pathname, "/test");
    },
  );

  await t.step("custom renderer renderRSC returns Response", async () => {
    const context = createMockRenderContext();
    const response = await customRenderer.renderRSC(null, null, context);

    assertEquals(response.headers.get("Content-Type"), "application/json");
    const data = await response.json();
    assertEquals(data.pathname, "/test");
  });

  await t.step("custom renderer generateBootstrapScript returns script", () => {
    const context = createMockRenderContext();
    const script = customRenderer.generateBootstrapScript(context);

    assertEquals(script.includes("__INITIAL_PATHNAME__"), true);
    assertEquals(script.includes("/test"), true);
  });
});
