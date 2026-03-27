// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

import { describe, it } from "@std/testing/bdd";
import { assertEquals } from "@std/assert";
import * as template from "./template.ts";
import type * as schema from "../state/schema.ts";
import { loadDefaultConcerns } from "../context/concerns.ts";

// =============================================================================
// Helpers
// =============================================================================

const allConcerns = await loadDefaultConcerns();
const openSource = allConcerns.find((c) => c.id === "open-source")!;
const beautiful = allConcerns.find((c) => c.id === "beautiful-product")!;

const sampleAnswers: readonly schema.DiscoveryAnswer[] = [
  { questionId: "status_quo", answer: "Users manually upload files" },
  {
    questionId: "ambition",
    answer: "1-star: basic upload. 10-star: smart listing",
  },
  {
    questionId: "verification",
    answer: "Unit tests + e2e test of upload flow",
  },
];

const sampleDecisions: readonly schema.Decision[] = [
  {
    id: "d1",
    question: "Which storage backend?",
    choice: "S3",
    promoted: false,
    timestamp: "2026-03-27T10:00:00Z",
  },
  {
    id: "d2",
    question: "Auth method?",
    choice: "OAuth2",
    promoted: true,
    timestamp: "2026-03-27T10:05:00Z",
  },
];

// =============================================================================
// renderSpec
// =============================================================================

describe("renderSpec", () => {
  it("includes spec name as heading", () => {
    const md = template.renderSpec("photo-upload", [], [], []);

    assertEquals(md.includes("# Spec: photo-upload"), true);
  });

  it("includes all discovery answers under their questionIds", () => {
    const md = template.renderSpec("test", sampleAnswers, [], []);

    assertEquals(md.includes("### status_quo"), true);
    assertEquals(md.includes("Users manually upload files"), true);
    assertEquals(md.includes("### ambition"), true);
    assertEquals(md.includes("### verification"), true);
  });

  it("includes concern-specific sections", () => {
    const md = template.renderSpec("test", [], [openSource], []);

    assertEquals(md.includes("## Contributor Guide (open-source)"), true);
    assertEquals(md.includes("## Public API Surface (open-source)"), true);
  });

  it("includes multiple concern sections when stacked", () => {
    const md = template.renderSpec("test", [], [openSource, beautiful], []);

    assertEquals(md.includes("(open-source)"), true);
    assertEquals(md.includes("(beautiful-product)"), true);
    assertEquals(md.includes("## Design States"), true);
  });

  it("includes decisions table when decisions exist", () => {
    const md = template.renderSpec("test", [], [], sampleDecisions);

    assertEquals(md.includes("## Decisions"), true);
    assertEquals(md.includes("Which storage backend?"), true);
    assertEquals(md.includes("S3"), true);
    assertEquals(md.includes("OAuth2"), true);
    assertEquals(md.includes("| yes |"), true);
    assertEquals(md.includes("| no |"), true);
  });

  it("omits decisions section when empty", () => {
    const md = template.renderSpec("test", [], [], []);

    assertEquals(md.includes("## Decisions"), false);
  });

  it("includes status as draft", () => {
    const md = template.renderSpec("test", [], [], []);

    assertEquals(md.includes("## Status: draft"), true);
  });
});
