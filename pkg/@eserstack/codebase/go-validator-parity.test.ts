// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * The Go ports in pkg/ajan/codebasefx (TASK-247) report what the TypeScript
 * validators report: validate-self-imports, validate-error-coverage,
 * validate-server-loc and the commit-msg rules, on fixtures and, for the
 * first three, on this repository with the manifest's settings.
 *
 * circular-deps, export-names and mod-exports need no parity check: their
 * TypeScript wrappers call the Go validators through the bridge.
 *
 * @module
 */

import * as nodeTest from "node:test";
import * as assert from "@eserstack/test-kit/assert";
import { runtime } from "@eserstack/standards/cross-runtime";
import * as ffiClient from "./ffi-client.ts";
import * as selfImports from "./validate-self-imports.ts";
import * as errorCoverage from "./validate-error-coverage.ts";
import * as serverLoc from "./validate-server-loc.ts";
import * as commitMsg from "./validate-commit-msg.ts";

// oxlint-disable-next-line node/no-top-level-await
await ffiClient.ensureLib();
const lib = ffiClient.getLib();

type GoIssue = { file: string; line?: number; message: string };

/** Runs one Go validator over dir through the bridge. */
const goIssues = (
  dir: string,
  validator: string,
  options: Record<string, unknown> = {},
  gitAware = false,
): GoIssue[] => {
  const parsed = lib!.call("codebaseValidateFiles", {
    dir,
    validators: [validator],
    validatorOptions: { [validator]: options },
    gitAware,
  }) as {
    results?: Array<{ issues?: GoIssue[] }>;
    error?: string;
  };
  if (parsed.error !== undefined) {
    throw new Error(parsed.error);
  }

  return parsed.results?.[0]?.issues ?? [];
};

const relative = (root: string, path: string): string => {
  const absRoot = runtime.path.resolve(root);
  const absPath = runtime.path.resolve(root, path);

  return runtime.path.relative(absRoot, absPath).split("\\").join("/");
};

const sortedLines = (lines: string[]): string[] => [...lines].sort();

const withFixture = async (
  files: Record<string, string>,
  fn: (dir: string) => Promise<void>,
): Promise<void> => {
  const dir = await runtime.fs.makeTempDir({
    dir: runtime.process.cwd(),
    prefix: ".go-parity-",
  });
  try {
    await Promise.all(
      Object.entries(files).map(async ([path, content]) => {
        const full = runtime.path.join(dir, path);
        await runtime.fs.ensureDir(runtime.path.dirname(full));
        await runtime.fs.writeTextFile(full, content);
      }),
    );
    await fn(dir);
  } finally {
    await runtime.fs.remove(dir, { recursive: true });
  }
};

const selfImportCompare = async (root: string, gitAware: boolean) => {
  const ts = await selfImports.tool.run({ root });
  const go = goIssues(root, "self-imports", {}, gitAware);

  assert.assertEquals(
    sortedLines(
      go.map((i) => `${relative(root, i.file)}:${i.line}: ${i.message}`),
    ),
    sortedLines(
      ts.issues.map(
        (i) => `${relative(root, i.path ?? "")}:${i.line}: ${i.message}`,
      ),
    ),
  );

  return ts.issues.length;
};

nodeTest.test(
  "self-imports: Go matches TypeScript on fixtures",
  { skip: lib === null },
  () =>
    withFixture(
      {
        "pkg/@eserstack/foo/mod.ts": [
          `import * as a from "@eserstack/foo";`,
          `import * as b from "@eserstack/foo/sub";`,
          `export { c } from "@eserstack/foo/c";`,
          `import "@eserstack/foo/side-effect";`,
          `const d = await import("@eserstack/foo/lazy");`,
          `// import * as e from "@eserstack/foo";`,
          ` * import * as f from "@eserstack/foo";`,
          `import * as g from "@eserstack/foobar";`,
          `import * as h from "@eserstack/bar";`,
          `import {`,
          `  i,`,
          `} from "@eserstack/foo/multi";`,
        ].join("\n"),
        "pkg/@eserstack/bar/mod.ts": `import * as foo from "@eserstack/foo";\n`,
        "elsewhere/mod.ts": `import * as foo from "@eserstack/foo";\n`,
      },
      async (dir) => {
        const found = await selfImportCompare(dir, false);
        assert.assertEquals(found, 6);
      },
    ),
);

nodeTest.test(
  "self-imports: Go matches TypeScript on the repository",
  { skip: lib === null },
  async () => {
    await selfImportCompare(".", true);
  },
);

// ErrD's fields share one line, and the validator reads only a field that
// starts a line (or the body), so ErrD has Code but misses Cause and Fix.
const errorsGo = `package x

var catalog = map[string]any{
	ErrA: &NSError{
		Code:  "A",
		Cause: "a cause",
		Fix:   "a fix",
	},
	ErrB: &NSError{
		Code:  "B",
		Cause: "",
	},
	ErrC: &OtherError{
		Code: "",
	},
	ErrD: &NSError{Code: "D", Cause: "c", Fix: "f"},
}
`;

const errorCoverageCompare = async (
  root: string,
  file: string,
  errorObjects?: string[],
  requiredFields?: string[],
) => {
  const ts = await errorCoverage.checkErrorCoverage({
    root,
    file,
    ...(errorObjects !== undefined ? { errorObjects } : {}),
    ...(requiredFields !== undefined ? { requiredFields } : {}),
  });
  const go = goIssues(root, "error-coverage", {
    file,
    ...(errorObjects !== undefined ? { errorObjects } : {}),
    ...(requiredFields !== undefined ? { requiredFields } : {}),
  });

  assert.assertEquals(
    go.map((i) => i.message),
    ts.violations.map((v) => `${v.name}: missing [${v.missing.join(", ")}]`),
  );

  return ts.violations.length;
};

nodeTest.test(
  "error-coverage: Go matches TypeScript on fixtures",
  { skip: lib === null },
  () =>
    withFixture({ "pkg/errors.go": errorsGo }, async (dir) => {
      assert.assertEquals(await errorCoverageCompare(dir, "pkg/errors.go"), 2);
      assert.assertEquals(
        await errorCoverageCompare(dir, "pkg/errors.go", [
          "NSError",
          "OtherError",
        ]),
        3,
      );
      assert.assertEquals(
        await errorCoverageCompare(dir, "pkg/errors.go", ["NSError"], ["Code"]),
        0,
      );
    }),
);

nodeTest.test(
  "error-coverage: Go matches TypeScript on the repository",
  { skip: lib === null },
  async () => {
    await errorCoverageCompare(".", "pkg/ajan/noskillsserverfx/errors.go", [
      "NSError",
    ]);
  },
);

const serverLocCompare = async (
  root: string,
  directory: string,
  maxLines?: number,
) => {
  const ts = await serverLoc.checkServerLoc({
    root,
    directory,
    ...(maxLines !== undefined ? { maxLines } : {}),
  });
  const go = goIssues(root, "server-loc", {
    directory,
    ...(maxLines !== undefined ? { maxLines } : {}),
  });

  assert.assertEquals(
    sortedLines(go.map((i) => `${relative(root, i.file)}: ${i.message}`)),
    sortedLines(
      ts.violations.map(
        (v) =>
          `${relative(root, v.path)}: ${v.lines} lines (limit ${maxLines ?? 500})`,
      ),
    ),
  );

  return ts.violations.length;
};

nodeTest.test(
  "server-loc: Go matches TypeScript on fixtures",
  { skip: lib === null },
  () =>
    withFixture(
      {
        "srv/short.go": "package srv\n",
        "srv/long.go": "x\n".repeat(5),
        "srv/exact.go": "x\n".repeat(3).slice(0, -1) + "\n",
        "srv/long_test.go": "x\n".repeat(9),
        "srv/notes.md": "x\n".repeat(9),
        "srv/nested/deep.go": "x\n".repeat(7),
        "other/long.go": "x\n".repeat(9),
      },
      async (dir) => {
        assert.assertEquals(await serverLocCompare(dir, "srv", 4), 2);
        assert.assertEquals(await serverLocCompare(dir, "srv"), 0);
      },
    ),
);

nodeTest.test(
  "server-loc: Go matches TypeScript on the repository",
  { skip: lib === null },
  async () => {
    await serverLocCompare(".", "pkg/ajan/noskillsserverfx");
  },
);

nodeTest.test(
  "commit-msg: the Go rules match the TypeScript rules",
  { skip: lib === null },
  () => {
    const messages = [
      "feat(cli): add a command",
      "feat: no scope",
      "fix(a,b): two scopes",
      "fix(a,): an empty scope",
      "fix(*): every package",
      "nope(x): bad type",
      "not a conventional message",
      "",
      "Merge branch 'main'",
      "feat(x):  two spaces",
      "feat(x)!: breaking",
      "FEAT(x): upper case type",
      "feat(x): first line\n\nbody text",
    ];
    const optionSets: commitMsg.CommitMsgOptions[] = [
      {},
      { forceScope: true },
      { allowAsterisk: false, allowMultipleScopes: false },
      { types: ["feat", "fix"] },
    ];

    for (const options of optionSets) {
      for (const message of messages) {
        const go = lib!.call("codebaseValidateCommitMsg", {
          message,
          ...options,
        }) as { valid: boolean; issues?: string[] };

        assert.assertEquals(
          { valid: go.valid, issues: go.issues ?? [] },
          commitMsg.validateCommitMsgLocal(message, options),
          `${JSON.stringify(message)} with ${JSON.stringify(options)}`,
        );
      }
    }
  },
);
