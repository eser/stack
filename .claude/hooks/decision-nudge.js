// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.
#!/usr/bin/env node
/**
 * decision-nudge.js — Claude Code PostToolUse hook
 *
 * Triggered after Write, Edit, or MultiEdit tools run.
 * Injects a short reminder into Claude's conversation context.
 *
 * Output format: { "additionalContext": "..." }
 */

let inputData = "";
process.stdin.setEncoding("utf-8");
process.stdin.on("data", (chunk) => {
  inputData += chunk;
});

process.stdin.on("end", () => {
  let toolName = "unknown";

  try {
    const data = JSON.parse(inputData);
    toolName = data.tool_name ?? "unknown";
  } catch {
    // JSON parse failed — continue anyway
  }

  const fileModifyingTools = ["Write", "Edit", "MultiEdit"];
  if (!fileModifyingTools.includes(toolName)) {
    process.exit(0);
  }

  const nudge = {
    additionalContext:
      "REMINDER: Run `deno fmt` and `deno lint` after TS edits. " +
      "Run `cd apps/services && make fix` after Go edits. " +
      "If this change is an architectural decision (technology choice, API design, " +
      "approach preference), consider logging it in an ADR under etc/adrs/.",
  };

  process.stdout.write(JSON.stringify(nudge));
  process.exit(0);
});
