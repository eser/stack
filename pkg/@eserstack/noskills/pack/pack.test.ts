// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * Tests for the noskills pack system — schema validation, built-in loading,
 * install/uninstall, list, inspect, prefix naming, concern install, requires.
 *
 * @module
 */

import * as bdd from "node:test";
import * as assert from "@eserstack/test-kit/assert";
import * as crossRuntime from "@eserstack/standards/cross-runtime";
import * as packSchema from "./schema.ts";
import * as defaultPacks from "../defaults/packs/mod.ts";
import * as packCmd from "../commands/pack.ts";

// =============================================================================
// Helpers
// =============================================================================

let tempDir: string;

const fileExists = async (path: string): Promise<boolean> => {
  try {
    await crossRuntime.runtime.fs.stat(path);
    return true;
  } catch {
    return false;
  }
};

/** Checks every path concurrently; the result keeps the order of `paths`. */
const filesExist = (paths: readonly string[]): Promise<boolean[]> =>
  Promise.all(paths.map((path) => fileExists(path)));

const removeFiles = async (paths: readonly string[]): Promise<void> => {
  await Promise.all(paths.map((path) => crossRuntime.runtime.fs.remove(path)));
};

const readJson = async (path: string): Promise<unknown> => {
  const content = await crossRuntime.runtime.fs.readTextFile(path);
  return JSON.parse(content);
};

const scaffoldEserDir = async (root: string): Promise<void> => {
  await crossRuntime.runtime.fs.mkdir(`${root}/.eser/rules`, {
    recursive: true,
  });
  await crossRuntime.runtime.fs.mkdir(`${root}/.eser/concerns`, {
    recursive: true,
  });
};

// =============================================================================
// PackManifest schema validation
// =============================================================================

bdd.describe("PackManifest validation", () => {
  bdd.it("valid manifest parses successfully", () => {
    const data = {
      name: "test-pack",
      version: "1.0.0",
      description: "A test pack",
      rules: ["rules/test.md"],
    };

    const result = packSchema.validatePackManifest(data);

    assert.assertEquals(result.name, "test-pack");
    assert.assertEquals(result.version, "1.0.0");
    assert.assertEquals(result.description, "A test pack");
  });

  bdd.it("missing name throws", () => {
    const data = { version: "1.0.0", description: "No name" };

    assert.assertThrows(
      () => packSchema.validatePackManifest(data),
      Error,
      "name",
    );
  });

  bdd.it("empty name throws", () => {
    const data = { name: "", version: "1.0.0", description: "Empty name" };

    assert.assertThrows(
      () => packSchema.validatePackManifest(data),
      Error,
      "name",
    );
  });

  bdd.it("missing version throws", () => {
    const data = { name: "test", description: "No version" };

    assert.assertThrows(
      () => packSchema.validatePackManifest(data),
      Error,
      "version",
    );
  });

  bdd.it("missing description throws", () => {
    const data = { name: "test", version: "1.0.0" };

    assert.assertThrows(
      () => packSchema.validatePackManifest(data),
      Error,
      "description",
    );
  });
});

// =============================================================================
// Built-in pack loading
// =============================================================================

bdd.describe("Built-in pack loading", () => {
  bdd.it("loads all 3 built-in packs", () => {
    assert.assertEquals(defaultPacks.BUILTIN_PACKS.size, 3);
    assert.assert(defaultPacks.BUILTIN_PACKS.has("typescript"));
    assert.assert(defaultPacks.BUILTIN_PACKS.has("react"));
    assert.assert(defaultPacks.BUILTIN_PACKS.has("security"));
  });

  bdd.it("typescript pack has correct structure", () => {
    const ts = defaultPacks.BUILTIN_PACKS.get("typescript")!;

    assert.assertEquals(ts.manifest.name, "typescript");
    assert.assertEquals(ts.manifest.version, "1.0.0");
    assert.assertEquals(Object.keys(ts.ruleContents).length, 3);
    assert.assert("use-strict-types" in ts.ruleContents);
    assert.assert("no-any" in ts.ruleContents);
    assert.assert("prefer-const" in ts.ruleContents);
    assert.assertEquals(ts.concernContents.length, 1);
    assert.assertEquals(ts.concernContents[0]!.id, "ts-quality");
  });

  bdd.it("react pack has correct structure", () => {
    const react = defaultPacks.BUILTIN_PACKS.get("react")!;

    assert.assertEquals(react.manifest.name, "react");
    assert.assertEquals(Object.keys(react.ruleContents).length, 3);
    assert.assertEquals(react.concernContents.length, 0);
  });

  bdd.it("security pack has correct structure", () => {
    const sec = defaultPacks.BUILTIN_PACKS.get("security")!;

    assert.assertEquals(sec.manifest.name, "security");
    assert.assertEquals(Object.keys(sec.ruleContents).length, 3);
    assert.assertEquals(sec.concernContents.length, 1);
    assert.assertEquals(sec.concernContents[0]!.id, "security-audit");
  });

  bdd.it("concern definitions follow ConcernDefinition schema", () => {
    for (const [, builtin] of defaultPacks.BUILTIN_PACKS) {
      for (const concern of builtin.concernContents) {
        assert.assertEquals(typeof concern.id, "string");
        assert.assertEquals(typeof concern.name, "string");
        assert.assertEquals(typeof concern.description, "string");
        assert.assert(Array.isArray(concern.extras));
        assert.assert(Array.isArray(concern.specSections));
        assert.assert(Array.isArray(concern.reminders));
        assert.assert(Array.isArray(concern.acceptanceCriteria));
      }
    }
  });
});

// =============================================================================
// Pack install (built-in)
// =============================================================================

bdd.describe("Pack install (built-in)", () => {
  bdd.beforeEach(async () => {
    tempDir = await crossRuntime.runtime.fs.makeTempDir({
      prefix: "pack_install_",
    });
    await scaffoldEserDir(tempDir);
  });

  bdd.afterEach(async () => {
    await crossRuntime.runtime.fs.remove(tempDir, { recursive: true });
  });

  bdd.it("copies rules to .eser/rules/ with pack prefix", async () => {
    const builtin = defaultPacks.BUILTIN_PACKS.get("typescript")!;
    const installed = await packCmd.installBuiltinPack(
      tempDir,
      "typescript",
      builtin,
    );

    assert.assertEquals(installed.rules.length, 3);

    for (const ruleFile of installed.rules) {
      assert.assert(ruleFile.startsWith("pack-typescript-"));
      assert.assert(ruleFile.endsWith(".md"));
    }
    const rulesExist = await filesExist(
      installed.rules.map((ruleFile) => `${tempDir}/.eser/rules/${ruleFile}`),
    );
    assert.assertEquals(rulesExist.includes(false), false);
  });

  bdd.it("copies concerns to .eser/concerns/ with numeric prefix", async () => {
    const builtin = defaultPacks.BUILTIN_PACKS.get("typescript")!;
    const installed = await packCmd.installBuiltinPack(
      tempDir,
      "typescript",
      builtin,
    );

    assert.assertEquals(installed.concerns.length, 1);

    const concernFile = installed.concerns[0]!;
    assert.assertMatch(concernFile, /^\d{3}-ts-quality\.json$/);
    assert.assert(await fileExists(`${tempDir}/.eser/concerns/${concernFile}`));

    const content = (await readJson(
      `${tempDir}/.eser/concerns/${concernFile}`,
    )) as { id: string };
    assert.assertEquals(content.id, "ts-quality");
  });

  bdd.it("records correct metadata in InstalledPack", async () => {
    const builtin = defaultPacks.BUILTIN_PACKS.get("react")!;
    const installed = await packCmd.installBuiltinPack(
      tempDir,
      "react",
      builtin,
    );

    assert.assertEquals(installed.name, "react");
    assert.assertEquals(installed.version, "1.0.0");
    assert.assertEquals(installed.source, "builtin");
    assert.assertEquals(installed.rules.length, 3);
    assert.assertEquals(installed.concerns.length, 0);
    assert.assertEquals(installed.folderRules.length, 0);
    assert.assert(installed.installedAt.length > 0);
  });

  bdd.it("rule files contain the rule text", async () => {
    const builtin = defaultPacks.BUILTIN_PACKS.get("security")!;
    await packCmd.installBuiltinPack(tempDir, "security", builtin);

    const content = await crossRuntime.runtime.fs.readTextFile(
      `${tempDir}/.eser/rules/pack-security-no-secrets-in-code.md`,
    );
    assert.assert(content.includes("Never hardcode API keys"));
  });
});

// =============================================================================
// Pack install (duplicate detection)
// =============================================================================

bdd.describe("Pack install (duplicate)", () => {
  bdd.beforeEach(async () => {
    tempDir = await crossRuntime.runtime.fs.makeTempDir({
      prefix: "pack_dup_",
    });
    await scaffoldEserDir(tempDir);
  });

  bdd.afterEach(async () => {
    await crossRuntime.runtime.fs.remove(tempDir, { recursive: true });
  });

  bdd.it("packs.json records installed packs", async () => {
    const builtin = defaultPacks.BUILTIN_PACKS.get("typescript")!;
    const installed = await packCmd.installBuiltinPack(
      tempDir,
      "typescript",
      builtin,
    );

    await packCmd.writePacksFile(tempDir, { installed: [installed] });

    const packsFile = await packCmd.readPacksFile(tempDir);
    assert.assertEquals(packsFile.installed.length, 1);
    assert.assertEquals(packsFile.installed[0]!.name, "typescript");
  });
});

// =============================================================================
// Pack uninstall
// =============================================================================

bdd.describe("Pack uninstall", () => {
  bdd.beforeEach(async () => {
    tempDir = await crossRuntime.runtime.fs.makeTempDir({
      prefix: "pack_uninst_",
    });
    await scaffoldEserDir(tempDir);
  });

  bdd.afterEach(async () => {
    await crossRuntime.runtime.fs.remove(tempDir, { recursive: true });
  });

  bdd.it("removes rule files on uninstall", async () => {
    // Install first
    const builtin = defaultPacks.BUILTIN_PACKS.get("typescript")!;
    const installed = await packCmd.installBuiltinPack(
      tempDir,
      "typescript",
      builtin,
    );
    await packCmd.writePacksFile(tempDir, { installed: [installed] });

    const rulePaths = installed.rules.map(
      (ruleFile) => `${tempDir}/.eser/rules/${ruleFile}`,
    );
    const concernPaths = installed.concerns.map(
      (concernFile) => `${tempDir}/.eser/concerns/${concernFile}`,
    );

    // Verify files exist
    assert.assertEquals((await filesExist(rulePaths)).includes(false), false);

    // Read packs, simulate uninstall by removing files
    await removeFiles([...rulePaths, ...concernPaths]);
    await packCmd.writePacksFile(tempDir, { installed: [] });

    // Verify files are gone
    assert.assertEquals((await filesExist(rulePaths)).includes(true), false);

    const packsFile = await packCmd.readPacksFile(tempDir);
    assert.assertEquals(packsFile.installed.length, 0);
  });

  bdd.it("removes concern files on uninstall", async () => {
    const builtin = defaultPacks.BUILTIN_PACKS.get("security")!;
    const installed = await packCmd.installBuiltinPack(
      tempDir,
      "security",
      builtin,
    );

    const concernPaths = installed.concerns.map(
      (concernFile) => `${tempDir}/.eser/concerns/${concernFile}`,
    );

    // Verify concern exists
    assert.assertEquals(
      (await filesExist(concernPaths)).includes(false),
      false,
    );

    // Remove
    await removeFiles(concernPaths);

    assert.assertEquals((await filesExist(concernPaths)).includes(true), false);
  });
});

// =============================================================================
// Pack list helpers
// =============================================================================

bdd.describe("Pack list", () => {
  bdd.it("readPacksFile returns empty for non-existent file", async () => {
    const tmpDir = await crossRuntime.runtime.fs.makeTempDir({
      prefix: "pack_list_",
    });

    const packsFile = await packCmd.readPacksFile(tmpDir);
    assert.assertEquals(packsFile.installed.length, 0);

    await crossRuntime.runtime.fs.remove(tmpDir, { recursive: true });
  });

  bdd.it("readPacksFile returns saved data", async () => {
    const tmpDir = await crossRuntime.runtime.fs.makeTempDir({
      prefix: "pack_list2_",
    });
    await crossRuntime.runtime.fs.mkdir(`${tmpDir}/.eser`, { recursive: true });

    const data: packSchema.InstalledPacksFile = {
      installed: [
        {
          name: "test-pack",
          version: "1.0.0",
          installedAt: "2026-04-01T00:00:00Z",
          source: "builtin",
          rules: ["pack-test-pack-rule.md"],
          concerns: [],
          folderRules: [],
        },
      ],
    };
    await packCmd.writePacksFile(tmpDir, data);

    const result = await packCmd.readPacksFile(tmpDir);
    assert.assertEquals(result.installed.length, 1);
    assert.assertEquals(result.installed[0]!.name, "test-pack");

    await crossRuntime.runtime.fs.remove(tmpDir, { recursive: true });
  });
});

// =============================================================================
// Rule prefix naming
// =============================================================================

bdd.describe("Rule prefix", () => {
  bdd.beforeEach(async () => {
    tempDir = await crossRuntime.runtime.fs.makeTempDir({
      prefix: "pack_prefix_",
    });
    await scaffoldEserDir(tempDir);
  });

  bdd.afterEach(async () => {
    await crossRuntime.runtime.fs.remove(tempDir, { recursive: true });
  });

  bdd.it("installed rules have pack-{name}- prefix", async () => {
    const builtin = defaultPacks.BUILTIN_PACKS.get("react")!;
    const installed = await packCmd.installBuiltinPack(
      tempDir,
      "react",
      builtin,
    );

    for (const ruleFile of installed.rules) {
      assert.assert(
        ruleFile.startsWith("pack-react-"),
        `Expected prefix pack-react-, got: ${ruleFile}`,
      );
    }
  });

  bdd.it("different packs have different prefixes", async () => {
    const ts = defaultPacks.BUILTIN_PACKS.get("typescript")!;
    const sec = defaultPacks.BUILTIN_PACKS.get("security")!;

    const tsInstalled = await packCmd.installBuiltinPack(
      tempDir,
      "typescript",
      ts,
    );
    const secInstalled = await packCmd.installBuiltinPack(
      tempDir,
      "security",
      sec,
    );

    for (const ruleFile of tsInstalled.rules) {
      assert.assert(ruleFile.startsWith("pack-typescript-"));
    }
    for (const ruleFile of secInstalled.rules) {
      assert.assert(ruleFile.startsWith("pack-security-"));
    }
  });
});

// =============================================================================
// Concern numeric prefix
// =============================================================================

bdd.describe("Concern install", () => {
  bdd.beforeEach(async () => {
    tempDir = await crossRuntime.runtime.fs.makeTempDir({
      prefix: "pack_concern_",
    });
    await scaffoldEserDir(tempDir);
  });

  bdd.afterEach(async () => {
    await crossRuntime.runtime.fs.remove(tempDir, { recursive: true });
  });

  bdd.it("concern gets numeric prefix", async () => {
    const builtin = defaultPacks.BUILTIN_PACKS.get("typescript")!;
    const installed = await packCmd.installBuiltinPack(
      tempDir,
      "typescript",
      builtin,
    );

    assert.assertEquals(installed.concerns.length, 1);
    assert.assertMatch(installed.concerns[0]!, /^\d{3}-/);
  });

  bdd.it("second pack gets next available numeric prefix", async () => {
    // Install typescript first (has ts-quality concern)
    const ts = defaultPacks.BUILTIN_PACKS.get("typescript")!;
    await packCmd.installBuiltinPack(tempDir, "typescript", ts);

    // Install security (has security-audit concern)
    const sec = defaultPacks.BUILTIN_PACKS.get("security")!;
    const secInstalled = await packCmd.installBuiltinPack(
      tempDir,
      "security",
      sec,
    );

    // Second concern should have prefix 002
    assert.assert(secInstalled.concerns[0]!.startsWith("002-"));
  });

  bdd.it("installed concern follows ConcernDefinition schema", async () => {
    const builtin = defaultPacks.BUILTIN_PACKS.get("security")!;
    const installed = await packCmd.installBuiltinPack(
      tempDir,
      "security",
      builtin,
    );

    const content = (await readJson(
      `${tempDir}/.eser/concerns/${installed.concerns[0]}`,
    )) as Record<string, unknown>;

    assert.assertEquals(typeof content["id"], "string");
    assert.assertEquals(typeof content["name"], "string");
    assert.assertEquals(typeof content["description"], "string");
    assert.assert(Array.isArray(content["extras"]));
    assert.assert(Array.isArray(content["specSections"]));
    assert.assert(Array.isArray(content["reminders"]));
    assert.assert(Array.isArray(content["acceptanceCriteria"]));
  });
});

// =============================================================================
// Pack requires (dependency resolution)
// =============================================================================

bdd.describe("Pack requires", () => {
  bdd.it("manifest with requires field is valid", () => {
    const data = {
      name: "advanced-ts",
      version: "1.0.0",
      description: "Advanced TypeScript pack",
      requires: ["typescript"],
      rules: [],
    };

    const result = packSchema.validatePackManifest(data);
    assert.assertEquals(result.requires?.length, 1);
    assert.assertEquals(result.requires![0], "typescript");
  });
});

// =============================================================================
// Sync after install
// =============================================================================

bdd.describe("Sync after install", () => {
  bdd.beforeEach(async () => {
    tempDir = await crossRuntime.runtime.fs.makeTempDir({
      prefix: "pack_sync_",
    });
    await scaffoldEserDir(tempDir);
    // Create .claude directory so Claude Code adapter can write
    await crossRuntime.runtime.fs.mkdir(`${tempDir}/.claude`, {
      recursive: true,
    });
  });

  bdd.afterEach(async () => {
    await crossRuntime.runtime.fs.remove(tempDir, { recursive: true });
  });

  bdd.it("installed pack rules are picked up by sync engine", async () => {
    const builtin = defaultPacks.BUILTIN_PACKS.get("typescript")!;
    await packCmd.installBuiltinPack(tempDir, "typescript", builtin);

    // Load rules from the directory — sync engine uses loadScopedRules
    const { loadScopedRules } = await import("../sync/engine.ts");
    const rules = await loadScopedRules(tempDir);

    // Should find the pack rules
    const packRules = rules.filter(
      (r) =>
        r.text.includes("explicit types") ||
        r.text.includes("any") ||
        r.text.includes("const"),
    );
    assert.assert(
      packRules.length >= 3,
      `Expected at least 3 pack rules, found ${packRules.length}`,
    );
  });
});

// =============================================================================
// createEmptyPacksFile
// =============================================================================

bdd.describe("createEmptyPacksFile", () => {
  bdd.it("returns empty installed array", () => {
    const packs = packSchema.createEmptyPacksFile();
    assert.assertEquals(packs.installed.length, 0);
  });
});

// =============================================================================
// Remote install: concern scopes
// =============================================================================

bdd.describe("Pack install (remote): concern scopes", () => {
  const specifier = "github:example/packs#scoped";
  const manifest: packSchema.PackManifest = {
    name: "scoped",
    version: "1.0.0",
    description: "A pack whose concern declares scopes",
    concerns: ["concerns/scoped.json"],
  };
  const concernWith = (scope: readonly string[]) =>
    JSON.stringify({
      id: "scoped",
      name: "Scoped",
      description: "Scoped reminders",
      extras: [],
      specSections: [],
      reminders: ["Plain", { text: "Design every state", scope }],
      acceptanceCriteria: [],
    });

  let originalFetch: typeof globalThis.fetch;

  // Serves the pack's concern file in place of raw.githubusercontent.com.
  const serveConcern = (body: string): void => {
    globalThis.fetch = (input: string | URL | Request) => {
      const url = input instanceof Request ? input.url : String(input);

      return Promise.resolve(
        url.endsWith("/concerns/scoped.json")
          ? new Response(body)
          : new Response("not found", { status: 404 }),
      );
    };
  };

  bdd.beforeEach(async () => {
    tempDir = await crossRuntime.runtime.fs.makeTempDir({
      prefix: "nos_pack_scope_",
    });
    await scaffoldEserDir(tempDir);
    originalFetch = globalThis.fetch;
  });

  bdd.afterEach(async () => {
    globalThis.fetch = originalFetch;
    await crossRuntime.runtime.fs.remove(tempDir, { recursive: true });
  });

  bdd.it("installs a concern whose reminders declare scopes", async () => {
    serveConcern(concernWith(["ui"]));

    const installed = await packCmd.installRemotePack(
      tempDir,
      specifier,
      manifest,
    );

    assert.assertEquals(installed.concerns.length, 1);
    const written = (await readJson(
      `${tempDir}/.eser/concerns/${installed.concerns[0]}`,
    )) as { reminders: unknown[] };
    assert.assertEquals(written.reminders[1], {
      text: "Design every state",
      scope: ["ui"],
    });
  });

  bdd.it("refuses a concern with an unknown scope value", async () => {
    serveConcern(concernWith(["frontend"]));

    await assert.assertRejects(
      () => packCmd.installRemotePack(tempDir, specifier, manifest),
      Error,
      'reminders[1].scope has "frontend"',
    );
    assert.assertEquals(
      await fileExists(`${tempDir}/.eser/concerns/001-scoped.json`),
      false,
    );
  });
});
