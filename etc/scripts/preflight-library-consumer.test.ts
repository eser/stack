// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

// etc/scripts belongs to no workspace package; the root package.json lists
// @eserstack/test-kit, so it resolves from the root node_modules.
import * as nodeTest from "node:test";
import * as assert from "@eserstack/test-kit/assert";
import * as consumer from "./preflight-library-consumer.ts";

nodeTest.test("parseOptions: the default, both forms, and errors", () => {
  assert.assertEquals(consumer.parseOptions([]), {
    packsDir: "etc/temp/npm-packs",
  });
  assert.assertEquals(consumer.parseOptions(["--packs", "out/packs"]), {
    packsDir: "out/packs",
  });
  assert.assertEquals(consumer.parseOptions(["--packs=out/packs"]), {
    packsDir: "out/packs",
  });
  assert.assertThrows(() => consumer.parseOptions(["--packs"]));
  assert.assertThrows(() => consumer.parseOptions(["--package", "x"]));
});

nodeTest.test("tarballName: the name pnpm pack writes", () => {
  assert.assertEquals(
    consumer.tarballName("@eserstack/primitives", "5.0.0"),
    "eserstack-primitives-5.0.0.tgz",
  );
});

nodeTest.test(
  "exportSpecifiers: one specifier per sub-path, source exports apart",
  () => {
    assert.assertEquals(
      consumer.exportSpecifiers("@eserstack/x", {
        ".": { types: "./dist/mod.d.ts", import: "./dist/mod.js" },
        "./results": {
          types: "./dist/results.d.ts",
          import: "./dist/results.js",
        },
        "./client/bootstrap": "./client/bootstrap/index.ts",
      }),
      {
        importable: ["@eserstack/x", "@eserstack/x/results"],
        sourceOnly: ["@eserstack/x/client/bootstrap"],
      },
    );
    assert.assertEquals(consumer.exportSpecifiers("@eserstack/x", null), {
      importable: [],
      sourceOnly: [],
    });
  },
);

const PACKAGES: consumer.PackedPackage[] = [
  {
    name: "@eserstack/standards",
    tarball: "/packs/eserstack-standards-5.0.0.tgz",
    library: true,
    typePackages: { "@types/semver": "^7.8.0" },
  },
  {
    name: "@eserstack/ajan-wasm",
    tarball: "/packs/eserstack-ajan-wasm-5.0.0.tgz",
    library: false,
    typePackages: {},
  },
  {
    name: "@eserstack/laroux-react",
    tarball: "/packs/eserstack-laroux-react-5.0.0.tgz",
    library: true,
    typePackages: { "@types/react": "^19.3.0", "@types/semver": "^7.0.0" },
  },
];

nodeTest.test(
  "consumerManifest: libraries as dependencies, their @types once",
  () => {
    assert.assertEquals(consumer.consumerManifest(PACKAGES), {
      name: "library-consumer",
      private: true,
      type: "module",
      dependencies: {
        "@eserstack/standards": "file:/packs/eserstack-standards-5.0.0.tgz",
        "@eserstack/laroux-react":
          "file:/packs/eserstack-laroux-react-5.0.0.tgz",
      },
      devDependencies: {
        "@types/semver": "^7.8.0",
        "@types/react": "^19.3.0",
      },
    });
  },
);

nodeTest.test(
  "consumerWorkspaceYaml: every package overridden to its tarball",
  () => {
    assert.assertEquals(
      consumer.consumerWorkspaceYaml(PACKAGES),
      [
        "strictDepBuilds: false",
        "overrides:",
        '  "@eserstack/standards": "file:/packs/eserstack-standards-5.0.0.tgz"',
        '  "@eserstack/ajan-wasm": "file:/packs/eserstack-ajan-wasm-5.0.0.tgz"',
        '  "@eserstack/laroux-react": "file:/packs/eserstack-laroux-react-5.0.0.tgz"',
        "",
      ].join("\n"),
    );
  },
);

nodeTest.test("consumerNpmrc: the scope on the unreachable registry", () => {
  assert.assertEquals(
    consumer.consumerNpmrc(),
    "@eserstack:registry=http://127.0.0.1:9/\n",
  );
});

nodeTest.test(
  "registryResolved: only @eserstack entries outside a tarball",
  () => {
    const lockfile = [
      "lockfileVersion: '9.0'",
      "",
      "overrides:",
      "  '@eserstack/fp': file:/packs/eserstack-fp-5.0.0.tgz",
      "",
      "importers:",
      "",
      "  .:",
      "    dependencies:",
      "      '@eserstack/fp':",
      "        specifier: file:/packs/eserstack-fp-5.0.0.tgz",
      "        version: file:../packs/eserstack-fp-5.0.0.tgz",
      "      '@eserstack/cache':",
      "        specifier: 5.0.0",
      "        version: 5.0.0",
      "",
      "packages:",
      "",
      "  '@eserstack/fp@file:../packs/eserstack-fp-5.0.0.tgz':",
      "    resolution: {integrity: sha512-x, tarball: file:../packs/eserstack-fp-5.0.0.tgz}",
      "",
      "  '@eserstack/primitives@5.0.0':",
      "    resolution: {integrity: sha512-y}",
      "",
      "  semver@7.8.5:",
      "    resolution: {integrity: sha512-z}",
      "",
    ].join("\n");

    assert.assertEquals(consumer.registryResolved(lockfile), [
      "@eserstack/cache@5.0.0",
      "@eserstack/primitives@5.0.0",
    ]);
  },
);

nodeTest.test("typeCheckSource: imports every specifier as a type", () => {
  assert.assertEquals(
    consumer.typeCheckSource(["@eserstack/x", "@eserstack/x/y"]),
    [
      'import type * as module0 from "@eserstack/x";',
      'import type * as module1 from "@eserstack/x/y";',
      "",
      "export type Modules = [typeof module0, typeof module1];",
      "",
    ].join("\n"),
  );
});
