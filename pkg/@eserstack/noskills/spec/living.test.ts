// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * Unit tests for spec/living.ts — pure function coverage.
 *
 * Covers: initial spec generation, section merging, TOC rendering, N/A reasoning,
 * classification-driven visibility, completeness checks, and frontmatter round-trips.
 * Disk I/O functions (applyAnswerToFile, applyNaToFile) are not tested here.
 */

import * as bdd from "@std/testing/bdd";
import * as assert from "@eserstack/test-kit/assert";
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

bdd.describe("mergeSections", () => {
  bdd.it("returns base sections when no concerns provided", () => {
    const sections = living.mergeSections([]);
    const ids = sections.map((s) => s.id);
    // Base sections always present
    assert.assertEquals(ids.includes("summary"), true);
    assert.assertEquals(ids.includes("problem-statement"), true);
    assert.assertEquals(ids.includes("acceptance-criteria"), true);
    assert.assertEquals(sections.length, living.BASE_SECTIONS.length);
  });

  bdd.it("concern sections appear after their anchor", () => {
    const sections = living.mergeSections([openSourceConcern]);
    const acIdx = sections.findIndex((s) => s.id === "acceptance-criteria");
    const guideIdx = sections.findIndex((s) => s.id === "contributor-guide");
    assert.assertEquals(guideIdx > acIdx, true);
  });

  bdd.it("concern with no specSections does not add sections", () => {
    const bare: schema.ConcernDefinition = {
      ...openSourceConcern,
      id: "bare",
      specSections: [],
    };
    const sections = living.mergeSections([bare]);
    assert.assertEquals(sections.length, living.BASE_SECTIONS.length);
  });

  bdd.it(
    "legacy string[] sections are auto-migrated with synthetic ids",
    () => {
      const sections = living.mergeSections([legacyConcern]);
      const legacySection = sections.find(
        (s) =>
          s.id.startsWith("legacy-") && s.id.includes("legacy-section-title"),
      );
      assert.assertEquals(legacySection !== undefined, true);
      assert.assertEquals(legacySection?.title, "Legacy Section Title");
      assert.assertEquals(legacySection?.condition, null);
    },
  );

  bdd.it(
    "section ordering: anchor:scope-boundary positions before acceptance-criteria",
    () => {
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
      assert.assertEquals(extraIdx > scopeIdx, true);
      assert.assertEquals(extraIdx < acIdx, true);
    },
  );

  bdd.it("unknown anchor falls back to after:acceptance-criteria", () => {
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
    assert.assertEquals(orphanIdx > acIdx, true);
  });
});

// =============================================================================
// generateInitialSpec
// =============================================================================

bdd.describe("generateInitialSpec", () => {
  bdd.it("base + concern sections appear with placeholder markers", () => {
    const { content, placeholders } = living.generateInitialSpec({
      specName: "my-feature",
      activeConcerns: [openSourceConcern],
      classification: null,
      creator,
      now,
    });
    assert.assertEquals(content.includes("# Spec: my-feature"), true);
    assert.assertEquals(content.includes("## Summary"), true);
    assert.assertEquals(content.includes("## Contributor Guide"), true);
    assert.assertEquals(content.includes("<!-- PLACEHOLDER:summary -->"), true);
    assert.assertEquals(
      content.includes("<!-- PLACEHOLDER:contributor-guide -->"),
      true,
    );
    assert.assertEquals(
      placeholders.some((p) => p.sectionId === "summary"),
      true,
    );
    assert.assertEquals(
      placeholders.find((p) => p.sectionId === "summary")?.status,
      "placeholder",
    );
  });

  bdd.it(
    "conditional sections start conditional-hidden when classification is null",
    () => {
      const { content, placeholders } = living.generateInitialSpec({
        specName: "feature",
        activeConcerns: [beautifulProductConcern],
        classification: null,
        creator,
        now,
      });
      const designStates = placeholders.find(
        (p) => p.sectionId === "design-states",
      );
      assert.assertEquals(designStates?.status, "conditional-hidden");
      // Marker should NOT be in the document body
      assert.assertEquals(
        content.includes("<!-- PLACEHOLDER:design-states -->"),
        false,
      );
    },
  );

  bdd.it(
    "conditional sections start placeholder when classification flag is true",
    () => {
      const { content, placeholders } = living.generateInitialSpec({
        specName: "ui-feature",
        activeConcerns: [beautifulProductConcern],
        classification: uiClassification,
        creator,
        now,
      });
      const designStates = placeholders.find(
        (p) => p.sectionId === "design-states",
      );
      assert.assertEquals(designStates?.status, "placeholder");
      assert.assertEquals(
        content.includes("<!-- PLACEHOLDER:design-states -->"),
        true,
      );
    },
  );

  bdd.it("metadata.created is set to creator + now", () => {
    const { metadata } = living.generateInitialSpec({
      specName: "feature",
      activeConcerns: [],
      classification: null,
      creator,
      now,
    });
    assert.assertEquals(metadata.created.user, "Alice");
    assert.assertEquals(metadata.created.date, now.toISOString());
    assert.assertEquals(metadata.contributors.length, 1);
    assert.assertEquals(metadata.contributors[0]?.user, "Alice");
  });

  bdd.it("content includes YAML frontmatter", () => {
    const { content } = living.generateInitialSpec({
      specName: "feature",
      activeConcerns: [],
      classification: null,
      creator,
      now,
    });
    assert.assertEquals(content.startsWith("---"), true);
    assert.assertEquals(content.includes("created:"), true);
  });

  bdd.it("TOC block is included with placeholder symbols", () => {
    const { content } = living.generateInitialSpec({
      specName: "feature",
      activeConcerns: [],
      classification: null,
      creator,
      now,
    });
    assert.assertEquals(content.includes("<!-- TOC:START -->"), true);
    assert.assertEquals(content.includes("<!-- TOC:END -->"), true);
    assert.assertEquals(content.includes("○ Summary"), true);
  });
});

// =============================================================================
// renderTOC
// =============================================================================

bdd.describe("renderTOC", () => {
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

  bdd.it("uses correct symbols for each status", () => {
    const toc = living.renderTOC(basePlaceholders);
    assert.assertEquals(toc.includes("✓ Summary"), true);
    assert.assertEquals(toc.includes("○ Problem Statement"), true);
    assert.assertEquals(toc.includes("— Scope Boundary"), true);
    assert.assertEquals(toc.includes("⊘ Design States"), true);
  });

  bdd.it("includes N/A reason inline", () => {
    const toc = living.renderTOC(basePlaceholders);
    assert.assertEquals(toc.includes("pure refactor with no new scope"), true);
  });

  bdd.it("is wrapped in TOC markers", () => {
    const toc = living.renderTOC(basePlaceholders);
    assert.assertEquals(toc.startsWith("<!-- TOC:START -->"), true);
    assert.assertEquals(toc.endsWith("<!-- TOC:END -->"), true);
  });
});

// =============================================================================
// replaceTOCBlock
// =============================================================================

bdd.describe("replaceTOCBlock", () => {
  bdd.it("replaces TOC region atomically", () => {
    const content =
      "before\n<!-- TOC:START -->\n## Sections\n- ○ Old\n<!-- TOC:END -->\nafter";
    const placeholders: schema.PlaceholderStatus[] = [
      { sectionId: "summary", sectionTitle: "Summary", status: "filled" },
    ];
    const updated = living.replaceTOCBlock(content, placeholders);
    assert.assertEquals(updated.includes("○ Old"), false);
    assert.assertEquals(updated.includes("✓ Summary"), true);
    assert.assertEquals(updated.includes("before"), true);
    assert.assertEquals(updated.includes("after"), true);
  });

  bdd.it(
    "is idempotent — re-running with same placeholders yields same result",
    () => {
      const content =
        "<!-- TOC:START -->\n## Sections\n- ○ Summary\n<!-- TOC:END -->";
      const placeholders: schema.PlaceholderStatus[] = [
        {
          sectionId: "summary",
          sectionTitle: "Summary",
          status: "placeholder",
        },
      ];
      const once = living.replaceTOCBlock(content, placeholders);
      const twice = living.replaceTOCBlock(once, placeholders);
      assert.assertEquals(once, twice);
    },
  );

  bdd.it("gracefully skips when no TOC block is found", () => {
    const content = "# Spec: foo\n\n## Summary";
    const result = living.replaceTOCBlock(content, []);
    assert.assertEquals(result, content);
  });
});

// =============================================================================
// replacePlaceholderMarker
// =============================================================================

bdd.describe("replacePlaceholderMarker", () => {
  bdd.it("replaces marker with body text", () => {
    const content =
      "## Summary\n\n<!-- PLACEHOLDER:summary -->\n_placeholder text_";
    const result = living.replacePlaceholderMarker(
      content,
      "summary",
      "The new body",
    );
    assert.assertEquals(result.includes("<!-- PLACEHOLDER:summary -->"), false);
    assert.assertEquals(result.includes("The new body"), true);
  });

  bdd.it("throws when marker not found", () => {
    const content = "## Summary\n\nAlready filled content";
    assert.assertThrows(
      () => living.replacePlaceholderMarker(content, "summary", "body"),
      Error,
      "Placeholder marker not found",
    );
  });
});

// =============================================================================
// markPlaceholderNa (Expansion B)
// =============================================================================

bdd.describe("markPlaceholderNa", () => {
  const initial: readonly schema.PlaceholderStatus[] = [
    { sectionId: "summary", sectionTitle: "Summary", status: "placeholder" },
    { sectionId: "ambition", sectionTitle: "Ambition", status: "placeholder" },
  ];

  bdd.it("records naReason, naBy, naAt correctly", () => {
    const updated = living.markPlaceholderNa(
      initial,
      "summary",
      "pure refactor — no net-new user-facing behavior",
      "Alice",
      now,
    );
    const s = updated.find((p) => p.sectionId === "summary")!;
    assert.assertEquals(s.status, "na");
    assert.assertEquals(
      s.naReason,
      "pure refactor — no net-new user-facing behavior",
    );
    assert.assertEquals(s.naBy, "Alice");
    assert.assertEquals(s.naAt, now.toISOString());
  });

  bdd.it("leaves other sections unchanged", () => {
    const updated = living.markPlaceholderNa(
      initial,
      "summary",
      "pure refactor — no net-new user-facing behavior",
      "Alice",
      now,
    );
    assert.assertEquals(
      updated.find((p) => p.sectionId === "ambition")?.status,
      "placeholder",
    );
  });

  bdd.it("rejects blank reason", () => {
    assert.assertThrows(
      () => living.markPlaceholderNa(initial, "summary", "", "Alice", now),
      Error,
      "N/A reason",
    );
  });

  bdd.it("rejects reason shorter than 20 chars", () => {
    assert.assertThrows(
      () =>
        living.markPlaceholderNa(initial, "summary", "too short", "Alice", now),
      Error,
      "too short",
    );
  });

  bdd.it("accepts reason of exactly 20 chars", () => {
    const reason = "12345678901234567890";
    const updated = living.markPlaceholderNa(
      initial,
      "summary",
      reason,
      "Alice",
      now,
    );
    assert.assertEquals(
      updated.find((p) => p.sectionId === "summary")?.status,
      "na",
    );
  });
});

// =============================================================================
// applyClassificationToPlaceholders
// =============================================================================

bdd.describe("applyClassificationToPlaceholders", () => {
  const sectionDefs = living.mergeSections([beautifulProductConcern]);

  const hiddenPlaceholders: readonly schema.PlaceholderStatus[] = [
    {
      sectionId: "design-states",
      sectionTitle: "Design States",
      status: "conditional-hidden",
    },
  ];

  bdd.it(
    "reveals conditional section when classification flag turns true",
    () => {
      const updated = living.applyClassificationToPlaceholders(
        hiddenPlaceholders,
        sectionDefs,
        uiClassification,
      );
      assert.assertEquals(
        updated.find((p) => p.sectionId === "design-states")?.status,
        "placeholder",
      );
    },
  );

  bdd.it("hides visible section when flag turns false", () => {
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
    assert.assertEquals(
      updated.find((p) => p.sectionId === "design-states")?.status,
      "conditional-hidden",
    );
  });

  bdd.it("does not change filled sections", () => {
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
    assert.assertEquals(
      updated.find((p) => p.sectionId === "design-states")?.status,
      "filled",
    );
  });

  bdd.it("does not change N/A sections", () => {
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
    assert.assertEquals(
      updated.find((p) => p.sectionId === "design-states")?.status,
      "na",
    );
  });

  bdd.it("null classification hides all conditional sections", () => {
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
    assert.assertEquals(
      updated.find((p) => p.sectionId === "design-states")?.status,
      "conditional-hidden",
    );
  });
});

// =============================================================================
// checkSpecCompleteness
// =============================================================================

bdd.describe("checkSpecCompleteness", () => {
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

  bdd.it("canAdvance when all sections are filled", () => {
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
    assert.assertEquals(canAdvance, true);
    assert.assertEquals(unresolvedSections.length, 0);
  });

  bdd.it("blocks when a placeholder remains", () => {
    const { canAdvance, unresolvedSections } = living.checkSpecCompleteness(
      makeSpecState([
        {
          sectionId: "summary",
          sectionTitle: "Summary",
          status: "placeholder",
        },
      ]),
    );
    assert.assertEquals(canAdvance, false);
    assert.assertEquals(unresolvedSections.length, 1);
    assert.assertEquals(unresolvedSections[0]?.sectionId, "summary");
  });

  bdd.it("N/A with a valid reason counts as resolved", () => {
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
    assert.assertEquals(canAdvance, true);
  });

  bdd.it("N/A without reason counts as unresolved", () => {
    const { canAdvance, unresolvedSections } = living.checkSpecCompleteness(
      makeSpecState([
        { sectionId: "summary", sectionTitle: "Summary", status: "na" },
      ]),
    );
    assert.assertEquals(canAdvance, false);
    assert.assertEquals(unresolvedSections.length, 1);
  });

  bdd.it("conditional-hidden sections are not required", () => {
    const { canAdvance } = living.checkSpecCompleteness(
      makeSpecState([
        {
          sectionId: "design-states",
          sectionTitle: "Design States",
          status: "conditional-hidden",
        },
      ]),
    );
    assert.assertEquals(canAdvance, true);
  });

  bdd.it("pending decisions block advancement", () => {
    const { canAdvance, pendingDecisions } = living.checkSpecCompleteness(
      makeSpecState(
        [{ sectionId: "summary", sectionTitle: "Summary", status: "filled" }],
        [
          {
            section: "auth",
            question: "Which provider?",
            waitingFor: ["@alice"],
          },
        ],
      ),
    );
    assert.assertEquals(canAdvance, false);
    assert.assertEquals(pendingDecisions.length, 1);
  });

  bdd.it("lists all unresolved section ids and titles", () => {
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
    assert.assertEquals(unresolvedSections.length, 2);
    assert.assertEquals(unresolvedSections.map((s) => s.sectionId).sort(), [
      "s1",
      "s3",
    ]);
  });
});

// =============================================================================
// Frontmatter round-trip
// =============================================================================

bdd.describe("parseFrontmatter / renderFrontmatter", () => {
  bdd.it("round-trips metadata with no data loss", () => {
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
      approvals: [
        {
          user: "Alice",
          status: "approved",
          date: "2026-04-06T02:00:00.000Z",
        },
      ],
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
    const { metadata: parsed, body: parsedBody } =
      living.parseFrontmatter(full);

    assert.assertEquals(parsed.created.user, metadata.created.user);
    assert.assertEquals(parsed.lastModified.user, metadata.lastModified.user);
    assert.assertEquals(parsed.contributors.length, 2);
    assert.assertEquals(parsed.approvals.length, 1);
    assert.assertEquals(parsed.pendingDecisions.length, 1);
    assert.assertEquals(parsedBody, body);
  });

  bdd.it("returns empty metadata when no frontmatter block", () => {
    const content = "# Spec: foo\n\n## Summary";
    const { metadata, body } = living.parseFrontmatter(content);
    assert.assertEquals(metadata.contributors.length, 0);
    assert.assertEquals(body, content);
  });

  bdd.it("throws when frontmatter is unclosed", () => {
    const content = "---\ncreated:\n  user: Alice\n# missing closing ---";
    assert.assertThrows(
      () => living.parseFrontmatter(content),
      Error,
      "malformed",
    );
  });
});

// =============================================================================
// applyMetadataAction
// =============================================================================

bdd.describe("applyMetadataAction", () => {
  const baseMetadata: schema.SpecMetadata = schema.EMPTY_SPEC_METADATA;

  bdd.it("answer action updates lastModified and adds contributor", () => {
    const updated = living.applyMetadataAction(
      baseMetadata,
      { type: "answer", user: "Alice", section: "summary" },
      now,
    );
    assert.assertEquals(updated.lastModified.user, "Alice");
    assert.assertEquals(updated.contributors.length, 1);
    assert.assertEquals(updated.contributors[0]?.user, "Alice");
    assert.assertEquals(updated.contributors[0]?.lastAction, "answer");
  });

  bdd.it("repeat contributor is updated in place (not duplicated)", () => {
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
    assert.assertEquals(meta.contributors.length, 1);
    assert.assertEquals(meta.contributors[0]?.user, "Alice");
  });

  bdd.it("delegation-created adds pending decision", () => {
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
    assert.assertEquals(updated.pendingDecisions.length, 1);
    assert.assertEquals(
      updated.pendingDecisions[0]?.question,
      "Which provider?",
    );
  });

  bdd.it("delegation-answered removes pending decision by section", () => {
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
    assert.assertEquals(resolved.pendingDecisions.length, 0);
  });

  bdd.it("approval action upserts approvals entry", () => {
    const updated = living.applyMetadataAction(
      baseMetadata,
      { type: "approval", user: "Alice" },
      now,
    );
    assert.assertEquals(updated.approvals.length, 1);
    assert.assertEquals(updated.approvals[0]?.status, "approved");
  });
});

// =============================================================================
// getRevealNotification
// =============================================================================

bdd.describe("getRevealNotification", () => {
  const base: readonly schema.PlaceholderStatus[] = [
    { sectionId: "summary", sectionTitle: "Summary", status: "filled" },
    {
      sectionId: "design-states",
      sectionTitle: "Design States",
      status: "conditional-hidden",
    },
  ];

  bdd.it("returns null when nothing changed", () => {
    const result = living.getRevealNotification(base, base);
    assert.assertEquals(result, null);
  });

  bdd.it(
    "returns revealed IDs when conditional section becomes visible",
    () => {
      const next: readonly schema.PlaceholderStatus[] = [
        { sectionId: "summary", sectionTitle: "Summary", status: "filled" },
        {
          sectionId: "design-states",
          sectionTitle: "Design States",
          status: "placeholder",
        },
      ];
      const result = living.getRevealNotification(base, next);
      assert.assertEquals(result !== null, true);
      assert.assertEquals(result!.revealed.includes("design-states"), true);
      assert.assertEquals(result!.hidden.length, 0);
    },
  );

  bdd.it(
    "returns hidden IDs when visible section becomes conditional-hidden",
    () => {
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
      assert.assertEquals(result !== null, true);
      assert.assertEquals(result!.hidden.includes("design-states"), true);
      assert.assertEquals(result!.revealed.length, 0);
    },
  );

  bdd.it("returns both revealed and hidden in one notification", () => {
    const prev: readonly schema.PlaceholderStatus[] = [
      { sectionId: "s1", sectionTitle: "S1", status: "placeholder" },
      { sectionId: "s2", sectionTitle: "S2", status: "conditional-hidden" },
    ];
    const next: readonly schema.PlaceholderStatus[] = [
      { sectionId: "s1", sectionTitle: "S1", status: "conditional-hidden" },
      { sectionId: "s2", sectionTitle: "S2", status: "placeholder" },
    ];
    const result = living.getRevealNotification(prev, next);
    assert.assertEquals(result !== null, true);
    assert.assertEquals(result!.revealed.includes("s2"), true);
    assert.assertEquals(result!.hidden.includes("s1"), true);
  });

  bdd.it(
    "does not include already-filled sections in revealed or hidden",
    () => {
      const prev: readonly schema.PlaceholderStatus[] = [
        { sectionId: "summary", sectionTitle: "Summary", status: "filled" },
      ];
      const next: readonly schema.PlaceholderStatus[] = [
        { sectionId: "summary", sectionTitle: "Summary", status: "filled" },
      ];
      const result = living.getRevealNotification(prev, next);
      assert.assertEquals(result, null);
    },
  );
});

// =============================================================================
// Declared section scopes
// =============================================================================

bdd.describe("declared section scopes", () => {
  const scopedSectionsConcern: schema.ConcernDefinition = {
    id: "custom",
    name: "Custom",
    description: "A project concern with scoped and plain sections",
    extras: [],
    specSections: [
      {
        id: "screens",
        title: "Screens",
        placeholder: "_List every screen._",
        scope: ["ui"],
        position: "after:acceptance-criteria",
      },
      {
        id: "endpoints",
        title: "Endpoints",
        placeholder: "_List every endpoint._",
        scope: ["api"],
        position: "after:acceptance-criteria",
      },
      {
        id: "rollout",
        title: "Rollout",
        placeholder: "_Describe the rollout._",
        position: "after:acceptance-criteria",
      },
      {
        id: "cli-help",
        title: "CLI Help",
        placeholder: "_Describe the help text._",
        condition: "involvesCLI",
        position: "after:acceptance-criteria",
      },
    ],
    reminders: [],
    acceptanceCriteria: [],
  };

  const statuses = (
    classification: schema.SpecClassification | null,
  ): Record<string, string> => {
    const { placeholders } = living.generateInitialSpec({
      specName: "scoped",
      activeConcerns: [scopedSectionsConcern],
      classification,
      creator,
      now,
    });

    return Object.fromEntries(
      placeholders
        .filter((p) => p.concernSource === "custom")
        .map((p) => [p.sectionId, p.status]),
    );
  };

  const cases = [
    {
      name: "hides scoped sections until the spec is classified",
      classification: null,
      expected: {
        screens: "conditional-hidden",
        endpoints: "conditional-hidden",
        rollout: "placeholder",
        "cli-help": "conditional-hidden",
      },
    },
    {
      name: "shows the ui section for a UI spec",
      classification: uiClassification,
      expected: {
        screens: "placeholder",
        endpoints: "conditional-hidden",
        rollout: "placeholder",
        "cli-help": "conditional-hidden",
      },
    },
    {
      name: "shows the api section for an API spec",
      classification: { ...allFalseClassification, involvesPublicAPI: true },
      expected: {
        screens: "conditional-hidden",
        endpoints: "placeholder",
        rollout: "placeholder",
        "cli-help": "conditional-hidden",
      },
    },
    {
      name: "shows only unscoped sections and matching conditions otherwise",
      classification: { ...allFalseClassification, involvesCLI: true },
      expected: {
        screens: "conditional-hidden",
        endpoints: "conditional-hidden",
        rollout: "placeholder",
        "cli-help": "placeholder",
      },
    },
  ];

  for (const { name, classification, expected } of cases) {
    bdd.it(name, () => {
      assert.assertEquals(statuses(classification), expected);
    });
  }

  bdd.it("reveals a scoped section once the classification matches", () => {
    const { placeholders } = living.generateInitialSpec({
      specName: "scoped",
      activeConcerns: [scopedSectionsConcern],
      classification: null,
      creator,
      now,
    });

    const updated = living.applyClassificationToPlaceholders(
      placeholders,
      living.mergeSections([scopedSectionsConcern]),
      { ...allFalseClassification, involvesPublicAPI: true },
    );

    assert.assertEquals(
      updated.find((p) => p.sectionId === "endpoints")?.status,
      "placeholder",
    );
    assert.assertEquals(
      updated.find((p) => p.sectionId === "screens")?.status,
      "conditional-hidden",
    );
  });
});
