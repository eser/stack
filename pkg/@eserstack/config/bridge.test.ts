// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * The dotenv and file loaders that live in Go (`pkg/ajan/configfx`), reached
 * through the bridge's dispatcher (`EserAjanCall`) and through the public
 * functions. The cases are the fixture files that the Go tests of configfx
 * read, so both sides check the same behavior; they were written from what
 * the TypeScript implementations answered before the move.
 *
 * @module
 */

import * as nodeTest from "node:test";
import * as assert from "@eserstack/test-kit/assert";
import * as client from "@eserstack/ajan/ffi/client";
import * as crossRuntime from "@eserstack/standards/cross-runtime";
import * as dotenv from "./dotenv/mod.ts";
import * as file from "./file/mod.ts";

const runtime = crossRuntime.runtime;

const CONFIGFX = runtime.path.join(
  import.meta.dirname ?? ".",
  "..",
  "..",
  "ajan",
  "configfx",
);

const readFixture = async <T>(...parts: string[]): Promise<T> =>
  JSON.parse(
    await runtime.fs.readTextFile(runtime.path.join(CONFIGFX, ...parts)),
  ) as T;

type Pair = readonly [string, string];

interface DotenvCase {
  readonly name: string;
  readonly text: string;
  readonly env?: Readonly<Record<string, string>>;
  readonly entries: readonly Pair[];
  readonly ignored?: readonly string[];
}

interface DotenvLoadCase {
  readonly name: string;
  readonly dir?: string;
  readonly env?: string;
  readonly envVars: readonly string[];
  readonly defaultEnvValue?: string;
  readonly maxFileSize?: number;
  readonly loadProcessEnv?: boolean;
  readonly environ: readonly Pair[];
  readonly envName?: string;
  readonly entries?: readonly Pair[];
  readonly ignored?: readonly string[];
  readonly error?: {
    readonly name: string;
    readonly file: string;
    readonly fileSize: number;
    readonly maxSize: number;
  };
}

interface DotenvLoadFixture {
  readonly files: Readonly<Record<string, string>>;
  readonly cases: readonly DotenvLoadCase[];
}

interface FileFixture {
  readonly files: Readonly<Record<string, string>>;
  readonly formats: ReadonlyArray<{
    readonly path: string;
    readonly format: number;
  }>;
  readonly locate: ReadonlyArray<{
    readonly name: string;
    readonly baseDir: string;
    readonly filenames: readonly string[];
    readonly searchParents?: boolean;
    readonly want: string | null;
  }>;
  readonly parse: ReadonlyArray<{
    readonly name: string;
    readonly path: string;
    readonly format?: number;
    readonly wantFormat: number;
    readonly decodedBy: "go" | "typescript";
    readonly content?: unknown;
    readonly errorCode?: string;
    readonly error?: string;
  }>;
}

const readDotenvCases = () =>
  readFixture<DotenvCase[]>("envparser", "testdata", "dotenv_cases.json");

const readDotenvLoad = () =>
  readFixture<DotenvLoadFixture>("envparser", "testdata", "dotenv_load.json");

const readFileFixture = () =>
  readFixture<FileFixture>("testdata", "file_cases.json");

/** Writes `files` (relative paths) into a new temporary directory. */
const writeFiles = async (
  prefix: string,
  files: Readonly<Record<string, string>>,
): Promise<string> => {
  const root = await runtime.fs.makeTempDir({ prefix });
  for (const [name, content] of Object.entries(files)) {
    const path = runtime.path.join(root, ...name.split("/"));
    // The fixture's files are independent, but the directories they share
    // are created once each, in order.
    // oxlint-disable-next-line no-await-in-loop
    await runtime.fs.mkdir(runtime.path.dirname(path), { recursive: true });
    // oxlint-disable-next-line no-await-in-loop
    await runtime.fs.writeTextFile(path, content);
  }

  return root;
};

/** Runs `fn` with console.warn captured, and returns what it warned. */
const captureWarnings = async <T>(
  fn: () => T | Promise<T>,
): Promise<{ readonly result: T; readonly warnings: string[] }> => {
  const warnings: string[] = [];
  // oxlint-disable-next-line no-console
  const original = console.warn;
  // oxlint-disable-next-line no-console
  console.warn = (message: string) => {
    warnings.push(message);
  };

  try {
    return { result: await fn(), warnings };
  } finally {
    // oxlint-disable-next-line no-console
    console.warn = original;
  }
};

const ignoredKeys = (warnings: readonly string[]): string[] =>
  warnings.map(
    (warning) => /^Ignored the key "(.*)" as it is/.exec(warning)?.[1] ?? "",
  );

/** Sets `vars` in the process environment while `fn` runs. */
const withProcessEnv = async <T>(
  vars: Readonly<Record<string, string | undefined>>,
  fn: () => Promise<T>,
): Promise<T> => {
  const saved = new Map<string, string | undefined>();
  for (const [name, value] of Object.entries(vars)) {
    saved.set(name, runtime.env.get(name));
    if (value === undefined) {
      runtime.env.delete(name);
    } else {
      runtime.env.set(name, value);
    }
  }

  try {
    return await fn();
  } finally {
    for (const [name, value] of saved) {
      if (value === undefined) {
        runtime.env.delete(name);
      } else {
        runtime.env.set(name, value);
      }
    }
  }
};

nodeTest.test(
  "configParseDotenv answers the cases of dotenv_cases.json",
  async () => {
    const lib = await client.requireLib();

    for (const tc of await readDotenvCases()) {
      const answer = lib.call("configParseDotenv", {
        text: tc.text,
        environ: Object.entries(tc.env ?? {}),
      });

      assert.assertEquals(answer.error, undefined, tc.name);
      assert.assertEquals(answer.entries, tc.entries, tc.name);
      assert.assertEquals(answer.ignored, tc.ignored, tc.name);
    }
  },
);

nodeTest.test(
  "parseEnvString answers the cases of dotenv_cases.json with the process environment",
  async () => {
    for (const tc of await readDotenvCases()) {
      // Each case sets its own variables, so the cases run one at a time.
      // oxlint-disable-next-line no-await-in-loop
      const { result, warnings } = await withProcessEnv(tc.env ?? {}, () =>
        captureWarnings(() => dotenv.parseEnvString(tc.text)),
      );

      assert.assertEquals(Object.getPrototypeOf(result), null, tc.name);
      assert.assertEquals(Object.entries(result), tc.entries, tc.name);
      assert.assertEquals(ignoredKeys(warnings), tc.ignored ?? [], tc.name);
    }
  },
);

nodeTest.test(
  "configLoadDotenv answers the cases of dotenv_load.json",
  async () => {
    const fixture = await readDotenvLoad();
    const root = await writeFiles("config-dotenv-", fixture.files);
    const lib = await client.requireLib();

    try {
      for (const tc of fixture.cases) {
        const baseDir =
          tc.dir === undefined ? root : runtime.path.join(root, tc.dir);
        const answer = lib.call("configLoadDotenv", {
          baseDir,
          env: tc.env,
          envVars: tc.envVars,
          defaultEnvValue: tc.defaultEnvValue ?? dotenv.defaultEnvValue,
          loadProcessEnv: tc.loadProcessEnv ?? false,
          maxFileSize: tc.maxFileSize ?? dotenv.DEFAULT_MAX_FILE_SIZE,
          environ: tc.environ,
        });

        assert.assertEquals(answer.ignored, tc.ignored, tc.name);

        if (tc.error !== undefined) {
          assert.assertEquals(answer.code, "too_large", tc.name);
          assert.assertEquals(
            answer.filepath,
            `${baseDir}/${tc.error.file}`,
            tc.name,
          );
          assert.assertEquals(answer.fileSize, tc.error.fileSize, tc.name);
          continue;
        }

        assert.assertEquals(answer.error, undefined, tc.name);
        assert.assertEquals(answer.envName, tc.envName, tc.name);
        assert.assertEquals(answer.entries, tc.entries, tc.name);
      }
    } finally {
      await runtime.fs.remove(root, { recursive: true });
    }
  },
);

nodeTest.test(
  "load answers the cases of dotenv_load.json that leave the process environment out",
  async () => {
    const fixture = await readDotenvLoad();
    const root = await writeFiles("config-dotenv-", fixture.files);

    try {
      for (const tc of fixture.cases) {
        if (tc.loadProcessEnv === true) {
          // The process has more variables than the fixture names; the
          // bridge call above checks this case with its environment.
          continue;
        }

        // The case's variables, and every other variable it reads for the
        // environment name unset.
        const vars: Record<string, string | undefined> = {};
        for (const name of [...tc.envVars, "ESER_DOTENV_FIXTURE_HOST"]) {
          vars[name] = undefined;
        }
        for (const [name, value] of tc.environ) {
          vars[name] = value;
        }

        const baseDir =
          tc.dir === undefined ? root : runtime.path.join(root, tc.dir);
        const run = () =>
          dotenv.load({
            baseDir,
            env: tc.env,
            envVars: [...tc.envVars],
            defaultEnvValue: tc.defaultEnvValue ?? dotenv.defaultEnvValue,
            loadProcessEnv: false,
            maxFileSize: tc.maxFileSize ?? dotenv.DEFAULT_MAX_FILE_SIZE,
          });

        // Each case sets its own variables, so the cases run one at a time.
        // oxlint-disable-next-line no-await-in-loop
        await withProcessEnv(vars, async () => {
          if (tc.error !== undefined) {
            const { warnings } = await captureWarnings(async () => {
              const error = await assert.assertRejects(
                run,
                dotenv.EnvFileTooLargeError,
              );
              assert.assertEquals(
                {
                  filepath: error.filepath,
                  fileSize: error.fileSize,
                  maxSize: error.maxSize,
                },
                {
                  filepath: `${baseDir}/${tc.error!.file}`,
                  fileSize: tc.error!.fileSize,
                  maxSize: tc.error!.maxSize,
                },
                tc.name,
              );
            });
            assert.assertEquals(
              ignoredKeys(warnings),
              tc.ignored ?? [],
              tc.name,
            );
            return;
          }

          const { result, warnings } = await captureWarnings(run);
          assert.assertEquals(result.get(dotenv.env), tc.envName, tc.name);
          assert.assertEquals<unknown>(
            [...result.entries()].filter(([key]) => typeof key === "string"),
            tc.entries,
            tc.name,
          );
          assert.assertEquals(ignoredKeys(warnings), tc.ignored ?? [], tc.name);
        });
      }
    } finally {
      await runtime.fs.remove(root, { recursive: true });
    }
  },
);

nodeTest.test("parseEnvFromFile reads one file through Go", async () => {
  const root = await writeFiles("config-dotenv-", {
    ".env": "A=1\nB='$A'\n",
  });

  try {
    const values = await dotenv.parseEnvFromFile(`${root}/.env`);
    assert.assertEquals(Object.entries(values), [
      ["A", "1"],
      ["B", "$A"],
    ]);
    assert.assertEquals(
      { ...(await dotenv.parseEnvFromFile(`${root}/absent`)) },
      {},
    );

    const error = await assert.assertRejects(
      () => dotenv.parseEnvFromFile(`${root}/.env`, 4),
      dotenv.EnvFileTooLargeError,
    );
    assert.assertEquals(
      [error.filepath, error.fileSize, error.maxSize],
      [`${root}/.env`, 11, 4],
    );

    assert.assertEquals(
      Object.keys(await dotenv.parseEnvFromFile(`${root}/.env`, Infinity)),
      ["A", "B"],
    );
  } finally {
    await runtime.fs.remove(root, { recursive: true });
  }
});

nodeTest.test(
  "configFileFormat and getFileFormat answer the formats of file_cases.json",
  async () => {
    const fixture = await readFileFixture();
    const lib = await client.requireLib();

    for (const tc of fixture.formats) {
      assert.assertEquals(
        lib.call("configFileFormat", { path: tc.path }),
        { format: tc.format },
        tc.path,
      );
      assert.assertEquals(file.getFileFormat(tc.path), tc.format, tc.path);
    }
  },
);

nodeTest.test(
  "configLocateFile and locate answer the cases of file_cases.json",
  async () => {
    const fixture = await readFileFixture();
    const root = await writeFiles("config-file-", fixture.files);
    const lib = await client.requireLib();
    const want = (path: string | null) =>
      path === null ? undefined : runtime.path.join(root, ...path.split("/"));

    try {
      for (const tc of fixture.locate) {
        const baseDir = runtime.path.join(root, ...tc.baseDir.split("/"));
        const answer = lib.call("configLocateFile", {
          baseDir,
          filenames: tc.filenames,
          searchParents: tc.searchParents ?? false,
        });

        assert.assertEquals(answer.error, undefined, tc.name);
        assert.assertEquals(answer.path, want(tc.want), tc.name);
        assert.assertEquals(
          // Each case reads the same tree; one at a time keeps the output
          // in order.
          // oxlint-disable-next-line no-await-in-loop
          await file.locate(baseDir, [...tc.filenames], tc.searchParents),
          want(tc.want),
          tc.name,
        );
      }
    } finally {
      await runtime.fs.remove(root, { recursive: true });
    }
  },
);

nodeTest.test(
  "configParseFile and parse answer the cases of file_cases.json",
  async () => {
    const fixture = await readFileFixture();
    const root = await writeFiles("config-file-", fixture.files);
    const lib = await client.requireLib();

    try {
      for (const tc of fixture.parse) {
        const path = runtime.path.join(root, ...tc.path.split("/"));
        const format = tc.format as file.FileFormat | undefined;
        const answer = lib.call("configParseFile", { path, format });

        if (tc.decodedBy === "typescript") {
          assert.assertEquals(
            answer,
            { format: tc.wantFormat, text: fixture.files[tc.path] },
            tc.name,
          );
        } else if (tc.errorCode !== undefined) {
          assert.assertEquals(answer.code, tc.errorCode, tc.name);
        } else {
          assert.assertEquals(answer.error, undefined, tc.name);
          assert.assertEquals(answer.format, tc.wantFormat, tc.name);
          assert.assertEquals(answer.content ?? null, tc.content, tc.name);
        }

        if (tc.errorCode === "not_found") {
          // One case at a time keeps the assertions in fixture order.
          // oxlint-disable-next-line no-await-in-loop
          await assert.assertRejects(
            () => file.parse(path, format),
            crossRuntime.NotFoundError,
            undefined,
            tc.name,
          );
          continue;
        }

        if (tc.errorCode === "parse") {
          // One case at a time keeps the assertions in fixture order.
          // oxlint-disable-next-line no-await-in-loop
          const error = await assert.assertRejects(
            () => file.parse(path, format),
            file.ConfigParseError,
            tc.error,
            tc.name,
          );
          assert.assertEquals(error.format, tc.wantFormat, tc.name);
          assert.assertEquals(error.filepath, path, tc.name);
          continue;
        }

        // oxlint-disable-next-line no-await-in-loop
        const result = await file.parse(path, format);
        assert.assertEquals(result.format, tc.wantFormat, tc.name);
        assert.assertEquals(result.filepath, path, tc.name);
        assert.assertEquals(
          // TOML tables have no prototype; the fixture holds plain JSON.
          result.content === undefined
            ? null
            : JSON.parse(JSON.stringify(result.content)),
          tc.content,
          tc.name,
        );
      }
    } finally {
      await runtime.fs.remove(root, { recursive: true });
    }
  },
);

const runChild = async <T>(
  script: string,
  env: Readonly<Record<string, string>>,
): Promise<T> => {
  const output = await runtime.exec.spawn(
    runtime.process.execPath(),
    ["--no-warnings", "--input-type=module", "--eval", script],
    { env: { ...env }, stdout: "piped", stderr: "piped" },
  );

  assert.assertEquals(output.code, 0, new TextDecoder().decode(output.stderr));

  return JSON.parse(new TextDecoder().decode(output.stdout)) as T;
};

nodeTest.test(
  "with ESER_AJAN=disabled every export that reaches Go throws or rejects with the bridge's load error, and the TypeScript ones still work",
  async () => {
    const urls = {
      config: import.meta.resolve("./mod.ts"),
      dotenv: import.meta.resolve("./dotenv/mod.ts"),
      file: import.meta.resolve("./file/mod.ts"),
    };
    const result = await runChild<{
      failures: Array<{ name: string; message: string; cause: string } | null>;
      configError: { name: string; code: string; message: string } | null;
      typescript: unknown;
    }>(
      `
        const config = await import(${JSON.stringify(urls.config)});
        const dotenv = await import(${JSON.stringify(urls.dotenv)});
        const file = await import(${JSON.stringify(urls.file)});
        const failures = [];
        for (const [name, run] of [
          ["parseEnvString", () => dotenv.parseEnvString("A=1")],
          ["parseEnvFromFile", () => dotenv.parseEnvFromFile(".env")],
          ["load", () => dotenv.load()],
          ["configure", () => dotenv.configure((reader) => reader.getCurrentEnv())],
          ["getFileFormat", () => file.getFileFormat("a.json")],
          ["locate", () => file.locate(".", ["package.json"])],
          ["parse", () => file.parse("package.json")],
          ["file.load", () => file.load(".", ["package.json"])],
        ]) {
          try {
            await run();
            failures.push(null);
          } catch (error) {
            failures.push({ name, message: error.message, cause: error.cause?.message ?? "" });
          }
        }
        let configError = null;
        try {
          await config.load(["system_env"]);
        } catch (error) {
          configError = { name: error.name, code: error.code, message: error.message };
        }
        const reader = dotenv.createEnvReader(new Map([[dotenv.env, "test"], ["PORT", "8080"]]));
        const typescript = {
          env: reader.getCurrentEnv(),
          port: reader.readInt("PORT"),
          resolved: file.resolvePath("b.json", "/a"),
          meta: (() => { const c = new config.Config(); c.setKeyMeta("k", { description: "", type: "string", ttl: 0, disallowSource: [] }); return Object.keys(c.state.meta); })(),
        };
        process.stdout.write(JSON.stringify({ failures, configError, typescript }));
      `,
      { ESER_AJAN: "disabled" },
    );

    assert.assertEquals(result.failures.length, 8);
    for (const failure of result.failures) {
      assert.assertExists(failure);
      assert.assertStringIncludes(
        failure.message,
        "eser-ajan native library unavailable",
        failure.name,
      );
      assert.assertStringIncludes(
        failure.cause,
        "ESER_AJAN=disabled",
        failure.name,
      );
    }

    // configLoad went through Go before the move, and keeps its ConfigError.
    assert.assertEquals(result.configError, {
      name: "ConfigError",
      code: "CONFIG_LOAD_FAILED",
      message: "native library unavailable",
    });

    assert.assertEquals(result.typescript, {
      env: "test",
      port: 8080,
      resolved: "/a/b.json",
      meta: ["k"],
    });
  },
);
