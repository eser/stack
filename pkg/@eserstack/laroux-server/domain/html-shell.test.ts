// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.
/**
 * Tests for HtmlShellBuilder port interface
 */

import { assertEquals, assertExists, assertStringIncludes } from "@std/assert";
import {
  type HtmlShellBuilder,
  type HtmlShellOptions,
  noopHtmlShellBuilder,
} from "./html-shell.ts";

Deno.test("HtmlShellBuilder - noopHtmlShellBuilder", async (t) => {
  await t.step("has correct name", () => {
    assertEquals(noopHtmlShellBuilder.name, "noop");
  });

  await t.step("createShell returns valid HTML document", () => {
    const html = noopHtmlShellBuilder.createShell({});

    assertStringIncludes(html, "<!DOCTYPE html>");
    assertStringIncludes(html, "<html>");
    assertStringIncludes(html, "<head>");
    assertStringIncludes(html, "<body>");
    assertStringIncludes(html, "</html>");
  });

  await t.step("createStreamingStart returns document start", () => {
    const html = noopHtmlShellBuilder.createStreamingStart({});

    assertStringIncludes(html, "<!DOCTYPE html>");
    assertStringIncludes(html, "<html>");
    assertStringIncludes(html, "<body>");
    // Should NOT include closing tags
    assertEquals(html.includes("</html>"), false);
  });

  await t.step("createStreamingEnd returns document end", () => {
    const html = noopHtmlShellBuilder.createStreamingEnd({});

    assertStringIncludes(html, "</body>");
    assertStringIncludes(html, "</html>");
    // Should NOT include opening tags
    assertEquals(html.includes("<!DOCTYPE"), false);
  });
});

Deno.test("HtmlShellBuilder interface compliance", async (t) => {
  await t.step(
    "noopHtmlShellBuilder implements HtmlShellBuilder interface",
    () => {
      const builder: HtmlShellBuilder = noopHtmlShellBuilder;

      assertEquals(typeof builder.name, "string");
      assertEquals(typeof builder.createShell, "function");
      assertEquals(typeof builder.createStreamingStart, "function");
      assertEquals(typeof builder.createStreamingEnd, "function");
    },
  );

  await t.step("all methods accept HtmlShellOptions", () => {
    const options: HtmlShellOptions = {
      head: "<meta charset='utf-8'>",
      body: "<div id='root'></div>",
      scripts: ["/client.js"],
      styles: ["/styles.css"],
      criticalCss: "body { margin: 0; }",
      rscPayload: '{"type":"root"}',
      title: "Test Page",
      lang: "en",
    };

    // Should not throw
    const shell = noopHtmlShellBuilder.createShell(options);
    const start = noopHtmlShellBuilder.createStreamingStart(options);
    const end = noopHtmlShellBuilder.createStreamingEnd(options);

    assertExists(shell);
    assertExists(start);
    assertExists(end);
  });
});

Deno.test("HtmlShellOptions", async (t) => {
  await t.step("all properties are optional", () => {
    const emptyOptions: HtmlShellOptions = {};
    assertExists(emptyOptions);
  });

  await t.step("accepts head content", () => {
    const options: HtmlShellOptions = {
      head: "<meta name='viewport' content='width=device-width'>",
    };
    assertEquals(options.head?.includes("viewport"), true);
  });

  await t.step("accepts body content", () => {
    const options: HtmlShellOptions = {
      body: "<div id='app'></div>",
    };
    assertEquals(options.body?.includes("app"), true);
  });

  await t.step("accepts scripts array", () => {
    const options: HtmlShellOptions = {
      scripts: ["/chunk-abc123.js", "/client.js"],
    };
    assertEquals(options.scripts?.length, 2);
  });

  await t.step("accepts styles array", () => {
    const options: HtmlShellOptions = {
      styles: ["/critical.css", "/main.css"],
    };
    assertEquals(options.styles?.length, 2);
  });

  await t.step("accepts critical CSS", () => {
    const options: HtmlShellOptions = {
      criticalCss: `
        body { margin: 0; padding: 0; }
        .header { background: #fff; }
      `,
    };
    assertEquals(options.criticalCss?.includes("header"), true);
  });

  await t.step("accepts RSC payload", () => {
    const payload = JSON.stringify({
      type: "root",
      children: [{ type: "div", props: { id: "app" } }],
    });
    const options: HtmlShellOptions = {
      rscPayload: payload,
    };
    assertEquals(options.rscPayload, payload);
  });

  await t.step("accepts page title", () => {
    const options: HtmlShellOptions = {
      title: "My App - Home",
    };
    assertEquals(options.title, "My App - Home");
  });

  await t.step("accepts language attribute", () => {
    const options: HtmlShellOptions = {
      lang: "ja",
    };
    assertEquals(options.lang, "ja");
  });

  await t.step("accepts chunk manifest", () => {
    const options: HtmlShellOptions = {
      manifest: {
        version: "1.0",
        buildId: "abc123",
        timestamp: Date.now(),
        chunks: {},
        files: {},
        entrypoint: "client.js",
        logLevel: "info",
      },
    };
    assertExists(options.manifest);
    assertEquals(options.manifest?.buildId, "abc123");
  });
});

Deno.test("Custom HtmlShellBuilder implementation", async (t) => {
  // Example of how a framework adapter would implement HtmlShellBuilder
  const customBuilder: HtmlShellBuilder = {
    name: "custom",
    createShell: (options) => {
      const lang = options.lang ?? "en";
      const title = options.title ?? "App";
      const criticalCss = options.criticalCss
        ? `<style>${options.criticalCss}</style>`
        : "";
      const styles = (options.styles ?? [])
        .map((s) => `<link rel="stylesheet" href="${s}">`)
        .join("\n");
      const scripts = (options.scripts ?? [])
        .map((s) => `<script type="module" src="${s}"></script>`)
        .join("\n");
      const rscScript = options.rscPayload
        ? `<script id="__RSC_PAYLOAD__" type="application/json">${options.rscPayload}</script>`
        : "";

      return `<!DOCTYPE html>
<html lang="${lang}">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${title}</title>
  ${criticalCss}
  ${styles}
  ${options.head ?? ""}
</head>
<body>
  ${options.body ?? ""}
  ${rscScript}
  ${scripts}
</body>
</html>`;
    },
    createStreamingStart: (options) => {
      const lang = options.lang ?? "en";
      const title = options.title ?? "App";
      const criticalCss = options.criticalCss
        ? `<style>${options.criticalCss}</style>`
        : "";
      const styles = (options.styles ?? [])
        .map((s) => `<link rel="stylesheet" href="${s}">`)
        .join("\n");

      return `<!DOCTYPE html>
<html lang="${lang}">
<head>
  <meta charset="utf-8">
  <title>${title}</title>
  ${criticalCss}
  ${styles}
  ${options.head ?? ""}
</head>
<body>`;
    },
    createStreamingEnd: (options) => {
      const scripts = (options.scripts ?? [])
        .map((s) => `<script type="module" src="${s}"></script>`)
        .join("\n");
      const rscScript = options.rscPayload
        ? `<script id="__RSC_PAYLOAD__" type="application/json">${options.rscPayload}</script>`
        : "";

      return `${rscScript}
  ${scripts}
</body>
</html>`;
    },
  };

  await t.step("custom builder has correct name", () => {
    assertEquals(customBuilder.name, "custom");
  });

  await t.step("custom builder createShell includes all options", () => {
    const html = customBuilder.createShell({
      title: "Test Page",
      lang: "de",
      head: "<meta name='author' content='Test'>",
      body: "<div id='root'>Content</div>",
      criticalCss: "body { color: blue; }",
      scripts: ["/app.js"],
      styles: ["/app.css"],
      rscPayload: '{"type":"test"}',
    });

    assertStringIncludes(html, 'lang="de"');
    assertStringIncludes(html, "<title>Test Page</title>");
    assertStringIncludes(html, "meta name='author'");
    assertStringIncludes(html, "<div id='root'>Content</div>");
    assertStringIncludes(html, "body { color: blue; }");
    assertStringIncludes(html, 'src="/app.js"');
    assertStringIncludes(html, 'href="/app.css"');
    assertStringIncludes(html, "__RSC_PAYLOAD__");
  });

  await t.step("custom builder streaming creates valid document", () => {
    const options: HtmlShellOptions = {
      title: "Streaming Test",
      criticalCss: "* { box-sizing: border-box; }",
      scripts: ["/hydrate.js"],
    };

    const start = customBuilder.createStreamingStart(options);
    const end = customBuilder.createStreamingEnd(options);

    // Start should have opening tags but not closing
    assertStringIncludes(start, "<!DOCTYPE html>");
    assertStringIncludes(start, "<html");
    assertStringIncludes(start, "<head>");
    assertStringIncludes(start, "<body>");
    assertEquals(start.includes("</html>"), false);

    // End should have closing tags but not opening
    assertStringIncludes(end, "</body>");
    assertStringIncludes(end, "</html>");
    assertEquals(end.includes("<!DOCTYPE"), false);

    // Combined should be valid HTML
    const full = start + "<div>Streamed content</div>" + end;
    assertStringIncludes(full, "<!DOCTYPE html>");
    assertStringIncludes(full, "</html>");
    assertStringIncludes(full, "Streamed content");
  });
});
