// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

import { assertEquals, assertStringIncludes } from "@std/assert";
import { describe, it } from "@std/testing/bdd";
import { stripAnsi } from "./colors.ts";
import { createOutput } from "./output.ts";
import {
  formatBlank,
  formatBox,
  formatError,
  formatInfo,
  formatItem,
  formatNextSteps,
  formatRule,
  formatSection,
  formatSuccess,
  formatTable,
  formatWarning,
} from "./formatters.ts";
import {
  getMultiplexTarget,
  getStreamTarget,
  getTestTarget,
  nullTarget,
} from "./targets.ts";

// --- Pure formatters ---

describe("pure formatters", () => {
  it("formatSuccess returns stdout lines", () => {
    const lines = formatSuccess("Operation completed");
    assertEquals(lines.length, 1);
    assertEquals(lines[0]!.channel, "stdout");
    assertStringIncludes(stripAnsi(lines[0]!.line), "Operation completed");
  });

  it("formatSuccess includes details when provided", () => {
    const lines = formatSuccess("Done", "details here");
    assertEquals(lines.length, 2);
    assertStringIncludes(stripAnsi(lines[1]!.line), "details here");
  });

  it("formatError routes to stderr channel", () => {
    const lines = formatError("Something failed");
    assertEquals(lines[0]!.channel, "stderr");
    assertStringIncludes(stripAnsi(lines[0]!.line), "Something failed");
  });

  it("formatError includes details on stderr", () => {
    const lines = formatError("Fail", "cause");
    assertEquals(lines.length, 2);
    assertEquals(lines[1]!.channel, "stderr");
  });

  it("formatWarning routes to stderr channel", () => {
    const lines = formatWarning("Watch out");
    assertEquals(lines[0]!.channel, "stderr");
    assertStringIncludes(stripAnsi(lines[0]!.line), "Watch out");
  });

  it("formatInfo routes to stdout channel", () => {
    const lines = formatInfo("FYI");
    assertEquals(lines[0]!.channel, "stdout");
    assertStringIncludes(stripAnsi(lines[0]!.line), "FYI");
  });

  it("formatSection produces 3 lines", () => {
    const lines = formatSection("Title");
    assertEquals(lines.length, 3);
    assertEquals(lines[0]!.line, "");
    assertStringIncludes(stripAnsi(lines[1]!.line), "Title");
  });

  it("formatItem formats key-value pair", () => {
    const lines = formatItem("Name", "test-project");
    assertEquals(lines.length, 1);
    assertStringIncludes(stripAnsi(lines[0]!.line), "Name");
    assertStringIncludes(stripAnsi(lines[0]!.line), "test-project");
  });

  it("formatNextSteps lists numbered steps", () => {
    const lines = formatNextSteps(["First", "Second"]);
    assertEquals(lines.length, 6);
    assertStringIncludes(stripAnsi(lines[3]!.line), "First");
    assertStringIncludes(stripAnsi(lines[4]!.line), "Second");
  });

  it("formatBox wraps text in a box", () => {
    const lines = formatBox("Hello");
    assertEquals(lines.length, 3);
    assertStringIncludes(stripAnsi(lines[1]!.line), "Hello");
  });

  it("formatBox returns empty for empty text", () => {
    assertEquals(formatBox("").length, 0);
  });

  it("formatBlank returns one empty line", () => {
    const lines = formatBlank();
    assertEquals(lines.length, 1);
    assertEquals(lines[0]!.line, "");
  });

  it("formatRule returns a horizontal rule", () => {
    const lines = formatRule(10);
    assertEquals(lines.length, 1);
    assertEquals(stripAnsi(lines[0]!.line).length, 10);
  });

  it("formatTable formats key-value pairs", () => {
    const lines = formatTable({ Name: "foo", Version: "1.0" });
    assertEquals(lines.length, 2);
    assertStringIncludes(stripAnsi(lines[0]!.line), "Name");
    assertStringIncludes(stripAnsi(lines[0]!.line), "foo");
  });

  it("formatTable returns empty for empty items", () => {
    assertEquals(formatTable({}).length, 0);
  });
});

// --- Output targets ---

describe("getTestTarget", () => {
  it("captures output lines", () => {
    const { target, lines, output } = getTestTarget();
    const out = createOutput(target);
    out.printSuccess("All good");
    assertEquals(lines.length, 1);
    assertStringIncludes(stripAnsi(output()), "All good");
  });

  it("preserves channel routing", () => {
    const { target, lines } = getTestTarget();
    const out = createOutput(target);
    out.printError("Bad");
    out.printSuccess("Good");
    assertEquals(lines[0]!.channel, "stderr");
    assertEquals(lines[1]!.channel, "stdout");
  });

  it("clear resets buffer", () => {
    const { target, lines, clear } = getTestTarget();
    const out = createOutput(target);
    out.printSuccess("Line 1");
    assertEquals(lines.length, 1);
    clear();
    assertEquals(lines.length, 0);
  });
});

describe("nullTarget", () => {
  it("discards all output without error", () => {
    const out = createOutput(nullTarget);
    out.printSuccess("Discarded");
    out.printError("Also discarded");
    out.printWarning("Gone");
  });
});

describe("getMultiplexTarget", () => {
  it("writes to all targets", () => {
    const t1 = getTestTarget();
    const t2 = getTestTarget();
    const multi = getMultiplexTarget(t1.target, t2.target);
    const out = createOutput(multi);
    out.printInfo("Broadcast");
    assertEquals(t1.lines.length, 1);
    assertEquals(t2.lines.length, 1);
    assertStringIncludes(stripAnsi(t1.output()), "Broadcast");
    assertStringIncludes(stripAnsi(t2.output()), "Broadcast");
  });
});

describe("getStreamTarget", () => {
  it("writes to a WritableStream", async () => {
    const chunks: Uint8Array[] = [];
    const stream = new WritableStream<Uint8Array>({
      write(chunk) {
        chunks.push(chunk);
      },
    });

    const target = getStreamTarget(stream);
    const out = createOutput(target);
    await out.printSuccess("Streamed!");

    const writer = stream.getWriter();
    await writer.close();

    const captured = new TextDecoder().decode(
      new Uint8Array(chunks.flatMap((ch) => [...ch])),
    );
    assertStringIncludes(captured, "Streamed!");
  });
});

// --- createOutput ---

describe("createOutput", () => {
  it("default creates a working formatter", () => {
    const out = createOutput();
    assertEquals(typeof out.printSuccess, "function");
    assertEquals(typeof out.printError, "function");
    assertEquals(typeof out.blank, "function");
    assertEquals(typeof out.printTable, "function");
  });

  it("has all 12 methods", () => {
    const out = createOutput(nullTarget);
    const methods = [
      "printSection",
      "printSuccess",
      "printError",
      "printWarning",
      "printInfo",
      "printItem",
      "printNextSteps",
      "boxText",
      "clearTerminal",
      "blank",
      "printRule",
      "printTable",
    ];
    for (const method of methods) {
      assertEquals(
        typeof (out as Record<string, unknown>)[method],
        "function",
        `Missing method: ${method}`,
      );
    }
  });
});
