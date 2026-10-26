// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

// etc/scripts belongs to no workspace package; the root package.json lists
// @eserstack/test-kit, so it resolves from the root node_modules.
import * as nodeTest from "node:test";
import * as assert from "@eserstack/test-kit/assert";
import * as crossRuntime from "../../pkg/@eserstack/standards/cross-runtime/mod.ts";
import * as gen from "./gen-library-manifests.ts";

const { runtime } = crossRuntime;

const PRIMITIVES = `{
  "name": "@eserstack/primitives",
  "version": "4.5.2",
  "type": "module",
  "exports": {
    ".": "./mod.ts",
    "./results": "./results.ts"
  },
  "devDependencies": {
    "@eserstack/test-kit": "workspace:*"
  }
}
`;

nodeTest.test("isLibrary: needs exports and no private flag", () => {
  assert.assertEquals(gen.isLibrary({ exports: "./mod.ts" }), true);
  assert.assertEquals(
    gen.isLibrary({ private: true, exports: "./mod.ts" }),
    false,
  );
  assert.assertEquals(gen.isLibrary({ name: "@eserstack/ajan-wasm" }), false);
});

nodeTest.test("distConditions: maps a source to its emitted files", () => {
  assert.assertEquals(gen.distConditions("./mod.ts"), {
    types: "./dist/mod.d.ts",
    import: "./dist/mod.js",
  });
  assert.assertEquals(gen.distConditions("./a/b-c.tsx"), {
    types: "./dist/a/b-c.d.ts",
    import: "./dist/a/b-c.js",
  });
  assert.assertThrows(() => gen.distConditions("./static/client.js"));
  assert.assertThrows(() => gen.distConditions("mod.ts"));
});

nodeTest.test(
  "publishExports: maps every sub-path and keeps source exports",
  () => {
    assert.assertEquals(gen.publishExports("./main.ts"), {
      ".": { types: "./dist/main.d.ts", import: "./dist/main.js" },
    });
    assert.assertEquals(
      gen.publishExports(
        {
          ".": "./mod.ts",
          "./client/bootstrap": "./client/bootstrap/index.ts",
        },
        ["./client/bootstrap"],
      ),
      {
        ".": { types: "./dist/mod.d.ts", import: "./dist/mod.js" },
        "./client/bootstrap": "./client/bootstrap/index.ts",
      },
    );
    assert.assertThrows(() =>
      gen.publishExports({ ".": { import: "./mod.ts" } }),
    );
    assert.assertThrows(() => gen.publishExports({}));
  },
);

nodeTest.test(
  "buildScript and buildConfigText: paths relative to the package",
  () => {
    assert.assertEquals(
      gen.buildScript("pkg/@eserstack/fp"),
      "node ../../../etc/scripts/build-library.ts",
    );
    assert.assertEquals(
      gen.buildScript("pkg/@eserstack/noskills-web", ["static"]),
      "node ../../../etc/scripts/build-library.ts --copy static",
    );
    assert.assertEquals(
      gen.buildConfigText("pkg/@eserstack/fp"),
      '{ "extends": "../../../tsconfig.build.json" }\n',
    );
  },
);

nodeTest.test("filesList: patterns, copied assets and extra entries", () => {
  assert.assertEquals(gen.filesList(), [
    "dist/**/*.js",
    "dist/**/*.d.ts",
    "dist/**/*.json",
  ]);
  assert.assertEquals(
    gen.filesList({ copy: ["static"], extraFiles: ["client.ts"] }),
    [
      "dist/**/*.js",
      "dist/**/*.d.ts",
      "dist/**/*.json",
      "dist/static/",
      "client.ts",
    ],
  );
});

nodeTest.test("formatJson: one entry per line, indented to its line", () => {
  assert.assertEquals(
    gen.formatJson(["a", "b"], "  "),
    '[\n    "a",\n    "b"\n  ]',
  );
  assert.assertEquals(gen.formatJson([], "  "), "[]");
  assert.assertEquals(
    gen.formatJson({ ".": { types: "./t", import: "./i" } }, "  "),
    '{\n    ".": {\n      "types": "./t",\n      "import": "./i"\n    }\n  }',
  );
});

nodeTest.test("topLevelMembers: locates keys, values and commas", () => {
  const text = '{\n  "a": "x,y",\n  "b": { "c": ["}"] },\n  "d": 1\n}\n';
  const members = gen.topLevelMembers(text);

  assert.assertEquals(
    members.map((member) => member.key),
    ["a", "b", "d"],
  );
  assert.assertEquals(
    text.slice(members[1]!.valueStart, members[1]!.valueEnd),
    '{ "c": ["}"] }',
  );
  assert.assertEquals(members[2]!.comma, -1);
  assert.assertThrows(() => gen.topLevelMembers("[]"));
});

nodeTest.test("applyLibraryFields: inserts the fields around exports", () => {
  const manifest = JSON.parse(PRIMITIVES) as gen.Manifest;
  const fields = gen.libraryFields("pkg/@eserstack/primitives", manifest);
  const result = gen.applyLibraryFields(PRIMITIVES, fields);

  assert.assertEquals(
    result,
    `{
  "name": "@eserstack/primitives",
  "version": "4.5.2",
  "type": "module",
  "files": [
    "dist/**/*.js",
    "dist/**/*.d.ts",
    "dist/**/*.json"
  ],
  "exports": {
    ".": "./mod.ts",
    "./results": "./results.ts"
  },
  "publishConfig": {
    "exports": {
      ".": {
        "types": "./dist/mod.d.ts",
        "import": "./dist/mod.js"
      },
      "./results": {
        "types": "./dist/results.d.ts",
        "import": "./dist/results.js"
      }
    }
  },
  "scripts": {
    "build": "node ../../../etc/scripts/build-library.ts"
  },
  "devDependencies": {
    "@eserstack/test-kit": "workspace:*"
  }
}
`,
  );

  // A second run changes nothing.
  assert.assertEquals(gen.applyLibraryFields(result, fields), result);
});

nodeTest.test(
  "applyLibraryFields: replaces owned fields, keeps the rest",
  () => {
    const text = `{
  "name": "@eserstack/x",
  "files": ["mod.ts", "README.md"],
  "exports": "./mod.ts",
  "bin": { "x": "./bin.ts" },
  "scripts": {
    "test": "node --test",
    "build": "old"
  },
  "publishConfig": {
    "access": "public"
  }
}
`;
    const manifest = JSON.parse(text) as gen.Manifest;
    const result = gen.applyLibraryFields(
      text,
      gen.libraryFields("pkg/@eserstack/x", manifest),
    );
    const parsed = JSON.parse(result) as Record<string, unknown>;

    assert.assertEquals(Object.keys(parsed), [
      "name",
      "files",
      "exports",
      "bin",
      "scripts",
      "publishConfig",
    ]);
    assert.assertEquals(parsed["scripts"], {
      test: "node --test",
      build: "node ../../../etc/scripts/build-library.ts",
    });
    assert.assertEquals(parsed["publishConfig"], {
      access: "public",
      exports: { ".": { types: "./dist/mod.d.ts", import: "./dist/mod.js" } },
    });
    // The member this script does not own keeps its one-line layout.
    assert.assertEquals(result.includes('"bin": { "x": "./bin.ts" },'), true);
  },
);

nodeTest.test(
  "LIBRARY_OPTIONS: laroux-react ships every bootstrap source the bundler copies",
  async () => {
    const entry = await runtime.fs.readTextFile(
      runtime.path.resolve(
        import.meta.dirname ?? ".",
        "../../pkg/@eserstack/laroux-bundler/adapters/react/rsc-client-entry.ts",
      ),
    );
    const list = /BOOTSTRAP_SOURCE_FILES = \[(?<items>[^\]]*)\]/.exec(entry)
      ?.groups?.["items"];

    assert.assertNotEquals(list, undefined);

    const sources = [...(list ?? "").matchAll(/"(?<file>[^"]+)"/g)].map(
      (match) => match.groups?.["file"] ?? "",
    );
    const files =
      gen.LIBRARY_OPTIONS["@eserstack/laroux-react"]?.extraFiles ?? [];

    assert.assertNotEquals(sources.length, 0);

    for (const source of sources) {
      const covered = files.some((file) =>
        file.endsWith("/") ? source.startsWith(file) : source === file,
      );

      assert.assertEquals(
        covered,
        true,
        `${source} is not in laroux-react's files`,
      );
    }
  },
);
