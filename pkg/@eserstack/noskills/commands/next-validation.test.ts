// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * Tests for the validator step of `noskills next`, against a temporary
 * project and a fake ai provider: when it runs, what the agent sees, the
 * stored result it repeats, and the skipped results.
 */

import * as bdd from "@std/testing/bdd";
import * as assert from "@eserstack/test-kit/assert";
import * as ai from "@eserstack/ai/mod";
import * as results from "@eserstack/primitives/results";
import { runtime } from "@eserstack/standards/cross-runtime";
import * as nextValidation from "./next-validation.ts";
import type * as compiler from "../context/compiler.ts";
import type * as transitionValidation from "../context/transition-validation.ts";
import * as questions from "../context/questions.ts";
import * as machine from "../state/machine.ts";
import * as persistence from "../state/persistence.ts";
import * as schema from "../state/schema.ts";

const SPEC = "upload";

const REPLY = JSON.stringify({
  summary: "One gap.",
  findings: [
    {
      severity: "medium",
      issue: "The scope boundary does not name the file types.",
      suggestion: "List the accepted file types.",
    },
  ],
});

/** A spec whose discovery answers are all in, waiting for review. */
const inRefinement = (): schema.StateFile => {
  let state = machine.startSpec(
    schema.createInitialState(),
    SPEC,
    `spec/${SPEC}`,
    "Let users upload photos",
  );
  for (const q of questions.QUESTIONS) {
    state = machine.addDiscoveryAnswer(
      state,
      q.id,
      `Answer for ${q.id} with enough detail`,
    );
  }

  return machine.completeDiscovery(state);
};

const manifest = (validate?: schema.ValidatorConfig): schema.NosManifest => ({
  ...schema.createInitialManifest([], ["claude-code"], [], {
    languages: ["typescript"],
    frameworks: [],
    ci: [],
    testRunner: "deno",
  }),
  ...(validate === undefined ? {} : { validate }),
});

const VALIDATE_ENTRY: schema.ValidatorConfig = {
  agent: "fake-judge",
  model: "judge-1",
};

type Recorded = {
  readonly agents: string[];
  readonly prompts: string[];
  readonly workDirs: string[];
  readonly notices: string[];
};

/**
 * Validator deps whose provider answers with `reply`, recording which agents
 * were looked up, what the model was sent and where it ran.
 */
const fakeDeps = (
  reply: (
    signal: AbortSignal | undefined,
  ) => Promise<results.Result<ai.GenerateTextResult, ai.AiError>>,
  timeoutMs = 5_000,
): { deps: nextValidation.NextValidationDeps; recorded: Recorded } => {
  const recorded: Recorded = {
    agents: [],
    prompts: [],
    workDirs: [],
    notices: [],
  };
  const deps: nextValidation.NextValidationDeps = {
    resolveFactory: (agent) => {
      recorded.agents.push(agent);
      return Promise.resolve({
        provider: agent,
        createModel: (config) =>
          Promise.resolve({
            capabilities: ["text_generation"],
            provider: agent,
            modelId: config.model,
            generateText: async (options, signal) => {
              recorded.workDirs.push(String(config.properties?.["cwd"]));
              const message = options.messages[0]?.content[0];
              recorded.prompts.push(
                message?.kind === "text" ? message.text : "",
              );
              // The directory exists while the agent runs in it.
              await runtime.fs.stat(String(config.properties?.["cwd"]));
              return await reply(signal);
            },
            // The fake throws on any call; the validator only calls generateText.
            // oxlint-disable-next-line require-yield
            streamText: async function* () {
              throw new Error("the validator never streams");
            },
            close: () => Promise.resolve(),
            getRawClient: () => null,
          }),
      });
    },
    timeoutMs,
    notify: (text) => {
      recorded.notices.push(text);
      return Promise.resolve();
    },
  };

  return { deps, recorded };
};

const answer = (text: string) => () =>
  Promise.resolve(
    results.ok<ai.GenerateTextResult>({
      content: [{ kind: "text", text }],
      stopReason: "end_turn",
      usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2 },
      modelId: "judge-1",
    }),
  );

bdd.describe("noskills next: the transition validator step", () => {
  let root: string;
  let state: schema.StateFile;

  bdd.beforeEach(async () => {
    root = await runtime.fs.makeTempDir({ prefix: "nos_next_validation_" });
    await runtime.fs.mkdir(`${root}/${persistence.paths.specDir(SPEC)}`, {
      recursive: true,
    });
    await runtime.fs.writeTextFile(
      `${root}/${persistence.paths.specFile(SPEC)}`,
      "# Spec: upload\n\nUsers upload photos.\n",
    );
    state = inRefinement();
    await persistence.writeStateAndSpec(root, state);
  });

  bdd.afterEach(async () => {
    await runtime.fs.remove(root, { recursive: true });
  });

  // TASK-329: state.specState.path came from state.json unchecked, so a
  // crafted state could send a file from outside the project to the model.
  bdd.it(
    "never sends a spec path outside the project to the agent",
    async () => {
      const outside = `${root}-secret.md`;
      await runtime.fs.writeTextFile(outside, "TOP SECRET\n");
      try {
        for (const path of [
          "../" + outside.split("/").pop(),
          outside,
          "a/../../x.md",
        ]) {
          const { deps, recorded } = fakeDeps(answer(REPLY));
          const crafted = {
            ...state,
            specState: { ...state.specState, path },
          };

          // One path at a time, so a failure names it.
          // oxlint-disable-next-line no-await-in-loop
          const validation = await nextValidation.validationFor(
            root,
            crafted,
            manifest(VALIDATE_ENTRY),
            false,
            deps,
          );

          assert.assertEquals(recorded.agents, [], path);
          assert.assertEquals(
            recorded.prompts.some((p) => p.includes("TOP SECRET")),
            false,
            path,
          );
          assert.assertStringIncludes(
            JSON.stringify(validation),
            "leaves the project",
          );
        }
      } finally {
        await runtime.fs.remove(outside);
      }
    },
  );

  bdd.it("does nothing unless the flag or the manifest asks", async () => {
    const { deps, recorded } = fakeDeps(answer(REPLY));

    const validation = await nextValidation.validationFor(
      root,
      state,
      manifest(),
      false,
      deps,
    );

    assert.assertEquals(validation, null);
    assert.assertEquals(recorded.agents, []);
  });

  bdd.it("runs the manifest's agent and reports its findings", async () => {
    const { deps, recorded } = fakeDeps(answer(REPLY));

    const validation = await nextValidation.validationFor(
      root,
      state,
      manifest(VALIDATE_ENTRY),
      false,
      deps,
    );

    assert.assertEquals(validation?.status, "reviewed");
    if (validation?.status === "reviewed") {
      assert.assertEquals(validation.agent, "fake-judge");
      assert.assertEquals(validation.findings.length, 1);
    }
    assert.assertEquals(recorded.agents, ["fake-judge"]);
    assert.assertEquals(recorded.notices.length, 1);

    // The agent saw the spec document and the answers, nothing more.
    const sent = JSON.parse(recorded.prompts[0] ?? "{}");
    assert.assertEquals(Object.keys(sent), ["transition", "spec", "answers"]);
    assert.assertStringIncludes(sent.spec.document, "Users upload photos.");
  });

  bdd.it("runs the agent in an empty directory it then removes", async () => {
    const { deps, recorded } = fakeDeps(answer(REPLY));

    await nextValidation.validationFor(
      root,
      state,
      manifest(VALIDATE_ENTRY),
      false,
      deps,
    );

    const [workDir] = recorded.workDirs;
    assert.assertNotEquals(workDir, root);
    assert.assertEquals(workDir?.startsWith(root), false);
    await assert.assertRejects(() => runtime.fs.stat(workDir ?? ""));
  });

  bdd.it(
    "repeats the stored result while the input stays the same",
    async () => {
      const { deps, recorded } = fakeDeps(answer(REPLY));
      const config = manifest(VALIDATE_ENTRY);

      const first = await nextValidation.validationFor(
        root,
        state,
        config,
        false,
        deps,
      );
      const second = await nextValidation.validationFor(
        root,
        state,
        config,
        false,
        deps,
      );

      assert.assertEquals(second, first);
      assert.assertEquals(recorded.agents.length, 1);
    },
  );

  bdd.it("runs again once the spec document changes", async () => {
    const { deps, recorded } = fakeDeps(answer(REPLY));
    const config = manifest(VALIDATE_ENTRY);

    await nextValidation.validationFor(root, state, config, false, deps);
    await runtime.fs.writeTextFile(
      `${root}/${persistence.paths.specFile(SPEC)}`,
      "# Spec: upload\n\nUsers upload photos and videos.\n",
    );
    await nextValidation.validationFor(root, state, config, false, deps);

    assert.assertEquals(recorded.agents.length, 2);
  });

  bdd.it("runs every time with --validate", async () => {
    const { deps, recorded } = fakeDeps(answer(REPLY));
    const config = manifest(VALIDATE_ENTRY);

    await nextValidation.validationFor(root, state, config, true, deps);
    await nextValidation.validationFor(root, state, config, true, deps);

    assert.assertEquals(recorded.agents.length, 2);
  });

  bdd.it(
    "uses the noskills run agent for --validate without an entry",
    async () => {
      const { deps, recorded } = fakeDeps(answer(REPLY));

      const validation = await nextValidation.validationFor(
        root,
        state,
        manifest(),
        true,
        deps,
      );

      assert.assertEquals(recorded.agents, ["claude-code"]);
      assert.assertEquals(validation?.model, "claude-sonnet-5");
    },
  );

  bdd.it(
    "says --validate has nothing to check outside the two transitions",
    async () => {
      const { deps, recorded } = fakeDeps(answer(REPLY));

      const validation = await nextValidation.validationFor(
        root,
        { ...state, phase: "EXECUTING" },
        manifest(VALIDATE_ENTRY),
        true,
        deps,
      );

      assert.assertEquals(validation, null);
      assert.assertEquals(recorded.agents, []);
      assert.assertStringIncludes(
        recorded.notices[0] ?? "",
        "nothing to check",
      );
    },
  );

  bdd.it(
    "skips with the reason when the manifest entry is unusable",
    async () => {
      const { deps, recorded } = fakeDeps(answer(REPLY));

      const validation = await nextValidation.validationFor(
        root,
        state,
        manifest({ agent: "fake-judge" } as schema.ValidatorConfig),
        false,
        deps,
      );

      assert.assertEquals(validation?.status, "skipped");
      if (validation?.status === "skipped") {
        assert.assertEquals(validation.agent, null);
        assert.assertStringIncludes(
          validation.reason,
          "noskills.validate.model",
        );
      }
      assert.assertEquals(recorded.agents, []);
    },
  );

  bdd.it("skips on a timeout and keeps the transition for review", async () => {
    const { deps } = fakeDeps(
      (signal) =>
        new Promise((_resolve, reject) => {
          signal?.addEventListener(
            "abort",
            () => reject(new ai.AiError("request aborted")),
            { once: true },
          );
        }),
      20,
    );

    const validation = await nextValidation.validationFor(
      root,
      state,
      manifest(VALIDATE_ENTRY),
      false,
      deps,
    );

    assert.assertEquals(validation?.status, "skipped");
    if (validation?.status === "skipped") {
      assert.assertStringIncludes(validation.reason, "did not answer within");
      assert.assertStringIncludes(
        validation.instruction,
        "spec upload next --validate",
      );
    }
    // Nothing in the state moved: the user still approves the answers.
    const stored = await persistence.readSpecState(root, SPEC);
    assert.assertEquals(stored.phase, "DISCOVERY_REFINEMENT");
    assert.assertEquals(stored.discovery.approved, false);
  });

  bdd.it("checks the spec proposal once the draft exists", async () => {
    const { deps, recorded } = fakeDeps(answer(REPLY));
    const proposal = machine.autoClassifyIfMissing({
      ...state,
      phase: "SPEC_PROPOSAL",
    });

    const validation = await nextValidation.validationFor(
      root,
      proposal,
      manifest(VALIDATE_ENTRY),
      false,
      deps,
    );

    assert.assertEquals(validation?.transition.id, "spec-proposal");
    const sent = JSON.parse(recorded.prompts[0] ?? "{}");
    assert.assertEquals(sent.transition.to, "SPEC_APPROVED");
  });

  bdd.it("judges a spec without a document yet", async () => {
    const { deps, recorded } = fakeDeps(answer(REPLY));
    await runtime.fs.remove(`${root}/${persistence.paths.specFile(SPEC)}`);

    await nextValidation.validationFor(
      root,
      state,
      manifest(VALIDATE_ENTRY),
      false,
      deps,
    );

    const sent = JSON.parse(recorded.prompts[0] ?? "{}");
    assert.assertEquals(sent.spec.document, null);
  });

  bdd.it("stores the result per spec", async () => {
    const { deps } = fakeDeps(answer(REPLY));

    const validation = await nextValidation.validationFor(
      root,
      state,
      manifest(VALIDATE_ENTRY),
      false,
      deps,
    );

    const record = (await persistence.readValidationRecord(root, SPEC)) as {
      key: string;
      validation: transitionValidation.TransitionValidation;
    };
    assert.assertEquals(record.validation, validation);
    assert.assertEquals(record.key.length, 64);
  });
});

bdd.describe("attachValidation", () => {
  const validation: transitionValidation.SkippedValidation = {
    status: "skipped",
    transition: {
      id: "spec-proposal",
      from: "SPEC_PROPOSAL",
      to: "SPEC_APPROVED",
      approval: "The user approves the spec draft.",
    },
    agent: "claude-code",
    model: "claude-sonnet-5",
    reason: "claude-code did not answer within 120 seconds.",
    instruction: "Tell the user.",
  };

  bdd.it("adds the validation and points the instruction at it", () => {
    const output = {
      phase: "SPEC_PROPOSAL",
      instruction: "Spec draft is ready.",
    } as unknown as compiler.NextOutput;

    const attached = nextValidation.attachValidation(output, validation) as {
      instruction: string;
      validation: transitionValidation.TransitionValidation;
    };

    assert.assertEquals(attached.validation, validation);
    assert.assertStringIncludes(attached.instruction, "Spec draft is ready. ");
    assert.assertStringIncludes(
      attached.instruction,
      "follow `validation.instruction` before you ask the user for approval",
    );
  });
});
