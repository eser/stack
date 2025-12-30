// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

import * as assert from "@std/assert";
import {
  extractFontFamilies,
  extractFontUrls,
  generateInlineFontFaceCss,
  generatePreloadHints,
  rewriteFontFaceCss,
} from "./fonts.ts";
import type { FontFile } from "./types.ts";

// ============================================================================
// extractFontUrls tests
// ============================================================================

Deno.test("extractFontUrls extracts woff2 URLs from CSS", () => {
  const css = `
    @font-face {
      src: url(https://fonts.gstatic.com/s/roboto/v30/KFOmCnqEu92Fr1Mu4mxK.woff2) format('woff2');
    }
  `;

  const urls = extractFontUrls(css);

  assert.assertEquals(urls.length, 1);
  assert.assert(urls[0]?.includes(".woff2"));
});

Deno.test("extractFontUrls extracts woff URLs", () => {
  const css = `
    @font-face {
      src: url(https://fonts.example.com/font.woff) format('woff');
    }
  `;

  const urls = extractFontUrls(css);

  assert.assertEquals(urls.length, 1);
  assert.assert(urls[0]?.includes(".woff"));
});

Deno.test("extractFontUrls extracts ttf URLs", () => {
  const css = `
    @font-face {
      src: url(https://fonts.example.com/font.ttf) format('truetype');
    }
  `;

  const urls = extractFontUrls(css);

  assert.assertEquals(urls.length, 1);
  assert.assert(urls[0]?.includes(".ttf"));
});

Deno.test("extractFontUrls handles double-quoted URLs", () => {
  const css = `
    @font-face {
      src: url("https://fonts.example.com/font.woff2");
    }
  `;

  const urls = extractFontUrls(css);

  assert.assertEquals(urls.length, 1);
  assert.assertEquals(urls[0], "https://fonts.example.com/font.woff2");
});

Deno.test("extractFontUrls handles single-quoted URLs", () => {
  const css = `
    @font-face {
      src: url('https://fonts.example.com/font.woff2');
    }
  `;

  const urls = extractFontUrls(css);

  assert.assertEquals(urls.length, 1);
  assert.assertEquals(urls[0], "https://fonts.example.com/font.woff2");
});

Deno.test("extractFontUrls handles unquoted URLs", () => {
  const css = `
    @font-face {
      src: url(https://fonts.example.com/font.woff2);
    }
  `;

  const urls = extractFontUrls(css);

  assert.assertEquals(urls.length, 1);
});

Deno.test("extractFontUrls returns empty array when no font URLs", () => {
  const css = `.foo { color: red; background: url(image.png); }`;

  const urls = extractFontUrls(css);

  assert.assertEquals(urls.length, 0);
});

Deno.test("extractFontUrls extracts multiple URLs", () => {
  const css = `
    @font-face {
      src: url(https://fonts.example.com/roboto-regular.woff2);
    }
    @font-face {
      src: url(https://fonts.example.com/roboto-bold.woff2);
    }
  `;

  const urls = extractFontUrls(css);

  assert.assertEquals(urls.length, 2);
});

// ============================================================================
// extractFontFamilies tests
// ============================================================================

Deno.test("extractFontFamilies extracts single font family from URL", () => {
  const url =
    "https://fonts.googleapis.com/css2?family=Roboto:wght@400;500&display=swap";

  const families = extractFontFamilies(url);

  assert.assertEquals(families.length, 1);
  assert.assertEquals(families[0], "Roboto");
});

Deno.test("extractFontFamilies extracts multiple font families", () => {
  const url =
    "https://fonts.googleapis.com/css2?family=Roboto|Open+Sans&display=swap";

  const families = extractFontFamilies(url);

  assert.assertEquals(families.length, 2);
  assert.assertEquals(families[0], "Roboto");
  assert.assertEquals(families[1], "Open Sans");
});

Deno.test("extractFontFamilies decodes URL-encoded family names", () => {
  const url =
    "https://fonts.googleapis.com/css2?family=Roboto+Mono&display=swap";

  const families = extractFontFamilies(url);

  assert.assertEquals(families.length, 1);
  assert.assertEquals(families[0], "Roboto Mono");
});

Deno.test("extractFontFamilies extracts family name without weight specifier", () => {
  const url =
    "https://fonts.googleapis.com/css2?family=Inter:wght@100;200;300;400;500&display=swap";

  const families = extractFontFamilies(url);

  assert.assertEquals(families.length, 1);
  assert.assertEquals(families[0], "Inter");
});

Deno.test("extractFontFamilies returns empty array for invalid URL", () => {
  const url = "https://fonts.googleapis.com/css2?display=swap";

  const families = extractFontFamilies(url);

  assert.assertEquals(families.length, 0);
});

// ============================================================================
// rewriteFontFaceCss tests
// ============================================================================

Deno.test("rewriteFontFaceCss replaces CDN URLs with local paths", () => {
  const originalCss = `
    @font-face {
      src: url(https://fonts.gstatic.com/s/roboto/font.woff2);
    }
  `;
  const fontFiles: FontFile[] = [
    {
      url: "https://fonts.gstatic.com/s/roboto/font.woff2",
      localPath: "/dist/fonts/font.woff2",
      filename: "font.woff2",
      format: "woff2",
    },
  ];

  const rewritten = rewriteFontFaceCss(originalCss, fontFiles, "/fonts");

  assert.assert(rewritten.includes("/fonts/font.woff2"));
  assert.assertEquals(
    rewritten.includes("https://fonts.gstatic.com"),
    false,
  );
});

Deno.test("rewriteFontFaceCss handles multiple font files", () => {
  const originalCss = `
    @font-face { src: url(https://cdn.example.com/a.woff2); }
    @font-face { src: url(https://cdn.example.com/b.woff2); }
  `;
  const fontFiles: FontFile[] = [
    {
      url: "https://cdn.example.com/a.woff2",
      localPath: "/dist/fonts/a.woff2",
      filename: "a.woff2",
      format: "woff2",
    },
    {
      url: "https://cdn.example.com/b.woff2",
      localPath: "/dist/fonts/b.woff2",
      filename: "b.woff2",
      format: "woff2",
    },
  ];

  const rewritten = rewriteFontFaceCss(originalCss, fontFiles, "/fonts");

  assert.assert(rewritten.includes("/fonts/a.woff2"));
  assert.assert(rewritten.includes("/fonts/b.woff2"));
});

Deno.test("rewriteFontFaceCss preserves other CSS content", () => {
  const originalCss = `
    /* Google Fonts */
    @font-face {
      font-family: 'Roboto';
      src: url(https://cdn.example.com/roboto.woff2);
      font-display: swap;
    }
  `;
  const fontFiles: FontFile[] = [
    {
      url: "https://cdn.example.com/roboto.woff2",
      localPath: "/dist/fonts/roboto.woff2",
      filename: "roboto.woff2",
      format: "woff2",
    },
  ];

  const rewritten = rewriteFontFaceCss(originalCss, fontFiles, "/fonts");

  assert.assert(rewritten.includes("font-family"));
  assert.assert(rewritten.includes("font-display: swap"));
  assert.assert(rewritten.includes("Google Fonts"));
});

// ============================================================================
// generatePreloadHints tests
// ============================================================================

Deno.test("generatePreloadHints generates HTML preload link tags", () => {
  const fontFiles: FontFile[] = [
    {
      url: "https://cdn.example.com/font.woff2",
      localPath: "/dist/fonts/font.woff2",
      filename: "font.woff2",
      format: "woff2",
    },
  ];

  const hints = generatePreloadHints(fontFiles, "/fonts");

  assert.assertEquals(hints.length, 1);
  assert.assert(hints[0]?.includes('<link rel="preload"'));
  assert.assert(hints[0]?.includes('href="/fonts/font.woff2"'));
});

Deno.test("generatePreloadHints includes correct crossorigin attribute", () => {
  const fontFiles: FontFile[] = [
    {
      url: "https://cdn.example.com/font.woff2",
      localPath: "/dist/fonts/font.woff2",
      filename: "font.woff2",
      format: "woff2",
    },
  ];

  const hints = generatePreloadHints(fontFiles, "/fonts");

  assert.assert(hints[0]?.includes('crossorigin="anonymous"'));
});

Deno.test("generatePreloadHints uses correct font format in type attribute", () => {
  const fontFiles: FontFile[] = [
    {
      url: "https://cdn.example.com/font.woff2",
      localPath: "/dist/fonts/font.woff2",
      filename: "font.woff2",
      format: "woff2",
    },
  ];

  const hints = generatePreloadHints(fontFiles, "/fonts");

  assert.assert(hints[0]?.includes('type="font/woff2"'));
});

Deno.test("generatePreloadHints uses publicPath in href", () => {
  const fontFiles: FontFile[] = [
    {
      url: "https://cdn.example.com/font.woff2",
      localPath: "/dist/fonts/font.woff2",
      filename: "font.woff2",
      format: "woff2",
    },
  ];

  const hints = generatePreloadHints(fontFiles, "/custom/path");

  assert.assert(hints[0]?.includes('href="/custom/path/font.woff2"'));
});

Deno.test("generatePreloadHints handles multiple fonts", () => {
  const fontFiles: FontFile[] = [
    {
      url: "url1",
      localPath: "path1",
      filename: "font1.woff2",
      format: "woff2",
    },
    {
      url: "url2",
      localPath: "path2",
      filename: "font2.woff",
      format: "woff",
    },
  ];

  const hints = generatePreloadHints(fontFiles, "/fonts");

  assert.assertEquals(hints.length, 2);
  assert.assert(hints[0]?.includes("font1.woff2"));
  assert.assert(hints[1]?.includes("font2.woff"));
});

// ============================================================================
// generateInlineFontFaceCss tests
// ============================================================================

Deno.test("generateInlineFontFaceCss generates valid @font-face declarations", () => {
  const fontFiles: FontFile[] = [
    {
      url: "https://cdn.example.com/roboto.woff2",
      localPath: "/dist/fonts/roboto.woff2",
      filename: "roboto.woff2",
      format: "woff2",
    },
  ];

  const css = generateInlineFontFaceCss(fontFiles, "/fonts", ["Roboto"]);

  assert.assert(css.includes("@font-face"));
  assert.assert(css.includes("font-family: 'Roboto'"));
  assert.assert(css.includes("src: url('/fonts/roboto.woff2')"));
});

Deno.test("generateInlineFontFaceCss includes font-display swap", () => {
  const fontFiles: FontFile[] = [
    {
      url: "url",
      localPath: "path",
      filename: "font.woff2",
      format: "woff2",
    },
  ];

  const css = generateInlineFontFaceCss(fontFiles, "/fonts", ["Inter"]);

  assert.assert(css.includes("font-display: swap"));
});

Deno.test("generateInlineFontFaceCss uses first family name", () => {
  const fontFiles: FontFile[] = [
    {
      url: "url",
      localPath: "path",
      filename: "font.woff2",
      format: "woff2",
    },
  ];

  const css = generateInlineFontFaceCss(fontFiles, "/fonts", [
    "Roboto",
    "Open Sans",
  ]);

  assert.assert(css.includes("font-family: 'Roboto'"));
});

Deno.test("generateInlineFontFaceCss handles multiple fonts", () => {
  const fontFiles: FontFile[] = [
    { url: "u1", localPath: "p1", filename: "a.woff2", format: "woff2" },
    { url: "u2", localPath: "p2", filename: "b.woff2", format: "woff2" },
  ];

  const css = generateInlineFontFaceCss(fontFiles, "/fonts", ["Font"]);

  const fontFaceCount = (css.match(/@font-face/g) || []).length;
  assert.assertEquals(fontFaceCount, 2);
});

// ============================================================================
// Real-world pattern tests (from laroux codebase analysis)
// ============================================================================

Deno.test("extractFontUrls handles multiple weights in separate font-face blocks", () => {
  const css = `
    @font-face {
      font-family: 'Open Sans';
      src: url(https://fonts.gstatic.com/s/opensans/font-400.woff2) format('woff2');
      font-weight: 400;
    }
    @font-face {
      font-family: 'Open Sans';
      src: url(https://fonts.gstatic.com/s/opensans/font-500.woff2) format('woff2');
      font-weight: 500;
    }
    @font-face {
      font-family: 'Open Sans';
      src: url(https://fonts.gstatic.com/s/opensans/font-700.woff2) format('woff2');
      font-weight: 700;
    }
  `;

  const urls = extractFontUrls(css);

  assert.assertEquals(urls.length, 3);
  assert.assert(urls[0]?.includes("font-400"));
  assert.assert(urls[1]?.includes("font-500"));
  assert.assert(urls[2]?.includes("font-700"));
});

Deno.test("rewriteFontFaceCss preserves font-family declaration in font-face", () => {
  const originalCss = `
    @font-face {
      font-family: 'Open Sans';
      src: url(https://cdn.example.com/opensans.woff2) format('woff2');
      font-weight: 400;
      font-style: normal;
    }
  `;
  const fontFiles: FontFile[] = [
    {
      url: "https://cdn.example.com/opensans.woff2",
      localPath: "/dist/fonts/opensans.woff2",
      filename: "opensans.woff2",
      format: "woff2",
    },
  ];

  const rewritten = rewriteFontFaceCss(originalCss, fontFiles, "/fonts");

  assert.assert(rewritten.includes("font-family: 'Open Sans'"));
  assert.assert(rewritten.includes("font-weight: 400"));
  assert.assert(rewritten.includes("font-style: normal"));
});

Deno.test("extractFontFamilies handles multiple font families with weights using pipe syntax", () => {
  // Google Fonts API v2 uses pipe (|) to separate multiple families in a single family= param
  const url =
    "https://fonts.googleapis.com/css2?family=Open+Sans:wght@400;500;600;700|Roboto+Mono:wght@400;500&display=swap";

  const families = extractFontFamilies(url);

  assert.assertEquals(families.length, 2);
  assert.assertEquals(families[0], "Open Sans");
  assert.assertEquals(families[1], "Roboto Mono");
});
