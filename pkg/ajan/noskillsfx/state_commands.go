// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

package noskillsfx

import (
	"path/filepath"
	"slices"
	"strings"
)

// The data side of `noskills ledger`, `noskills rule` and `noskills concern`
// (commands/ledger.ts, commands/rule.ts, commands/concern.ts); cmd/noskills
// prints their results.

// ReadManifestSection is readManifest: the noskills section of
// .eser/manifest.yml, or ok false when there is none.
func ReadManifestSection(root string) (*JSObject, bool) {
	return readManifestSection(root)
}

// ReadLedgerValues is readLedger: every line of a spec's ledger.jsonl that
// parses to something other than null, as it parses. A spec name that would
// leave the ledger folder reads nothing.
func ReadLedgerValues(root, spec string) []any {
	records := []any{}

	if !validSpecPathName(spec) {
		return records
	}

	content, ok := readOptionalFile(filepath.Join(root, progressesDir, "ledger", spec, "ledger.jsonl"))
	if !ok {
		return records
	}

	for _, line := range strings.Split(jsTrim(content), "\n") {
		if line == "" {
			continue
		}

		if value, err := parseJSON(line); err == nil && value != nil {
			records = append(records, value)
		}
	}

	return records
}

// ReadLedgerSummaryValue is readSummary: the parsed summary.json, or nil
// (JSON null) when it is missing or does not parse.
func ReadLedgerSummaryValue(root, spec string) any {
	if !validSpecPathName(spec) {
		return nil
	}

	value, ok := readJSONFile(filepath.Join(root, progressesDir, "ledger", spec, "summary.json"))
	if !ok {
		return nil
	}

	return value
}

// MeasurementDraft is toMeasurementDraft: the guided half of a
// measurement-report/v1 draft built from the ledger.
func MeasurementDraft(spec string, records []any) *JSObject {
	decisions := make([]any, 0, len(records))

	for _, record := range records {
		decision := NewJSObject()

		for _, pair := range [][2]string{
			{"id", "id"}, {"category", "category"}, {"question", "question"}, {"resolution", "resolution"},
			{"provenance", "provenance"}, {"phase", "state"},
		} {
			if value, ok := FieldOf(record, pair[1]); ok {
				decision.set(pair[0], value)
			}
		}

		decisions = append(decisions, decision)
	}

	return JSObjectOf(
		"schemaVersion", "measurement-report/v1",
		"specId", spec,
		"title", spec+" (live ledger)",
		"guided", JSObjectOf("decisions", decisions),
	)
}

// StripRuleQuotes takes one quote off each end of a pattern, as
// `--applies-to=` values are read.
func StripRuleQuotes(value string) string {
	return stripFrontmatterQuotes(value)
}

// ConcernMessage is a line concern add prints for one id: Unknown names an
// id no concern has, Active one that is already active.
type ConcernMessage struct {
	Unknown string
	Active  string
}

// ConcernActivation is what concern add did.
type ConcernActivation struct {
	Messages  []ConcernMessage
	Added     []string
	Available []string
}

// readProjectConcern is readConcern: the project's .eser/concerns/<id>.json
// when it parses.
func readProjectConcern(root, id string) bool {
	if strings.ContainsAny(id, `/\`) || id == ".." || id == "." {
		return false
	}

	value, ok := readJSONFile(filepath.Join(root, concernsDir, id+".json"))

	return ok && value != nil
}

// ActivateConcerns is concern add: each id, in argument order, is taken
// from the project's concerns or from the built-in ones (whose file is then
// written), and the new ones are added to the manifest.
func ActivateConcerns(root string, section *JSObject, ids []string) (ConcernActivation, error) {
	result := ConcernActivation{Messages: nil, Added: nil, Available: nil}

	defaults, err := DefaultConcernObjects()
	if err != nil {
		return result, err
	}

	for _, concern := range defaults {
		result.Available = append(result.Available, concern.Definition.ID)
	}

	active := section.arr("concerns")

	for _, id := range ids {
		found := readProjectConcern(root, id)

		if !found {
			for _, concern := range defaults {
				if concern.Definition.ID != id {
					continue
				}

				found = true

				if err := writeSyncFile(filepath.Join(root, concernsDir, id+".json"), string(stateJSON(concern.Raw))); err != nil {
					return result, err
				}

				break
			}
		}

		if !found {
			result.Messages = append(result.Messages, ConcernMessage{Unknown: id, Active: ""})

			continue
		}

		if slices.Contains(active, any(id)) || slices.Contains(result.Added, id) {
			result.Messages = append(result.Messages, ConcernMessage{Unknown: "", Active: id})

			continue
		}

		result.Added = append(result.Added, id)
	}

	if len(result.Added) == 0 {
		return result, nil
	}

	return result, WriteManifestSection(root, section.with("concerns", appendAny(active, anyOf(result.Added)...)))
}

// DeactivateConcern is concern remove: it reports whether the id was active
// and takes it out of the manifest.
func DeactivateConcern(root string, section *JSObject, id string) (bool, error) {
	active := section.arr("concerns")
	if !slices.Contains(active, any(id)) {
		return false, nil
	}

	kept := slices.DeleteFunc(slices.Clone(active), func(value any) bool { return value == id })

	return true, WriteManifestSection(root, section.with("concerns", kept))
}

// ConcernList is what concern list shows: the built-in concerns and the
// manifest's active list as it is.
type ConcernList struct {
	All    []DefaultConcernObject
	Active []any
}

// ConcernGroup is the concerns of one category, in their order.
type ConcernGroup struct {
	Category string
	Concerns []ConcernDefinition
}

// ListConcernsForCommand reads the built-in concerns and the active list.
func ListConcernsForCommand(root string) (ConcernList, error) {
	all, err := DefaultConcernObjects()
	if err != nil {
		return ConcernList{All: nil, Active: nil}, err
	}

	active := []any{}

	if section, ok := readManifestSection(root); ok {
		if value, present := section.get("concerns"); present && value != nil {
			if items, isList := value.([]any); isList {
				active = items
			}
		}
	}

	return ConcernList{All: all, Active: active}, nil
}

func concernCategory(concern *ConcernDefinition) string {
	if concern.Category != nil {
		return *concern.Category
	}

	return "general"
}

// IsActive reports whether the manifest lists the concern.
func (c ConcernList) IsActive(id string) bool { //nolint:gocritic // hugeParam: read-only
	return slices.Contains(c.Active, any(id))
}

// Groups are the concerns by category, in the order the categories first
// appear.
func (c ConcernList) Groups() []ConcernGroup { //nolint:gocritic // hugeParam: read-only
	var groups []ConcernGroup

	for i := range c.All {
		category := concernCategory(&c.All[i].Definition)

		at := slices.IndexFunc(groups, func(g ConcernGroup) bool { return g.Category == category })
		if at == -1 {
			groups = append(groups, ConcernGroup{Category: category, Concerns: nil})
			at = len(groups) - 1
		}

		groups[at].Concerns = append(groups[at].Concerns, c.All[i].Definition)
	}

	return groups
}

// ActiveDefinitions are the built-in concerns the manifest lists.
func (c ConcernList) ActiveDefinitions() []ConcernDefinition { //nolint:gocritic // hugeParam: read-only
	var active []ConcernDefinition

	for i := range c.All {
		if c.IsActive(c.All[i].Definition.ID) {
			active = append(active, c.All[i].Definition)
		}
	}

	return active
}

// JSON is the `concern list --json` output.
func (c ConcernList) JSON() *JSObject { //nolint:gocritic // hugeParam: read-only
	concerns := make([]any, len(c.All))

	for i := range c.All {
		definition := &c.All[i].Definition
		concerns[i] = JSObjectOf(
			"id", definition.ID,
			"description", definition.Description,
			"category", concernCategory(definition),
			"isActive", c.IsActive(definition.ID),
		)
	}

	return JSObjectOf("concerns", concerns, "active", c.Active)
}
