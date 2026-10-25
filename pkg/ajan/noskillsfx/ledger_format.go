// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

package noskillsfx

import "strings"

// The -o markdown and -o text documents of commands/ledger.ts formatLedger
// and formatMeasurementDraft. -o json prints the value itself.

// FormatLedger is formatLedger: the ledger output (spec, records, summary)
// as a document, or as FormatOutput prints it for json.
func FormatLedger(output *JSObject, format string) (string, error) {
	if format != OutputMarkdown && format != OutputText {
		return FormatOutput(output, format)
	}

	spec, specPresent := output.get("spec")
	records, _ := output.getOr("records").([]any)
	summary, _ := output.get("summary")

	decisions := make([]string, 0, len(records))
	for _, record := range records {
		state, statePresent := lenientField(record, "state")
		decisions = append(decisions, decisionLine(record, templateOf(state, statePresent)))
	}

	if len(decisions) == 0 {
		decisions = append(decisions, "No decisions recorded.")
	}

	return ledgerLayout(format, "Decision ledger: "+templateOf(spec, specPresent),
		ledgerSection{"Decisions", decisions},
		ledgerSection{"Summary", ledgerSummaryLines(summary)},
	), nil
}

// FormatMeasurementDraft is formatMeasurementDraft: a measurement draft's
// decisions listed like the ledger's, or the draft as FormatOutput prints it
// for json.
func FormatMeasurementDraft(draft *JSObject, format string) (string, error) {
	if format != OutputMarkdown && format != OutputText {
		return FormatOutput(draft, format)
	}

	title, titlePresent := draft.get("title")
	entries, _ := lenientField(draft, "guided", "decisions")
	list, _ := entries.([]any)

	decisions := make([]string, 0, len(list))
	for _, entry := range list {
		phase, phasePresent := lenientField(entry, "phase")
		decisions = append(decisions, decisionLine(entry, templateOf(phase, phasePresent)))
	}

	if len(decisions) == 0 {
		decisions = append(decisions, "No decisions recorded.")
	}

	return ledgerLayout(format, templateOf(title, titlePresent), ledgerSection{"Decisions", decisions}), nil
}

type ledgerSection struct {
	heading string
	body    []string
}

// ledgerLayout is layout: a markdown document, or the same lines with
// "Heading:" in place of the markdown headings for text.
func ledgerLayout(format, title string, sections ...ledgerSection) string {
	lines := []string{title}
	if format == OutputMarkdown {
		lines[0] = "# " + title
	}

	for _, section := range sections {
		heading := section.heading + ":"
		if format == OutputMarkdown {
			heading = "## " + section.heading
		}

		lines = append(lines, "", heading, "")
		lines = append(lines, section.body...)
	}

	return strings.Join(lines, "\n")
}

// decisionLine is decisionLine: "- id (phase, category, provenance): Q A".
func decisionLine(entry any, phase string) string {
	part := func(key string) string {
		value, present := lenientField(entry, key)

		return templateOf(value, present)
	}

	return "- " + part("id") + " (" + phase + ", " + part("category") + ", " + part("provenance") + "): " +
		part("question") + " " + part("resolution")
}

// ledgerSummaryLines is summaryLines; summary.json values that are missing
// print as undefined, as the optional chains in TypeScript do.
func ledgerSummaryLines(summary any) []string {
	if summary == nil {
		return []string{"No summary yet."}
	}

	value := func(keys ...string) string {
		v, present := lenientField(summary, keys...)

		return templateOf(v, present)
	}
	presence := func(keys ...string) string {
		if v, _ := lenientField(summary, keys...); v == true {
			return "present"
		}

		return "missing"
	}

	return []string{
		"- Resolved decisions: " + value("resolved_decisions") +
			" (ratified " + value("provenance_breakdown", "ratified") +
			", inferred " + value("provenance_breakdown", "inferred") +
			", default " + value("provenance_breakdown", "default") + ")",
		"- Open questions: " + value("open_questions"),
		"- Named artifacts: " + value("specificity", "named_artifacts_count"),
		"- Acceptance criteria: " + presence("specificity", "acceptance_criteria_present"),
		"- Out of scope: " + presence("specificity", "out_of_scope_present"),
	}
}

// lenientField is value?.a?.b: undefined (present false) as soon as a step
// is null, missing or not an object.
func lenientField(value any, keys ...string) (any, bool) {
	current := value
	for _, key := range keys {
		o, ok := current.(*JSObject)
		if !ok {
			return nil, false
		}

		next, present := o.get(key)
		if !present {
			return nil, false
		}

		current = next
	}

	return current, true
}
