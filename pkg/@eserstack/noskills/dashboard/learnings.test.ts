// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

import { describe, it } from "@std/testing/bdd";
import { assert, assertEquals } from "@std/assert";
import * as learnings from "./learnings.ts";
import * as persistence from "../state/persistence.ts";
import { runtime } from "@eserstack/standards/cross-runtime";

// =============================================================================
// Helpers
// =============================================================================

let tempCounter = 0;
const makeTempDir = async (): Promise<string> => {
  const base = await runtime.fs.makeTempDir();
  const dir = `${base}/noskills-learnings-test-${tempCounter++}`;
  await persistence.scaffoldEserDir(dir);
  return dir;
};

const makeLearning = (
  spec: string,
  type: learnings.LearningType,
  text: string,
  severity: "high" | "medium" | "low" = "medium",
): learnings.Learning => ({
  ts: new Date().toISOString(),
  spec,
  type,
  text,
  severity,
});

// =============================================================================
// addLearning + readLearnings
// =============================================================================

describe("addLearning + readLearnings", () => {
  it("stores learning in JSONL file", async () => {
    const root = await makeTempDir();
    await learnings.addLearning(
      root,
      makeLearning("upload", "mistake", "Assumed S3 v2, was v3"),
    );

    const all = await learnings.readLearnings(root);
    assertEquals(all.length, 1);
    assertEquals(all[0]!.spec, "upload");
    assertEquals(all[0]!.type, "mistake");
    assertEquals(all[0]!.text, "Assumed S3 v2, was v3");
  });

  it("appends multiple learnings", async () => {
    const root = await makeTempDir();
    await learnings.addLearning(
      root,
      makeLearning("upload", "mistake", "First"),
    );
    await learnings.addLearning(
      root,
      makeLearning("auth", "convention", "Second"),
    );

    const all = await learnings.readLearnings(root);
    assertEquals(all.length, 2);
  });

  it("returns empty for missing file", async () => {
    const root = await makeTempDir();
    const all = await learnings.readLearnings(root);
    assertEquals(all.length, 0);
  });

  it("survives across specs (persistent file)", async () => {
    const root = await makeTempDir();
    await learnings.addLearning(
      root,
      makeLearning("spec-1", "mistake", "From spec 1"),
    );
    await learnings.addLearning(
      root,
      makeLearning("spec-2", "success", "From spec 2"),
    );

    const all = await learnings.readLearnings(root);
    assertEquals(all.length, 2);
    assertEquals(all[0]!.spec, "spec-1");
    assertEquals(all[1]!.spec, "spec-2");
  });
});

// =============================================================================
// removeLearning
// =============================================================================

describe("removeLearning", () => {
  it("removes by index", async () => {
    const root = await makeTempDir();
    await learnings.addLearning(root, makeLearning("a", "mistake", "First"));
    await learnings.addLearning(root, makeLearning("b", "success", "Second"));
    await learnings.addLearning(root, makeLearning("c", "convention", "Third"));

    const removed = await learnings.removeLearning(root, 1); // remove "Second"
    assertEquals(removed, true);

    const all = await learnings.readLearnings(root);
    assertEquals(all.length, 2);
    assertEquals(all[0]!.text, "First");
    assertEquals(all[1]!.text, "Third");
  });

  it("returns false for out-of-range index", async () => {
    const root = await makeTempDir();
    await learnings.addLearning(root, makeLearning("a", "mistake", "Only"));

    const removed = await learnings.removeLearning(root, 5);
    assertEquals(removed, false);
  });
});

// =============================================================================
// getRelevantLearnings
// =============================================================================

describe("getRelevantLearnings", () => {
  it("returns relevant learnings based on keyword match", async () => {
    const root = await makeTempDir();
    await learnings.addLearning(
      root,
      makeLearning("upload", "mistake", "S3 SDK version was wrong", "high"),
    );
    await learnings.addLearning(
      root,
      makeLearning("auth", "convention", "Use bcrypt for passwords"),
    );

    const relevant = await learnings.getRelevantLearnings(
      root,
      "Add S3 upload feature",
    );

    // S3 learning should be more relevant
    assert(relevant.length > 0);
    assert(relevant.some((l) => l.text.includes("S3")));
  });

  it("caps at 5 learnings max", async () => {
    const root = await makeTempDir();
    for (let i = 0; i < 10; i++) {
      await learnings.addLearning(
        root,
        makeLearning(`spec-${i}`, "convention", `Learning ${i}`),
      );
    }

    const relevant = await learnings.getRelevantLearnings(root, "anything");
    assert(relevant.length <= 5);
  });

  it("prioritizes high-severity and conventions", async () => {
    const root = await makeTempDir();
    await learnings.addLearning(
      root,
      makeLearning("a", "success", "Low priority", "low"),
    );
    await learnings.addLearning(
      root,
      makeLearning("b", "mistake", "High priority", "high"),
    );

    const relevant = await learnings.getRelevantLearnings(root, "test");
    assertEquals(relevant[0]!.severity, "high");
  });
});

// =============================================================================
// formatLearnings
// =============================================================================

describe("formatLearnings", () => {
  it("formats with icons and spec source", () => {
    const formatted = learnings.formatLearnings([
      makeLearning("upload", "mistake", "Bad assumption"),
      makeLearning("auth", "success", "Good pattern"),
      makeLearning("core", "convention", "Use Result types"),
    ]);

    assertEquals(formatted.length, 3);
    assert(formatted[0]!.includes("Past mistake"));
    assert(formatted[0]!.includes("upload"));
    assert(formatted[1]!.includes("Success"));
    assert(formatted[2]!.includes("Convention"));
  });
});
