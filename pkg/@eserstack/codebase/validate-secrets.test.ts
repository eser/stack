// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * validate-secrets has two implementations: the TypeScript checkFile (what
 * `run` and `--fix` use) and the Go ValidateSecrets behind the FFI (what
 * `validator.validate` uses). They must agree finding for finding, or the gate
 * and the fixer disagree — on 2026-09-17 they reported 84 and 2 issues on the
 * same tree. This runs both over one fixture and compares.
 *
 * @module
 */

import * as assert from "@std/assert";
import * as path from "@std/path";
import { runtime } from "@eserstack/standards/cross-runtime";
import { ensureLib, getLib } from "./ffi-client.ts";
import { tool } from "./validate-secrets.ts";

const HEADER =
  "// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.\n";

const FIXTURE: Record<string, string> = {
  "src/config.ts": HEADER + "export const apiKey = 'abcdefghijklmnop';\n" +
    'export const password = "correct horse battery";\n' +
    "export const name = 'service';\n",
  "src/notes.md": "The token: abcdefghijklmnop rotates daily.\n" +
    "password = unquotedvalue123\n",
  "src/keys.pem": "-----BEGIN RSA PRIVATE KEY-----\nMIIE...\n",
  "src/aws.txt": "id AKIAIOSFODNN7EXAMPLE\n",
  "src/config.test.ts": HEADER + "const secret = 'abcdefghijklmnop';\n",
  "docs/skills/security.md": "Never do this: password = 'hunter2hunter2'\n",
};

/** Excluded exactly the way .eser/manifest.yml excludes the skill docs. */
const EXCLUDE = ["docs/skills/"];

const findings = (
  issues: ReadonlyArray<{ path?: string; file?: string; line?: number }>,
  root: string,
): string[] =>
  issues
    .map((i) => {
      const p = (i.path ?? i.file ?? "").replace(/^\.\//, "");
      const rel = path.isAbsolute(p) ? path.relative(root, p) : p;

      return `${rel.replaceAll("\\", "/")}:${i.line ?? 0}`;
    })
    .sort();

const makeFixture = async (): Promise<string> => {
  const root = await runtime.fs.makeTempDir({
    prefix: "validate-secrets-parity-",
  });

  for (const [rel, body] of Object.entries(FIXTURE)) {
    const full = path.join(root, rel);
    await runtime.fs.mkdir(path.dirname(full), { recursive: true });
    await runtime.fs.writeTextFile(full, body);
  }

  return root;
};

// sanitizeResources: false — file-tool.ts transitively loads the FFI DynamicLibrary
Deno.test({
  name: "validate-secrets: Go and TypeScript implementations agree",
  sanitizeResources: false,
  sanitizeOps: false,
  async fn() {
    await ensureLib();
    const lib = getLib();
    const nativeDisabled = Deno.env.get("ESER_AJAN_NATIVE") === "disabled";

    if (lib === null && nativeDisabled) {
      // Native deliberately off: only the TypeScript half can run here.
      return;
    }

    assert.assert(
      lib !== null,
      "native library not loaded — build it first (deno task cli preflight or build-native-lib)",
    );

    const root = await makeFixture();
    try {
      const ts = await tool.run({ root, exclude: EXCLUDE });
      const go = await tool.validator.validate({
        root,
        options: { exclude: EXCLUDE },
      });

      const expected = [
        "src/aws.txt:1",
        "src/config.ts:2",
        "src/config.ts:3",
        "src/keys.pem:1",
      ];

      assert.assertEquals(findings(ts.issues, root), expected, "TypeScript");
      assert.assertEquals(findings(go.issues, root), expected, "Go");
    } finally {
      await runtime.fs.remove(root, { recursive: true });
    }
  },
});
