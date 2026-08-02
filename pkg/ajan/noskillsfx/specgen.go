// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

// specgen.go — living spec generation and manipulation.
//
// Pure functions for generating the initial spec.md document and checking its
// completeness gate. Disk I/O lives in the caller (cmd/noskills) to keep this
// package testable without a filesystem.
//
// Architecture: JSON state is the canonical truth; spec.md is the view.
// The completeness gate reads from state, never from the markdown file.
package noskillsfx

import (
	"fmt"
	"strings"

	"gopkg.in/yaml.v3"
)

// =============================================================================
// Base sections (always present in every spec — mirrors BASE_SECTIONS in living.ts)
// =============================================================================

// BaseSection is one of the 10 hardcoded sections every spec starts with.
type BaseSection struct {
	ID          string
	Title       string
	Placeholder string
	Position    string
}

// BaseSections is the ordered list of the 10 base spec sections.
//
//nolint:gochecknoglobals // immutable ordered set, accessed by iteration
var BaseSections = []BaseSection{
	{
		ID:          "summary",
		Title:       "Summary",
		Placeholder: "_Synthesize the spec in 2-3 sentences: what changes, why it matters, for whom._",
		Position:    "base:0",
	},
	{
		ID:          "problem-statement",
		Title:       "Problem Statement",
		Placeholder: "_Describe the current pain: what is broken, missing, or inefficient? For whom? What happens today when they try?_",
		Position:    "base:1",
	},
	{
		ID:          "ambition",
		Title:       "Ambition",
		Placeholder: "_What does success look like? Paint the 12-month ideal state — not just this feature, but the trajectory it starts._",
		Position:    "base:2",
	},
	{
		ID:          "reversibility",
		Title:       "Reversibility",
		Placeholder: "_If this ships and is wrong, how do we undo it? Rollback steps, feature flags, migration reversibility, blast radius._",
		Position:    "base:3",
	},
	{
		ID:          "user-impact",
		Title:       "User Impact",
		Placeholder: "_Who benefits and how? What changes for them — before/after their day, their workflow, their frustration?_",
		Position:    "base:4",
	},
	{
		ID:          "verification-strategy",
		Title:       "Verification Strategy",
		Placeholder: "_How will we know it worked? Automated tests, manual smoke tests, metrics to watch, acceptance checklist._",
		Position:    "base:5",
	},
	{
		ID:          "scope-boundary",
		Title:       "Scope Boundary",
		Placeholder: "_What is explicitly OUT of scope? Name specific features, use cases, or edge cases this spec does NOT address._",
		Position:    "base:6",
	},
	{
		ID:          "premises",
		Title:       "Premises",
		Placeholder: "_List every assumption this spec makes. If an assumption turns out wrong, what breaks?_",
		Position:    "base:7",
	},
	{
		ID:          "tasks",
		Title:       "Tasks",
		Placeholder: "_Break implementation into concrete tasks. Each task: what it does, how to verify it is done, any ordering constraints._",
		Position:    "base:8",
	},
	{
		ID:          "acceptance-criteria",
		Title:       "Acceptance Criteria",
		Placeholder: "_Binary, testable criteria. Each item: the system does X when Y. No fuzzy language._",
		Position:    "base:9",
	},
}

// =============================================================================
// Merged section type
// =============================================================================

// SpecSection is a fully resolved section entry — base or concern-contributed.
type SpecSection struct {
	ID            string
	Title         string
	Placeholder   string
	Condition     *string // classification flag name, e.g. "involvesWebUI"
	Position      string
	ConcernSource *string // ID of the concern that contributed this section
}

// =============================================================================
// Section merging (mirrors mergeSections in living.ts)
// =============================================================================

// anchorFromPosition extracts the base-section anchor from a position string
// like "after:tasks:0" → "tasks". Returns "" for "base:N" positions.
func anchorFromPosition(pos string) string {
	if !strings.HasPrefix(pos, "after:") {
		return ""
	}

	rest := strings.TrimPrefix(pos, "after:")
	parts := strings.SplitN(rest, ":", 2)

	return parts[0]
}

// normalizeRawSection converts a concern specSections entry (string or typed)
// into a typed SpecSectionDefinition. Legacy string format uses auto-generated IDs.
func normalizeRawSection(concernID string, raw any, idx int) SpecSectionDefinition {
	if str, ok := raw.(string); ok {
		id := fmt.Sprintf("%s-%s",
			concernID,
			strings.Trim(strings.ReplaceAll(strings.ToLower(str), " ", "-"), "-"),
		)

		return SpecSectionDefinition{
			ID:          id,
			Title:       str,
			Placeholder: fmt.Sprintf("_%s: to be addressed during discovery._", str),
			Condition:   nil,
			Position:    fmt.Sprintf("after:tasks:%d", idx),
		}
	}

	if def, ok := raw.(SpecSectionDefinition); ok {
		return def
	}

	// Fallback: try map deserialization (when loaded from JSON as map[string]any).
	if m, ok := raw.(map[string]any); ok {
		def := SpecSectionDefinition{}

		if v, ok := m["id"].(string); ok {
			def.ID = v
		}

		if v, ok := m["title"].(string); ok {
			def.Title = v
		}

		if v, ok := m["placeholder"].(string); ok {
			def.Placeholder = v
		}

		if v, ok := m["position"].(string); ok {
			def.Position = v
		}

		if v, ok := m["condition"].(string); ok {
			def.Condition = &v
		}

		return def
	}

	return SpecSectionDefinition{
		ID:       fmt.Sprintf("%s-section-%d", concernID, idx),
		Title:    fmt.Sprintf("Section %d", idx),
		Position: fmt.Sprintf("after:tasks:%d", idx),
	}
}

// MergeSections produces an ordered list of all spec sections (base + concern
// contributions), anchored via "after:<base-id>" position strings.
// Sections with unknown anchors fall back to after "acceptance-criteria".
func MergeSections(activeConcerns []ConcernDefinition) []SpecSection {
	baseIDs := make(map[string]bool, len(BaseSections))
	for _, s := range BaseSections {
		baseIDs[s.ID] = true
	}

	// Collect concern sections grouped by their anchor.
	insertAfter := make(map[string][]SpecSection)

	for _, concern := range activeConcerns {
		for i, raw := range concern.SpecSections {
			def := normalizeRawSection(concern.ID, raw, i)
			anchor := anchorFromPosition(def.Position)

			if !baseIDs[anchor] {
				anchor = "acceptance-criteria"
			}

			src := concern.ID
			sec := SpecSection{
				ID:            def.ID,
				Title:         def.Title,
				Placeholder:   def.Placeholder,
				Condition:     def.Condition,
				Position:      def.Position,
				ConcernSource: &src,
			}

			insertAfter[anchor] = append(insertAfter[anchor], sec)
		}
	}

	// Interleave concern sections after their anchor base sections.
	result := make([]SpecSection, 0, len(BaseSections)+len(activeConcerns))

	for _, base := range BaseSections {
		result = append(result, SpecSection{
			ID:          base.ID,
			Title:       base.Title,
			Placeholder: base.Placeholder,
			Condition:   nil,
			Position:    base.Position,
		})

		result = append(result, insertAfter[base.ID]...)
	}

	return result
}

// =============================================================================
// Placeholder markers
// =============================================================================

const tocStart = "<!-- TOC:START -->"
const tocEnd = "<!-- TOC:END -->"

// PlaceholderMarker returns the HTML comment marker for a section.
func PlaceholderMarker(sectionID string) string {
	return "<!-- PLACEHOLDER:" + sectionID + " -->"
}

// RenderTOC renders the table-of-contents block (between TOC markers).
func RenderTOC(placeholders []PlaceholderStatus) string {
	statusSymbols := map[string]string{
		"filled":             "✓",
		"placeholder":        "○",
		"na":                 "—",
		"conditional-hidden": "⊘",
	}

	lines := []string{tocStart, "## Sections"}

	for _, p := range placeholders {
		sym, ok := statusSymbols[p.Status]
		if !ok {
			sym = "?"
		}

		switch p.Status {
		case "na":
			if p.NaReason != nil {
				lines = append(lines, fmt.Sprintf("- %s %s _(N/A: %s)_", sym, p.SectionTitle, *p.NaReason))
			} else {
				lines = append(lines, fmt.Sprintf("- %s %s", sym, p.SectionTitle))
			}
		case "conditional-hidden":
			lines = append(lines, fmt.Sprintf("- %s %s _(hidden — condition not met)_", sym, p.SectionTitle))
		default:
			lines = append(lines, fmt.Sprintf("- %s %s", sym, p.SectionTitle))
		}
	}

	lines = append(lines, tocEnd)

	return strings.Join(lines, "\n")
}

// ReplaceTOCBlock replaces the TOC block in content with a freshly rendered one.
// Skips gracefully if no TOC block is found.
func ReplaceTOCBlock(content string, placeholders []PlaceholderStatus) string {
	startIdx := strings.Index(content, tocStart)
	endIdx := strings.Index(content, tocEnd)

	if startIdx == -1 || endIdx == -1 {
		return content
	}

	newTOC := RenderTOC(placeholders)

	return content[:startIdx] + newTOC + content[endIdx+len(tocEnd):]
}

// =============================================================================
// YAML frontmatter (mirrors parseFrontmatter / renderFrontmatter in living.ts)
// =============================================================================

const frontmatterDelimiter = "---"

// ParseFrontmatter splits a spec.md string into SpecMetadata and the body.
// Returns the zero metadata and the full content as body when no frontmatter
// is present.
func ParseFrontmatter(content string) (SpecMetadata, string, error) {
	lines := strings.Split(content, "\n")

	if len(lines) == 0 || lines[0] != frontmatterDelimiter {
		return EmptySpecMetadata(), content, nil
	}

	endIdx := -1

	for i := 1; i < len(lines); i++ {
		if lines[i] == frontmatterDelimiter {
			endIdx = i

			break
		}
	}

	if endIdx == -1 {
		return EmptySpecMetadata(), content, fmt.Errorf(
			"spec.md frontmatter is malformed: found opening --- but no closing ---",
		)
	}

	yamlStr := strings.Join(lines[1:endIdx], "\n")

	var meta SpecMetadata
	if err := yaml.Unmarshal([]byte(yamlStr), &meta); err != nil {
		return EmptySpecMetadata(), content, fmt.Errorf("parseFrontmatter: %w", err)
	}

	body := strings.Join(lines[endIdx+1:], "\n")

	return meta, body, nil
}

// RenderFrontmatter serialises SpecMetadata as a YAML frontmatter block.
// Does NOT include a trailing newline — callers add a separator when joining.
func RenderFrontmatter(metadata SpecMetadata) (string, error) {
	data, err := yaml.Marshal(metadata)
	if err != nil {
		return "", fmt.Errorf("renderFrontmatter: %w", err)
	}

	return frontmatterDelimiter + "\n" + strings.TrimRight(string(data), "\n") + "\n" + frontmatterDelimiter, nil
}

// =============================================================================
// Initial spec generation (mirrors generateInitialSpec in living.ts)
// =============================================================================

// GenerateSpecArgs holds the inputs for GenerateInitialSpec.
type GenerateSpecArgs struct {
	SpecName       string
	ActiveConcerns []ConcernDefinition
	Classification *SpecClassification // nil means no classification yet
	Creator        struct {
		Name  string
		Email string
	}
	Now string // RFC3339 timestamp
}

// GenerateSpecResult holds the outputs of GenerateInitialSpec.
type GenerateSpecResult struct {
	Content      string
	Placeholders []PlaceholderStatus
	Metadata     SpecMetadata
}

// classificationConditions maps section condition IDs to flag accessors.
//
//nolint:gochecknoglobals // pure accessor map, never mutated
var classificationConditions = map[string]func(*SpecClassification) bool{
	"involvesWebUI":        func(c *SpecClassification) bool { return c.InvolvesWebUI },
	"involvesCLI":          func(c *SpecClassification) bool { return c.InvolvesCLI },
	"involvesPublicAPI":    func(c *SpecClassification) bool { return c.InvolvesPublicAPI },
	"involvesMigration":    func(c *SpecClassification) bool { return c.InvolvesMigration },
	"involvesDataHandling": func(c *SpecClassification) bool { return c.InvolvesDataHandling },
}

// sectionVisible reports whether a section with the given condition should be
// shown under the given classification. Sections with no condition are always visible.
func sectionVisible(condition *string, classification *SpecClassification) bool {
	if condition == nil {
		return true
	}

	if classification == nil {
		return false
	}

	fn, ok := classificationConditions[*condition]

	return ok && fn(classification)
}

// GenerateInitialSpec produces the initial spec.md content, placeholder state,
// and metadata for a newly created spec. Pure — no disk I/O.
func GenerateInitialSpec(args GenerateSpecArgs) (GenerateSpecResult, error) {
	sections := MergeSections(args.ActiveConcerns)

	// Build initial placeholder state.
	placeholders := make([]PlaceholderStatus, 0, len(sections))

	for _, sec := range sections {
		status := "placeholder"
		if !sectionVisible(sec.Condition, args.Classification) {
			status = "conditional-hidden"
		}

		p := PlaceholderStatus{
			SectionID:    sec.ID,
			SectionTitle: sec.Title,
			Status:       status,
		}

		if sec.ConcernSource != nil {
			cs := *sec.ConcernSource
			p.ConcernSource = &cs
		}

		placeholders = append(placeholders, p)
	}

	metadata := SpecMetadata{}
	metadata.Created.Date = args.Now
	metadata.Created.User = args.Creator.Name
	metadata.LastModified.Date = args.Now
	metadata.LastModified.User = args.Creator.Name
	metadata.Contributors = []ContributorEntry{
		{User: args.Creator.Name, LastAction: "created", Date: args.Now},
	}
	metadata.Approvals = []ApprovalEntry{}
	metadata.PendingDecisions = []PendingDecision{}

	frontmatter, err := RenderFrontmatter(metadata)
	if err != nil {
		return GenerateSpecResult{}, err
	}

	// Build document.
	parts := []string{
		frontmatter,
		"# Spec: " + args.SpecName,
		RenderTOC(placeholders),
	}

	for _, sec := range sections {
		// Find the matching placeholder to get its status.
		var status string

		for _, p := range placeholders {
			if p.SectionID == sec.ID {
				status = p.Status

				break
			}
		}

		if status == "conditional-hidden" {
			continue
		}

		parts = append(parts, fmt.Sprintf("## %s\n\n%s\n%s",
			sec.Title, PlaceholderMarker(sec.ID), sec.Placeholder))
	}

	return GenerateSpecResult{
		Content:      strings.Join(parts, "\n\n"),
		Placeholders: placeholders,
		Metadata:     metadata,
	}, nil
}

// =============================================================================
// Completeness gate (mirrors checkSpecCompleteness in living.ts)
// =============================================================================

// CompletenessResult is the output of CheckSpecCompleteness.
type CompletenessResult struct {
	CanAdvance        bool
	UnresolvedSection []struct {
		SectionID    string
		SectionTitle string
	}
	PendingDecisions []PendingDecision
}

// CheckSpecCompleteness reports whether the spec is ready to advance to
// SPEC_PROPOSAL. conditional-hidden sections are not required. N/A reasons
// shorter than 20 characters are rejected (anti-vague-N/A gate).
func CheckSpecCompleteness(specState SpecState) CompletenessResult {
	var unresolved []struct {
		SectionID    string
		SectionTitle string
	}

	for _, p := range specState.Placeholders {
		switch p.Status {
		case "conditional-hidden", "filled":
			// resolved
		case "na":
			if p.NaReason != nil && len(strings.TrimSpace(*p.NaReason)) >= 20 {
				// resolved — valid N/A reason
			} else {
				unresolved = append(unresolved, struct {
					SectionID    string
					SectionTitle string
				}{p.SectionID, p.SectionTitle})
			}
		default: // "placeholder"
			unresolved = append(unresolved, struct {
				SectionID    string
				SectionTitle string
			}{p.SectionID, p.SectionTitle})
		}
	}

	return CompletenessResult{
		CanAdvance:        len(unresolved) == 0 && len(specState.Metadata.PendingDecisions) == 0,
		UnresolvedSection: unresolved,
		PendingDecisions:  specState.Metadata.PendingDecisions,
	}
}

// =============================================================================
// Question ID → Section ID mapping
// =============================================================================

//nolint:gochecknoglobals // immutable lookup table
var questionToSection = map[string]string{
	"status_quo":     "problem-statement",
	"user_impact":    "user-impact",
	"ambition":       "ambition",
	"scope_boundary": "scope-boundary",
	"verification":   "verification-strategy",
	"reversibility":  "reversibility",
}

// QuestionToSectionID maps a discovery question ID to the spec section it populates.
// Returns the questionID unchanged when there is no mapping.
func QuestionToSectionID(questionID string) string {
	if sectionID, ok := questionToSection[questionID]; ok {
		return sectionID
	}

	return questionID
}
