// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * Tests for the agent-session git wrapper.
 *
 * The integration tests install the real wrapper script in a temporary project
 * and drive it the way an agent can get around the PreToolUse text guard: an
 * interpreter (`deno eval`) builds the program name "g" + "it" at run time and
 * starts it, so the command text never contains `git`. This is the same class
 * as `python -c "subprocess.run(['g'+'it','push'])"` from TASK-22.
 *
 * @module
 */

import * as assert from "@eserstack/test-kit/assert";
import * as crossRuntime from "@eserstack/standards/cross-runtime";
import * as gitWrapper from "./git-wrapper.ts";
import * as gitWrapperInstall from "./git-wrapper-install.ts";
import * as run from "./run.ts";
import * as persistence from "../state/persistence.ts";
import * as schema from "../state/schema.ts";

const fs = crossRuntime.runtime.fs;

// =============================================================================
// Pure parts
// =============================================================================

const KIND_CASES: readonly {
  readonly name: string;
  readonly args: readonly string[];
  readonly kind: gitWrapper.GitExecKind;
}[] = [
  { name: "status reads", args: ["status"], kind: "read" },
  { name: "log after -C reads", args: ["-C", "/x", "log"], kind: "read" },
  { name: "--version reads", args: ["--version"], kind: "read" },
  { name: "branch listing reads", args: ["branch", "--list"], kind: "read" },
  {
    name: "config --get reads",
    args: ["config", "--get", "a.b"],
    kind: "read",
  },
  { name: "clone creates a repository", args: ["clone", "u"], kind: "clone" },
  { name: "push", args: ["push", "origin", "main"], kind: "push" },
  { name: "send-pack pushes", args: ["send-pack", "r"], kind: "push" },
  { name: "commit writes", args: ["commit", "-m", "x"], kind: "write" },
  { name: "branch delete writes", args: ["branch", "-D", "x"], kind: "write" },
  { name: "config set writes", args: ["config", "a.b", "c"], kind: "write" },
  {
    name: "a value of -c is not the subcommand",
    args: ["-c", "log", "commit"],
    kind: "write",
  },
];

for (const { name, args, kind } of KIND_CASES) {
  Deno.test(`classifyGitExec: ${name}`, () => {
    assert.assertEquals(gitWrapper.classifyGitExec(args), kind);
  });
}

Deno.test("prependToPath puts the directory first exactly once", () => {
  assert.assertEquals(
    gitWrapper.prependToPath("/usr/bin:/w:/bin", "/w"),
    "/w:/usr/bin:/bin",
  );
  assert.assertEquals(gitWrapper.prependToPath("", "/w"), "/w");
});

Deno.test("removeFromPath drops every occurrence of the directory", () => {
  assert.assertEquals(
    gitWrapper.removeFromPath("/w:/usr/bin:/w:/bin", "/w"),
    "/usr/bin:/bin",
  );
});

Deno.test("envFileExport quotes the directory as one shell word", () => {
  assert.assertEquals(
    gitWrapper.envFileExport("/p q/it's"),
    `export PATH='/p q/it'\\''s':"$PATH"\n`,
  );
});

Deno.test("gitExecDenial names the refused subcommand", () => {
  const message = gitWrapper.gitExecDenial(["-C", "/x", "push", "origin"]);

  assert.assertStringIncludes(message, `refused "git push"`);
  assert.assertStringIncludes(message, "allowGit");
});

// =============================================================================
// Integration: the installed wrapper
// =============================================================================

const REPO_ROOT = crossRuntime.runtime.path.resolve(
  import.meta.dirname ?? ".",
  "../../../..",
);

// How the wrapper starts this checkout's noskills, as `command` in a manifest.
const COMMAND_PREFIX = [
  crossRuntime.runtime.process.execPath(),
  "run",
  "-A",
  "--config",
  `${REPO_ROOT}/deno.json`,
  `${REPO_ROOT}/pkg/@eserstack/noskills/main.ts`,
]
  .map(gitWrapper.shellQuote)
  .join(" ");

type Spawned = { readonly code: number; readonly stderr: string };

const spawn = async (
  command: string,
  args: readonly string[],
  cwd: string,
  env?: Record<string, string>,
): Promise<Spawned> => {
  const result = await crossRuntime.runtime.exec.spawn(command, [...args], {
    cwd,
    env,
    stdin: "null",
    stdout: "piped",
    stderr: "piped",
  });

  return {
    code: result.code,
    stderr: new TextDecoder().decode(result.stderr),
  };
};

const realGitOnPath = async (): Promise<string> => {
  const found = await gitWrapperInstall.resolveRealGit(
    crossRuntime.runtime.env.get("PATH") ?? "",
    "/nonexistent",
  );
  if (found === null) throw new Error("git is not on PATH; install git");

  return found;
};

/** A repository with a local identity, no signing and no hooks of its own. */
const createRepo = async (realGit: string, dir: string): Promise<void> => {
  const hooksDir = `${dir}/.test-hooks`;
  await fs.mkdir(hooksDir, { recursive: true });

  for (const args of [
    ["init", "-q"],
    ["config", "user.name", "noskills test"],
    ["config", "user.email", "test@example.com"],
    ["config", "commit.gpgsign", "false"],
    ["config", "core.hooksPath", hooksDir],
  ]) {
    // Each step configures the repository the previous one created.
    // deno-lint-ignore no-await-in-loop
    const result = await spawn(realGit, args, dir);
    assert.assertEquals(result.code, 0, result.stderr);
  }
};

const commitCount = async (realGit: string, dir: string): Promise<number> => {
  const result = await crossRuntime.runtime.exec.spawn(
    realGit,
    ["rev-list", "--count", "HEAD"],
    { cwd: dir, stdout: "piped", stderr: "null" },
  );

  return result.success
    ? Number(new TextDecoder().decode(result.stdout).trim())
    : 0;
};

type Project = {
  readonly root: string;
  readonly realGit: string;
  readonly wrapper: gitWrapperInstall.InstalledGitWrapper;
};

const PROJECT_TRAITS: schema.ProjectTraits = {
  languages: [],
  frameworks: [],
  ci: [],
  testRunner: null,
};

const writeAllowGit = async (root: string, allowGit: boolean) => {
  await persistence.writeManifest(root, {
    ...schema.createInitialManifest([], ["claude-code"], [], PROJECT_TRAITS),
    allowGit,
    command: COMMAND_PREFIX,
  });
};

/** A noskills project with one commit and the wrapper installed. */
const createProject = async (): Promise<Project> => {
  const root = await fs.realPath(
    await fs.makeTempDir({ prefix: "nos_git_wrapper_" }),
  );
  const realGit = await realGitOnPath();

  await createRepo(realGit, root);
  await persistence.scaffoldEserDir(root);
  await writeAllowGit(root, false);
  await fs.writeTextFile(`${root}/.gitignore`, ".test-hooks/\n");
  assert.assertEquals((await spawn(realGit, ["add", "-A"], root)).code, 0);
  assert.assertEquals(
    (await spawn(realGit, ["commit", "-q", "-m", "init"], root)).code,
    0,
  );

  const wrapper = await gitWrapperInstall.installGitWrapper(
    root,
    COMMAND_PREFIX,
  );
  if (wrapper === null) throw new Error("the wrapper was not installed");

  return { root, realGit, wrapper };
};

/**
 * Runs git the way an interpreter does it: the program name is assembled at
 * run time and resolved on PATH, which has the wrapper first. The `Deno.*`
 * calls are the text of the program the child `deno eval` runs, not calls this
 * test makes.
 */
const interpreterGit = async (
  project: Project,
  args: readonly string[],
  cwd: string = project.root,
): Promise<Spawned> => {
  const program = `const r = new Deno.Command("g" + "it", { args: ${JSON.stringify(
    args,
  )}, stdout: "inherit", stderr: "inherit" }).outputSync(); Deno.exit(r.code);`;

  return await spawn(
    crossRuntime.runtime.process.execPath(),
    ["eval", program],
    cwd,
    {
      PATH: gitWrapper.prependToPath(
        crossRuntime.runtime.env.get("PATH") ?? "",
        project.wrapper.binDir,
      ),
    },
  );
};

const withProject = async (
  body: (project: Project) => Promise<void>,
): Promise<void> => {
  const project = await createProject();
  try {
    await body(project);
  } finally {
    await fs.remove(project.root, { recursive: true });
  }
};

Deno.test("wrapper refuses an interpreter-built git commit while allowGit is false", async () => {
  await withProject(async (project) => {
    const result = await interpreterGit(project, [
      "commit",
      "--allow-empty",
      "-m",
      "agent commit",
    ]);

    assert.assertNotEquals(result.code, 0);
    assert.assertStringIncludes(result.stderr, `refused "git commit"`);
    assert.assertEquals(await commitCount(project.realGit, project.root), 1);
  });
});

Deno.test("wrapper refuses an interpreter-built git push while allowGit is false", async () => {
  await withProject(async (project) => {
    const remote = `${project.root}/.test-hooks/remote.git`;
    await spawn(
      project.realGit,
      ["init", "-q", "--bare", remote],
      project.root,
    );
    await spawn(
      project.realGit,
      ["remote", "add", "origin", remote],
      project.root,
    );

    const result = await interpreterGit(project, [
      "push",
      "origin",
      "HEAD:refs/heads/main",
    ]);

    assert.assertNotEquals(result.code, 0);
    assert.assertStringIncludes(result.stderr, `refused "git push"`);
    assert.assertEquals(await commitCount(project.realGit, remote), 0);
  });
});

Deno.test("wrapper refuses a write that names the project with -C from elsewhere", async () => {
  await withProject(async (project) => {
    const elsewhere = await fs.makeTempDir({ prefix: "nos_git_elsewhere_" });
    try {
      const result = await interpreterGit(
        project,
        ["-C", project.root, "commit", "--allow-empty", "-m", "x"],
        elsewhere,
      );

      assert.assertNotEquals(result.code, 0);
      assert.assertEquals(await commitCount(project.realGit, project.root), 1);
    } finally {
      await fs.remove(elsewhere, { recursive: true });
    }
  });
});

Deno.test("wrapper refuses a write that names the project after another global option", async () => {
  await withProject(async (project) => {
    const elsewhere = await fs.makeTempDir({ prefix: "nos_git_elsewhere_" });
    try {
      const results = await Promise.all(
        ["--no-advice", "--no-lazy-fetch", "--attr-source=HEAD"].map((option) =>
          interpreterGit(
            project,
            [option, "-C", project.root, "commit", "--allow-empty", "-m", "x"],
            elsewhere,
          ),
        ),
      );

      for (const result of results) {
        assert.assertNotEquals(result.code, 0);
      }
      assert.assertEquals(await commitCount(project.realGit, project.root), 1);
    } finally {
      await fs.remove(elsewhere, { recursive: true });
    }
  });
});

Deno.test("wrapper runs reads, and writes to other repositories", async () => {
  await withProject(async (project) => {
    const status = await interpreterGit(project, ["status", "--porcelain"]);
    assert.assertEquals(status.code, 0, status.stderr);

    // A test suite's temporary repository is not the project's.
    const other = await fs.realPath(
      await fs.makeTempDir({ prefix: "nos_git_other_" }),
    );
    try {
      await createRepo(project.realGit, other);
      const commit = await interpreterGit(
        project,
        ["commit", "--allow-empty", "-m", "test fixture"],
        other,
      );

      assert.assertEquals(commit.code, 0, commit.stderr);
      assert.assertEquals(await commitCount(project.realGit, other), 1);
    } finally {
      await fs.remove(other, { recursive: true });
    }
  });
});

Deno.test("wrapper lets the commit through once allowGit is true", async () => {
  await withProject(async (project) => {
    await writeAllowGit(project.root, true);

    const result = await interpreterGit(project, [
      "commit",
      "--allow-empty",
      "-m",
      "allowed",
    ]);

    assert.assertEquals(result.code, 0, result.stderr);
    assert.assertEquals(await commitCount(project.realGit, project.root), 2);
  });
});

Deno.test("the run loop's own commit works with the wrapper first on PATH", async () => {
  await withProject(async (project) => {
    // A commit hook that calls git itself, as lint-staged does. Through the
    // wrapper this `git add` would be a refused write to the project.
    await fs.writeTextFile(
      `${project.root}/.test-hooks/pre-commit`,
      "#!/bin/sh\ngit add -A\n",
      { mode: 0o755 },
    );
    await fs.chmod(`${project.root}/.test-hooks/pre-commit`, 0o755);
    await fs.writeTextFile(`${project.root}/feature.txt`, "work\n");

    const env = {
      ...crossRuntime.runtime.env.toObject(),
      PATH: gitWrapper.prependToPath(
        crossRuntime.runtime.env.get("PATH") ?? "",
        project.wrapper.binDir,
      ),
    };
    const committed = await run.autoCommit(
      project.root,
      "noskills: iteration 1: progress",
      project.wrapper,
      env,
    );

    assert.assertEquals(committed, true);
    assert.assertEquals(await commitCount(project.realGit, project.root), 2);
    assert.assertEquals(
      await run.autoCommit(project.root, "nothing", project.wrapper, env),
      false,
    );
  });
});

// A short bound keeps the test fast; the default is GIT_CHECK_TIMEOUT_SECONDS.
const HANG_TIMEOUT_SECONDS = 2;
// Room for starting the shells and the interpreter on a loaded CI machine.
const HANG_SLACK_MS = 5_000;

const HANGING_CHECKS: readonly {
  readonly name: string;
  readonly script: string;
}[] = [
  {
    // It waits on a child, as npx does on a registry that does not answer.
    name: "a check that never returns",
    script: "#!/bin/sh\nsleep 30\n",
  },
  {
    name: "a check that also ignores SIGTERM",
    script: "#!/bin/sh\ntrap '' TERM\nsleep 30\n",
  },
];

for (const { name, script } of HANGING_CHECKS) {
  Deno.test(`wrapper refuses the command within its bound for ${name}`, async () => {
    await withProject(async (project) => {
      const check = `${project.root}/.test-hooks/hanging-check.sh`;
      await fs.writeTextFile(check, script, { mode: 0o755 });
      await fs.chmod(check, 0o755);
      const wrapper = await gitWrapperInstall.installGitWrapper(
        project.root,
        gitWrapper.shellQuote(check),
        { checkTimeoutSeconds: HANG_TIMEOUT_SECONDS },
      );
      if (wrapper === null) throw new Error("the wrapper was not installed");

      const started = performance.now();
      const result = await interpreterGit({ ...project, wrapper }, [
        "commit",
        "--allow-empty",
        "-m",
        "agent commit",
      ]);
      const elapsedMs = performance.now() - started;

      assert.assertNotEquals(result.code, 0);
      assert.assertStringIncludes(
        result.stderr,
        `did not answer within ${HANG_TIMEOUT_SECONDS} seconds`,
      );
      assert.assertLess(
        elapsedMs,
        (HANG_TIMEOUT_SECONDS + gitWrapper.GIT_CHECK_KILL_GRACE_SECONDS) *
          1000 +
          HANG_SLACK_MS,
      );
      assert.assertEquals(await commitCount(project.realGit, project.root), 1);
    });
  });
}

Deno.test("buildWrapperScript rejects a timeout that is not a positive whole number", () => {
  for (const checkTimeoutSeconds of [0, -1, 1.5, Number.NaN]) {
    assert.assertThrows(
      () =>
        gitWrapper.buildWrapperScript({
          realGit: "/usr/bin/git",
          projectGitDir: "/p/.git",
          projectRoot: "/p",
          commandPrefix: "noskills",
          checkTimeoutSeconds,
        }),
      Error,
      "checkTimeoutSeconds",
    );
  }
});

Deno.test("checkGitExec decides by the repository a write acts on", async () => {
  await withProject(async (project) => {
    const elsewhere = await fs.makeTempDir({ prefix: "nos_git_elsewhere_" });
    const context = {
      root: project.root,
      realGit: project.realGit,
      cwd: elsewhere,
    };
    try {
      const cases: readonly [readonly string[], boolean][] = [
        [["commit", "-m", "x"], false],
        [["--git-dir", `${project.root}/.git`, "commit", "-m", "x"], true],
        [["-C", project.root, "reset", "--hard"], true],
        [["push", "origin", "main"], true],
        [["clone", "https://example.com/r.git"], false],
        [["-C", project.root, "status"], false],
        [["--no-advice", "-C", project.root, "commit", "-m", "x"], true],
        // An option the guard does not know may hide a `-C <project>` after it.
        [["--future-option", "-C", project.root, "commit", "-m", "x"], true],
      ];

      const verdicts = await Promise.all(
        cases.map(([args]) => gitWrapperInstall.checkGitExec(args, context)),
      );

      for (const [i, [args, refused]] of cases.entries()) {
        assert.assertEquals(verdicts[i] !== null, refused, args.join(" "));
      }
    } finally {
      await fs.remove(elsewhere, { recursive: true });
    }
  });
});

Deno.test("exportFromEnvFile adds the PATH export once", async () => {
  const dir = await fs.makeTempDir({ prefix: "nos_git_env_" });
  try {
    const envFile = `${dir}/env.sh`;
    await fs.writeTextFile(envFile, "export A=1\n");

    await gitWrapperInstall.exportFromEnvFile(envFile, "/w");
    await gitWrapperInstall.exportFromEnvFile(envFile, "/w");

    assert.assertEquals(
      await fs.readTextFile(envFile),
      `export A=1\n${gitWrapper.envFileExport("/w")}`,
    );
  } finally {
    await fs.remove(dir, { recursive: true });
  }
});
