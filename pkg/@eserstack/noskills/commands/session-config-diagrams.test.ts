// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * session, config and diagrams run as a user runs them (TASK-328).
 *
 * @module
 */

import * as bdd from "node:test";
import * as assert from "@eserstack/test-kit/assert";
import { runtime } from "@eserstack/standards/cross-runtime";

const REPO_ROOT = runtime.path.resolve(
  import.meta.dirname ?? ".",
  "../../../..",
);

const SESSIONS_DIR = ".eser/.state/sessions";

// The commands color their output; the checks read the text.
const ANSI_SEQUENCE = new RegExp(`${String.fromCharCode(27)}\\[[0-9;]*m`, "g");

const runNoskills = async (
  cwd: string,
  home: string,
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
    {
      cwd,
      // The user identity lives under HOME; an empty XDG_CONFIG_HOME counts
      // as unset, so the developer's own config is never read or written.
      env: {
        HOME: home,
        XDG_CONFIG_HOME: "",
        NOSKILLS_PROJECT_ROOT: cwd,
        NOSKILLS_SESSION: "",
      },
      stdin: "null",
      stdout: "piped",
      stderr: "piped",
    },
  );

  return {
    code: result.code,
    output: (
      new TextDecoder().decode(result.stdout) +
      new TextDecoder().decode(result.stderr)
    ).replace(ANSI_SEQUENCE, ""),
  };
};

const sessionFiles = async (root: string): Promise<string[]> => {
  const names: string[] = [];
  try {
    for await (const entry of runtime.fs.readDir(`${root}/${SESSIONS_DIR}`)) {
      names.push(entry.name);
    }
  } catch {
    // no sessions directory: no sessions
  }
  return names.sort();
};

const exists = async (path: string): Promise<boolean> => {
  try {
    await runtime.fs.stat(path);
    return true;
  } catch {
    return false;
  }
};

bdd.describe("noskills session, config and diagrams", () => {
  let base: string;
  let root: string;
  let home: string;

  bdd.beforeEach(async () => {
    base = await runtime.fs.makeTempDir({ prefix: "nos_session_cmds_" });
    root = `${base}/project`;
    home = `${base}/home`;
    await runtime.fs.mkdir(root, { recursive: true });
    await runtime.fs.mkdir(home, { recursive: true });
  });

  bdd.afterEach(async () => {
    await runtime.fs.remove(base, { recursive: true });
  });

  const init = async (): Promise<void> => {
    const result = await runNoskills(root, home, [
      "init",
      "--non-interactive",
      "--tools=claude-code",
    ]);
    assert.assertEquals(result.code, 0, result.output);
  };

  /** Points the manifest's command at a name the output can be checked for. */
  const setManifestCommand = async (command: string): Promise<void> => {
    const path = `${root}/.eser/manifest.yml`;
    const text = await runtime.fs.readTextFile(path);
    await runtime.fs.writeTextFile(
      path,
      text.replace("command: npx eser@latest noskills", `command: ${command}`),
    );
  };

  bdd.describe("session start", () => {
    bdd.beforeEach(init);

    // An empty value started a session bound to the spec "" in IDLE.
    bdd.it("refuses --spec= without a name", async () => {
      const result = await runNoskills(root, home, [
        "session",
        "start",
        "--spec=",
      ]);

      assert.assertEquals(result.code, 1, result.output);
      assert.assertStringIncludes(result.output, "--spec needs a spec name.");
      assert.assertEquals(await sessionFiles(root), []);
    });

    // --spec=x --free wrote a free session that still named the spec.
    for (const flags of [
      ["--spec=add-login-page", "--free"],
      ["--spec=add-login-page", "--auto"],
      ["--free", "--auto"],
    ]) {
      bdd.it(`refuses ${flags.join(" ")} together`, async () => {
        const result = await runNoskills(root, home, [
          "session",
          "start",
          ...flags,
        ]);

        assert.assertEquals(result.code, 1, result.output);
        assert.assertStringIncludes(
          result.output,
          "Use only one of --spec=<name>, --free or --auto.",
        );
        assert.assertEquals(await sessionFiles(root), []);
      });
    }

    // The process that runs `session start` exits before the session is
    // used, so the record keeps pid 0 for "no owning process".
    bdd.it("writes a free session with pid 0", async () => {
      const result = await runNoskills(root, home, [
        "session",
        "start",
        "--free",
      ]);
      assert.assertEquals(result.code, 0, result.output);

      const files = await sessionFiles(root);
      assert.assertEquals(files.length, 1);
      const session = JSON.parse(
        await runtime.fs.readTextFile(`${root}/${SESSIONS_DIR}/${files[0]}`),
      ) as Record<string, unknown>;
      assert.assertEquals(session["mode"], "free");
      assert.assertEquals(session["spec"], null);
      assert.assertEquals(session["pid"], 0);
    });
  });

  bdd.describe("session end and list", () => {
    bdd.beforeEach(init);

    // It printed "Session not found" and exited 0.
    bdd.it("exits 1 when the session does not exist", async () => {
      const result = await runNoskills(root, home, [
        "session",
        "end",
        "--id=missing",
      ]);

      assert.assertEquals(result.code, 1, result.output);
      assert.assertStringIncludes(result.output, "Session not found: missing");
    });

    // It printed "NaNh ago" and never marked the session stale.
    bdd.it("lists an unreadable time as unknown and stale", async () => {
      await runtime.fs.mkdir(`${root}/${SESSIONS_DIR}`, { recursive: true });
      await runtime.fs.writeTextFile(
        `${root}/${SESSIONS_DIR}/sess-bad.json`,
        '{"id":"sess-bad","mode":"free","lastActiveAt":"not a date"}\n',
      );

      const result = await runNoskills(root, home, ["session", "list"]);

      assert.assertEquals(result.code, 0, result.output);
      assert.assertEquals(result.output.includes("NaN"), false, result.output);
      assert.assertMatch(result.output, /sess-bad .* unknown.*\(stale\)/);
    });
  });

  bdd.describe("config", () => {
    // config printed the npx default, because it never loaded the
    // manifest's command.
    bdd.it("names the manifest's command", async () => {
      await init();
      await setManifestCommand("my-noskills");

      const result = await runNoskills(root, home, ["config", "get-user"]);

      assert.assertEquals(result.code, 0, result.output);
      assert.assertStringIncludes(
        result.output,
        'Set one with: my-noskills config set-user --name="Your Name"',
      );
      assert.assertEquals(
        result.output.includes("npx eser@latest noskills"),
        false,
        result.output,
      );
    });

    // Any failure to remove user.json read as "No user configured.".
    bdd.it("reports a user.json it cannot remove", async () => {
      // A directory with an entry in it cannot be removed as a file.
      const userFile = `${home}/.config/eser/noskills/user.json`;
      await runtime.fs.mkdir(`${userFile}/keep`, { recursive: true });

      const result = await runNoskills(root, home, ["config", "clear-user"]);

      assert.assertEquals(result.code, 1, result.output);
      assert.assertStringIncludes(
        result.output,
        `noskills: remove the user identity ${userFile}`,
      );
      assert.assertEquals(
        result.output.includes("No user configured."),
        false,
        result.output,
      );
    });
  });

  bdd.describe("diagrams scan", () => {
    // writeRegistry threw ENOENT when .eser/ was missing.
    bdd.it("asks for init in a project without noskills", async () => {
      await runtime.fs.writeTextFile(
        `${root}/README.md`,
        "```mermaid\ngraph TD\n  A[src/login.ts] --> B\n```\n",
      );

      const result = await runNoskills(root, home, ["diagrams", "scan"]);

      assert.assertEquals(result.code, 1, result.output);
      assert.assertStringIncludes(
        result.output,
        "noskills is not initialized. Run: npx eser@latest noskills init",
      );
      assert.assertEquals(await exists(`${root}/.eser`), false);
    });
  });
});
