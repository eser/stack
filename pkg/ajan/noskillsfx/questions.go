// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

package noskillsfx

// =============================================================================
// Question types
// =============================================================================

// Question is a single discovery interview question.
type Question struct {
	ID       string   `json:"id"`
	Text     string   `json:"text"`
	Concerns []string `json:"concerns"`
}

// QuestionWithExtras combines a Question with concern-injected sub-questions.
type QuestionWithExtras struct {
	Question
	Extras []ConcernExtra `json:"extras"`
}

// =============================================================================
// Hardcoded discovery questions (v0.1) — mirrors QUESTIONS in questions.ts
// =============================================================================

//nolint:gochecknoglobals
var questions = []Question{
	{
		ID:   "status_quo",
		Text: "What does the user do today without this feature?",
		Concerns: []string{
			"product:status_quo", "eng:replace_scope", "qa:regression_risk",
		},
	},
	{
		ID:   "ambition",
		Text: "Describe the 1-star and 10-star versions.",
		Concerns: []string{
			"product:scope_direction", "eng:complexity_tier", "qa:test_depth",
		},
	},
	{
		ID:   "reversibility",
		Text: "Does this change involve an irreversible decision?",
		Concerns: []string{
			"product:one_way_door", "eng:migration_strategy", "qa:verification_stringency",
		},
	},
	{
		ID:   "user_impact",
		Text: "Does this change affect existing users' behavior?",
		Concerns: []string{
			"product:breaking_change", "eng:backward_compat", "qa:regression_tests",
		},
	},
	{
		ID:   "verification",
		Text: "How do you verify this works correctly?",
		Concerns: []string{
			"product:success_metric", "eng:test_strategy", "qa:acceptance_criteria",
		},
	},
	{
		ID:   "scope_boundary",
		Text: "What should this feature NOT do?",
		Concerns: []string{
			"product:focus", "eng:out_of_scope", "qa:negative_tests",
		},
	},
}

// builtInExtras are always injected regardless of active concerns.
//
//nolint:gochecknoglobals
var builtInExtras = []ConcernExtra{
	{
		QuestionID: "verification",
		Text:       "What tests should be written? (unit, integration, e2e — be specific about what behavior to test)",
	},
	{
		QuestionID: "verification",
		Text:       "What documentation needs updating? (README, API docs, CHANGELOG, inline comments)",
	},
}

// =============================================================================
// Question helpers
// =============================================================================

// GetQuestionsWithExtras returns the 6 base questions augmented with extras
// from active concerns (mirrors getQuestionsWithExtras in questions.ts).
func GetQuestionsWithExtras(activeConcerns []ConcernDefinition) []QuestionWithExtras {
	result := make([]QuestionWithExtras, len(questions))

	for i, q := range questions {
		var extras []ConcernExtra

		// Built-in extras first
		for _, e := range builtInExtras {
			if e.QuestionID == q.ID {
				extras = append(extras, e)
			}
		}

		// Concern-contributed extras
		extras = append(extras, GetConcernExtras(activeConcerns, q.ID)...)

		if extras == nil {
			extras = []ConcernExtra{}
		}

		result[i] = QuestionWithExtras{Question: q, Extras: extras}
	}

	return result
}

// GetNextUnanswered returns the first unanswered question, or nil when all
// questions have answers (mirrors getNextUnanswered in questions.ts).
func GetNextUnanswered(questions []QuestionWithExtras, answers []DiscoveryAnswer) *QuestionWithExtras {
	answered := make(map[string]bool, len(answers))
	for _, a := range answers {
		answered[a.QuestionID] = true
	}

	for i := range questions {
		if !answered[questions[i].ID] {
			return &questions[i]
		}
	}

	return nil
}

// IsDiscoveryComplete reports whether all 6 base questions have been answered.
func IsDiscoveryComplete(answers []DiscoveryAnswer) bool {
	answered := make(map[string]bool, len(answers))
	for _, a := range answers {
		answered[a.QuestionID] = true
	}

	for _, q := range questions {
		if !answered[q.ID] {
			return false
		}
	}

	return true
}
