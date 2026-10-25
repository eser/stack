// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * `noskills run` end to end, against a fake claude CLI on PATH that plays a
 * scripted turn per call (the same stand-in as cmd/noskills/run_binary_test.go)
 * (TASK-326).
 *
 * @module
 */

import * as bdd from "node:test";
import * as assert from "@eserstack/test-kit/assert";
import * as crossRuntime from "@eserstack/standards/cross-runtime";
import { runtime } from "@eserstack/standards/cross-runtime";
import * as persistence from "../state/persistence.ts";
import * as schema from "../state/schema.ts";

const REPO_ROOT = runtime.path.resolve(
  import.meta.dirname ?? ".",
  "../../../..",
);

const CLI = [`${REPO_ROOT}/pkg/@eserstack/noskills/main.ts`];

// Each call reads its mode from line n of $FAKE_DIR/script, and copies the
// spec's own state as the agent sees it during the turn.
const FAKE_CLAUDE = `#!/bin/sh
n=$(( $(cat "$FAKE_DIR/count" 2>/dev/null || echo 0) + 1 ))
echo "$n" > "$FAKE_DIR/count"
cat > /dev/null
cp .eser/.state/progresses/specs/test.json "$FAKE_DIR/spec-during-$n.json" 2>/dev/null
mode=$(sed -n "\${n}p" "$FAKE_DIR/script")
say() {
  printf '%s\\n' '{"type":"assistant","session_id":"s1","message":{"content":[{"type":"text","text":"'"$1"'"}]}}'
}
printf '%s\\n' '{"type":"system","subtype":"init","session_id":"s1"}'
case "$mode" in
  done)
    $NOSKILLS_UNDER_TEST spec test done > "$FAKE_DIR/done-$n.txt" 2>&1
    say "turn $n finished the spec"
    ;;
  fail)
    echo "the agent could not start" >&2
    exit 1
    ;;
  *)
    say "turn $n worked"
    ;;
esac
printf '%s\\n' '{"type":"result","subtype":"success","session_id":"s1","result":"ok","stop_reason":"end_turn"}'
`;

type Project = {
  readonly root: string;
  readonly fakeDir: string;
  readonly binDir: string;
};

const makeProject = async (
  phase: schema.Phase,
  modes: readonly string[],
): Promise<Project> => {
  const root = await runtime.fs.makeTempDir({ prefix: "nos_run_loop_" });
  const fakeDir = await runtime.fs.makeTempDir({ prefix: "nos_run_fake_" });
  const binDir = await runtime.fs.makeTempDir({ prefix: "nos_run_bin_" });

  const init = await runtime.exec.spawn(
    runtime.process.execPath(),
    [...CLI, "init", "--non-interactive", "--tools=claude-code"],
    { cwd: root, stdin: "null", stdout: "piped", stderr: "piped" },
  );
  assert.assertEquals(init.code, 0, new TextDecoder().decode(init.stderr));

  await runtime.fs.mkdir(`${root}/.eser/specs/test`, { recursive: true });
  await runtime.fs.writeTextFile(
    `${root}/.eser/specs/test/spec.md`,
    "# Spec: test\n\nAdd photo upload support\n",
  );
  await persistence.writeStateAndSpec(root, {
    ...schema.createInitialState(),
    phase,
    spec: "test",
    specDescription: "Add photo upload support",
    branch: "spec/test",
  });

  await runtime.fs.writeTextFile(`${binDir}/claude`, FAKE_CLAUDE);
  await runtime.fs.chmod(`${binDir}/claude`, 0o755);
  await runtime.fs.writeTextFile(`${fakeDir}/script`, modes.join("\n") + "\n");

  return { root, fakeDir, binDir };
};

const runLoop = async (
  project: Project,
  args: readonly string[],
): Promise<{ code: number; output: string }> => {
  const result = await runtime.exec.spawn(
    runtime.process.execPath(),
    [...CLI, "run", "--unattended", ...args],
    {
      cwd: project.root,
      stdin: "null",
      stdout: "piped",
      stderr: "piped",
      env: {
        PATH: `${project.binDir}:${runtime.env.get("PATH") ?? ""}`,
        FAKE_DIR: project.fakeDir,
        NOSKILLS_UNDER_TEST: `${runtime.process.execPath()} ${CLI.join(" ")}`,
      },
    },
  );

  return {
    code: result.code,
    output:
      new TextDecoder().decode(result.stdout) +
      new TextDecoder().decode(result.stderr),
  };
};

const readJson = async (path: string): Promise<schema.StateFile> =>
  JSON.parse(await runtime.fs.readTextFile(path)) as schema.StateFile;

bdd.describe(
  "noskills run loop",
  { skip: crossRuntime.getPlatform() === "windows" },
  () => {
    let project: Project;

    bdd.afterEach(async () => {
      await Promise.all(
        [project.root, project.fakeDir, project.binDir].map((dir) =>
          runtime.fs.remove(dir, { recursive: true }),
        ),
      );
    });

    // (1) and (4): the spec's own state, which `spec test next` reads first,
    // was left in SPEC_APPROVED and without the driver claim.
    bdd.it("the agent's turn sees EXECUTING and the claim", async () => {
      project = await makeProject("SPEC_APPROVED", ["work"]);

      await runLoop(project, ["--max-iterations=1"]);

      const during = await readJson(`${project.fakeDir}/spec-during-1.json`);
      assert.assertEquals(during.phase, "EXECUTING");
      assert.assertEquals(
        (during.execution as Record<string, unknown>)["driver"],
        "acp",
      );
    });

    // (2): a spec the agent finished with `spec test done` ends the loop with
    // 0 on the next turn, although state.json is IDLE by then; (6) the
    // finished turn is not recorded into the IDLE state.
    bdd.it("a spec the agent finishes ends the loop with 0", async () => {
      project = await makeProject("EXECUTING", ["done", "work"]);

      const { code, output } = await runLoop(project, ["--max-iterations=3"]);

      assert.assertEquals(code, 0, output);
      assert.assertStringIncludes(output, "Spec completed!");
      assert.assertEquals(output.includes("Max iterations"), false, output);

      const global = await readJson(
        `${project.root}/${persistence.paths.stateFile}`,
      );
      assert.assertEquals(global.phase, "IDLE");
      assert.assertEquals(global.execution.iteration, 0);
    });

    // (3): a turn that stops the loop on the last allowed iteration keeps its
    // own exit code instead of "Max iterations reached" and 2.
    bdd.it("a stop on the last iteration keeps its exit code", async () => {
      project = await makeProject("EXECUTING", ["fail"]);

      const { code, output } = await runLoop(project, ["--max-iterations=1"]);

      assert.assertEquals(code, 1, output);
      assert.assertEquals(output.includes("Max iterations"), false, output);
    });

    // Running out of iterations is still exit 2.
    bdd.it("running out of iterations exits with 2", async () => {
      project = await makeProject("EXECUTING", ["work", "work"]);

      const { code, output } = await runLoop(project, ["--max-iterations=2"]);

      assert.assertEquals(code, 2, output);
      assert.assertStringIncludes(output, "Max iterations (2) reached");
    });
  },
);
