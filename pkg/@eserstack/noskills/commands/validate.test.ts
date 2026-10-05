// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * Tests for `noskills validate` command.
 *
 * Covers: module exports, missing spec-name error path, and exit code 0/1
 * based on spec completeness via a real temp-dir fixture.
 */

import * as bdd from "@std/testing/bdd";
import * as assert from "@std/assert";
import * as crossRuntime from "@eserstack/standards/cross-runtime";
import * as results from "@eserstack/primitives/results";
import * as schema from "../state/schema.ts";
import * as machine from "../state/machine.ts";
import * as persistence from "../state/persistence.ts";
import * as validate from "./validate.ts";

// =============================================================================
// Module structure
// =============================================================================

bdd.describe("noskills validate: module structure", () => {
  bdd.it("exports main as a function", () => {
    assert.assertEquals(typeof validate.main, "function");
  });
});

// =============================================================================
// Missing spec-name argument
// =============================================================================

bdd.describe({
  name: "noskills validate: no spec name",
  sanitizeOps: false,
  sanitizeResources: false,
  fn: () => {
    bdd.it("returns exit code 1 when no spec name provided", async () => {
      const result = await validate.main([]);
      assert.assertEquals(results.isFail(result), true);
      if (results.isFail(result)) {
        assert.assertEquals(result.error.exitCode, 1);
      }
    });
  },
});

// =============================================================================
// Completeness via real temp-dir fixture
// =============================================================================

let tempDir: string;

bdd.describe({
  name: "noskills validate: completeness checks",
  sanitizeOps: false,
  sanitizeResources: false,
  fn: () => {
    bdd.beforeEach(async () => {
      tempDir = await crossRuntime.runtime.fs.makeTempDir({
        prefix: "validate_test_",
      });
      await crossRuntime.runtime.fs.mkdir(
        `${tempDir}/.eser/.state/progresses/specs/my-spec`,
        { recursive: true },
      );
    });

    bdd.afterEach(async () => {
      await crossRuntime.runtime.fs.remove(tempDir, { recursive: true });
    });

    bdd.it(
      "returns exit code 0 when all visible sections are filled",
      async () => {
        const base = schema.createInitialState();
        const started = machine.startSpec(base, "my-spec", "spec/my-spec");
        const withFilledPlaceholders: schema.StateFile = {
          ...started,
          specState: {
            path: "spec/my-spec",
            status: "draft",
            metadata: schema.EMPTY_SPEC_METADATA,
            placeholders: [
              {
                sectionId: "summary",
                sectionTitle: "Summary",
                status: "filled",
              },
              {
                sectionId: "problem-statement",
                sectionTitle: "Problem Statement",
                status: "filled",
              },
            ],
          },
        };
        await persistence.writeSpecState(
          tempDir,
          "my-spec",
          withFilledPlaceholders,
        );

        const result = await validate.main(["my-spec"], tempDir);
        assert.assertEquals(results.isOk(result), true);
      },
    );

    bdd.it("returns exit code 1 when a placeholder remains", async () => {
      const base = schema.createInitialState();
      const started = machine.startSpec(base, "my-spec", "spec/my-spec");
      const withUnresolved: schema.StateFile = {
        ...started,
        specState: {
          path: "spec/my-spec",
          status: "draft",
          metadata: schema.EMPTY_SPEC_METADATA,
          placeholders: [
            {
              sectionId: "summary",
              sectionTitle: "Summary",
              status: "placeholder",
            },
          ],
        },
      };
      await persistence.writeSpecState(tempDir, "my-spec", withUnresolved);

      const result = await validate.main(["my-spec"], tempDir);
      assert.assertEquals(results.isFail(result), true);
      if (results.isFail(result)) {
        assert.assertEquals(result.error.exitCode, 1);
      }
    });

    bdd.it("returns exit code 1 when a pending decision exists", async () => {
      const base = schema.createInitialState();
      const started = machine.startSpec(base, "my-spec", "spec/my-spec");
      const withDecision: schema.StateFile = {
        ...started,
        specState: {
          path: "spec/my-spec",
          status: "draft",
          metadata: {
            ...schema.EMPTY_SPEC_METADATA,
            pendingDecisions: [
              {
                section: "auth",
                question: "Which provider?",
                waitingFor: ["@alice"],
              },
            ],
          },
          placeholders: [
            { sectionId: "summary", sectionTitle: "Summary", status: "filled" },
          ],
        },
      };
      await persistence.writeSpecState(tempDir, "my-spec", withDecision);

      const result = await validate.main(["my-spec"], tempDir);
      assert.assertEquals(results.isFail(result), true);
    });
  },
});
