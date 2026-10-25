// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

import * as assert from "@eserstack/test-kit/assert";
import * as results from "@eserstack/primitives/results";
import { runtime } from "@eserstack/standards/cross-runtime";
import type * as crossRuntime from "@eserstack/standards/cross-runtime";
import * as scripts from "./scripts.ts";

const buildShellArgsCases = [
  {
    name:
      "buildShellArgs runs the command as it is without forwarded arguments",
    command: "deno test --allow-all",
    extraArgs: [],
    expected: ["-c", "deno test --allow-all"],
  },
  {
    name: "buildShellArgs passes forwarded arguments as positional parameters",
    command: "deno test",
    extraArgs: ["--filter", "my test", `it's "quoted"`],
    expected: [
      "-c",
      'deno test "$@"',
      "sh",
      "--filter",
      "my test",
      `it's "quoted"`,
    ],
  },
  {
    name: "buildShellArgs keeps forwarded arguments out of the script text",
    command: "echo",
    extraArgs: ["$(touch x); echo injected"],
    expected: ["-c", 'echo "$@"', "sh", "$(touch x); echo injected"],
  },
  {
    name: "buildShellArgs keeps an empty forwarded argument",
    command: "echo",
    extraArgs: [""],
    expected: ["-c", 'echo "$@"', "sh", ""],
  },
  {
    name: "buildShellArgs drops the trailing newline of a block scalar command",
    command: "cd lib\ndeno test\n",
    extraArgs: ["--filter", "slug"],
    expected: ["-c", 'cd lib\ndeno test "$@"', "sh", "--filter", "slug"],
  },
];

for (const { name, command, extraArgs, expected } of buildShellArgsCases) {
  Deno.test(name, () => {
    assert.assertEquals(scripts.buildShellArgs(command, extraArgs), expected);
  });
}

const withTempDir = async (
  run: (dir: string) => Promise<void>,
): Promise<void> => {
  const dir = await runtime.fs.makeTempDir({ prefix: "eser-scripts-" });

  try {
    await run(dir);
  } finally {
    await runtime.fs.remove(dir, { recursive: true });
  }
};

// Each argument is printed between brackets on its own line, so the file shows
// exactly where every argument starts and ends.
const PRINT_ARGS = "printf '[%s]\\n' > args.txt";

const printedArgs = (args: readonly string[]): string =>
  args.map((arg) => `[${arg}]\n`).join("");

Deno.test("executeCommand passes each forwarded argument as one word", async () => {
  await withTempDir(async (dir) => {
    const forwarded = [
      "has space",
      "it's",
      '"double quoted"',
      "back\\slash",
      "$HOME",
      "*",
      "",
      "two\nlines",
    ];

    const code = await scripts.executeCommand(PRINT_ARGS, dir, forwarded);

    assert.assertEquals(code, 0);
    assert.assertEquals(
      await runtime.fs.readTextFile(runtime.path.join(dir, "args.txt")),
      printedArgs(forwarded),
    );
  });
});

Deno.test("executeCommand never runs a forwarded argument as a command", async () => {
  await withTempDir(async (dir) => {
    const forwarded = [
      "a; touch semicolon",
      "$(touch substitution)",
      "`touch backtick`",
      "a && touch and",
      "a | touch pipe",
    ];

    const code = await scripts.executeCommand(PRINT_ARGS, dir, forwarded);

    assert.assertEquals(code, 0);
    assert.assertEquals(
      await runtime.fs.readTextFile(runtime.path.join(dir, "args.txt")),
      printedArgs(forwarded),
    );

    const markers = ["semicolon", "substitution", "backtick", "and", "pipe"];
    const created = await Promise.all(
      markers.map((name) => runtime.fs.exists(runtime.path.join(dir, name))),
    );

    for (const [index, name] of markers.entries()) {
      assert.assertFalse(
        created[index],
        `the forwarded argument created "${name}"`,
      );
    }
  });
});

Deno.test("executeCommand forwards arguments after a command that ends in a newline", async () => {
  await withTempDir(async (dir) => {
    // A YAML block scalar (`command: |`) ends the command with a newline.
    const forwarded = ["touch newline"];

    const code = await scripts.executeCommand(
      `${PRINT_ARGS}\n`,
      dir,
      forwarded,
    );

    assert.assertEquals(code, 0);
    assert.assertEquals(
      await runtime.fs.readTextFile(runtime.path.join(dir, "args.txt")),
      printedArgs(forwarded),
    );
    assert.assertFalse(
      await runtime.fs.exists(runtime.path.join(dir, "newline")),
    );
  });
});

Deno.test("executeCommand runs the command unchanged without forwarded arguments", async () => {
  await withTempDir(async (dir) => {
    const code = await scripts.executeCommand(PRINT_ARGS, dir);

    assert.assertEquals(code, 0);
    // printf with a format and no arguments prints the format once.
    assert.assertEquals(
      await runtime.fs.readTextFile(runtime.path.join(dir, "args.txt")),
      "[]\n",
    );
  });
});

Deno.test("executeCommand returns the exit code of a failing command", async () => {
  await withTempDir(async (dir) => {
    assert.assertEquals(await scripts.executeCommand("exit 3", dir), 3);
  });
});

// --- parseScript ---

// A Result carries its own iterator function, so two equal results never
// compare equal; tests compare this plain form instead.
const settled = <T, E>(
  result: results.Result<T, E>,
): { ok: T } | { fail: E } =>
  results.isOk(result) ? { ok: result.value } : { fail: result.error };

const parseScriptCases = [
  {
    name: "parseScript treats a string as the command",
    entry: "deno test",
    expected: {
      name: "test",
      command: "deno test",
      description: "test",
      workingDirectory: undefined,
      depends: [],
    },
  },
  {
    name: "parseScript keeps the fields of an object entry",
    entry: {
      command: "deno test",
      description: "Run the tests",
      workingDirectory: "./lib",
      depends: ["build"],
    },
    expected: {
      name: "test",
      command: "deno test",
      description: "Run the tests",
      workingDirectory: "./lib",
      depends: ["build"],
    },
  },
  {
    name: "parseScript fills the defaults of an object entry",
    entry: { command: "deno test" },
    expected: {
      name: "test",
      command: "deno test",
      description: "test",
      workingDirectory: undefined,
      depends: [],
    },
  },
];

for (const { name, entry, expected } of parseScriptCases) {
  Deno.test(name, () => {
    assert.assertEquals(
      settled(scripts.parseScript("test", entry)),
      { ok: expected },
    );
  });
}

const malformedEntryCases = [
  {
    name: "parseScript rejects an empty entry",
    entry: null,
    message: 'script "test" must be a command string or an object with a ' +
      '"command" string, not null',
  },
  {
    name: "parseScript rejects a list entry",
    entry: ["deno test"],
    message: 'script "test" must be a command string or an object with a ' +
      '"command" string, not ["deno test"]',
  },
  {
    name: "parseScript rejects an object without a command",
    entry: { description: "Run the tests" },
    message: 'script "test" has no "command" string; add the command it ' +
      "runs, for example command: deno test",
  },
  {
    name: "parseScript rejects a description that is not a string",
    entry: { command: "deno test", description: 5 },
    message: 'script "test" has a "description" that is not a string: 5',
  },
  {
    name: "parseScript rejects a workingDirectory that is not a string",
    entry: { command: "deno test", workingDirectory: ["./lib"] },
    message:
      'script "test" has a "workingDirectory" that is not a string: ["./lib"]',
  },
  {
    // `depends: build` in YAML is a string, and looping over it would treat
    // every letter as a script name.
    name: "parseScript rejects depends written as one name",
    entry: { command: "deno test", depends: "build" },
    message: 'script "test" has depends "build"; write a list of script ' +
      "names, for example depends: [build]",
  },
  {
    name: "parseScript rejects depends with an entry that is not a name",
    entry: { command: "deno test", depends: ["build", 3] },
    message: 'script "test" has depends ["build",3]; write a list of script ' +
      "names, for example depends: [build]",
  },
];

for (const { name, entry, message } of malformedEntryCases) {
  Deno.test(name, () => {
    assert.assertEquals(
      settled(scripts.parseScript("test", entry)),
      { fail: message },
    );
  });
}

// --- resolveRunOrder ---

const runOrderNames = (
  result: ReturnType<typeof scripts.resolveRunOrder>,
): { dependencies: string[]; script: string } => {
  if (results.isFail(result)) {
    throw new Error(`expected a run order, got: ${result.error.message}`);
  }

  return {
    dependencies: result.value.dependencies.map((dependency) =>
      dependency.name
    ),
    script: result.value.script.name,
  };
};

const runOrderCases = [
  {
    name: "resolveRunOrder runs a script without depends alone",
    scripts: { solo: "echo solo" },
    run: "solo",
    expected: { dependencies: [], script: "solo" },
  },
  {
    name: "resolveRunOrder runs a chain from the deepest dependency up",
    scripts: {
      first: "echo first",
      second: { command: "echo second", depends: ["first"] },
      third: { command: "echo third", depends: ["second"] },
    },
    run: "third",
    expected: { dependencies: ["first", "second"], script: "third" },
  },
  {
    name: "resolveRunOrder runs the shared base of a diamond once",
    scripts: {
      base: "echo base",
      left: { command: "echo left", depends: ["base"] },
      right: { command: "echo right", depends: ["base"] },
      top: { command: "echo top", depends: ["left", "right"] },
    },
    run: "top",
    expected: { dependencies: ["base", "left", "right"], script: "top" },
  },
  {
    name: "resolveRunOrder keeps the order the depends list gives",
    scripts: {
      a: "echo a",
      b: "echo b",
      top: { command: "echo top", depends: ["b", "a"] },
    },
    run: "top",
    expected: { dependencies: ["b", "a"], script: "top" },
  },
  {
    name: "resolveRunOrder lists a dependency named twice once",
    scripts: {
      build: "echo build",
      test: { command: "echo test", depends: ["build", "build"] },
    },
    run: "test",
    expected: { dependencies: ["build"], script: "test" },
  },
];

for (const { name, scripts: entries, run, expected } of runOrderCases) {
  Deno.test(name, () => {
    assert.assertEquals(
      runOrderNames(scripts.resolveRunOrder(run, entries)),
      expected,
    );
  });
}

const runOrderErrorCases = [
  {
    name: "resolveRunOrder reports a cycle with its chain",
    scripts: {
      a: { command: "echo a", depends: ["b"] },
      b: { command: "echo b", depends: ["a"] },
    },
    run: "a",
    reason: "cycle",
    chain: ["a", "b", "a"],
    message:
      'script "a" depends on itself through a -> b -> a; remove one of these ' +
      "depends entries",
  },
  {
    name: "resolveRunOrder reports a cycle below the requested script",
    scripts: {
      top: { command: "echo top", depends: ["a"] },
      a: { command: "echo a", depends: ["b"] },
      b: { command: "echo b", depends: ["a"] },
    },
    run: "top",
    reason: "cycle",
    chain: ["top", "a", "b", "a"],
    message:
      'script "a" depends on itself through a -> b -> a; remove one of these ' +
      "depends entries",
  },
  {
    name: "resolveRunOrder reports a script that depends on itself",
    scripts: { a: { command: "echo a", depends: ["a"] } },
    run: "a",
    reason: "cycle",
    chain: ["a", "a"],
    message:
      'script "a" depends on itself through a -> a; remove one of these ' +
      "depends entries",
  },
  {
    name: "resolveRunOrder reports a dependency the manifest does not define",
    scripts: { second: { command: "echo second", depends: ["frist"] } },
    run: "second",
    reason: "unknown",
    chain: ["second", "frist"],
    message: 'script "second" depends on "frist", which the manifest does ' +
      'not define; add a "frist" script or correct the name in the depends ' +
      'of "second"',
  },
  {
    name: "resolveRunOrder names the chain to a deep unknown dependency",
    scripts: {
      third: { command: "echo third", depends: ["second"] },
      second: { command: "echo second", depends: ["frist"] },
    },
    run: "third",
    reason: "unknown",
    chain: ["third", "second", "frist"],
    message: 'script "second" depends on "frist" (third -> second -> frist), ' +
      'which the manifest does not define; add a "frist" script or correct ' +
      'the name in the depends of "second"',
  },
  {
    name: "resolveRunOrder reports a requested script the manifest lacks",
    scripts: {},
    run: "missing",
    reason: "unknown",
    chain: ["missing"],
    message: 'script "missing" is not defined in the manifest scripts',
  },
  {
    name: "resolveRunOrder does not take an inherited name for a script",
    scripts: { build: { command: "echo build", depends: ["toString"] } },
    run: "build",
    reason: "unknown",
    chain: ["build", "toString"],
    message: 'script "build" depends on "toString", which the manifest does ' +
      'not define; add a "toString" script or correct the name in the ' +
      'depends of "build"',
  },
  {
    name: "resolveRunOrder reports a malformed dependency entry",
    scripts: {
      build: null,
      test: { command: "echo test", depends: ["build"] },
    },
    run: "test",
    reason: "malformed",
    chain: ["test", "build"],
    message: 'script "build" must be a command string or an object with a ' +
      '"command" string, not null',
  },
];

for (const runOrderErrorCase of runOrderErrorCases) {
  const { name, scripts: entries, run, reason, chain, message } =
    runOrderErrorCase;

  Deno.test(name, () => {
    const result = scripts.resolveRunOrder(run, entries);

    assert.assert(results.isFail(result), "expected the resolution to fail");
    assert.assertInstanceOf(result.error, scripts.ManifestScriptError);
    assert.assertEquals(result.error.reason, reason);
    assert.assertEquals(result.error.chain, chain);
    assert.assertEquals(result.error.message, message);
  });
}

// --- runScript ---

// Each script appends its name to log.txt in the test directory, so the file
// shows which scripts ran and in which order.
const loggingScript = (
  dir: string,
  name: string,
  depends: readonly string[] = [],
) => ({
  command: `echo ${name} >> log.txt`,
  workingDirectory: dir,
  depends,
});

const readLog = async (dir: string): Promise<string | null> => {
  const logPath = runtime.path.join(dir, "log.txt");

  if (!await runtime.fs.exists(logPath)) {
    return null;
  }

  return await runtime.fs.readTextFile(logPath);
};

Deno.test("runScript runs a chain of dependencies before the script", async () => {
  await withTempDir(async (dir) => {
    const entries = {
      first: loggingScript(dir, "first"),
      second: loggingScript(dir, "second", ["first"]),
      third: loggingScript(dir, "third", ["second"]),
    };

    const result = await scripts.runScript("third", entries, []);

    assert.assertEquals(settled(result), { ok: undefined });
    assert.assertEquals(await readLog(dir), "first\nsecond\nthird\n");
  });
});

Deno.test("runScript runs the shared base of a diamond once", async () => {
  await withTempDir(async (dir) => {
    const entries = {
      base: loggingScript(dir, "base"),
      left: loggingScript(dir, "left", ["base"]),
      right: loggingScript(dir, "right", ["base"]),
      top: loggingScript(dir, "top", ["left", "right"]),
    };

    const result = await scripts.runScript("top", entries, []);

    assert.assertEquals(settled(result), { ok: undefined });
    assert.assertEquals(await readLog(dir), "base\nleft\nright\ntop\n");
  });
});

Deno.test("runScript stops at a failing dependency with its exit code", async () => {
  await withTempDir(async (dir) => {
    const entries = {
      first: { command: "exit 3", workingDirectory: dir },
      second: loggingScript(dir, "second", ["first"]),
      third: loggingScript(dir, "third", ["second"]),
    };

    const result = await scripts.runScript("third", entries, []);

    assert.assertEquals(settled(result), {
      fail: {
        message:
          'script "third" did not run: its dependency "first" exited with ' +
          "code 3",
        exitCode: 3,
      },
    });
    assert.assertEquals(await readLog(dir), null);
  });
});

Deno.test("runScript runs nothing when the dependencies form a cycle", async () => {
  await withTempDir(async (dir) => {
    const entries = {
      first: loggingScript(dir, "first", ["second"]),
      second: loggingScript(dir, "second", ["first"]),
      third: loggingScript(dir, "third", ["first"]),
    };

    const result = await scripts.runScript("third", entries, []);

    assert.assertEquals(settled(result), {
      fail: {
        message: 'script "first" depends on itself through first -> second ' +
          "-> first; remove one of these depends entries",
        exitCode: 1,
      },
    });
    assert.assertEquals(await readLog(dir), null);
  });
});

Deno.test("runScript forwards arguments to the script and not its dependencies", async () => {
  await withTempDir(async (dir) => {
    const appendArgs = "printf '[%s]\\n' >> log.txt";
    const entries = {
      build: { command: appendArgs, workingDirectory: dir },
      test: { command: appendArgs, workingDirectory: dir, depends: ["build"] },
    };

    const result = await scripts.runScript("test", entries, ["has space"]);

    assert.assertEquals(settled(result), { ok: undefined });
    // printf with a format and no arguments prints the format once.
    assert.assertEquals(await readLog(dir), "[]\n[has space]\n");
  });
});

// --- eser self-invocation ---

const shellQuoteCases = [
  { name: "shellQuote quotes a plain word", value: "deno", expected: "'deno'" },
  {
    name: "shellQuote keeps a space inside one word",
    value: "/opt/John Smith/deno",
    expected: "'/opt/John Smith/deno'",
  },
  {
    name: "shellQuote closes and reopens the quote around a single quote",
    value: "it's",
    expected: "'it'\\''s'",
  },
  {
    name: "shellQuote leaves $, backslash and backtick as data",
    value: "$HOME\\`x`",
    expected: "'$HOME\\`x`'",
  },
  { name: "shellQuote keeps an empty value", value: "", expected: "''" },
];

for (const { name, value, expected } of shellQuoteCases) {
  Deno.test(name, () => {
    assert.assertEquals(scripts.shellQuote(value), expected);
  });
}

// Every path holds a space, a quote or a `$`, so each case also shows that a
// path stays one single-quoted word.
const prefixPaths: scripts.CliPrefixPaths = {
  execPath: "/opt/John Smith/bin/exe",
  entryPath: "/lib/it's/eser.js",
  mainPath: "/src/$HOME/main.ts",
};

const NODE_FORM = "'/opt/John Smith/bin/exe' '/lib/it'\\''s/eser.js'";
const DENO_FORM =
  "'/opt/John Smith/bin/exe' run --allow-all '/src/$HOME/main.ts'";

const buildCliPrefixCases: readonly {
  readonly invoker: crossRuntime.CliInvoker;
  readonly expected: string;
}[] = [
  { invoker: "binary", expected: "'/opt/John Smith/bin/exe'" },
  { invoker: "npm", expected: NODE_FORM },
  { invoker: "npx", expected: NODE_FORM },
  { invoker: "pnpm", expected: NODE_FORM },
  { invoker: "pnpx", expected: NODE_FORM },
  { invoker: "bun", expected: NODE_FORM },
  { invoker: "bunx", expected: NODE_FORM },
  { invoker: "deno", expected: DENO_FORM },
  { invoker: "dev", expected: DENO_FORM },
  { invoker: "unknown", expected: "eser" },
];

for (const { invoker, expected } of buildCliPrefixCases) {
  Deno.test(`buildCliPrefix for the ${invoker} invoker`, () => {
    assert.assertEquals(scripts.buildCliPrefix(invoker, prefixPaths), expected);
  });
}

Deno.test("buildCliPrefix falls back to the eser on PATH without an entry file", () => {
  assert.assertEquals(
    scripts.buildCliPrefix("npm", { ...prefixPaths, entryPath: null }),
    "eser",
  );
});

const resolveCommandCases = [
  {
    name: "resolveCommand replaces a lone eser",
    command: "eser",
    expected: "PREFIX",
  },
  {
    name: "resolveCommand replaces a leading eser and keeps the rest",
    command: "eser workflows run -e precommit",
    expected: "PREFIX workflows run -e precommit",
  },
  {
    name: "resolveCommand leaves a word that only starts with eser",
    command: "eserx run",
    expected: "eserx run",
  },
  {
    name: "resolveCommand leaves other commands",
    command: "deno test",
    expected: "deno test",
  },
];

for (const { name, command, expected } of resolveCommandCases) {
  Deno.test(name, () => {
    assert.assertEquals(scripts.resolveCommand(command, "PREFIX"), expected);
  });
}

// Each form of the self-invocation, run for real through sh: the stand-in
// executable records the words it receives after the paths were quoted.
const selfInvocationCases: readonly {
  readonly invoker: crossRuntime.CliInvoker;
  readonly leadingArgs: (entryPath: string, mainPath: string) => string[];
}[] = [
  { invoker: "binary", leadingArgs: () => [] },
  { invoker: "npm", leadingArgs: (entryPath) => [entryPath] },
  {
    invoker: "deno",
    leadingArgs: (_entryPath, mainPath) => ["run", "--allow-all", mainPath],
  },
];

for (const { invoker, leadingArgs } of selfInvocationCases) {
  Deno.test(`executeCommand runs eser as ${invoker} through paths with a space and a quote`, async () => {
    await withTempDir(async (dir) => {
      // A stand-in executable that records its arguments, in a directory whose
      // name breaks an unquoted path in two words and opens a quote.
      const toolsDir = runtime.path.join(dir, "John Smith's tools");
      await runtime.fs.mkdir(toolsDir);
      const execPath = runtime.path.join(toolsDir, "exe");
      await runtime.fs.writeTextFile(
        execPath,
        `#!/bin/sh\n${PRINT_ARGS} "$@"\n`,
        {
          mode: 0o755,
        },
      );
      const checkoutDir = runtime.path.join(dir, "checkout it's $HOME");
      const entryPath = runtime.path.join(checkoutDir, "eser.js");
      const mainPath = runtime.path.join(checkoutDir, "main.ts");

      const command = scripts.resolveCommand(
        "eser workflows run",
        scripts.buildCliPrefix(invoker, { execPath, entryPath, mainPath }),
      );
      const code = await scripts.executeCommand(command, dir, ["has space"]);

      assert.assertEquals(code, 0);
      assert.assertEquals(
        await runtime.fs.readTextFile(runtime.path.join(dir, "args.txt")),
        printedArgs([
          ...leadingArgs(entryPath, mainPath),
          "workflows",
          "run",
          "has space",
        ]),
      );
    });
  });
}
