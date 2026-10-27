// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

// etc/scripts belongs to no workspace package; the root package.json lists
// @eserstack/test-kit, so it resolves from the root node_modules.
import * as fs from "node:fs/promises";
import * as nodeTest from "node:test";
import * as url from "node:url";
import * as assert from "@eserstack/test-kit/assert";
import * as distUtils from "./dist-utils.ts";
import * as larouxApp from "./preflight-laroux-app.ts";

const REPO_ROOT = distUtils.repoRootFrom(import.meta.dirname);

const readJson = async <T>(path: string): Promise<T> =>
  JSON.parse(await fs.readFile(`${REPO_ROOT}/${path}`, "utf8")) as T;

const fileUrl = (path: string): string => url.pathToFileURL(path).href;

nodeTest.test("parseOptions: defaults, both forms and bad arguments", () => {
  assert.assertEquals(larouxApp.parseOptions([]), {
    packsDir: "etc/temp/npm-packs",
    appDir: null,
  });
  assert.assertEquals(
    larouxApp.parseOptions(["--packs", "etc/temp/x", "--app-dir=/tmp/app"]),
    { packsDir: "etc/temp/x", appDir: "/tmp/app" },
  );
  assert.assertThrows(() => larouxApp.parseOptions(["--verbose"]));
  assert.assertThrows(() => larouxApp.parseOptions(["--packs"]));
});

nodeTest.test("hostAjanLibrary: the file make ajan-lib writes", () => {
  assert.assertEquals(
    larouxApp.hostAjanLibrary("darwin", "arm64"),
    "pkg/@eserstack/ajan/dist/aarch64-darwin/libeser_ajan.dylib",
  );
  assert.assertEquals(
    larouxApp.hostAjanLibrary("linux", "amd64"),
    "pkg/@eserstack/ajan/dist/x86_64-linux/libeser_ajan.so",
  );
});

nodeTest.test(
  "pointAtTarballs: packed dependencies and every override use the tarball",
  () => {
    const tarballs = new Map([
      ["laroux", "/packs/laroux-5.0.0.tgz"],
      ["@eserstack/laroux", "/packs/eserstack-laroux-5.0.0.tgz"],
      ["@eserstack/fp", "/packs/eserstack-fp-5.0.0.tgz"],
    ]);

    assert.assertEquals(
      larouxApp.pointAtTarballs(
        {
          name: "app",
          scripts: { dev: "laroux dev" },
          dependencies: { "@eserstack/laroux": "^5.0.0", react: "^19.3.0" },
          devDependencies: { laroux: "^5.0.0" },
        },
        tarballs,
      ),
      {
        name: "app",
        scripts: { dev: "laroux dev" },
        dependencies: {
          "@eserstack/laroux": "file:/packs/eserstack-laroux-5.0.0.tgz",
          react: "^19.3.0",
        },
        devDependencies: { laroux: "file:/packs/laroux-5.0.0.tgz" },
        overrides: {
          laroux: "file:/packs/laroux-5.0.0.tgz",
          "@eserstack/laroux": "file:/packs/eserstack-laroux-5.0.0.tgz",
          "@eserstack/fp": "file:/packs/eserstack-fp-5.0.0.tgz",
        },
      },
    );
  },
);

nodeTest.test(
  "registryResolved and installedCopies: read an npm lockfile",
  () => {
    const lock: larouxApp.PackageLock = {
      packages: {
        "": {},
        "node_modules/laroux": { resolved: "file:../packs/laroux-5.0.0.tgz" },
        "node_modules/@eserstack/fp": {
          resolved: "https://registry.npmjs.org/@eserstack/fp/-/fp-5.0.0.tgz",
        },
        "node_modules/react": {
          resolved: "https://registry.npmjs.org/react/-/react-19.3.1.tgz",
        },
        "node_modules/laroux/node_modules/react": {
          resolved: "https://registry.npmjs.org/react/-/react-19.3.0.tgz",
        },
      },
    };

    assert.assertEquals(
      larouxApp.registryResolved(lock, new Set(["laroux", "@eserstack/fp"])),
      [
        "node_modules/@eserstack/fp (https://registry.npmjs.org/@eserstack/fp/-/fp-5.0.0.tgz)",
      ],
    );
    assert.assertEquals(
      [...larouxApp.installedCopies(lock, ["react", "react-dom"])],
      [
        [
          "react",
          ["node_modules/react", "node_modules/laroux/node_modules/react"],
        ],
        ["react-dom", []],
      ],
    );
  },
);

nodeTest.test("packageOf: the package of a module file", () => {
  assert.assertEquals(
    larouxApp.packageOf(
      "/app/node_modules/@eserstack/laroux-server/dist/main.js",
    ),
    {
      name: "@eserstack/laroux-server",
      root: "/app/node_modules/@eserstack/laroux-server",
      file: "dist/main.js",
    },
  );
  assert.assertEquals(
    larouxApp.packageOf("/app/node_modules/laroux/node_modules/react/index.js"),
    {
      name: "react",
      root: "/app/node_modules/laroux/node_modules/react",
      file: "index.js",
    },
  );
  assert.assertEquals(larouxApp.packageOf("/app/dist/server/page.js"), null);
});

const APP = "/app/node_modules";
const ONE_OF_EACH = [
  fileUrl(`${APP}/laroux/dist/cli.js`),
  fileUrl(`${APP}/@eserstack/laroux-server/dist/cli.js`),
  fileUrl(`${APP}/@eserstack/laroux-server/${larouxApp.ACTION_REGISTRY_FILE}`),
  fileUrl(`${APP}/react/index.js`),
  fileUrl(`${APP}/react-dom/server.node.js`),
  `${fileUrl("/app/dist/server/src/app/layout.js")}?v=build-1`,
];
const REGISTRY_RULES: larouxApp.InstanceRules = {
  required: larouxApp.SINGLE_COPY_PACKAGES,
  registry: true,
};

nodeTest.test("instanceProblems: one copy of each passes", () => {
  assert.assertEquals(
    larouxApp.instanceProblems(ONE_OF_EACH, REGISTRY_RULES),
    [],
  );
});

nodeTest.test(
  "instanceProblems: a second React, as a CLI with its own copy loads, fails",
  () => {
    const problems = larouxApp.instanceProblems(
      [...ONE_OF_EACH, fileUrl(`${APP}/laroux/node_modules/react/index.js`)],
      REGISTRY_RULES,
    );

    assert.assertEquals(problems.length, 1);
    assert.assertStringIncludes(
      problems[0]!,
      "react loaded from 2 directories",
    );
  },
);

nodeTest.test(
  "instanceProblems: a second action registry, as the old bundle split it, fails",
  () => {
    const problems = larouxApp.instanceProblems(
      [
        ...ONE_OF_EACH,
        fileUrl(
          `${APP}/laroux/node_modules/@eserstack/laroux-server/${larouxApp.ACTION_REGISTRY_FILE}`,
        ),
      ],
      REGISTRY_RULES,
    );

    assert.assertEquals(
      problems.some((problem) =>
        problem.includes("the action registry loaded from 2 files"),
      ),
      true,
    );
    assert.assertEquals(
      problems.some((problem) =>
        problem.includes("@eserstack/laroux-server loaded from 2 directories"),
      ),
      true,
    );
  },
);

nodeTest.test(
  "instanceProblems: a check that loaded nothing proves nothing",
  () => {
    assert.assertEquals(
      larouxApp.instanceProblems(
        [fileUrl(`${APP}/laroux/dist/cli.js`)],
        REGISTRY_RULES,
      ),
      [
        "react never loaded, so its single copy is unproven",
        "react-dom never loaded, so its single copy is unproven",
        "@eserstack/laroux-server never loaded, so its single copy is unproven",
        `${larouxApp.ACTION_REGISTRY_FILE} of @eserstack/laroux-server never loaded`,
      ],
    );
    assert.assertEquals(
      larouxApp.instanceProblems(
        ONE_OF_EACH.filter(
          (moduleUrl) => !moduleUrl.includes("action-registry"),
        ),
        { required: larouxApp.SINGLE_COPY_PACKAGES, registry: false },
      ),
      [],
    );
  },
);

nodeTest.test("the registry page imports the registry the CLI runs", () => {
  assert.assertStringIncludes(
    larouxApp.REGISTRY_PAGE,
    'from "@eserstack/laroux-server/action-registry"',
  );
  assert.assertStringIncludes(
    larouxApp.RECORDER_SOURCE,
    "module.registerHooks",
  );
});

// =============================================================================
// The npm package laroux and the laroux-app recipe (TASK-237, decision-47)
// =============================================================================

type Manifest = {
  readonly name?: string;
  readonly bin?: Readonly<Record<string, string>>;
  readonly publishConfig?: { readonly bin?: Readonly<Record<string, string>> };
  readonly scripts?: Readonly<Record<string, string>>;
  readonly dependencies?: Readonly<Record<string, string>>;
  readonly devDependencies?: Readonly<Record<string, string>>;
  readonly exports?: unknown;
};

nodeTest.test(
  "the npm package laroux is the bin and depends on laroux-server only",
  async () => {
    const manifest = await readJson<Manifest>(
      "pkg/@eserstack/laroux-bin/package.json",
    );

    assert.assertEquals(manifest.name, larouxApp.TOOL_PACKAGE);
    assert.assertEquals(manifest.publishConfig?.bin, {
      laroux: "./dist/cli.js",
    });
    assert.assertEquals(manifest.dependencies, {
      [larouxApp.SERVER_PACKAGE]: "workspace:*",
    });
  },
);

nodeTest.test("the single-file laroux bundle script is gone", async () => {
  await assert.assertRejects(() =>
    fs.stat(`${REPO_ROOT}/pkg/@eserstack/laroux-server/scripts/npm-build.ts`),
  );
});

type Recipe = {
  readonly name: string;
  readonly files: readonly { readonly source: string }[];
  readonly dependencies?: {
    readonly npm?: readonly string[];
    readonly npmDev?: readonly string[];
  };
};

const larouxRecipe = async (): Promise<Recipe> => {
  const registry = await readJson<{ recipes: readonly Recipe[] }>(
    ".eser/recipes.json",
  );
  const recipe = registry.recipes.find((item) => item.name === "laroux-app");

  if (recipe === undefined) {
    throw new Error(".eser/recipes.json has no laroux-app recipe");
  }

  return recipe;
};

nodeTest.test(
  "laroux-app: the laroux packages come from npm and laroux is a dev dependency",
  async () => {
    const recipe = await larouxRecipe();
    const manifest = await readJson<Manifest>(
      ".eser/recipes/laroux-app/package.json",
    );
    const specs = {
      ...manifest.dependencies,
      ...manifest.devDependencies,
    };

    assert.assertEquals(
      recipe.dependencies?.npm?.includes("@eserstack/laroux"),
      true,
    );
    assert.assertEquals(recipe.dependencies?.npmDev, ["laroux"]);
    assert.assertEquals(
      manifest.dependencies?.["@eserstack/laroux"] !== undefined,
      true,
    );
    assert.assertEquals(
      manifest.devDependencies?.["laroux"] !== undefined,
      true,
    );
    assert.assertEquals(
      Object.entries(specs).filter(([, spec]) => /^(npm|jsr):/.test(spec)),
      [],
    );
    assert.assertEquals(manifest.scripts, {
      dev: "laroux dev",
      build: "laroux build",
      serve: "laroux serve",
    });
  },
);

nodeTest.test(
  "laroux-app: every @eserstack import names an export of a workspace package",
  async () => {
    const recipe = await larouxRecipe();
    const sources = recipe.files
      .map((file) => file.source)
      .filter((source) => /\.(?:ts|tsx)$/.test(source));
    const imports: string[] = [];

    for (const source of sources) {
      // oxlint-disable-next-line no-await-in-loop
      const text = await fs.readFile(`${REPO_ROOT}/.eser/${source}`, "utf8");

      for (const match of text.matchAll(/from\s+"(@eserstack\/[^"]+)"/g)) {
        imports.push(match[1]!);
      }
    }

    assert.assertEquals(imports.length > 0, true);

    for (const specifier of imports) {
      const [scope, name, ...rest] = specifier.split("/");
      const subPath = rest.length === 0 ? "." : `./${rest.join("/")}`;
      // oxlint-disable-next-line no-await-in-loop
      const manifest = await readJson<Manifest>(
        `pkg/@eserstack/${name}/package.json`,
      ).catch(() => null);

      assert.assertEquals(
        manifest !== null &&
          manifest.name === `${scope}/${name}` &&
          typeof manifest.exports === "object" &&
          manifest.exports !== null &&
          subPath in manifest.exports,
        true,
        `the laroux-app recipe imports ${specifier}, which no workspace package exports`,
      );
    }
  },
);
