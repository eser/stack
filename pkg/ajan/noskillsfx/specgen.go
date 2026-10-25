// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

// The base sections of the living spec, their placeholder markers and the
// question each answer fills (spec/living.ts); living_spec.go builds and
// updates spec.md from them.
package noskillsfx

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
// Placeholder markers
// =============================================================================

const tocStart = "<!-- TOC:START -->"
const tocEnd = "<!-- TOC:END -->"

// PlaceholderMarker returns the HTML comment marker for a section.
func PlaceholderMarker(sectionID string) string {
	return "<!-- PLACEHOLDER:" + sectionID + " -->"
}

const frontmatterDelimiter = "---"

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
