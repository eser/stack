// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * Checks the rule files the Cursor, Windsurf and Copilot adapters write. Once
 * a spec is active, `next` refuses a call without `spec <name>`, so the file
 * must never tell the agent to submit through a bare `next`.
 *
 * @module
 */

import * as bdd from "@std/testing/bdd";
import * as assert from "@std/assert";
import * as crossRuntime from "@eserstack/standards/cross-runtime";
import type * as adapter from "./adapter.ts";
import * as ruleFile from "./rule-file.ts";
import * as cursorAdapterMod from "./adapters/cursor.ts";
import * as windsurfAdapterMod from "./adapters/windsurf.ts";
import * as copilotAdapterMod from "./adapters/copilot.ts";
import * as copilotCliAdapterMod from "./adapters/copilot-cli.ts";

// Not "noskills" at the end, so a bare command cannot pass for a prefixed one.
const PREFIX = "deno run -A ./tools/nos.ts";
const RULES = ["Use tabs for indentation"];

const TOOLS: readonly {
  readonly adapter: adapter.ToolAdapter;
  readonly path: string;
}[] = [
  { adapter: cursorAdapterMod.cursorAdapter, path: ".cursorrules" },
  { adapter: windsurfAdapterMod.windsurfAdapter, path: ".windsurfrules" },
  {
    adapter: copilotAdapterMod.copilotAdapter,
    path: ".github/copilot-instructions.md",
  },
  {
    adapter: copilotCliAdapterMod.copilotCliAdapter,
    path: ".github/copilot-instructions.md",
  },
];

/** Runs one adapter's rule sync in a temporary project and reads `path`. */
const generate = async (
  toolAdapter: adapter.ToolAdapter,
  path: string,
): Promise<string> => {
  const root = await crossRuntime.runtime.fs.makeTempDir({
    prefix: `nos_rule_file_${toolAdapter.id}_`,
  });

  try {
    await toolAdapter.syncRules({ root, rules: RULES, commandPrefix: PREFIX });

    return await crossRuntime.runtime.fs.readTextFile(`${root}/${path}`);
  } finally {
    await crossRuntime.runtime.fs.remove(root, { recursive: true });
  }
};

for (const { adapter: toolAdapter, path } of TOOLS) {
  bdd.describe(`rule file: ${toolAdapter.id} (${path})`, () => {
    bdd.it("is the shared rule file text", async () => {
      assert.assertEquals(
        await generate(toolAdapter, path),
        ruleFile.buildRuleFile(RULES, PREFIX),
      );
    });

    bdd.it(
      "gets and submits instructions through spec <name> next",
      async () => {
        const text = await generate(toolAdapter, path);

        assert.assertStringIncludes(
          text,
          `Run \`${PREFIX} spec <name> next\` to get your current instruction.`,
        );
        assert.assertStringIncludes(
          text,
          `Submit results with \`${PREFIX} spec <name> next --answer="..."\`.`,
        );
        assert.assertStringIncludes(
          text,
          `(\`${PREFIX} spec <name> next --answer\`)`,
        );
      },
    );

    bdd.it("never submits through a bare next", async () => {
      const text = await generate(toolAdapter, path);

      assert.assertEquals(text.includes(`${PREFIX} next --answer`), false);
      assert.assertEquals(text.includes("`noskills "), false);
    });

    bdd.it("lists the project's rules", async () => {
      assert.assertStringIncludes(
        await generate(toolAdapter, path),
        "## Rules\n\n- Use tabs for indentation\n",
      );
    });
  });
}
