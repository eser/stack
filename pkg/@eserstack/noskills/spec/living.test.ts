// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * Unit tests for spec/living.ts — pure function coverage.
 *
 * Covers: initial spec generation, section merging, TOC rendering, N/A reasoning,
 * classification-driven visibility, completeness checks, and frontmatter round-trips.
 * Disk I/O functions (applyAnswerToFile, applyNaToFile) are not tested here.
 */

import { describe, it } from "@std/testing/bdd";
import { assertEquals, assertThrows } from "@std/assert";
import * as schema from "../state/schema.ts";
import * as living from "./living.ts";

// =============================================================================
// Test fixtures
// =============================================================================

const openSourceConcern: schema.ConcernDefinition = {
  id: "open-source",
  name: "Open Source",
  description: "Open source project",
  extras: [],
  specSections: [
    {
      id: "contributor-guide",
      title: "Contributor Guide",
      placeholder: "_Contributor guidelines placeholder_",
      condition: null,
      position: "after:acceptance-criteria",
    },
  ],
  reminders: [],
  acceptanceCriteria: ["Accept contributions"],
};

const beautifulProductConcern: schema.ConcernDefinition = {
  id: "beautiful-product",
  name: "Beautiful Product",
  description: "UI excellence",
  extras: [],
  specSections: [
    {
      id: "design-states",
      title: "Design States",
      placeholder: "_Design states placeholder_",
      condition: "involvesWebUI",
      position: "after:acceptance-criteria",
    },
  ],
  reminders: [],
  acceptanceCriteria: ["Consistent design"],
};

const legacyConcern: schema.ConcernDefinition = {
  id: "legacy",
  name: "Legacy Concern",
  description: "Old string[] format",
  extras: [],
  specSections: ["Legacy Section Title"],
  reminders: [],
  acceptanceCriteria: ["Legacy criterion"],
};

const now = new Date("2026-04-06T00:00:00Z");
const creator = { name: "Alice", email: "alice@example.com" };

const allFalseClassification: schema.SpecClassification = {
  involvesWebUI: false,
  involvesCLI: false,
  involvesPublicAPI: false,
  involvesMigration: false,
  involvesDataHandling: false,
};

const uiClassification: schema.SpecClassification = {
  involvesWebUI: true,
  involvesCLI: false,
  involvesPublicAPI: false,
  involvesMigration: false,
  involvesDataHandling: false,
};

// =============================================================================
// mergeSections
// =============================================================================

describe("mergeSections", () => {
  it("returns base sections when no concerns provided", () => {
    const sections = living.mergeSections([]);
    const ids = sections.map((s) => s.id);
    // Base sections always present
    assertEquals(ids.includes("summary"), true);
    assertEquals(ids.includes("problem-statement"), true);
    assertEquals(ids.includes("acceptance-criteria"), true);
    assertEquals(sections.length, living.BASE_SECTIONS.length);
  });

  it("concern sections appear after their anchor", () => {
    const sections = living.mergeSections([openSourceConcern]);
    const acIdx = sections.findIndex((s) => s.id === "acceptance-criteria");
    const guideIdx = sections.findIndex((s) => s.id === "contributor-guide");
    assertEquals(guideIdx > acIdx, true);
  });

  it("concern with no specSections does not add sections", () => {
    const bare: schema.ConcernDefinition = {
      ...openSourceConcern,
      id: "bare",
      specSections: [],
    };
    const sections = living.mergeSections([bare]);
    assertEquals(sections.length, living.BASE_SECTIONS.length);
  });

  it("legacy string[] sections are auto-migrated with synthetic ids", () => {
    const sections = living.mergeSections([legacyConcern]);
    const legacySection = sections.find((s) =>
      s.id.startsWith("legacy-") && s.id.includes("legacy-section-title")
    );
    assertEquals(legacySection !== undefined, true);
    assertEquals(legacySection?.title, "Legacy Section Title");
    assertEquals(legacySection?.condition, null);
  });

  it("section ordering: anchor:scope-boundary positions before acceptance-criteria", () => {
    const scopeConcern: schema.ConcernDefinition = {
      id: "scope-concern",
      name: "Scope Concern",
      description: "test",
      extras: [],
      specSections: [
        {
          id: "scope-extra",
          title: "Scope Extra",
          placeholder: "_placeholder_",
          condition: null,
          position: "after:scope-boundary",
        },
      ],
      reminders: [],
      acceptanceCriteria: ["ok"],
    };
    const sections = living.mergeSections([scopeConcern]);
    const scopeIdx = sections.findIndex((s) => s.id === "scope-boundary");
    const extraIdx = sections.findIndex((s) => s.id === "scope-extra");
    const acIdx = sections.findIndex((s) => s.id === "acceptance-criteria");
    assertEquals(extraIdx > scopeIdx, true);
    assertEquals(extraIdx < acIdx, true);
  });

  it("unknown anchor falls back to after:acceptance-criteria", () => {
    const badAnchorConcern: schema.ConcernDefinition = {
      id: "bad-anchor",
      name: "Bad Anchor",
      description: "test",
      extras: [],
      specSections: [
        {
          id: "orphan-section",
          title: "Orphan",
          placeholder: "_placeholder_",
          condition: null,
          position: "after:nonexistent-section",
        },
      ],
      reminders: [],
      acceptanceCriteria: ["ok"],
    };
    const sections = living.mergeSections([badAnchorConcern]);
    const acIdx = sections.findIndex((s) => s.id === "acceptance-criteria");
    const orphanIdx = sections.findIndex((s) => s.id === "orphan-section");
    assertEquals(orphanIdx > acIdx, true);
  });
});

// =============================================================================
// generateInitialSpec
// =============================================================================

describe("generateInitialSpec", () => {
  it("base + concern sections appear with placeholder markers", () => {
    const { content, placeholders } = living.generateInitialSpec({
      specName: "my-feature",
      activeConcerns: [openSourceConcern],
      classification: null,
      creator,
      now,
    });
    assertEquals(content.includes("# Spec: my-feature"), true);
    assertEquals(content.includes("## Summary"), true);
    assertEquals(content.includes("## Contributor Guide"), true);
    assertEquals(content.includes("<!-- PLACEHOLDER:summary -->"), true);
    assertEquals(
      content.includes("<!-- PLACEHOLDER:contributor-guide -->"),
      true,
    );
    assertEquals(placeholders.some((p) => p.sectionId === "summary"), true);
    assertEquals(
      placeholders.find((p) => p.sectionId === "summary")?.status,
      "placeholder",
    );
  });

  it("conditional sections start conditional-hidden when classification is null", () => {
    const { content, placeholders } = living.generateInitialSpec({
      specName: "feature",
      activeConcerns: [beautifulProductConcern],
      classification: null,
      creator,
      now,
    });
    const designStates = placeholders.find((p) =>
      p.sectionId === "design-states"
    );
    assertEquals(designStates?.status, "conditional-hidden");
    // Marker should NOT be in the document body
    assertEquals(content.includes("<!-- PLACEHOLDER:design-states -->"), false);
  });

  it("conditional sections start placeholder when classification flag is true", () => {
    const { content, placeholders } = living.generateInitialSpec({
      specName: "ui-feature",
      activeConcerns: [beautifulProductConcern],
      classification: uiClassification,
      creator,
      now,
    });
    const designStates = placeholders.find((p) =>
      p.sectionId === "design-states"
    );
    assertEquals(designStates?.status, "placeholder");
    assertEquals(content.includes("<!-- PLACEHOLDER:design-states -->"), true);
  });

  it("metadata.created is set to creator + now", () => {
    const { metadata } = living.generateInitialSpec({
      specName: "feature",
      activeConcerns: [],
      classification: null,
      creator,
      now,
    });
    assertEquals(metadata.created.user, "Alice");
    assertEquals(metadata.created.date, now.toISOString());
    assertEquals(metadata.contributors.length, 1);
    assertEquals(metadata.contributors[0]?.user, "Alice");
  });

  it("content includes YAML frontmatter", () => {
    const { content } = living.generateInitialSpec({
      specName: "feature",
      activeConcerns: [],
      classification: null,
      creator,
      now,
    });
    assertEquals(content.startsWith("---"), true);
    assertEquals(content.includes("created:"), true);
  });

  it("TOC block is included with placeholder symbols", () => {
    const { content } = living.generateInitialSpec({
      specName: "feature",
      activeConcerns: [],
      classification: null,
      creator,
      now,
    });
    assertEquals(content.includes("<!-- TOC:START -->"), true);
    assertEquals(content.includes("<!-- TOC:END -->"), true);
    assertEquals(content.includes("○ Summary"), true);
  });
});

// =============================================================================
// renderTOC
// =============================================================================

describe("renderTOC", () => {
  const basePlaceholders: schema.PlaceholderStatus[] = [
    { sectionId: "summary", sectionTitle: "Summary", status: "filled" },
    {
      sectionId: "problem-statement",
      sectionTitle: "Problem Statement",
      status: "placeholder",
    },
    {
      sectionId: "scope-boundary",
      sectionTitle: "Scope Boundary",
      status: "na",
      naReason: "pure refactor with no new scope",
    },
    {
      sectionId: "design-states",
      sectionTitle: "Design States",
      status: "conditional-hidden",
    },
  ];

  it("uses correct symbols for each status", () => {
    const toc = living.renderTOC(basePlaceholders);
    assertEquals(toc.includes("✓ Summary"), true);
    assertEquals(toc.includes("○ Problem Statement"), true);
    assertEquals(toc.includes("— Scope Boundary"), true);
    assertEquals(toc.includes("⊘ Design States"), true);
  });

  it("includes N/A reason inline", () => {
    const toc = living.renderTOC(basePlaceholders);
    assertEquals(toc.includes("pure refactor with no new scope"), true);
  });

  it("is wrapped in TOC markers", () => {
    const toc = living.renderTOC(basePlaceholders);
    assertEquals(toc.startsWith("<!-- TOC:START -->"), true);
    assertEquals(toc.endsWith("<!-- TOC:END -->"), true);
  });
});

// =============================================================================
// replaceTOCBlock
// =============================================================================

describe("replaceTOCBlock", () => {
  it("replaces TOC region atomically", () => {
    const content =
      "before\n<!-- TOC:START -->\n## Sections\n- ○ Old\n<!-- TOC:END -->\nafter";
    const placeholders: schema.PlaceholderStatus[] = [
      { sectionId: "summary", sectionTitle: "Summary", status: "filled" },
    ];
    const updated = living.replaceTOCBlock(content, placeholders);
    assertEquals(updated.includes("○ Old"), false);
    assertEquals(updated.includes("✓ Summary"), true);
    assertEquals(updated.includes("before"), true);
    assertEquals(updated.includes("after"), true);
  });

  it("is idempotent — re-running with same placeholders yields same result", () => {
    const content =
      "<!-- TOC:START -->\n## Sections\n- ○ Summary\n<!-- TOC:END -->";
    const placeholders: schema.PlaceholderStatus[] = [
      { sectionId: "summary", sectionTitle: "Summary", status: "placeholder" },
    ];
    const once = living.replaceTOCBlock(content, placeholders);
    const twice = living.replaceTOCBlock(once, placeholders);
    assertEquals(once, twice);
  });

  it("gracefully skips when no TOC block is found", () => {
    const content = "# Spec: foo\n\n## Summary";
    const result = living.replaceTOCBlock(content, []);
    assertEquals(result, content);
  });
});

// =============================================================================
// replacePlaceholderMarker
// =============================================================================

describe("replacePlaceholderMarker", () => {
  it("replaces marker with body text", () => {
    const content =
      "## Summary\n\n<!-- PLACEHOLDER:summary -->\n_placeholder text_";
    const result = living.replacePlaceholderMarker(
      content,
      "summary",
      "The new body",
    );
    assertEquals(result.includes("<!-- PLACEHOLDER:summary -->"), false);
    assertEquals(result.includes("The new body"), true);
  });

  it("throws when marker not found", () => {
    const content = "## Summary\n\nAlready filled content";
    assertThrows(
      () => living.replacePlaceholderMarker(content, "summary", "body"),
      Error,
      "Placeholder marker not found",
    );
  });
});

// =============================================================================
// markPlaceholderNa (Expansion B)
// =============================================================================

describe("markPlaceholderNa", () => {
  const initial: readonly schema.PlaceholderStatus[] = [
    { sectionId: "summary", sectionTitle: "Summary", status: "placeholder" },
    { sectionId: "ambition", sectionTitle: "Ambition", status: "placeholder" },
  ];

  it("records naReason, naBy, naAt correctly", () => {
    const updated = living.markPlaceholderNa(
      initial,
      "summary",
      "pure refactor — no net-new user-facing behavior",
      "Alice",
      now,
    );
    const s = updated.find((p) => p.sectionId === "summary")!;
    assertEquals(s.status, "na");
    assertEquals(s.naReason, "pure refactor — no net-new user-facing behavior");
    assertEquals(s.naBy, "Alice");
    assertEquals(s.naAt, now.toISOString());
  });

  it("leaves other sections unchanged", () => {
    const updated = living.markPlaceholderNa(
      initial,
      "summary",
      "pure refactor — no net-new user-facing behavior",
      "Alice",
      now,
    );
    assertEquals(
      updated.find((p) => p.sectionId === "ambition")?.status,
      "placeholder",
    );
  });

  it("rejects blank reason", () => {
    assertThrows(
      () => living.markPlaceholderNa(initial, "summary", "", "Alice", now),
      Error,
      "N/A reason",
    );
  });

  it("rejects reason shorter than 20 chars", () => {
    assertThrows(
      () =>
        living.markPlaceholderNa(initial, "summary", "too short", "Alice", now),
      Error,
      "too short",
    );
  });

  it("accepts reason of exactly 20 chars", () => {
    const reason = "12345678901234567890";
    const updated = living.markPlaceholderNa(
      initial,
      "summary",
      reason,
      "Alice",
      now,
    );
    assertEquals(updated.find((p) => p.sectionId === "summary")?.status, "na");
  });
});

// =============================================================================
// applyClassificationToPlaceholders
// =============================================================================

describe("applyClassificationToPlaceholders", () => {
  const sectionDefs = living.mergeSections([beautifulProductConcern]);

  const hiddenPlaceholders: readonly schema.PlaceholderStatus[] = [
    {
      sectionId: "design-states",
      sectionTitle: "Design States",
      status: "conditional-hidden",
    },
  ];

  it("reveals conditional section when classification flag turns true", () => {
    const updated = living.applyClassificationToPlaceholders(
      hiddenPlaceholders,
      sectionDefs,
      uiClassification,
    );
    assertEquals(
      updated.find((p) => p.sectionId === "design-states")?.status,
      "placeholder",
    );
  });

  it("hides visible section when flag turns false", () => {
    const visiblePlaceholders: readonly schema.PlaceholderStatus[] = [
      {
        sectionId: "design-states",
        sectionTitle: "Design States",
        status: "placeholder",
      },
    ];
    const updated = living.applyClassificationToPlaceholders(
      visiblePlaceholders,
      sectionDefs,
      allFalseClassification,
    );
    assertEquals(
      updated.find((p) => p.sectionId === "design-states")?.status,
      "conditional-hidden",
    );
  });

  it("does not change filled sections", () => {
    const filledPlaceholders: readonly schema.PlaceholderStatus[] = [
      {
        sectionId: "design-states",
        sectionTitle: "Design States",
        status: "filled",
      },
    ];
    const updated = living.applyClassificationToPlaceholders(
      filledPlaceholders,
      sectionDefs,
      allFalseClassification,
    );
    assertEquals(
      updated.find((p) => p.sectionId === "design-states")?.status,
      "filled",
    );
  });

  it("does not change N/A sections", () => {
    const naPlaceholders: readonly schema.PlaceholderStatus[] = [
      {
        sectionId: "design-states",
        sectionTitle: "Design States",
        status: "na",
        naReason: "completely static UI, no interactive states needed",
      },
    ];
    const updated = living.applyClassificationToPlaceholders(
      naPlaceholders,
      sectionDefs,
      allFalseClassification,
    );
    assertEquals(
      updated.find((p) => p.sectionId === "design-states")?.status,
      "na",
    );
  });

  it("null classification hides all conditional sections", () => {
    const visible: readonly schema.PlaceholderStatus[] = [
      {
        sectionId: "design-states",
        sectionTitle: "Design States",
        status: "placeholder",
      },
    ];
    const updated = living.applyClassificationToPlaceholders(
      visible,
      sectionDefs,
      null,
    );
    assertEquals(
      updated.find((p) => p.sectionId === "design-states")?.status,
      "conditional-hidden",
    );
  });
});

// =============================================================================
// checkSpecCompleteness
// =============================================================================

describe("checkSpecCompleteness", () => {
  const makeSpecState = (
    placeholders: readonly schema.PlaceholderStatus[],
    pendingDecisions: readonly schema.PendingDecision[] = [],
  ): schema.SpecState => ({
    path: "spec/test",
    status: "draft",
    metadata: {
      ...schema.EMPTY_SPEC_METADATA,
      pendingDecisions,
    },
    placeholders,
  });

  it("canAdvance when all sections are filled", () => {
    const { canAdvance, unresolvedSections } = living.checkSpecCompleteness(
      makeSpecState([
        { sectionId: "summary", sectionTitle: "Summary", status: "filled" },
        {
          sectionId: "problem-statement",
          sectionTitle: "Problem Statement",
          status: "filled",
        },
      ]),
    );
    assertEquals(canAdvance, true);
    assertEquals(unresolvedSections.length, 0);
  });

  it("blocks when a placeholder remains", () => {
    const { canAdvance, unresolvedSections } = living.checkSpecCompleteness(
      makeSpecState([
        {
          sectionId: "summary",
          sectionTitle: "Summary",
          status: "placeholder",
        },
      ]),
    );
    assertEquals(canAdvance, false);
    assertEquals(unresolvedSections.length, 1);
    assertEquals(unresolvedSections[0]?.sectionId, "summary");
  });

  it("N/A with a valid reason counts as resolved", () => {
    const { canAdvance } = living.checkSpecCompleteness(
      makeSpecState([
        {
          sectionId: "summary",
          sectionTitle: "Summary",
          status: "na",
          naReason: "pure refactor — no new user-facing behavior",
        },
      ]),
    );
    assertEquals(canAdvance, true);
  });

  it("N/A without reason counts as unresolved", () => {
    const { canAdvance, unresolvedSections } = living.checkSpecCompleteness(
      makeSpecState([
        { sectionId: "summary", sectionTitle: "Summary", status: "na" },
      ]),
    );
    assertEquals(canAdvance, false);
    assertEquals(unresolvedSections.length, 1);
  });

  it("conditional-hidden sections are not required", () => {
    const { canAdvance } = living.checkSpecCompleteness(
      makeSpecState([
        {
          sectionId: "design-states",
          sectionTitle: "Design States",
          status: "conditional-hidden",
        },
      ]),
    );
    assertEquals(canAdvance, true);
  });

  it("pending decisions block advancement", () => {
    const { canAdvance, pendingDecisions } = living.checkSpecCompleteness(
      makeSpecState(
        [{ sectionId: "summary", sectionTitle: "Summary", status: "filled" }],
        [{
          section: "auth",
          question: "Which provider?",
          waitingFor: ["@alice"],
        }],
      ),
    );
    assertEquals(canAdvance, false);
    assertEquals(pendingDecisions.length, 1);
  });

  it("lists all unresolved section ids and titles", () => {
    const { unresolvedSections } = living.checkSpecCompleteness(
      makeSpecState([
        { sectionId: "s1", sectionTitle: "Section One", status: "placeholder" },
        { sectionId: "s2", sectionTitle: "Section Two", status: "filled" },
        {
          sectionId: "s3",
          sectionTitle: "Section Three",
          status: "placeholder",
        },
      ]),
    );
    assertEquals(unresolvedSections.length, 2);
    assertEquals(unresolvedSections.map((s) => s.sectionId).sort(), [
      "s1",
      "s3",
    ]);
  });
});

// =============================================================================
// Frontmatter round-trip
// =============================================================================

describe("parseFrontmatter / renderFrontmatter", () => {
  it("round-trips metadata with no data loss", () => {
    const metadata: schema.SpecMetadata = {
      created: { date: "2026-04-06T00:00:00.000Z", user: "Alice" },
      lastModified: { date: "2026-04-06T01:00:00.000Z", user: "Bob" },
      contributors: [
        {
          user: "Alice",
          lastAction: "created",
          date: "2026-04-06T00:00:00.000Z",
        },
        { user: "Bob", lastAction: "answer", date: "2026-04-06T01:00:00.000Z" },
      ],
      approvals: [{
        user: "Alice",
        status: "approved",
        date: "2026-04-06T02:00:00.000Z",
      }],
      pendingDecisions: [
        {
          section: "auth",
          question: "Which provider?",
          waitingFor: ["@alice"],
        },
      ],
    };

    const rendered = living.renderFrontmatter(metadata);
    const body = "\n\n# Spec: foo\n\n## Summary\n\ncontent";
    const full = `${rendered}\n${body}`;
    const { metadata: parsed, body: parsedBody } = living.parseFrontmatter(
      full,
    );

    assertEquals(parsed.created.user, metadata.created.user);
    assertEquals(parsed.lastModified.user, metadata.lastModified.user);
    assertEquals(parsed.contributors.length, 2);
    assertEquals(parsed.approvals.length, 1);
    assertEquals(parsed.pendingDecisions.length, 1);
    assertEquals(parsedBody, body);
  });

  it("returns empty metadata when no frontmatter block", () => {
    const content = "# Spec: foo\n\n## Summary";
    const { metadata, body } = living.parseFrontmatter(content);
    assertEquals(metadata.contributors.length, 0);
    assertEquals(body, content);
  });

  it("throws when frontmatter is unclosed", () => {
    const content = "---\ncreated:\n  user: Alice\n# missing closing ---";
    assertThrows(() => living.parseFrontmatter(content), Error, "malformed");
  });
});

// =============================================================================
// applyMetadataAction
// =============================================================================

describe("applyMetadataAction", () => {
  const baseMetadata: schema.SpecMetadata = schema.EMPTY_SPEC_METADATA;

  it("answer action updates lastModified and adds contributor", () => {
    const updated = living.applyMetadataAction(
      baseMetadata,
      { type: "answer", user: "Alice", section: "summary" },
      now,
    );
    assertEquals(updated.lastModified.user, "Alice");
    assertEquals(updated.contributors.length, 1);
    assertEquals(updated.contributors[0]?.user, "Alice");
    assertEquals(updated.contributors[0]?.lastAction, "answer");
  });

  it("repeat contributor is updated in place (not duplicated)", () => {
    let meta = living.applyMetadataAction(
      baseMetadata,
      { type: "answer", user: "Alice", section: "summary" },
      now,
    );
    meta = living.applyMetadataAction(
      meta,
      { type: "answer", user: "Alice", section: "ambition" },
      new Date("2026-04-06T01:00:00Z"),
    );
    assertEquals(meta.contributors.length, 1);
    assertEquals(meta.contributors[0]?.user, "Alice");
  });

  it("delegation-created adds pending decision", () => {
    const updated = living.applyMetadataAction(
      baseMetadata,
      {
        type: "delegation-created",
        user: "Alice",
        section: "auth",
        question: "Which provider?",
        waitingFor: ["@bob"],
      },
      now,
    );
    assertEquals(updated.pendingDecisions.length, 1);
    assertEquals(updated.pendingDecisions[0]?.question, "Which provider?");
  });

  it("delegation-answered removes pending decision by section", () => {
    const withDecision = living.applyMetadataAction(
      baseMetadata,
      {
        type: "delegation-created",
        user: "Alice",
        section: "auth",
        question: "Which provider?",
        waitingFor: ["@bob"],
      },
      now,
    );
    const resolved = living.applyMetadataAction(
      withDecision,
      { type: "delegation-answered", user: "Bob", section: "auth" },
      new Date("2026-04-06T02:00:00Z"),
    );
    assertEquals(resolved.pendingDecisions.length, 0);
  });

  it("approval action upserts approvals entry", () => {
    const updated = living.applyMetadataAction(
      baseMetadata,
      { type: "approval", user: "Alice" },
      now,
    );
    assertEquals(updated.approvals.length, 1);
    assertEquals(updated.approvals[0]?.status, "approved");
  });
});

// =============================================================================
// getRevealNotification
// =============================================================================

describe("getRevealNotification", () => {
  const base: readonly schema.PlaceholderStatus[] = [
    { sectionId: "summary", sectionTitle: "Summary", status: "filled" },
    {
      sectionId: "design-states",
      sectionTitle: "Design States",
      status: "conditional-hidden",
    },
  ];

  it("returns null when nothing changed", () => {
    const result = living.getRevealNotification(base, base);
    assertEquals(result, null);
  });

  it("returns revealed IDs when conditional section becomes visible", () => {
    const next: readonly schema.PlaceholderStatus[] = [
      { sectionId: "summary", sectionTitle: "Summary", status: "filled" },
      {
        sectionId: "design-states",
        sectionTitle: "Design States",
        status: "placeholder",
      },
    ];
    const result = living.getRevealNotification(base, next);
    assertEquals(result !== null, true);
    assertEquals(result!.revealed.includes("design-states"), true);
    assertEquals(result!.hidden.length, 0);
  });

  it("returns hidden IDs when visible section becomes conditional-hidden", () => {
    const prev: readonly schema.PlaceholderStatus[] = [
      {
        sectionId: "design-states",
        sectionTitle: "Design States",
        status: "placeholder",
      },
    ];
    const next: readonly schema.PlaceholderStatus[] = [
      {
        sectionId: "design-states",
        sectionTitle: "Design States",
        status: "conditional-hidden",
      },
    ];
    const result = living.getRevealNotification(prev, next);
    assertEquals(result !== null, true);
    assertEquals(result!.hidden.includes("design-states"), true);
    assertEquals(result!.revealed.length, 0);
  });

  it("returns both revealed and hidden in one notification", () => {
    const prev: readonly schema.PlaceholderStatus[] = [
      { sectionId: "s1", sectionTitle: "S1", status: "placeholder" },
      { sectionId: "s2", sectionTitle: "S2", status: "conditional-hidden" },
    ];
    const next: readonly schema.PlaceholderStatus[] = [
      { sectionId: "s1", sectionTitle: "S1", status: "conditional-hidden" },
      { sectionId: "s2", sectionTitle: "S2", status: "placeholder" },
    ];
    const result = living.getRevealNotification(prev, next);
    assertEquals(result !== null, true);
    assertEquals(result!.revealed.includes("s2"), true);
    assertEquals(result!.hidden.includes("s1"), true);
  });

  it("does not include already-filled sections in revealed or hidden", () => {
    const prev: readonly schema.PlaceholderStatus[] = [
      { sectionId: "summary", sectionTitle: "Summary", status: "filled" },
    ];
    const next: readonly schema.PlaceholderStatus[] = [
      { sectionId: "summary", sectionTitle: "Summary", status: "filled" },
    ];
    const result = living.getRevealNotification(prev, next);
    assertEquals(result, null);
  });
});
