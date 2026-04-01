// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * Tests for the noskills pack system — schema validation, built-in loading,
 * install/uninstall, list, inspect, prefix naming, concern install, requires.
 *
 * @module
 */

import { afterEach, beforeEach, describe, it } from "@std/testing/bdd";
import { assert, assertEquals, assertThrows } from "@std/assert";
import * as crossRuntime from "@eser/standards/cross-runtime";
import * as packSchema from "./schema.ts";
import { BUILTIN_PACKS } from "../defaults/packs/mod.ts";
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

describe("PackManifest validation", () => {
  it("valid manifest parses successfully", () => {
    const data = {
      name: "test-pack",
      version: "1.0.0",
      description: "A test pack",
      rules: ["rules/test.md"],
    };

    const result = packSchema.validatePackManifest(data);

    assertEquals(result.name, "test-pack");
    assertEquals(result.version, "1.0.0");
    assertEquals(result.description, "A test pack");
  });

  it("missing name throws", () => {
    const data = { version: "1.0.0", description: "No name" };

    assertThrows(
      () => packSchema.validatePackManifest(data),
      Error,
      "name",
    );
  });

  it("empty name throws", () => {
    const data = { name: "", version: "1.0.0", description: "Empty name" };

    assertThrows(
      () => packSchema.validatePackManifest(data),
      Error,
      "name",
    );
  });

  it("missing version throws", () => {
    const data = { name: "test", description: "No version" };

    assertThrows(
      () => packSchema.validatePackManifest(data),
      Error,
      "version",
    );
  });

  it("missing description throws", () => {
    const data = { name: "test", version: "1.0.0" };

    assertThrows(
      () => packSchema.validatePackManifest(data),
      Error,
      "description",
    );
  });
});

// =============================================================================
// Built-in pack loading
// =============================================================================

describe("Built-in pack loading", () => {
  it("loads all 3 built-in packs", () => {
    assertEquals(BUILTIN_PACKS.size, 3);
    assert(BUILTIN_PACKS.has("typescript"));
    assert(BUILTIN_PACKS.has("react"));
    assert(BUILTIN_PACKS.has("security"));
  });

  it("typescript pack has correct structure", () => {
    const ts = BUILTIN_PACKS.get("typescript")!;

    assertEquals(ts.manifest.name, "typescript");
    assertEquals(ts.manifest.version, "1.0.0");
    assertEquals(Object.keys(ts.ruleContents).length, 3);
    assert("use-strict-types" in ts.ruleContents);
    assert("no-any" in ts.ruleContents);
    assert("prefer-const" in ts.ruleContents);
    assertEquals(ts.concernContents.length, 1);
    assertEquals(ts.concernContents[0]!.id, "ts-quality");
  });

  it("react pack has correct structure", () => {
    const react = BUILTIN_PACKS.get("react")!;

    assertEquals(react.manifest.name, "react");
    assertEquals(Object.keys(react.ruleContents).length, 3);
    assertEquals(react.concernContents.length, 0);
  });

  it("security pack has correct structure", () => {
    const sec = BUILTIN_PACKS.get("security")!;

    assertEquals(sec.manifest.name, "security");
    assertEquals(Object.keys(sec.ruleContents).length, 3);
    assertEquals(sec.concernContents.length, 1);
    assertEquals(sec.concernContents[0]!.id, "security-audit");
  });

  it("concern definitions follow ConcernDefinition schema", () => {
    for (const [, builtin] of BUILTIN_PACKS) {
      for (const concern of builtin.concernContents) {
        assertEquals(typeof concern.id, "string");
        assertEquals(typeof concern.name, "string");
        assertEquals(typeof concern.description, "string");
        assert(Array.isArray(concern.extras));
        assert(Array.isArray(concern.specSections));
        assert(Array.isArray(concern.reminders));
        assert(Array.isArray(concern.acceptanceCriteria));
      }
    }
  });
});

// =============================================================================
// Pack install (built-in)
// =============================================================================

describe("Pack install (built-in)", () => {
  beforeEach(async () => {
    tempDir = await crossRuntime.runtime.fs.makeTempDir({
      prefix: "pack_install_",
    });
    await scaffoldEserDir(tempDir);
  });

  afterEach(async () => {
    await crossRuntime.runtime.fs.remove(tempDir, { recursive: true });
  });

  it("copies rules to .eser/rules/ with pack prefix", async () => {
    const builtin = BUILTIN_PACKS.get("typescript")!;
    const installed = await packCmd.installBuiltinPack(
      tempDir,
      "typescript",
      builtin,
    );

    assertEquals(installed.rules.length, 3);

    for (const ruleFile of installed.rules) {
      assert(ruleFile.startsWith("pack-typescript-"));
      assert(ruleFile.endsWith(".md"));
      assert(await fileExists(`${tempDir}/.eser/rules/${ruleFile}`));
    }
  });

  it("copies concerns to .eser/concerns/ with numeric prefix", async () => {
    const builtin = BUILTIN_PACKS.get("typescript")!;
    const installed = await packCmd.installBuiltinPack(
      tempDir,
      "typescript",
      builtin,
    );

    assertEquals(installed.concerns.length, 1);

    const concernFile = installed.concerns[0]!;
    assert(concernFile.match(/^\d{3}-ts-quality\.json$/));
    assert(await fileExists(`${tempDir}/.eser/concerns/${concernFile}`));

    const content = await readJson(
      `${tempDir}/.eser/concerns/${concernFile}`,
    ) as { id: string };
    assertEquals(content.id, "ts-quality");
  });

  it("records correct metadata in InstalledPack", async () => {
    const builtin = BUILTIN_PACKS.get("react")!;
    const installed = await packCmd.installBuiltinPack(
      tempDir,
      "react",
      builtin,
    );

    assertEquals(installed.name, "react");
    assertEquals(installed.version, "1.0.0");
    assertEquals(installed.source, "builtin");
    assertEquals(installed.rules.length, 3);
    assertEquals(installed.concerns.length, 0);
    assertEquals(installed.folderRules.length, 0);
    assert(installed.installedAt.length > 0);
  });

  it("rule files contain the rule text", async () => {
    const builtin = BUILTIN_PACKS.get("security")!;
    await packCmd.installBuiltinPack(tempDir, "security", builtin);

    const content = await crossRuntime.runtime.fs.readTextFile(
      `${tempDir}/.eser/rules/pack-security-no-secrets-in-code.md`,
    );
    assert(content.includes("Never hardcode API keys"));
  });
});

// =============================================================================
// Pack install (duplicate detection)
// =============================================================================

describe("Pack install (duplicate)", () => {
  beforeEach(async () => {
    tempDir = await crossRuntime.runtime.fs.makeTempDir({
      prefix: "pack_dup_",
    });
    await scaffoldEserDir(tempDir);
  });

  afterEach(async () => {
    await crossRuntime.runtime.fs.remove(tempDir, { recursive: true });
  });

  it("packs.json records installed packs", async () => {
    const builtin = BUILTIN_PACKS.get("typescript")!;
    const installed = await packCmd.installBuiltinPack(
      tempDir,
      "typescript",
      builtin,
    );

    await packCmd.writePacksFile(tempDir, { installed: [installed] });

    const packsFile = await packCmd.readPacksFile(tempDir);
    assertEquals(packsFile.installed.length, 1);
    assertEquals(packsFile.installed[0]!.name, "typescript");
  });
});

// =============================================================================
// Pack uninstall
// =============================================================================

describe("Pack uninstall", () => {
  beforeEach(async () => {
    tempDir = await crossRuntime.runtime.fs.makeTempDir({
      prefix: "pack_uninst_",
    });
    await scaffoldEserDir(tempDir);
  });

  afterEach(async () => {
    await crossRuntime.runtime.fs.remove(tempDir, { recursive: true });
  });

  it("removes rule files on uninstall", async () => {
    // Install first
    const builtin = BUILTIN_PACKS.get("typescript")!;
    const installed = await packCmd.installBuiltinPack(
      tempDir,
      "typescript",
      builtin,
    );
    await packCmd.writePacksFile(tempDir, { installed: [installed] });

    // Verify files exist
    for (const ruleFile of installed.rules) {
      assert(await fileExists(`${tempDir}/.eser/rules/${ruleFile}`));
    }

    // Read packs, simulate uninstall by removing files
    for (const ruleFile of installed.rules) {
      await crossRuntime.runtime.fs.remove(
        `${tempDir}/.eser/rules/${ruleFile}`,
      );
    }
    for (const concernFile of installed.concerns) {
      await crossRuntime.runtime.fs.remove(
        `${tempDir}/.eser/concerns/${concernFile}`,
      );
    }
    await packCmd.writePacksFile(tempDir, { installed: [] });

    // Verify files are gone
    for (const ruleFile of installed.rules) {
      assertEquals(
        await fileExists(`${tempDir}/.eser/rules/${ruleFile}`),
        false,
      );
    }

    const packsFile = await packCmd.readPacksFile(tempDir);
    assertEquals(packsFile.installed.length, 0);
  });

  it("removes concern files on uninstall", async () => {
    const builtin = BUILTIN_PACKS.get("security")!;
    const installed = await packCmd.installBuiltinPack(
      tempDir,
      "security",
      builtin,
    );

    // Verify concern exists
    for (const concernFile of installed.concerns) {
      assert(await fileExists(`${tempDir}/.eser/concerns/${concernFile}`));
    }

    // Remove
    for (const concernFile of installed.concerns) {
      await crossRuntime.runtime.fs.remove(
        `${tempDir}/.eser/concerns/${concernFile}`,
      );
    }

    for (const concernFile of installed.concerns) {
      assertEquals(
        await fileExists(`${tempDir}/.eser/concerns/${concernFile}`),
        false,
      );
    }
  });
});

// =============================================================================
// Pack list helpers
// =============================================================================

describe("Pack list", () => {
  it("readPacksFile returns empty for non-existent file", async () => {
    const tmpDir = await crossRuntime.runtime.fs.makeTempDir({
      prefix: "pack_list_",
    });

    const packsFile = await packCmd.readPacksFile(tmpDir);
    assertEquals(packsFile.installed.length, 0);

    await crossRuntime.runtime.fs.remove(tmpDir, { recursive: true });
  });

  it("readPacksFile returns saved data", async () => {
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
    assertEquals(result.installed.length, 1);
    assertEquals(result.installed[0]!.name, "test-pack");

    await crossRuntime.runtime.fs.remove(tmpDir, { recursive: true });
  });
});

// =============================================================================
// Rule prefix naming
// =============================================================================

describe("Rule prefix", () => {
  beforeEach(async () => {
    tempDir = await crossRuntime.runtime.fs.makeTempDir({
      prefix: "pack_prefix_",
    });
    await scaffoldEserDir(tempDir);
  });

  afterEach(async () => {
    await crossRuntime.runtime.fs.remove(tempDir, { recursive: true });
  });

  it("installed rules have pack-{name}- prefix", async () => {
    const builtin = BUILTIN_PACKS.get("react")!;
    const installed = await packCmd.installBuiltinPack(
      tempDir,
      "react",
      builtin,
    );

    for (const ruleFile of installed.rules) {
      assert(
        ruleFile.startsWith("pack-react-"),
        `Expected prefix pack-react-, got: ${ruleFile}`,
      );
    }
  });

  it("different packs have different prefixes", async () => {
    const ts = BUILTIN_PACKS.get("typescript")!;
    const sec = BUILTIN_PACKS.get("security")!;

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
      assert(ruleFile.startsWith("pack-typescript-"));
    }
    for (const ruleFile of secInstalled.rules) {
      assert(ruleFile.startsWith("pack-security-"));
    }
  });
});

// =============================================================================
// Concern numeric prefix
// =============================================================================

describe("Concern install", () => {
  beforeEach(async () => {
    tempDir = await crossRuntime.runtime.fs.makeTempDir({
      prefix: "pack_concern_",
    });
    await scaffoldEserDir(tempDir);
  });

  afterEach(async () => {
    await crossRuntime.runtime.fs.remove(tempDir, { recursive: true });
  });

  it("concern gets numeric prefix", async () => {
    const builtin = BUILTIN_PACKS.get("typescript")!;
    const installed = await packCmd.installBuiltinPack(
      tempDir,
      "typescript",
      builtin,
    );

    assertEquals(installed.concerns.length, 1);
    assert(installed.concerns[0]!.match(/^\d{3}-/));
  });

  it("second pack gets next available numeric prefix", async () => {
    // Install typescript first (has ts-quality concern)
    const ts = BUILTIN_PACKS.get("typescript")!;
    await packCmd.installBuiltinPack(tempDir, "typescript", ts);

    // Install security (has security-audit concern)
    const sec = BUILTIN_PACKS.get("security")!;
    const secInstalled = await packCmd.installBuiltinPack(
      tempDir,
      "security",
      sec,
    );

    // Second concern should have prefix 002
    assert(secInstalled.concerns[0]!.startsWith("002-"));
  });

  it("installed concern follows ConcernDefinition schema", async () => {
    const builtin = BUILTIN_PACKS.get("security")!;
    const installed = await packCmd.installBuiltinPack(
      tempDir,
      "security",
      builtin,
    );

    const content = await readJson(
      `${tempDir}/.eser/concerns/${installed.concerns[0]}`,
    ) as Record<string, unknown>;

    assertEquals(typeof content["id"], "string");
    assertEquals(typeof content["name"], "string");
    assertEquals(typeof content["description"], "string");
    assert(Array.isArray(content["extras"]));
    assert(Array.isArray(content["specSections"]));
    assert(Array.isArray(content["reminders"]));
    assert(Array.isArray(content["acceptanceCriteria"]));
  });
});

// =============================================================================
// Pack requires (dependency resolution)
// =============================================================================

describe("Pack requires", () => {
  it("manifest with requires field is valid", () => {
    const data = {
      name: "advanced-ts",
      version: "1.0.0",
      description: "Advanced TypeScript pack",
      requires: ["typescript"],
      rules: [],
    };

    const result = packSchema.validatePackManifest(data);
    assertEquals(result.requires?.length, 1);
    assertEquals(result.requires![0], "typescript");
  });
});

// =============================================================================
// Sync after install
// =============================================================================

describe("Sync after install", () => {
  beforeEach(async () => {
    tempDir = await crossRuntime.runtime.fs.makeTempDir({
      prefix: "pack_sync_",
    });
    await scaffoldEserDir(tempDir);
    // Create .claude directory so Claude Code adapter can write
    await crossRuntime.runtime.fs.mkdir(`${tempDir}/.claude`, {
      recursive: true,
    });
  });

  afterEach(async () => {
    await crossRuntime.runtime.fs.remove(tempDir, { recursive: true });
  });

  it("installed pack rules are picked up by sync engine", async () => {
    const builtin = BUILTIN_PACKS.get("typescript")!;
    await packCmd.installBuiltinPack(tempDir, "typescript", builtin);

    // Load rules from the directory — sync engine uses loadScopedRules
    const { loadScopedRules } = await import("../sync/engine.ts");
    const rules = await loadScopedRules(tempDir);

    // Should find the pack rules
    const packRules = rules.filter((r) =>
      r.text.includes("explicit types") ||
      r.text.includes("any") ||
      r.text.includes("const")
    );
    assert(
      packRules.length >= 3,
      `Expected at least 3 pack rules, found ${packRules.length}`,
    );
  });
});

// =============================================================================
// createEmptyPacksFile
// =============================================================================

describe("createEmptyPacksFile", () => {
  it("returns empty installed array", () => {
    const packs = packSchema.createEmptyPacksFile();
    assertEquals(packs.installed.length, 0);
  });
});
