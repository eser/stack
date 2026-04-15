// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * Tests for `noskills spec <name> plan-export` command.
 *
 * Covers: wrong-phase guard (exit code 1), valid-phase write (all 5 sections).
 */

import { afterEach, beforeEach, describe, it } from "@std/testing/bdd";
import { assertEquals } from "@std/assert";
import * as crossRuntime from "@eserstack/standards/cross-runtime";
import * as results from "@eserstack/primitives/results";
import * as schema from "../state/schema.ts";
import * as machine from "../state/machine.ts";
import * as persistence from "../state/persistence.ts";
import { main } from "./plan-export.ts";

// =============================================================================
// Helpers
// =============================================================================

let tempDir: string;

const setupTempDir = async (): Promise<void> => {
  tempDir = await crossRuntime.runtime.fs.makeTempDir({
    prefix: "plan_export_test_",
  });
  await crossRuntime.runtime.fs.mkdir(
    `${tempDir}/.eser/specs/my-spec`,
    { recursive: true },
  );
  await crossRuntime.runtime.fs.mkdir(
    `${tempDir}/.eser/.state/progresses/specs`,
    { recursive: true },
  );
  crossRuntime.runtime.env.set("NOSKILLS_PROJECT_ROOT", tempDir);
};

const teardownTempDir = async (): Promise<void> => {
  crossRuntime.runtime.env.delete("NOSKILLS_PROJECT_ROOT");
  await crossRuntime.runtime.fs.remove(tempDir, { recursive: true });
};

// Build a SPEC_APPROVED state with realistic field values
const buildSpecApprovedState = (): schema.StateFile => {
  const idle = schema.createInitialState();
  const inDiscovery = machine.startSpec(
    idle,
    "my-spec",
    "spec/my-spec",
    "Build an upload feature for the dashboard",
  );
  const withAnswers: schema.StateFile = {
    ...inDiscovery,
    discovery: {
      ...inDiscovery.discovery,
      answers: [
        {
          questionId: "scope_boundary",
          answer: "No admin panel changes\nNo mobile support in this iteration",
        },
        {
          questionId: "verification",
          answer: "Run unit tests. Check upload completes without errors.",
        },
      ],
    },
    customACs: [
      {
        id: "ac-1",
        text: "Files up to 10MB upload successfully",
        user: "test",
        email: "test@example.com",
        timestamp: new Date().toISOString(),
        addedInPhase: "SPEC_APPROVED",
      },
    ],
  };
  const inReview = machine.completeDiscovery(withAnswers);
  const inProposal = machine.approveDiscoveryReview(inReview);
  return machine.approveSpec(inProposal);
};

const SPEC_MD_CONTENT = `# Spec: my-spec

## Status
approved

## Summary
Build upload feature.

## Tasks
- [ ] task-1: Implement upload component
- [ ] task-2: Write unit tests

## Out of Scope
placeholder

## Verification
placeholder
`;

// =============================================================================
// Wrong phase guard
// =============================================================================

describe({
  name: "noskills plan-export: wrong phase",
  sanitizeOps: false,
  sanitizeResources: false,
  fn: () => {
    beforeEach(async () => {
      await setupTempDir();
    });

    afterEach(async () => {
      await teardownTempDir();
    });

    it("returns exit code 1 and message contains 'SPEC_PROPOSAL' when phase is DISCOVERY", async () => {
      const discState = machine.startSpec(
        schema.createInitialState(),
        "my-spec",
        "spec/my-spec",
        "A spec",
      );
      await persistence.writeSpecState(tempDir, "my-spec", discState);

      // Capture console.error output
      const errors: string[] = [];
      const origError = console.error;
      console.error = (...args: unknown[]) => errors.push(String(args[0]));

      try {
        const result = await main(["--spec=my-spec"]);

        assertEquals(results.isFail(result), true);
        if (results.isFail(result)) {
          assertEquals(result.error.exitCode, 1);
        }
        assertEquals(
          errors.some((e) => e.includes("SPEC_PROPOSAL")),
          true,
        );
      } finally {
        console.error = origError;
      }
    });
  },
});

// =============================================================================
// Valid phase — writes .claude/plan.md with all 5 sections
// =============================================================================

describe({
  name: "noskills plan-export: valid phase",
  sanitizeOps: false,
  sanitizeResources: false,
  fn: () => {
    beforeEach(async () => {
      await setupTempDir();
    });

    afterEach(async () => {
      await teardownTempDir();
    });

    it("SPEC_APPROVED writes .claude/plan.md with all 5 section headers", async () => {
      const state = buildSpecApprovedState();
      await persistence.writeSpecState(tempDir, "my-spec", state);

      // Write a minimal spec.md for task parsing
      await crossRuntime.runtime.fs.writeTextFile(
        `${tempDir}/.eser/specs/my-spec/spec.md`,
        SPEC_MD_CONTENT,
      );

      const result = await main(["--spec=my-spec"]);

      assertEquals(results.isOk(result), true);

      // Verify output file exists
      const planPath = `${tempDir}/.claude/plan.md`;
      const content = await crossRuntime.runtime.fs.readTextFile(planPath);

      assertEquals(content.includes("## Summary"), true);
      assertEquals(content.includes("## Tasks"), true);
      assertEquals(content.includes("## Acceptance Criteria"), true);
      assertEquals(content.includes("## Out of Scope"), true);
      assertEquals(content.includes("## Verification"), true);

      // Verify field values
      assertEquals(
        content.includes("Build an upload feature for the dashboard"),
        true,
      );
      assertEquals(
        content.includes("Files up to 10MB upload successfully"),
        true,
      );
      assertEquals(
        content.includes("No admin panel changes"),
        true,
      );
      assertEquals(
        content.includes("Run unit tests"),
        true,
      );

      // Tasks rendered as checkboxes
      assertEquals(content.includes("- [ ] Implement upload component"), true);
      assertEquals(content.includes("- [ ] Write unit tests"), true);

      // Header includes spec name
      assertEquals(content.includes("# Plan: my-spec"), true);
    });
  },
});
