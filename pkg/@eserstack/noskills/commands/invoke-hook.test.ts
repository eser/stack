// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * Integration tests for the post-ask-user-question hook handler.
 *
 * These tests exercise `processAskUserQuestionHook` — the testable core of
 * `handlePostAskUserQuestion` — end to end: given a parsed Claude Code hook
 * input plus a temp project root, verify that `.eser/.state/progresses/
 * ask-token.json` is (or is not) produced with the expected shape.
 *
 * This covers the discovery integrity system's write half (the read/consume
 * half is covered in `next.test.ts` via `consumeAskToken`).
 *
 * It also covers `takeExecutorReminder`, which decides when the PreToolUse
 * hook adds the sub-agent reminder to its `additionalContext`; the protected
 * files; `decidePreToolUse`, the PreToolUse decision without stdin, against
 * projects with and without sessions; and the session-start and pre-tool-use
 * hooks run as Claude Code runs them, with JSON in and out.
 *
 * @module
 */

import * as bdd from "@std/testing/bdd";
import * as assert from "@std/assert";
import * as crossRuntime from "@eserstack/standards/cross-runtime";
import * as invokeHook from "./invoke-hook.ts";
import * as cmd from "../output/cmd.ts";
import * as hookDecisions from "./hook-decisions.ts";
import * as persistence from "../state/persistence.ts";
import * as schema from "../state/schema.ts";
import * as machine from "../state/machine.ts";
import * as questions from "../context/questions.ts";
import * as next from "./next.ts";

let tempDir: string;

const initProject = async (root: string): Promise<void> => {
  // Minimal layout so `persistence.readState` has somewhere to look. We don't
  // need a full init — an empty progresses/ dir plus a state.json is enough.
  const stateDir = `${root}/${persistence.paths.progressesDir}`;
  await crossRuntime.runtime.fs.mkdir(stateDir, { recursive: true });
  const initial = schema.createInitialState();
  await crossRuntime.runtime.fs.writeTextFile(
    `${root}/${persistence.paths.stateFile}`,
    JSON.stringify(initial, null, 2) + "\n",
  );
};

const readTokenFile = async (
  root: string,
): Promise<Record<string, unknown> | null> => {
  try {
    const raw = await crossRuntime.runtime.fs.readTextFile(
      `${root}/${persistence.paths.askTokenFile}`,
    );
    return JSON.parse(raw) as Record<string, unknown>;
  } catch {
    return null;
  }
};

bdd.describe("processAskUserQuestionHook — token writing", () => {
  bdd.beforeEach(async () => {
    tempDir = await crossRuntime.runtime.fs.makeTempDir({
      prefix: "nos_invoke_hook_",
    });
    await initProject(tempDir);
  });

  bdd.afterEach(async () => {
    await crossRuntime.runtime.fs.remove(tempDir, { recursive: true });
  });

  bdd.it(
    "writes token file with correct structure for AskUserQuestion input",
    async () => {
      const input: Record<string, unknown> = {
        "tool_name": "AskUserQuestion",
        "tool_input": {
          questions: [
            { question: "What is the current behavior of the upload flow?" },
          ],
        },
        cwd: tempDir,
      };

      await invokeHook.processAskUserQuestionHook(input, tempDir);

      const token = await readTokenFile(tempDir);
      assert.assertExists(token, "token file should exist");
      assert.assertEquals(typeof token["token"], "string");
      // spec is null because the initial state has no active spec
      assert.assertEquals(token["spec"], null);
      assert.assertEquals(typeof token["createdAt"], "string");
      // Outside DISCOVERY the call records one step that no answer takes.
      assert.assertEquals(token["steps"], [{
        stepId: "unknown",
        match: "modified",
        originalQuestion: "",
        askedQuestion: "What is the current behavior of the upload flow?",
      }]);
    },
  );

  bdd.it(
    "skips non-AskUserQuestion tools (no token file written)",
    async () => {
      const input: Record<string, unknown> = {
        "tool_name": "Bash",
        "tool_input": { command: "ls" },
        cwd: tempDir,
      };

      await invokeHook.processAskUserQuestionHook(input, tempDir);

      const token = await readTokenFile(tempDir);
      assert.assertEquals(token, null);
    },
  );

  bdd.it(
    "handles missing questions array gracefully (no throw, no file)",
    async () => {
      const input: Record<string, unknown> = {
        "tool_name": "AskUserQuestion",
        "tool_input": {},
        cwd: tempDir,
      };

      // Should not throw
      await invokeHook.processAskUserQuestionHook(input, tempDir);

      const token = await readTokenFile(tempDir);
      assert.assertEquals(token, null);
    },
  );

  bdd.it(
    "falls back to legacy single-string `question` field shape",
    async () => {
      const input: Record<string, unknown> = {
        "tool_name": "AskUserQuestion",
        "tool_input": {
          question: "Legacy single-string shape",
        },
        cwd: tempDir,
      };

      await invokeHook.processAskUserQuestionHook(input, tempDir);

      const token = await readTokenFile(tempDir);
      assert.assertExists(token);
      const steps = token["steps"] as { askedQuestion: string }[];
      assert.assertEquals(
        steps.map((s) => s.askedQuestion),
        ["Legacy single-string shape"],
      );
    },
  );
});

bdd.describe(
  "processAskUserQuestionHook: base questions asked together",
  () => {
    const ask = (asked: readonly string[]): Record<string, unknown> => ({
      "tool_name": "AskUserQuestion",
      "tool_input": { questions: asked.map((question) => ({ question })) },
      cwd: tempDir,
    });

    const stepIdsOf = (token: Record<string, unknown> | null): string[] =>
      ((token?.["steps"] ?? []) as { stepId: string }[]).map((s) => s.stepId);

    bdd.beforeEach(async () => {
      tempDir = await crossRuntime.runtime.fs.makeTempDir({
        prefix: "nos_invoke_hook_batch_",
      });
      const state = machine.startSpec(
        schema.createInitialState(),
        "upload",
        "spec/upload",
      );
      await crossRuntime.runtime.fs.mkdir(
        `${tempDir}/${persistence.paths.progressesDir}`,
        { recursive: true },
      );
      await crossRuntime.runtime.fs.writeTextFile(
        `${tempDir}/${persistence.paths.stateFile}`,
        JSON.stringify(state, null, 2) + "\n",
      );
    });

    bdd.afterEach(async () => {
      await crossRuntime.runtime.fs.remove(tempDir, { recursive: true });
    });

    bdd.it(
      "records a step for every question across the two calls",
      async () => {
        const texts = questions.QUESTIONS.map((q) => q.text);

        await invokeHook.processAskUserQuestionHook(
          ask(texts.slice(0, 4)),
          tempDir,
        );
        await invokeHook.processAskUserQuestionHook(
          ask(texts.slice(4)),
          tempDir,
        );

        const token = await readTokenFile(tempDir);
        assert.assertEquals(token?.["spec"], "upload");
        assert.assertEquals(
          stepIdsOf(token),
          questions.QUESTIONS.map((q) => q.id),
        );
      },
    );

    bdd.it(
      "lets a later question about the answers leave the steps alone",
      async () => {
        await invokeHook.processAskUserQuestionHook(
          ask(questions.QUESTIONS.map((q) => q.text).slice(0, 4)),
          tempDir,
        );
        await invokeHook.processAskUserQuestionHook(
          ask(questions.QUESTIONS.map((q) => q.text).slice(4)),
          tempDir,
        );
        await invokeHook.processAskUserQuestionHook(
          ask(["Add, defer or skip the offline mode?"]),
          tempDir,
        );

        const token = await readTokenFile(tempDir);
        assert.assertEquals(stepIdsOf(token).length, 6);
      },
    );

    bdd.it("gives every answer of the set its STATED source", async () => {
      await invokeHook.processAskUserQuestionHook(
        ask(questions.QUESTIONS.map((q) => q.text).slice(0, 4)),
        tempDir,
      );
      await invokeHook.processAskUserQuestionHook(
        ask(questions.QUESTIONS.map((q) => q.text).slice(4)),
        tempDir,
      );

      const taken = await next.consumeAskTokens(
        tempDir,
        "upload",
        questions.QUESTIONS.map((q) => q.id),
      );

      assert.assertEquals(taken.size, 6);
      assert.assertEquals(await readTokenFile(tempDir), null);
    });
  },
);

bdd.describe("takeExecutorReminder: once per iteration", () => {
  let root: string;

  bdd.beforeEach(async () => {
    root = await crossRuntime.runtime.fs.makeTempDir({
      prefix: "nos_executor_reminder_",
    });
  });

  bdd.afterEach(async () => {
    await crossRuntime.runtime.fs.remove(root, { recursive: true });
  });

  bdd.it("returns the reminder on the first edit, then nothing", async () => {
    const first = await invokeHook.takeExecutorReminder(root);
    const second = await invokeHook.takeExecutorReminder(root);

    assert.assertEquals(first, hookDecisions.EXECUTOR_REMINDER);
    assert.assertEquals(second, null);
  });

  bdd.it("returns it again once the Stop hook removes the flag", async () => {
    await invokeHook.takeExecutorReminder(root);
    await crossRuntime.runtime.fs.remove(
      `${root}/${persistence.paths.progressesDir}/executor-warned.flag`,
    );

    assert.assertEquals(
      await invokeHook.takeExecutorReminder(root),
      hookDecisions.EXECUTOR_REMINDER,
    );
  });
});

// =============================================================================
// Protected files: allowGit and the git wrapper stay out of the agent's reach
// =============================================================================

const PROTECTED_MANIFEST = [
  "workflows:",
  "  precommit: [fmt]",
  "noskills:",
  "  allowGit: false",
  "  command: npx eser@latest noskills",
  "",
].join("\n");

const createProtectedProject = async (): Promise<string> => {
  const fs = crossRuntime.runtime.fs;
  const root = await fs.realPath(
    await fs.makeTempDir({ prefix: "nos_protected_" }),
  );
  await fs.mkdir(`${root}/${persistence.paths.eserDir}`, { recursive: true });
  await fs.writeTextFile(
    `${root}/${persistence.paths.manifestFile}`,
    PROTECTED_MANIFEST,
  );

  return root;
};

const PROTECTED_CASES: readonly {
  readonly name: string;
  readonly toolName: string;
  readonly toolInput: Record<string, unknown>;
  readonly denied: boolean;
}[] = [
  {
    name: "an Edit that sets allowGit",
    toolName: "Edit",
    toolInput: {
      "file_path": ".eser/manifest.yml",
      "old_string": "allowGit: false",
      "new_string": "allowGit: true",
    },
    denied: true,
  },
  {
    name: "a Write to the wrapper path",
    toolName: "Write",
    toolInput: {
      "file_path": ".eser/.state/bin/git",
      content: '#!/bin/sh\nexec /usr/bin/git "$@"\n',
    },
    denied: true,
  },
  {
    name: "a Write that replaces the manifest with allowGit on",
    toolName: "Write",
    toolInput: {
      "file_path": ".eser/manifest.yml",
      content: PROTECTED_MANIFEST.replace("false", "true"),
    },
    denied: true,
  },
  {
    name: "a MultiEdit that changes the wrapper's command",
    toolName: "MultiEdit",
    toolInput: {
      "file_path": ".eser/manifest.yml",
      edits: [{
        "old_string": "npx eser@latest noskills",
        "new_string": "true",
      }],
    },
    denied: true,
  },
  {
    name: "an Edit that reaches the manifest through ..",
    toolName: "Edit",
    toolInput: {
      "file_path": "src/../.eser/manifest.yml",
      "old_string": "allowGit: false",
      "new_string": "allowGit: true",
    },
    denied: true,
  },
  {
    name: "a Bash command that rewrites allowGit",
    toolName: "Bash",
    toolInput: {
      command:
        "sed -i '' 's/allowGit: false/allowGit: true/' .eser/manifest.yml",
    },
    denied: true,
  },
  {
    name: "an Edit to another section of the manifest",
    toolName: "Edit",
    toolInput: {
      "file_path": ".eser/manifest.yml",
      "old_string": "[fmt]",
      "new_string": "[fmt, lint]",
    },
    denied: false,
  },
  {
    name: "a Write to a rule under .eser",
    toolName: "Write",
    toolInput: { "file_path": ".eser/rules/naming.md", content: "# Naming\n" },
    denied: false,
  },
  {
    name: "a Write to project code",
    toolName: "Write",
    toolInput: { "file_path": "src/main.ts", content: "export {};\n" },
    denied: false,
  },
  {
    name: "a Bash command that reads the manifest",
    toolName: "Bash",
    toolInput: { command: "cat .eser/manifest.yml" },
    denied: false,
  },
];

bdd.describe("checkProtectedFiles", () => {
  let root: string;

  bdd.beforeEach(async () => {
    root = await createProtectedProject();
  });

  bdd.afterEach(async () => {
    await crossRuntime.runtime.fs.remove(root, { recursive: true });
  });

  for (const { name, toolName, toolInput, denied } of PROTECTED_CASES) {
    bdd.it(`${denied ? "refuses" : "allows"} ${name}`, async () => {
      const reason = await invokeHook.checkProtectedFiles(
        toolName,
        toolInput,
        root,
      );

      assert.assertEquals(reason !== null, denied, reason ?? undefined);
    });
  }

  bdd.it("refuses an Edit through a symlink to the manifest", async () => {
    const link = await crossRuntime.runtime.exec.spawn(
      "ln",
      ["-s", `${root}/${persistence.paths.manifestFile}`, `${root}/m.yml`],
      { stdout: "null", stderr: "null" },
    );
    assert.assertEquals(link.success, true);

    const reason = await invokeHook.checkProtectedFiles("Edit", {
      "file_path": `${root}/m.yml`,
      "old_string": "allowGit: false",
      "new_string": "allowGit: true",
    }, root);

    assert.assertNotEquals(reason, null);
  });

  bdd.it("refuses creating a manifest that turns allowGit on", async () => {
    await crossRuntime.runtime.fs.remove(
      `${root}/${persistence.paths.manifestFile}`,
    );

    const reason = await invokeHook.checkProtectedFiles("Write", {
      "file_path": `${root}/${persistence.paths.manifestFile}`,
      content: "noskills:\n  allowGit: true\n",
    }, root);

    assert.assertNotEquals(reason, null);
  });
});

// The hook as the agent tools run it: JSON on stdin, the decision on stdout,
// stderr and the exit code.
const REPO_ROOT = crossRuntime.runtime.path.resolve(
  import.meta.dirname ?? ".",
  "../../../..",
);

const NOSKILLS_MAIN = `${REPO_ROOT}/pkg/@eserstack/noskills/main.ts`;

type HookRun = {
  readonly code: number;
  readonly stdout: string;
  readonly stderr: string;
};

const runPreToolUseHook = async (
  input: Record<string, unknown>,
): Promise<HookRun> => {
  const result = await crossRuntime.runtime.exec.spawn(
    crossRuntime.runtime.process.execPath(),
    [
      "run",
      "-A",
      "--config",
      `${REPO_ROOT}/deno.json`,
      NOSKILLS_MAIN,
      "invoke-hook",
      "pre-tool-use",
    ],
    { stdinText: JSON.stringify(input), stdout: "piped", stderr: "piped" },
  );

  return {
    code: result.code,
    stdout: new TextDecoder().decode(result.stdout),
    stderr: new TextDecoder().decode(result.stderr),
  };
};

bdd.describe("pre-tool-use hook: protected files", () => {
  let root: string;

  bdd.beforeEach(async () => {
    root = await createProtectedProject();
  });

  bdd.afterEach(async () => {
    await crossRuntime.runtime.fs.remove(root, { recursive: true });
  });

  bdd.it(
    "denies an Edit that sets allowGit and a Write to the wrapper, allows a rule",
    async () => {
      const byName = new Map(PROTECTED_CASES.map((c) => [c.name, c]));
      const picked = [
        "an Edit that sets allowGit",
        "a Write to the wrapper path",
        "a Write to a rule under .eser",
      ].map((name) => byName.get(name)!);

      const runs = await Promise.all(
        picked.map((c) =>
          runPreToolUseHook({
            "tool_name": c.toolName,
            "tool_input": c.toolInput,
            cwd: root,
          })
        ),
      );

      for (const [i, c] of picked.entries()) {
        const run = runs[i]!;
        if (c.denied) {
          // Exit code 2 refuses the call in every tool; the JSON names the
          // reason where the tool reads it.
          assert.assertEquals(run.code, 2, c.name);
          assert.assertStringIncludes(run.stderr, "noskills: ", c.name);
          const decision = JSON.parse(run.stdout) as {
            hookSpecificOutput: { permissionDecision: string };
          };
          assert.assertEquals(
            decision.hookSpecificOutput.permissionDecision,
            "deny",
            c.name,
          );
        } else {
          assert.assertEquals(run.code, 0, run.stderr);
          assert.assertEquals(run.stdout.includes('"deny"'), false, c.name);
        }
      }

      // The manifest still says what the user wrote.
      assert.assertEquals(
        (await persistence.readManifest(root))?.allowGit,
        false,
      );
    },
  );

  bdd.it(
    "answers Copilot CLI and Kiro in their own forms, with exit code 2",
    async () => {
      const [copilot, kiro] = await Promise.all([
        runPreToolUseHook({
          toolName: "edit",
          toolArgs: JSON.stringify({
            path: ".eser/manifest.yml",
            "old_str": "allowGit: false",
            "new_str": "allowGit: true",
          }),
          cwd: root,
        }),
        runPreToolUseHook({
          "hook_event_name": "preToolUse",
          "tool_name": "execute_bash",
          "tool_input": { command: "git push origin main" },
          cwd: root,
        }),
      ]);

      assert.assertEquals(copilot!.code, 2, copilot!.stderr);
      const decision = JSON.parse(copilot!.stdout) as {
        permissionDecision: string;
        permissionDecisionReason: string;
      };
      assert.assertEquals(decision.permissionDecision, "deny");
      assert.assertStringIncludes(
        decision.permissionDecisionReason,
        "allowGit",
      );

      assert.assertEquals(kiro!.code, 2, kiro!.stderr);
      assert.assertEquals(kiro!.stdout, "");
      assert.assertStringIncludes(kiro!.stderr, "Git write operations");
    },
  );
});

// =============================================================================
// Each agent tool's payload through the protected-file check and git guard
// =============================================================================

/**
 * One PreToolUse payload per agent tool, in the shape its documentation gives
 * (see the list in hook-decisions.ts): a shell call running `command` and a
 * file call setting allowGit in the manifest.
 */
type ToolPayloads = {
  readonly shell: (command: string) => Record<string, unknown>;
  readonly allowGitEdit: Record<string, unknown>;
};

const MANIFEST = ".eser/manifest.yml";

const TOOL_PAYLOADS: Readonly<Record<string, ToolPayloads>> = {
  "Claude Code": {
    shell: (command) => ({
      "hook_event_name": "PreToolUse",
      "tool_name": "Bash",
      "tool_input": { command },
    }),
    allowGitEdit: {
      "hook_event_name": "PreToolUse",
      "tool_name": "Edit",
      "tool_input": {
        "file_path": MANIFEST,
        "old_string": "allowGit: false",
        "new_string": "allowGit: true",
      },
    },
  },
  Codex: {
    shell: (command) => ({
      "hook_event_name": "PreToolUse",
      "tool_name": "Bash",
      "tool_use_id": "call_1",
      "turn_id": "turn_1",
      "tool_input": { command },
    }),
    allowGitEdit: {
      "hook_event_name": "PreToolUse",
      "tool_name": "apply_patch",
      "turn_id": "turn_1",
      "tool_input": {
        command:
          `*** Begin Patch\n*** Update File: ${MANIFEST}\n@@\n noskills:\n-  allowGit: false\n+  allowGit: true\n*** End Patch`,
      },
    },
  },
  "Copilot CLI (camelCase)": {
    shell: (command) => ({
      timestamp: 1704614400000,
      toolName: "bash",
      toolArgs: JSON.stringify({ command, description: "run" }),
    }),
    allowGitEdit: {
      timestamp: 1704614400000,
      toolName: "edit",
      toolArgs: {
        path: MANIFEST,
        "old_str": "allowGit: false",
        "new_str": "allowGit: true",
      },
    },
  },
  "Copilot CLI (PascalCase)": {
    shell: (command) => ({
      "hook_event_name": "PreToolUse",
      timestamp: "2026-10-05T00:00:00.000Z",
      "tool_name": "Bash",
      "tool_input": { command },
    }),
    allowGitEdit: {
      "hook_event_name": "PreToolUse",
      "tool_name": "Write",
      "tool_input": {
        path: MANIFEST,
        "file_text": "noskills:\n  allowGit: true\n",
      },
    },
  },
  Kiro: {
    shell: (command) => ({
      "hook_event_name": "preToolUse",
      "session_id": "abc123",
      "tool_name": "execute_bash",
      "tool_input": { command },
    }),
    allowGitEdit: {
      "hook_event_name": "preToolUse",
      "session_id": "abc123",
      "tool_name": "fs_write",
      "tool_input": {
        command: "str_replace",
        path: MANIFEST,
        "old_str": "allowGit: false",
        "new_str": "allowGit: true",
      },
    },
  },
  OpenCode: {
    shell: (command) => ({
      "hook_event_name": "PreToolUse",
      "session_id": "ses_1",
      "tool_name": "bash",
      "tool_input": { command, description: "run" },
    }),
    allowGitEdit: {
      "hook_event_name": "PreToolUse",
      "session_id": "ses_1",
      "tool_name": "edit",
      "tool_input": {
        filePath: MANIFEST,
        oldString: "allowGit: false",
        newString: "allowGit: true",
      },
    },
  },
};

bdd.describe("each agent tool's PreToolUse payload", () => {
  let root: string;

  bdd.beforeEach(async () => {
    root = await createProtectedProject();
  });

  bdd.afterEach(async () => {
    await crossRuntime.runtime.fs.remove(root, { recursive: true });
  });

  for (const [tool, payloads] of Object.entries(TOOL_PAYLOADS)) {
    bdd.it(`${tool}: the git guard refuses a git write`, async () => {
      const shellCall = (command: string): string => {
        const call = hookDecisions.hookToolCall(payloads.shell(command));
        assert.assertEquals(call.kind, "shell", tool);

        return call.kind === "shell" ? call.command : "";
      };

      assert.assertNotEquals(
        await invokeHook.checkGitGuard(shellCall("git push"), false, root),
        null,
      );
      assert.assertEquals(
        await invokeHook.checkGitGuard(shellCall("git status"), false, root),
        null,
      );
    });

    bdd.it(
      `${tool}: the protected-file check refuses an allowGit edit`,
      async () => {
        const input = payloads.allowGitEdit;

        assert.assertNotEquals(
          await invokeHook.checkProtectedFiles(
            hookDecisions.toolNameOf(input),
            hookDecisions.toolInputOf(input),
            root,
          ),
          null,
        );
      },
    );

    bdd.it(`${tool}: decidePreToolUse refuses both`, async () => {
      const env: invokeHook.PreToolUseEnv = {
        root,
        sessionId: null,
        warn: () => Promise.resolve(),
      };

      const decisions = await Promise.all([
        invokeHook.decidePreToolUse(payloads.shell("git commit -m x"), env),
        invokeHook.decidePreToolUse(payloads.allowGitEdit, env),
      ]);

      for (const decision of decisions) {
        assert.assertEquals(decision.kind, "deny", tool);
      }
    });
  }

  bdd.it(
    "lets an OpenCode edit to another section of the manifest through",
    async () => {
      assert.assertEquals(
        await invokeHook.checkProtectedFiles("edit", {
          filePath: MANIFEST,
          oldString: "[fmt]",
          newString: "[fmt, lint]",
        }, root),
        null,
      );
    },
  );

  bdd.it(
    "refuses a patch to the manifest, whose result it cannot work out",
    async () => {
      const reason = await invokeHook.checkProtectedFiles("apply_patch", {
        patchText:
          `*** Begin Patch\n*** Update File: src/a.ts\n*** Update File: ${MANIFEST}\n*** End Patch`,
      }, root);

      assert.assertNotEquals(reason, null);
      assert.assertStringIncludes(
        reason ?? "",
        "does not show what the file holds",
      );
    },
  );
});

// =============================================================================
// preToolUseAnswer: the decision in each tool's form
// =============================================================================

bdd.describe("preToolUseAnswer", () => {
  const denial: invokeHook.PreToolUseDecision = {
    kind: "deny",
    reason: "Git write operations are not allowed.",
  };
  const context: invokeHook.PreToolUseDecision = {
    kind: "allow-with-context",
    context: "[noskills] Rules for this file",
  };

  bdd.it("denies with exit code 2 and the reason on stderr everywhere", () => {
    for (const dialect of ["claude", "copilot", "kiro"] as const) {
      const answer = invokeHook.preToolUseAnswer(denial, dialect);

      assert.assertEquals(answer.exitCode, 2, dialect);
      assert.assertEquals(
        answer.stderr,
        "noskills: Git write operations are not allowed.\n",
        dialect,
      );
    }
  });

  bdd.it("puts the denial in hookSpecificOutput for the claude dialect", () => {
    const answer = invokeHook.preToolUseAnswer(denial, "claude");

    assert.assertEquals(JSON.parse(answer.stdout), {
      hookSpecificOutput: {
        hookEventName: "PreToolUse",
        permissionDecision: "deny",
        permissionDecisionReason:
          "noskills: Git write operations are not allowed.",
      },
    });
  });

  bdd.it("puts the denial at the top level for Copilot CLI", () => {
    const answer = invokeHook.preToolUseAnswer(denial, "copilot");

    assert.assertEquals(JSON.parse(answer.stdout), {
      permissionDecision: "deny",
      permissionDecisionReason:
        "noskills: Git write operations are not allowed.",
    });
  });

  bdd.it("writes no stdout for a Kiro denial", () => {
    assert.assertEquals(invokeHook.preToolUseAnswer(denial, "kiro").stdout, "");
  });

  bdd.it("adds context only where the tool reads it", () => {
    const claude = invokeHook.preToolUseAnswer(context, "claude");
    const kiro = invokeHook.preToolUseAnswer(context, "kiro");
    const copilot = invokeHook.preToolUseAnswer(context, "copilot");

    assert.assertStringIncludes(claude.stdout, '"additionalContext"');
    assert.assertEquals(kiro.stdout, "[noskills] Rules for this file");
    // An allow would skip Copilot CLI's permission prompt.
    assert.assertEquals(copilot, { stdout: "", stderr: "", exitCode: 0 });
  });

  bdd.it("answers nothing when there is nothing to decide", () => {
    assert.assertEquals(
      invokeHook.preToolUseAnswer({ kind: "none" }, "claude"),
      { stdout: "", stderr: "", exitCode: 0 },
    );
  });
});

// =============================================================================
// decidePreToolUse: git guard and phase gate without stdin
// =============================================================================

const CUSTOM_PREFIX = "deno task cli noskills";

type GateProject = {
  readonly root: string;
  readonly warnings: string[];
  readonly env: (sessionId: string | null) => invokeHook.PreToolUseEnv;
};

/**
 * A project whose manifest names CUSTOM_PREFIX and whose global state is in
 * `phase` for the spec `upload`.
 */
const createGateProject = async (
  phase: schema.Phase,
  allowGit = false,
): Promise<GateProject> => {
  const fs = crossRuntime.runtime.fs;
  const root = await fs.makeTempDir({ prefix: "nos_gate_" });

  await fs.mkdir(`${root}/${persistence.paths.eserDir}`, { recursive: true });
  await persistence.writeManifest(root, {
    ...schema.createInitialManifest([], ["claude-code"], ["anthropic"], {
      languages: ["typescript"],
      frameworks: [],
      ci: [],
      testRunner: "deno",
    }),
    allowGit,
    command: CUSTOM_PREFIX,
  });
  await persistence.writeState(root, {
    ...schema.createInitialState(),
    phase,
    spec: "upload",
  });

  const warnings: string[] = [];

  return {
    root,
    warnings,
    env: (sessionId) => ({
      root,
      sessionId,
      warn: (notice) => {
        warnings.push(notice);
        return Promise.resolve();
      },
    }),
  };
};

const addSession = async (
  root: string,
  id: string,
  mode: "spec" | "free",
  phase: string | null,
): Promise<void> => {
  const now = new Date().toISOString();
  await persistence.createSession(root, {
    id,
    spec: null,
    mode,
    phase,
    pid: 1,
    startedAt: now,
    lastActiveAt: now,
    tool: "claude-code",
  });
};

const bash = (command: string): Record<string, unknown> => ({
  "tool_name": "Bash",
  "tool_input": { command },
});

const writeCode: Record<string, unknown> = {
  "tool_name": "Write",
  "tool_input": { "file_path": "src/upload.ts", content: "export {};\n" },
};

const reasonOf = (decision: invokeHook.PreToolUseDecision): string =>
  decision.kind === "deny" ? decision.reason : "";

bdd.describe("decidePreToolUse", () => {
  const projects: string[] = [];

  const project = async (
    phase: schema.Phase,
    allowGit = false,
  ): Promise<GateProject> => {
    const created = await createGateProject(phase, allowGit);
    projects.push(created.root);
    return created;
  };

  bdd.afterEach(async () => {
    // loadCommandPrefix sets the prefix for the process; put the default back
    // for the tests that run after these.
    cmd.setCommandPrefix(schema.DEFAULT_COMMAND_PREFIX);
    await Promise.all(
      projects.splice(0).map((root) =>
        crossRuntime.runtime.fs.remove(root, { recursive: true })
      ),
    );
  });

  bdd.it("refuses a git write in a project with no session", async () => {
    const { env } = await project("EXECUTING");

    const decision = await invokeHook.decidePreToolUse(
      bash("git push origin main"),
      env(null),
    );

    assert.assertEquals(decision.kind, "deny");
  });

  bdd.it(
    "refuses a git write when NOSKILLS_SESSION names no session on disk",
    async () => {
      const { env } = await project("EXECUTING");

      const decision = await invokeHook.decidePreToolUse(
        bash("git commit -m wip"),
        env("ended-session"),
      );

      assert.assertEquals(decision.kind, "deny");
    },
  );

  bdd.it("refuses a git write in a free-mode session", async () => {
    const { root, env } = await project("IDLE");
    await addSession(root, "free-1", "free", null);

    const decision = await invokeHook.decidePreToolUse(
      bash("git push"),
      env("free-1"),
    );

    assert.assertEquals(decision.kind, "deny");
  });

  bdd.it("lets git reads and other commands through", async () => {
    const { env } = await project("DISCOVERY");

    const decisions = await Promise.all(
      ["git status", "git log --oneline -5", "deno test -A"].map((command) =>
        invokeHook.decidePreToolUse(bash(command), env(null))
      ),
    );

    assert.assertEquals(decisions.map((d) => d.kind), ["none", "none", "none"]);
  });

  bdd.it("lets git writes through when allowGit is true", async () => {
    const { env } = await project("EXECUTING", true);

    const decision = await invokeHook.decidePreToolUse(
      bash("git commit -m wip"),
      env(null),
    );

    assert.assertEquals(decision.kind, "none");
  });

  bdd.it(
    "refuses a protected-file edit even in a free-mode session",
    async () => {
      const { root, env } = await project("IDLE");
      await addSession(root, "free-2", "free", null);

      const decision = await invokeHook.decidePreToolUse({
        "tool_name": "Write",
        "tool_input": {
          "file_path": ".eser/.state/bin/git",
          content: "#!/bin/sh\n",
        },
        cwd: root,
      }, env("free-2"));

      assert.assertEquals(decision.kind, "deny");
    },
  );

  bdd.it(
    "refuses a code edit in DISCOVERY and names the manifest's command",
    async () => {
      const { env } = await project("DISCOVERY");

      const decision = await invokeHook.decidePreToolUse(writeCode, env(null));

      assert.assertEquals(decision.kind, "deny");
      assert.assertStringIncludes(
        reasonOf(decision),
        `\`${CUSTOM_PREFIX} spec upload next\``,
      );
    },
  );

  bdd.it(
    "refuses Kiro, Copilot CLI and OpenCode code edits in DISCOVERY",
    async () => {
      const { env } = await project("DISCOVERY");
      const edits = [
        {
          "hook_event_name": "preToolUse",
          "tool_name": "fs_write",
          "tool_input": {
            command: "create",
            path: "src/upload.ts",
            "file_text": "export {};\n",
          },
        },
        {
          toolName: "create",
          toolArgs: '{"path":"src/upload.ts","file_text":"export {};"}',
        },
        {
          "tool_name": "apply_patch",
          "tool_input": {
            patchText:
              "*** Begin Patch\n*** Add File: src/upload.ts\n+export {};\n*** End Patch",
          },
        },
      ];

      const decisions = await Promise.all(
        edits.map((edit) => invokeHook.decidePreToolUse(edit, env(null))),
      );

      for (const decision of decisions) {
        assert.assertEquals(decision.kind, "deny");
      }
    },
  );

  bdd.it(
    "refuses a patch in DISCOVERY when any of its files is gated",
    async () => {
      const { env } = await project("DISCOVERY");

      const decision = await invokeHook.decidePreToolUse({
        "tool_name": "apply_patch",
        "tool_input": {
          command:
            "*** Begin Patch\n*** Update File: .eser/rules/a.md\n*** Update File: src/upload.ts\n*** End Patch",
        },
      }, env(null));

      assert.assertEquals(decision.kind, "deny");
    },
  );

  bdd.it("lets a code edit through in a free-mode session", async () => {
    const { root, env } = await project("DISCOVERY");
    await addSession(root, "free-3", "free", null);

    const decision = await invokeHook.decidePreToolUse(
      writeCode,
      env("free-3"),
    );

    assert.assertEquals(decision.kind, "none");
  });

  bdd.it(
    "gates a code edit by the project state when the session is gone",
    async () => {
      const { env } = await project("SPEC_PROPOSAL");

      const decision = await invokeHook.decidePreToolUse(
        writeCode,
        env("ended-session"),
      );

      assert.assertEquals(decision.kind, "deny");
      assert.assertStringIncludes(reasonOf(decision), "approve");
    },
  );

  bdd.it(
    "gates by the most restrictive session phase and warns the user",
    async () => {
      const { root, env, warnings } = await project("IDLE");
      await addSession(root, "spec-1", "spec", "EXECUTING");
      await addSession(root, "spec-2", "spec", "BLOCKED");

      const decision = await invokeHook.decidePreToolUse(writeCode, env(null));

      assert.assertEquals(decision.kind, "deny");
      assert.assertStringIncludes(reasonOf(decision), "Execution blocked");
      assert.assertEquals(warnings.length, 1);
      assert.assertStringIncludes(warnings[0]!, "NOSKILLS_SESSION");
    },
  );

  bdd.it(
    "lets a code edit through in EXECUTING with the executor reminder",
    async () => {
      const { env } = await project("EXECUTING");

      const decision = await invokeHook.decidePreToolUse(writeCode, env(null));

      assert.assertEquals(decision.kind, "allow-with-context");
      assert.assertStringIncludes(
        decision.kind === "allow-with-context" ? decision.context : "",
        hookDecisions.EXECUTOR_REMINDER,
      );
    },
  );

  bdd.it("lets a Codex patch through in EXECUTING", async () => {
    const { env } = await project("EXECUTING");

    const decision = await invokeHook.decidePreToolUse({
      "hook_event_name": "PreToolUse",
      "tool_name": "apply_patch",
      "tool_input": {
        command:
          "*** Begin Patch\n*** Update File: src/a.ts\n*** Add File: src/b.ts\n+x\n*** End Patch",
      },
    }, env(null));

    assert.assertNotEquals(decision.kind, "deny");
  });

  bdd.it("leaves tools other than Bash and the file tools alone", async () => {
    const { env } = await project("DISCOVERY");

    const decision = await invokeHook.decidePreToolUse(
      { "tool_name": "Read", "tool_input": { "file_path": "src/upload.ts" } },
      env(null),
    );

    assert.assertEquals(decision.kind, "none");
  });
});

// =============================================================================
// session-start as Claude Code runs it
// =============================================================================

bdd.describe("session-start hook", () => {
  let root: string;

  bdd.beforeEach(async () => {
    // allowGit true: this test is about the context, not the git wrapper.
    root = (await createGateProject("IDLE", true)).root;
  });

  bdd.afterEach(async () => {
    await crossRuntime.runtime.fs.remove(root, { recursive: true });
  });

  bdd.it(
    "puts the compiled instruction in additionalContext, naming the manifest's command",
    async () => {
      const result = await crossRuntime.runtime.exec.spawn(
        crossRuntime.runtime.process.execPath(),
        [
          "run",
          "-A",
          "--config",
          `${REPO_ROOT}/deno.json`,
          `${REPO_ROOT}/pkg/@eserstack/noskills/main.ts`,
          "invoke-hook",
          "session-start",
        ],
        {
          env: { NOSKILLS_PROJECT_ROOT: root, CLAUDE_ENV_FILE: "" },
          stdin: "null",
          stdout: "piped",
          stderr: "piped",
        },
      );
      assert.assertEquals(
        result.code,
        0,
        new TextDecoder().decode(result.stderr),
      );

      const output = JSON.parse(new TextDecoder().decode(result.stdout)) as {
        hookSpecificOutput: {
          hookEventName: string;
          additionalContext: string;
        };
      };

      assert.assertEquals(
        output.hookSpecificOutput.hookEventName,
        "SessionStart",
      );
      const context = output.hookSpecificOutput.additionalContext;
      assert.assertStringIncludes(context, '"phase":"IDLE"');
      assert.assertStringIncludes(context, CUSTOM_PREFIX);
      assert.assertEquals(
        context.includes(schema.DEFAULT_COMMAND_PREFIX),
        false,
      );
    },
  );

  bdd.it(
    "gives Copilot CLI a top-level additionalContext with --tool=copilot-cli",
    async () => {
      const result = await crossRuntime.runtime.exec.spawn(
        crossRuntime.runtime.process.execPath(),
        [
          "run",
          "-A",
          "--config",
          `${REPO_ROOT}/deno.json`,
          NOSKILLS_MAIN,
          "invoke-hook",
          "session-start",
          "--tool=copilot-cli",
        ],
        {
          env: { NOSKILLS_PROJECT_ROOT: root, CLAUDE_ENV_FILE: "" },
          stdin: "null",
          stdout: "piped",
          stderr: "piped",
        },
      );
      assert.assertEquals(
        result.code,
        0,
        new TextDecoder().decode(result.stderr),
      );

      const output = JSON.parse(
        new TextDecoder().decode(result.stdout),
      ) as Record<string, unknown>;

      assert.assertEquals(Object.keys(output), ["additionalContext"]);
      assert.assertStringIncludes(
        String(output["additionalContext"]),
        '"phase":"IDLE"',
      );
    },
  );
});
