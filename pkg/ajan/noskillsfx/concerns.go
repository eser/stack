// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

package noskillsfx

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"sort"
	"strings"
)

// =============================================================================
// Concern loader
// =============================================================================

// LoadConcerns reads all *.json files from dirPath, sorts them by filename,
// and returns the parsed ConcernDefinition slice.
// Returns an empty slice (not an error) when the directory does not exist.
func LoadConcerns(dirPath string) ([]ConcernDefinition, error) {
	entries, err := os.ReadDir(dirPath)
	if err != nil {
		if os.IsNotExist(err) {
			return []ConcernDefinition{}, nil
		}

		return nil, fmt.Errorf("loadConcerns: %w", err)
	}

	names := make([]string, 0, len(entries))

	for _, e := range entries {
		if !e.IsDir() && strings.HasSuffix(e.Name(), ".json") {
			names = append(names, e.Name())
		}
	}

	sort.Strings(names) // numeric prefixes ensure stable ordering

	concerns := make([]ConcernDefinition, 0, len(names))

	for _, name := range names {
		filePath := filepath.Join(dirPath, name)

		data, err := os.ReadFile(filePath) //nolint:gosec // path from dir scan
		if err != nil {
			return nil, fmt.Errorf("loadConcerns: read %s: %w", name, err)
		}

		var c ConcernDefinition
		if err := json.Unmarshal(data, &c); err != nil {
			return nil, fmt.Errorf("loadConcerns: parse %s: %w", name, err)
		}

		// If a promptFile is set, load it and append its content to reminders.
		if c.PromptFile != nil {
			promptPath := filepath.Join(filepath.Dir(filePath), *c.PromptFile)

			promptData, err := os.ReadFile(promptPath) //nolint:gosec // path from concern definition
			if err != nil {
				return nil, fmt.Errorf("loadConcerns: promptFile for %q not found at %s: %w", c.ID, promptPath, err)
			}

			if content := strings.TrimSpace(string(promptData)); content != "" {
				c.Reminders = append(c.Reminders, content)
			}
		}

		concerns = append(concerns, c)
	}

	return concerns, nil
}

// FilterActiveConcerns returns only the concerns whose IDs appear in activeIDs.
// The returned slice preserves the order of the input concerns list.
func FilterActiveConcerns(all []ConcernDefinition, activeIDs []string) []ConcernDefinition {
	set := make(map[string]bool, len(activeIDs))
	for _, id := range activeIDs {
		set[id] = true
	}

	result := make([]ConcernDefinition, 0, len(activeIDs))

	for _, c := range all {
		if set[c.ID] {
			result = append(result, c)
		}
	}

	return result
}

// =============================================================================
// Concern operations (mirrors concerns.ts exports)
// =============================================================================

// GetConcernExtras returns all ConcernExtra entries for a given questionId
// across all active concerns.
func GetConcernExtras(concerns []ConcernDefinition, questionID string) []ConcernExtra {
	var extras []ConcernExtra

	for _, c := range concerns {
		for _, e := range c.Extras {
			if e.QuestionID == questionID {
				extras = append(extras, e)
			}
		}
	}

	return extras
}

// GetReminders aggregates reminders from all active concerns, optionally
// filtering out file-type-specific reminders when classification is present.
func GetReminders(concerns []ConcernDefinition, classification *SpecClassification) []string {
	var reminders []string

	for _, c := range concerns {
		for _, r := range c.Reminders {
			if classification != nil && isClassificationFilteredOut(r, classification) {
				continue
			}

			reminders = append(reminders, c.ID+": "+r)
		}
	}

	return reminders
}

// isClassificationFilteredOut returns true when a reminder should be hidden
// given the current classification flags.
func isClassificationFilteredOut(reminder string, cl *SpecClassification) bool {
	lower := strings.ToLower(reminder)

	uiKeywords := []string{"slop", "ui element", "design intentionality", "interaction states", "edge case check", "loading state"}
	apiKeywords := []string{"api doc", "endpoint should be"}

	for _, kw := range uiKeywords {
		if strings.Contains(lower, kw) && !cl.InvolvesWebUI {
			return true
		}
	}

	for _, kw := range apiKeywords {
		if strings.Contains(lower, kw) && !cl.InvolvesPublicAPI {
			return true
		}
	}

	return false
}

// isFileSpecificReminder returns true when a reminder is file-type-specific
// (UI/API/migration) rather than general.
func isFileSpecificReminder(reminder string) bool {
	lower := strings.ToLower(reminder)
	fileSpecific := []string{
		"slop", "ui element", "design intentionality", "interaction states",
		"edge case check", "loading state", "api doc", "endpoint should be",
		"migration", "rollback",
	}

	for _, kw := range fileSpecific {
		if strings.Contains(lower, kw) {
			return true
		}
	}

	return false
}

// SplitRemindersByTier separates reminders into tier-1 (general, always shown)
// and tier-2 (file-type-specific, shown when editing relevant files).
func SplitRemindersByTier(concerns []ConcernDefinition) (tier1, tier2 []string) {
	for _, c := range concerns {
		for _, r := range c.Reminders {
			prefixed := c.ID + ": " + r
			if isFileSpecificReminder(r) {
				tier2 = append(tier2, prefixed)
			} else {
				tier1 = append(tier1, prefixed)
			}
		}
	}

	return tier1, tier2
}

// GetTier2RemindersForFile returns tier-2 reminders applicable to a specific file.
func GetTier2RemindersForFile(concerns []ConcernDefinition, filePath string, cl *SpecClassification) []string {
	ext := ""
	if idx := strings.LastIndex(filePath, "."); idx != -1 {
		ext = filePath[idx:]
	}

	uiExts := map[string]bool{".tsx": true, ".jsx": true, ".html": true, ".css": true, ".svelte": true, ".vue": true}
	apiExts := map[string]bool{".ts": true, ".go": true, ".py": true, ".rs": true}
	isUI := uiExts[ext]
	isAPI := apiExts[ext]

	var reminders []string

	for _, c := range concerns {
		for _, r := range c.Reminders {
			if !isFileSpecificReminder(r) {
				continue
			}

			lower := strings.ToLower(r)

			uiKWs := []string{"slop", "ui element", "design intentionality", "interaction states", "edge case check", "loading state"}
			apiKWs := []string{"api doc", "endpoint should be"}

			isUIReminder := false
			for _, kw := range uiKWs {
				if strings.Contains(lower, kw) {
					isUIReminder = true

					break
				}
			}

			if isUIReminder && !isUI {
				continue
			}

			isAPIReminder := false
			for _, kw := range apiKWs {
				if strings.Contains(lower, kw) {
					isAPIReminder = true

					break
				}
			}

			if isAPIReminder && (!isAPI || cl == nil || !cl.InvolvesPublicAPI) {
				continue
			}

			reminders = append(reminders, c.ID+": "+r)
		}
	}

	return reminders
}

// ConcernTension describes a conflict between two active concerns.
type ConcernTension struct {
	Between []string `json:"between"`
	Issue   string   `json:"issue"`
}

// DetectTensions returns tensions between pairs of active concerns.
func DetectTensions(activeConcerns []ConcernDefinition) []ConcernTension {
	ids := make(map[string]bool, len(activeConcerns))
	for _, c := range activeConcerns {
		ids[c.ID] = true
	}

	type pair struct{ a, b, issue string }

	known := []pair{
		{"move-fast", "compliance", "Speed vs traceability — shortcuts may violate audit requirements."},
		{"move-fast", "long-lived", "Shipping speed vs maintainability — tech debt decisions need human approval."},
		{"beautiful-product", "move-fast", "Design polish vs speed — which UI states can be deferred?"},
		{"well-engineered", "move-fast", "Engineering rigor vs shipping speed — which quality dimensions can be deferred to v2?"},
		{"well-engineered", "learning-project", "Engineering standards vs experimentation freedom — how much rigor is appropriate for an experiment?"},
		{"move-fast", "security-audited", "Shipping speed vs security rigor — security audit phases add time."},
		{"move-fast", "ship-ready", "Speed vs ship hygiene — ship-ready gates add friction; each must be justified or automated."},
		{"move-fast", "peer-reviewed", "Shipping speed vs review thoroughness — Critical Pass items are non-negotiable blockers."},
		{"developer-experience", "compliance", "Zero-friction DX vs mandatory compliance steps."},
	}

	var tensions []ConcernTension

	for _, p := range known {
		if ids[p.a] && ids[p.b] {
			tensions = append(tensions, ConcernTension{
				Between: []string{p.a, p.b},
				Issue:   p.issue,
			})
		}
	}

	return tensions
}

// GetDreamStatePrompts returns dream-state prompts from all active concerns.
func GetDreamStatePrompts(activeConcerns []ConcernDefinition) []string {
	var prompts []string

	for _, c := range activeConcerns {
		if c.DreamStatePrompt != nil && len(*c.DreamStatePrompt) > 0 {
			prompts = append(prompts, *c.DreamStatePrompt)
		}
	}

	return prompts
}

// GetAcceptanceCriteria aggregates ACs from active concerns.
func GetAcceptanceCriteria(activeConcerns []ConcernDefinition) []string {
	var acs []string

	for _, c := range activeConcerns {
		acs = append(acs, c.AcceptanceCriteria...)
	}

	return acs
}
