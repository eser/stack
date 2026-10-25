// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

import * as assert from "@eserstack/test-kit/assert";
import * as results from "@eserstack/primitives/results";
import * as shellExec from "@eserstack/shell/exec";
import * as crossRuntime from "@eserstack/standards/cross-runtime";
import * as config from "../config.ts";
import * as generation from "../generation.ts";
import * as claudeCode from "./claude-code.ts";

// TASK-158 end to end: the adapter spawns the CLI with --json-schema and reads
// the reply from the result event's structured_output, in generateText and in
// streamText alike. The spawn goes through the native library.

const claudeConfig = config.withDefaults({
  provider: "claude-code",
  model: "",
});
const hi = [{
  role: "user" as const,
  content: [{ kind: "text" as const, text: "hi" }],
}];
const titleSchema: Record<string, unknown> = {
  type: "object",
  properties: { title: { type: "string" } },
  required: ["title"],
  additionalProperties: false,
};

// A stand-in for the claude CLI: it answers a --json-schema request the way the
// CLI does, with the reply in the result event's structured_output. It leaves
// the prompt on stdin unread, since only the arguments matter here.
const FAKE_CLAUDE = `#!/bin/sh
case " $* " in
  *" --json-schema "*)
    echo '[{"type":"result","subtype":"success","result":"Here is the title.","structured_output":{"title":"Deno workspaces"}}]' ;;
  *)
    echo '{"type":"result","subtype":"success","result":"no --json-schema flag"}' ;;
esac
`;

Deno.test({
  name: "a json_schema request returns the structured reply, streamed or not",
  // The stand-in CLI is a POSIX shell script.
  ignore: crossRuntime.getPlatform() === "windows",
  // The native library the first spawn loads outlives the test.
  sanitizeResources: false,
  fn: async () => {
    // The adapter spawns through the synchronous child(), which needs the
    // native library that the first spawn() loads.
    await shellExec.exec`true`.text();

    const dir = await crossRuntime.runtime.fs.makeTempDir({
      prefix: "eser-claude-",
    });
    const binary = crossRuntime.runtime.path.join(dir, "claude");

    try {
      await crossRuntime.runtime.fs.writeTextFile(binary, FAKE_CLAUDE);
      await crossRuntime.runtime.fs.chmod(binary, 0o755);

      const model = new claudeCode.ClaudeCodeModel(binary, claudeConfig);
      const options = {
        messages: hi,
        responseFormat: {
          type: "json_schema" as const,
          jsonSchema: titleSchema,
        },
      };

      const result = await model.generateText(options);
      assert.assert(results.isOk(result), "generateText failed");
      assert.assertEquals(JSON.parse(generation.text(result.value)), {
        title: "Deno workspaces",
      });

      const streamed = await generation.collectStream(
        model.streamText(options),
      );
      assert.assertEquals(JSON.parse(generation.text(streamed)), {
        title: "Deno workspaces",
      });
    } finally {
      await crossRuntime.runtime.fs.remove(dir, { recursive: true });
    }
  },
});
