// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

import * as assert from "@std/assert";
import * as span from "./span.ts";
import * as ansiMod from "./renderers/ansi.ts";
import * as markdownMod from "./renderers/markdown.ts";
import * as plainMod from "./renderers/plain.ts";

// =============================================================================
// GaugeSpan Tests
// =============================================================================

Deno.test("gauge - construction with defaults", () => {
  const g = span.gauge(67);
  assert.assertEquals(g.kind, "gauge");
  assert.assertEquals(g.percent, 67);
  assert.assertEquals(g.width, undefined);
  assert.assertEquals(g.label, undefined);
});

Deno.test("gauge - construction with custom width and label", () => {
  const g = span.gauge(42, { width: 30, label: "progress" });
  assert.assertEquals(g.kind, "gauge");
  assert.assertEquals(g.percent, 42);
  assert.assertEquals(g.width, 30);
  assert.assertEquals(g.label, "progress");
});

Deno.test("gauge - percent clamped below 0", () => {
  const g = span.gauge(-15);
  assert.assertEquals(g.percent, 0);
});

Deno.test("gauge - percent clamped above 100", () => {
  const g = span.gauge(200);
  assert.assertEquals(g.percent, 100);
});

Deno.test("gauge - percent at boundaries 0 and 100", () => {
  const g0 = span.gauge(0);
  assert.assertEquals(g0.percent, 0);
  const g100 = span.gauge(100);
  assert.assertEquals(g100.percent, 100);
});

Deno.test("gauge - ANSI rendering contains bar characters and percentage", () => {
  const renderer = ansiMod.ansi();
  const result = renderer.render([span.gauge(67)]);
  assert.assertStringIncludes(result, "█");
  assert.assertStringIncludes(result, "░");
  assert.assertStringIncludes(result, "67%");
});

Deno.test("gauge - ANSI rendering with label includes label text", () => {
  const renderer = ansiMod.ansi();
  const result = renderer.render([span.gauge(50, { label: "done" })]);
  assert.assertStringIncludes(result, "50%");
  assert.assertStringIncludes(result, "done");
});

Deno.test("gauge - ANSI rendering at 0% has no filled blocks", () => {
  const renderer = ansiMod.ansi();
  const result = renderer.render([span.gauge(0, { width: 10 })]);
  assert.assertStringIncludes(result, "0%");
  // Should have only empty blocks (░), no filled (█)
  assert.assert(!result.includes("█"));
});

Deno.test("gauge - ANSI rendering at 100% has no empty blocks", () => {
  const renderer = ansiMod.ansi();
  const result = renderer.render([span.gauge(100, { width: 10 })]);
  assert.assertStringIncludes(result, "100%");
  assert.assert(!result.includes("░"));
});

Deno.test("gauge - Markdown rendering uses bold percentage format", () => {
  const renderer = markdownMod.markdown();
  const result = renderer.render([span.gauge(67)]);
  assert.assertStringIncludes(result, "**67%**");
});

Deno.test("gauge - Markdown rendering with label includes dash-separated label", () => {
  const renderer = markdownMod.markdown();
  const result = renderer.render([span.gauge(50, { label: "progress" })]);
  assert.assertStringIncludes(result, "**50%**");
  assert.assertStringIncludes(result, "progress");
});

Deno.test("gauge - Plain rendering uses bracket bar format", () => {
  const renderer = plainMod.plain();
  const result = renderer.render([span.gauge(50, { width: 10 })]);
  // 50% of 10 = 5 filled, 5 empty
  assert.assertStringIncludes(result, "[=====     ]");
  assert.assertStringIncludes(result, "50%");
});

Deno.test("gauge - Plain rendering with label appends label", () => {
  const renderer = plainMod.plain();
  const result = renderer.render([
    span.gauge(75, { width: 8, label: "status" }),
  ]);
  assert.assertStringIncludes(result, "75%");
  assert.assertStringIncludes(result, "status");
});

Deno.test("gauge - Plain rendering at 0%", () => {
  const renderer = plainMod.plain();
  const result = renderer.render([span.gauge(0, { width: 5 })]);
  assert.assertStringIncludes(result, "[     ]");
  assert.assertStringIncludes(result, "0%");
});

Deno.test("gauge - Plain rendering at 100%", () => {
  const renderer = plainMod.plain();
  const result = renderer.render([span.gauge(100, { width: 5 })]);
  assert.assertStringIncludes(result, "[=====]");
  assert.assertStringIncludes(result, "100%");
});

// =============================================================================
// SeparatorSpan Tests
// =============================================================================

Deno.test("separator - construction without label", () => {
  const s = span.separator();
  assert.assertEquals(s.kind, "separator");
  assert.assertEquals(s.label, undefined);
});

Deno.test("separator - construction with label", () => {
  const s = span.separator("Section");
  assert.assertEquals(s.kind, "separator");
  assert.assertEquals(s.label, "Section");
});

Deno.test("separator - ANSI rendering without label contains dash characters", () => {
  const renderer = ansiMod.ansi();
  const result = renderer.render([span.separator()]);
  assert.assertStringIncludes(result, "─");
});

Deno.test("separator - ANSI rendering with label includes label text", () => {
  const renderer = ansiMod.ansi();
  const result = renderer.render([span.separator("Details")]);
  assert.assertStringIncludes(result, "Details");
  assert.assertStringIncludes(result, "─");
});

Deno.test("separator - ANSI rendering ends with newline", () => {
  const renderer = ansiMod.ansi();
  const withoutLabel = renderer.render([span.separator()]);
  const withLabel = renderer.render([span.separator("X")]);
  // Both should end with newline before the RESET sequence
  assert.assertStringIncludes(withoutLabel, "\n");
  assert.assertStringIncludes(withLabel, "\n");
});

Deno.test("separator - Markdown rendering without label is horizontal rule", () => {
  const renderer = markdownMod.markdown();
  const result = renderer.render([span.separator()]);
  assert.assertStringIncludes(result, "---");
});

Deno.test("separator - Markdown rendering with label", () => {
  const renderer = markdownMod.markdown();
  const result = renderer.render([span.separator("Section")]);
  assert.assertStringIncludes(result, "---");
  assert.assertStringIncludes(result, "Section");
});

Deno.test("separator - Plain rendering without label", () => {
  const renderer = plainMod.plain();
  const result = renderer.render([span.separator()]);
  assert.assertStringIncludes(result, "─");
});

Deno.test("separator - Plain rendering with label", () => {
  const renderer = plainMod.plain();
  const result = renderer.render([span.separator("Stats")]);
  assert.assertStringIncludes(result, "---");
  assert.assertStringIncludes(result, "Stats");
});

// =============================================================================
// AlertSpan Tests
// =============================================================================

Deno.test("alert - construction for info level", () => {
  const a = span.alert("info", "note");
  assert.assertEquals(a.kind, "alert");
  assert.assertEquals(a.level, "info");
  assert.assertEquals(a.children.length, 1);
});

Deno.test("alert - construction for success level", () => {
  const a = span.alert("success", "done");
  assert.assertEquals(a.level, "success");
});

Deno.test("alert - construction for warning level", () => {
  const a = span.alert("warning", "careful");
  assert.assertEquals(a.level, "warning");
});

Deno.test("alert - construction for error level", () => {
  const a = span.alert("error", "failed");
  assert.assertEquals(a.level, "error");
});

Deno.test("alert - construction with multiple children", () => {
  const a = span.alert("info", "first ", span.bold("second"));
  assert.assertEquals(a.children.length, 2);
  assert.assertEquals(a.children[0]!.kind, "text");
  assert.assertEquals(a.children[1]!.kind, "bold");
});

Deno.test("alert - ANSI rendering info contains correct icon", () => {
  const renderer = ansiMod.ansi();
  const result = renderer.render([span.alert("info", "msg")]);
  assert.assertStringIncludes(result, "ℹ");
  assert.assertStringIncludes(result, "msg");
});

Deno.test("alert - ANSI rendering success contains correct icon", () => {
  const renderer = ansiMod.ansi();
  const result = renderer.render([span.alert("success", "msg")]);
  assert.assertStringIncludes(result, "✓");
});

Deno.test("alert - ANSI rendering warning contains correct icon", () => {
  const renderer = ansiMod.ansi();
  const result = renderer.render([span.alert("warning", "msg")]);
  assert.assertStringIncludes(result, "▲");
});

Deno.test("alert - ANSI rendering error contains correct icon", () => {
  const renderer = ansiMod.ansi();
  const result = renderer.render([span.alert("error", "msg")]);
  assert.assertStringIncludes(result, "✗");
});

Deno.test("alert - ANSI rendering includes children text", () => {
  const renderer = ansiMod.ansi();
  const result = renderer.render([span.alert("info", "hello ", "world")]);
  assert.assertStringIncludes(result, "hello ");
  assert.assertStringIncludes(result, "world");
});

Deno.test("alert - Markdown rendering info uses blockquote format", () => {
  const renderer = markdownMod.markdown();
  const result = renderer.render([span.alert("info", "details")]);
  assert.assertStringIncludes(result, "> **");
  assert.assertStringIncludes(result, "Info");
  assert.assertStringIncludes(result, "details");
});

Deno.test("alert - Markdown rendering success uses blockquote format", () => {
  const renderer = markdownMod.markdown();
  const result = renderer.render([span.alert("success", "ok")]);
  assert.assertStringIncludes(result, "> **");
  assert.assertStringIncludes(result, "Success");
  assert.assertStringIncludes(result, "ok");
});

Deno.test("alert - Markdown rendering warning uses blockquote format", () => {
  const renderer = markdownMod.markdown();
  const result = renderer.render([span.alert("warning", "caution")]);
  assert.assertStringIncludes(result, "> **");
  assert.assertStringIncludes(result, "Warning");
  assert.assertStringIncludes(result, "caution");
});

Deno.test("alert - Markdown rendering error uses blockquote format", () => {
  const renderer = markdownMod.markdown();
  const result = renderer.render([span.alert("error", "failure")]);
  assert.assertStringIncludes(result, "> **");
  assert.assertStringIncludes(result, "Error");
  assert.assertStringIncludes(result, "failure");
});

Deno.test("alert - Plain rendering info uses [INFO] tag", () => {
  const renderer = plainMod.plain();
  const result = renderer.render([span.alert("info", "note")]);
  assert.assertStringIncludes(result, "[INFO]");
  assert.assertStringIncludes(result, "note");
});

Deno.test("alert - Plain rendering success uses [OK] tag", () => {
  const renderer = plainMod.plain();
  const result = renderer.render([span.alert("success", "passed")]);
  assert.assertStringIncludes(result, "[OK]");
  assert.assertStringIncludes(result, "passed");
});

Deno.test("alert - Plain rendering warning uses [WARN] tag", () => {
  const renderer = plainMod.plain();
  const result = renderer.render([span.alert("warning", "watch out")]);
  assert.assertStringIncludes(result, "[WARN]");
  assert.assertStringIncludes(result, "watch out");
});

Deno.test("alert - Plain rendering error uses [ERROR] tag", () => {
  const renderer = plainMod.plain();
  const result = renderer.render([span.alert("error", "broken")]);
  assert.assertStringIncludes(result, "[ERROR]");
  assert.assertStringIncludes(result, "broken");
});

// =============================================================================
// plainLength Tests — New Span Types
// =============================================================================

Deno.test("plainLength - gauge with default width", () => {
  const g = span.gauge(50);
  // width=20 (default), " 50%" = 4 chars, no label => 20 + 4 = 24
  assert.assertEquals(span.plainLength(g), 24);
});

Deno.test("plainLength - gauge with custom width", () => {
  const g = span.gauge(75, { width: 10 });
  // width=10, " 75%" = 4 chars, no label => 10 + 4 = 14
  assert.assertEquals(span.plainLength(g), 14);
});

Deno.test("plainLength - gauge with label", () => {
  const g = span.gauge(100, { width: 10, label: "done" });
  // width=10, " 100%" = 5 chars, "  done" = 6 chars => 10 + 5 + 6 = 21
  assert.assertEquals(span.plainLength(g), 21);
});

Deno.test("plainLength - gauge percent affects string length", () => {
  const g1 = span.gauge(5);
  // width=20, " 5%" = 3 chars => 23
  assert.assertEquals(span.plainLength(g1), 23);

  const g2 = span.gauge(100);
  // width=20, " 100%" = 5 chars => 25
  assert.assertEquals(span.plainLength(g2), 25);
});

Deno.test("plainLength - separator returns 0", () => {
  const s1 = span.separator();
  assert.assertEquals(span.plainLength(s1), 0);

  const s2 = span.separator("label");
  assert.assertEquals(span.plainLength(s2), 0);
});

Deno.test("plainLength - alert returns 2 plus children length", () => {
  const a = span.alert("info", "hello");
  // 2 + "hello".length(5) = 7
  assert.assertEquals(span.plainLength(a), 7);
});

Deno.test("plainLength - alert with multiple children", () => {
  const a = span.alert("error", "abc", "de");
  // 2 + 3 + 2 = 7
  assert.assertEquals(span.plainLength(a), 7);
});

Deno.test("plainLength - alert with nested bold child", () => {
  const a = span.alert("warning", span.bold("hey"));
  // 2 + plainLength(bold("hey")) => 2 + 3 = 5
  assert.assertEquals(span.plainLength(a), 5);
});

Deno.test("plainLength - alert with empty children", () => {
  const a = span.alert("success");
  // 2 + 0 = 2
  assert.assertEquals(span.plainLength(a), 2);
});
