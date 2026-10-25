// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.
/**
 * Tests for HtmlShellBuilder port interface
 */

import * as nodeTest from "node:test";
import * as assert from "@eserstack/test-kit/assert";
import * as htmlShell from "./html-shell.ts";
import type { HtmlShellBuilder, HtmlShellOptions } from "./html-shell.ts";

nodeTest.test("HtmlShellBuilder - noopHtmlShellBuilder", async (t) => {
  await t.test("has correct name", () => {
    assert.assertEquals(htmlShell.noopHtmlShellBuilder.name, "noop");
  });

  await t.test("createShell returns valid HTML document", () => {
    const html = htmlShell.noopHtmlShellBuilder.createShell({});

    assert.assertStringIncludes(html, "<!DOCTYPE html>");
    assert.assertStringIncludes(html, "<html>");
    assert.assertStringIncludes(html, "<head>");
    assert.assertStringIncludes(html, "<body>");
    assert.assertStringIncludes(html, "</html>");
  });

  await t.test("createStreamingStart returns document start", () => {
    const html = htmlShell.noopHtmlShellBuilder.createStreamingStart({});

    assert.assertStringIncludes(html, "<!DOCTYPE html>");
    assert.assertStringIncludes(html, "<html>");
    assert.assertStringIncludes(html, "<body>");
    // Should NOT include closing tags
    assert.assertEquals(html.includes("</html>"), false);
  });

  await t.test("createStreamingEnd returns document end", () => {
    const html = htmlShell.noopHtmlShellBuilder.createStreamingEnd({});

    assert.assertStringIncludes(html, "</body>");
    assert.assertStringIncludes(html, "</html>");
    // Should NOT include opening tags
    assert.assertEquals(html.includes("<!DOCTYPE"), false);
  });
});

nodeTest.test("HtmlShellBuilder interface compliance", async (t) => {
  await t.test(
    "noopHtmlShellBuilder implements HtmlShellBuilder interface",
    () => {
      const builder: HtmlShellBuilder = htmlShell.noopHtmlShellBuilder;

      assert.assertEquals(typeof builder.name, "string");
      assert.assertEquals(typeof builder.createShell, "function");
      assert.assertEquals(typeof builder.createStreamingStart, "function");
      assert.assertEquals(typeof builder.createStreamingEnd, "function");
    },
  );

  await t.test("all methods accept HtmlShellOptions", () => {
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
    const shell = htmlShell.noopHtmlShellBuilder.createShell(options);
    const start = htmlShell.noopHtmlShellBuilder.createStreamingStart(options);
    const end = htmlShell.noopHtmlShellBuilder.createStreamingEnd(options);

    assert.assertExists(shell);
    assert.assertExists(start);
    assert.assertExists(end);
  });
});

nodeTest.test("HtmlShellOptions", async (t) => {
  await t.test("all properties are optional", () => {
    const emptyOptions: HtmlShellOptions = {};
    assert.assertExists(emptyOptions);
  });

  await t.test("accepts head content", () => {
    const options: HtmlShellOptions = {
      head: "<meta name='viewport' content='width=device-width'>",
    };
    assert.assertEquals(options.head?.includes("viewport"), true);
  });

  await t.test("accepts body content", () => {
    const options: HtmlShellOptions = {
      body: "<div id='app'></div>",
    };
    assert.assertEquals(options.body?.includes("app"), true);
  });

  await t.test("accepts scripts array", () => {
    const options: HtmlShellOptions = {
      scripts: ["/chunk-abc123.js", "/client.js"],
    };
    assert.assertEquals(options.scripts?.length, 2);
  });

  await t.test("accepts styles array", () => {
    const options: HtmlShellOptions = {
      styles: ["/critical.css", "/main.css"],
    };
    assert.assertEquals(options.styles?.length, 2);
  });

  await t.test("accepts critical CSS", () => {
    const options: HtmlShellOptions = {
      criticalCss: `
        body { margin: 0; padding: 0; }
        .header { background: #fff; }
      `,
    };
    assert.assertEquals(options.criticalCss?.includes("header"), true);
  });

  await t.test("accepts RSC payload", () => {
    const payload = JSON.stringify({
      type: "root",
      children: [{ type: "div", props: { id: "app" } }],
    });
    const options: HtmlShellOptions = {
      rscPayload: payload,
    };
    assert.assertEquals(options.rscPayload, payload);
  });

  await t.test("accepts page title", () => {
    const options: HtmlShellOptions = {
      title: "My App - Home",
    };
    assert.assertEquals(options.title, "My App - Home");
  });

  await t.test("accepts language attribute", () => {
    const options: HtmlShellOptions = {
      lang: "ja",
    };
    assert.assertEquals(options.lang, "ja");
  });

  await t.test("accepts chunk manifest", () => {
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
    assert.assertExists(options.manifest);
    assert.assertEquals(options.manifest?.buildId, "abc123");
  });
});

nodeTest.test("Custom HtmlShellBuilder implementation", async (t) => {
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

  await t.test("custom builder has correct name", () => {
    assert.assertEquals(customBuilder.name, "custom");
  });

  await t.test("custom builder createShell includes all options", () => {
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

    assert.assertStringIncludes(html, 'lang="de"');
    assert.assertStringIncludes(html, "<title>Test Page</title>");
    assert.assertStringIncludes(html, "meta name='author'");
    assert.assertStringIncludes(html, "<div id='root'>Content</div>");
    assert.assertStringIncludes(html, "body { color: blue; }");
    assert.assertStringIncludes(html, 'src="/app.js"');
    assert.assertStringIncludes(html, 'href="/app.css"');
    assert.assertStringIncludes(html, "__RSC_PAYLOAD__");
  });

  await t.test("custom builder streaming creates valid document", () => {
    const options: HtmlShellOptions = {
      title: "Streaming Test",
      criticalCss: "* { box-sizing: border-box; }",
      scripts: ["/hydrate.js"],
    };

    const start = customBuilder.createStreamingStart(options);
    const end = customBuilder.createStreamingEnd(options);

    // Start should have opening tags but not closing
    assert.assertStringIncludes(start, "<!DOCTYPE html>");
    assert.assertStringIncludes(start, "<html");
    assert.assertStringIncludes(start, "<head>");
    assert.assertStringIncludes(start, "<body>");
    assert.assertEquals(start.includes("</html>"), false);

    // End should have closing tags but not opening
    assert.assertStringIncludes(end, "</body>");
    assert.assertStringIncludes(end, "</html>");
    assert.assertEquals(end.includes("<!DOCTYPE"), false);

    // Combined should be valid HTML
    const full = start + "<div>Streamed content</div>" + end;
    assert.assertStringIncludes(full, "<!DOCTYPE html>");
    assert.assertStringIncludes(full, "</html>");
    assert.assertStringIncludes(full, "Streamed content");
  });
});
