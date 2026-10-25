// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * `spec <name> section` fills or marks N/A the sections the completeness
 * gate checks, run as a user runs it (TASK-325).
 *
 * @module
 */

import * as bdd from "@std/testing/bdd";
import * as assert from "@eserstack/test-kit/assert";
import { runtime } from "@eserstack/standards/cross-runtime";
import * as persistence from "../state/persistence.ts";
import type * as schema from "../state/schema.ts";

const REPO_ROOT = runtime.path.resolve(
  import.meta.dirname ?? ".",
  "../../../..",
);

const runNoskills = async (
  cwd: string,
  args: readonly string[],
): Promise<{ code: number; output: string }> => {
  const result = await runtime.exec.spawn(
    runtime.process.execPath(),
    [
      "run",
      "-A",
      "--config",
      `${REPO_ROOT}/deno.json`,
      `${REPO_ROOT}/pkg/@eserstack/noskills/main.ts`,
      ...args,
    ],
    { cwd, stdin: "null", stdout: "piped", stderr: "piped" },
  );

  return {
    code: result.code,
    output:
      new TextDecoder().decode(result.stdout) +
      new TextDecoder().decode(result.stderr),
  };
};

const SPEC = "photo-upload";
const REASON = "The upload changes no stored data at all";

const section = (
  root: string,
  ...args: readonly string[]
): Promise<{ code: number; output: string }> =>
  runNoskills(root, ["spec", SPEC, "section", ...args]);

const placeholderOf = async (
  root: string,
  sectionId: string,
): Promise<schema.PlaceholderStatus | undefined> => {
  const state = await persistence.readSpecState(root, SPEC);

  return state?.specState.placeholders.find((p) => p.sectionId === sectionId);
};

const specMarkdown = (root: string): Promise<string> =>
  runtime.fs.readTextFile(`${root}/${persistence.paths.specFile(SPEC)}`);

bdd.describe("noskills spec <name> section", () => {
  let root: string;

  bdd.beforeEach(async () => {
    root = await runtime.fs.makeTempDir({ prefix: "nos_spec_section_" });
    const init = await runNoskills(root, [
      "init",
      "--non-interactive",
      "--tools=claude-code",
    ]);
    assert.assertEquals(init.code, 0, init.output);
    const created = await runNoskills(root, [
      "spec",
      "new",
      SPEC,
      "Let users upload photos",
    ]);
    assert.assertEquals(created.code, 0, created.output);
  });

  bdd.afterEach(async () => {
    await runtime.fs.remove(root, { recursive: true });
  });

  bdd.it("lists every section with its id and status", async () => {
    const { code, output } = await section(root, "list");

    assert.assertEquals(code, 0, output);
    assert.assertStringIncludes(output, "○ summary");
    assert.assertStringIncludes(output, "○ acceptance-criteria");
    assert.assertStringIncludes(output, "Acceptance Criteria");
    assert.assertStringIncludes(output, `spec ${SPEC} section <id> fill`);
  });

  bdd.it("fill writes the text into spec.md and both state files", async () => {
    // `next` makes state.json name the spec, as an agent's session does.
    const next = await runNoskills(root, ["spec", SPEC, "next"]);
    assert.assertEquals(next.code, 0, next.output);

    const { code, output } = await section(
      root,
      "summary",
      "fill",
      "Users upload photos from their phones.",
    );
    assert.assertEquals(code, 0, output);
    assert.assertStringIncludes(output, "Section filled: ");
    assert.assertStringIncludes(output, "Summary");

    assert.assertEquals(
      (await placeholderOf(root, "summary"))?.status,
      "filled",
    );
    const global = await persistence.readState(root);
    assert.assertEquals(
      global.specState.placeholders.find((p) => p.sectionId === "summary")
        ?.status,
      "filled",
    );

    const markdown = await specMarkdown(root);
    assert.assertStringIncludes(
      markdown,
      "Users upload photos from their phones.",
    );
    assert.assertEquals(
      markdown.includes("<!-- PLACEHOLDER:summary -->"),
      false,
    );
    assert.assertStringIncludes(markdown, "- ✓ Summary");
  });

  bdd.it("na records the reason in spec.md and the state", async () => {
    const { code, output } = await section(root, "premises", "na", REASON);
    assert.assertEquals(code, 0, output);
    assert.assertStringIncludes(output, "Section marked N/A: ");
    assert.assertStringIncludes(output, "Premises");

    const premises = await placeholderOf(root, "premises");
    assert.assertEquals(premises?.status, "na");
    assert.assertEquals(premises?.naReason, REASON);
    assert.assertStringIncludes(await specMarkdown(root), `: ${REASON}_`);
  });

  bdd.it("refuses an unknown section and names the valid ones", async () => {
    const { code, output } = await section(root, "bogus", "fill", "Text");

    assert.assertEquals(code, 1, output);
    assert.assertStringIncludes(output, "Unknown section: bogus");
    assert.assertStringIncludes(output, "summary, problem-statement");
  });

  bdd.it("refuses an empty text, a short reason and a bad action", async () => {
    for (const [args, expected] of [
      [["summary", "fill"], "Please provide the section text."],
      [["summary", "fill", "  "], "Please provide the section text."],
      [["premises", "na"], "Please provide the reason"],
      [["premises", "na", "too short"], "too short (9 chars, minimum 20)"],
      [["summary", "bogus", "x"], "Usage:"],
    ] as const) {
      // One command at a time, so a failure names it.
      // deno-lint-ignore no-await-in-loop
      const { code, output } = await section(root, ...args);

      assert.assertEquals(code, 1, `${args.join(" ")}: ${output}`);
      assert.assertStringIncludes(output, expected, args.join(" "));
    }

    assert.assertEquals(
      (await placeholderOf(root, "premises"))?.status,
      "placeholder",
    );
  });

  bdd.it("refuses a section that is already resolved", async () => {
    const first = await section(root, "summary", "fill", "First text.");
    assert.assertEquals(first.code, 0, first.output);

    const { code, output } = await section(root, "summary", "na", REASON);

    assert.assertEquals(code, 1, output);
    assert.assertStringIncludes(output, "Section summary is already resolved");
  });

  bdd.it("refuses outside the phases the gate checks", async () => {
    const state = await persistence.readSpecState(root, SPEC);
    assert.assertNotEquals(state, null);
    await persistence.writeStateAndSpec(root, {
      ...state!,
      phase: "EXECUTING",
    });

    const { code, output } = await section(root, "summary", "fill", "Text.");

    assert.assertEquals(code, 1, output);
    assert.assertStringIncludes(
      output,
      "Cannot change spec sections in phase EXECUTING",
    );
    assert.assertEquals(output.includes("    at "), false, output);
  });

  bdd.it("resolves every section so validate passes", async () => {
    const state = await persistence.readSpecState(root, SPEC);
    const open = (state?.specState.placeholders ?? []).filter(
      (p) => p.status === "placeholder",
    );
    assert.assertNotEquals(open.length, 0);

    for (const p of open) {
      // The commands write the same state files, so they run in order.
      // deno-lint-ignore no-await-in-loop
      const { code, output } = await section(root, p.sectionId, "na", REASON);
      assert.assertEquals(code, 0, `${p.sectionId}: ${output}`);
    }

    const validate = await runNoskills(root, ["validate", SPEC]);
    assert.assertEquals(validate.code, 0, validate.output);
  });

  bdd.it("is in the spec help", async () => {
    const { output } = await runNoskills(root, ["spec", "--help"]);

    assert.assertStringIncludes(output, "note, section, ledger");
  });
});
