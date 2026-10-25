// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

package noskillsfx

import (
	"strings"
)

// The -o markdown and -o text renderers of output/formatter.ts. They read
// the fields of a command's output as loosely as the TypeScript renderers
// do: a field that is missing is skipped, a value prints as a template
// literal prints it ("[object Object]" for an object), and a field read on
// null fails as JavaScript does.

// Output formats of -o / --output.
const (
	OutputJSON     = "json"
	OutputMarkdown = "markdown"
	OutputText     = "text"
)

// FormatOutputError is the TypeError the TypeScript renderer throws when it
// reads a field of a null value.
type FormatOutputError struct {
	Key string
}

func (e *FormatOutputError) Error() string {
	return "Cannot read properties of null (reading '" + e.Key + "')"
}

// FormatOutput is format(data, fmt): the text writeFormatted prints before
// its newline.
func FormatOutput(data any, format string) (string, error) {
	switch format {
	case OutputMarkdown:
		return formatMarkdown(data)
	case OutputText:
		return formatText(data)
	default:
		return jsonStringifyIndent(data), nil
	}
}

// fieldReader reads fields of the output, remembering the first read of a
// field on null, which is where the TypeScript renderer throws.
type fieldReader struct {
	err error
}

// top is get(obj, key): undefined (present false) unless the output is an
// object holding the key.
func (r *fieldReader) top(data any, key string) (any, bool) {
	o, ok := data.(*JSObject)
	if !ok {
		return nil, false
	}

	return o.get(key)
}

// field is `value.key` where value is not undefined: null throws, any other
// value without the key gives undefined.
func (r *fieldReader) field(value any, key string) (any, bool) {
	if value == nil {
		if r.err == nil {
			r.err = &FormatOutputError{Key: key}
		}

		return nil, false
	}

	o, ok := value.(*JSObject)
	if !ok {
		return nil, false
	}

	return o.get(key)
}

// items is `for (const x of value.key)` over an array; anything else
// iterates nothing.
func (r *fieldReader) items(value any, key string) []any {
	field, _ := r.field(value, key)
	items, _ := field.([]any)

	return items
}

// itemLabel is the renderer's label of an acceptance criterion or a debt
// item: "id: text" for the { id, text } objects the compiler emits, the
// value as a template literal prints it for anything else.
func itemLabel(item any) string {
	o, ok := item.(*JSObject)
	if !ok {
		return jsString(item)
	}

	text, hasText := o.get("text")
	if !hasText {
		return jsString(item)
	}

	if id, hasID := o.get("id"); hasID {
		return jsString(id) + ": " + jsString(text)
	}

	return jsString(text)
}

// templateOf is `${value}` for a value that may be undefined.
func templateOf(value any, present bool) string {
	if !present {
		return "undefined"
	}

	return jsString(value)
}

// validationLines is validationOf: who ran the second agent, its summary and
// one line per finding, or ok false when the output holds no validation.
func (r *fieldReader) validationLines(data any) (by, summary string, items []string, ok bool) {
	validation, present := r.top(data, "validation")
	if !present {
		return "", "", nil, false
	}

	agent, agentPresent := r.field(validation, "agent")
	model, modelPresent := r.field(validation, "model")

	by = "not run"
	if !agentPresent || agent != nil {
		by = templateOf(agent, agentPresent) + ", " + templateOf(model, modelPresent)
	}

	if status, _ := r.field(validation, "status"); status == "skipped" {
		reason, reasonPresent := r.field(validation, "reason")

		return by, "Skipped: " + templateOf(reason, reasonPresent), nil, true
	}

	summaryValue, summaryPresent := r.field(validation, "summary")
	findings := r.items(validation, "findings")

	if !summaryPresent {
		summaryValue = undefinedValue{}
	}

	summary = joinedString(summaryValue)

	if len(findings) == 0 {
		parts := []string{}

		for _, part := range []any{summaryValue, "No findings."} {
			if part != "" {
				parts = append(parts, joinedString(part))
			}
		}

		summary = strings.Join(parts, " ")
	}

	for _, finding := range findings {
		severity, severityPresent := r.field(finding, "severity")
		issue, issuePresent := r.field(finding, "issue")
		suggestion, suggestionPresent := r.field(finding, "suggestion")

		line := "[" + templateOf(severity, severityPresent) + "] " + templateOf(issue, issuePresent)
		if !suggestionPresent || suggestion != "" {
			line += " Suggestion: " + templateOf(suggestion, suggestionPresent)
		}

		items = append(items, line)
	}

	return by, summary, items, true
}

// questionsOf are the batched discovery questions, or nil when there are
// none.
func (r *fieldReader) questionsOf(data any) []any {
	value, present := r.top(data, "questions")
	if !present {
		return nil
	}

	questions, _ := value.([]any)

	return questions
}

func formatMarkdown(data any) (string, error) { //nolint:cyclop,funlen,gocognit // formatMarkdown, one block after another
	r := &fieldReader{}
	lines := []string{}
	add := func(more ...string) { lines = append(lines, more...) }

	if phase, ok := r.top(data, "phase"); ok {
		add("# noskills — "+jsString(phase), "")
	}

	if instruction, ok := r.top(data, "instruction"); ok {
		add("## Instruction", "", joinedString(instruction), "")
	}

	for _, q := range r.questionsOf(data) {
		id, idPresent := r.field(q, "id")
		text, textPresent := r.field(q, "text")
		add("## Question: "+templateOf(id, idPresent), "", "> "+templateOf(text, textPresent))

		extrasValue, extrasPresent := r.field(q, "extras")
		if extras, _ := extrasValue.([]any); extrasPresent && len(extras) > 0 {
			add("", "Also consider:")

			for _, extra := range extras {
				add("- " + jsString(extra))
			}
		}

		add("")
	}

	if report, ok := r.top(data, "statusReport"); ok {
		add("## Acceptance Criteria", "")

		for _, criterion := range r.items(report, "criteria") {
			add("- [ ] " + itemLabel(criterion))
		}

		add("")
	}

	if debt, ok := r.top(data, "previousIterationDebt"); ok {
		from, fromPresent := r.field(debt, "fromIteration")
		note, notePresent := r.field(debt, "note")
		add("## Debt (from iteration "+templateOf(from, fromPresent)+")", "", "> "+templateOf(note, notePresent), "")

		for _, item := range r.items(debt, "items") {
			add("- " + itemLabel(item))
		}

		add("")
	}

	if failed, _ := r.top(data, "verificationFailed"); failed == true {
		output, _ := r.top(data, "verificationOutput")
		add("## Verification FAILED", "", "```", nullishString(output), "```", "")
	}

	if by, summary, items, ok := r.validationLines(data); ok {
		add("## Validation ("+by+")", "", summary, "")

		for _, item := range items {
			add("- " + item)
		}

		if len(items) > 0 {
			add("")
		}
	}

	if behavioral, ok := r.top(data, "behavioral"); ok {
		tone, tonePresent := r.field(behavioral, "tone")
		add("## Behavioral", "", "**Tone:** "+templateOf(tone, tonePresent), "")

		for _, rule := range r.items(behavioral, "rules") {
			add("- " + jsString(rule))
		}

		add("")
	}

	if meta, ok := r.top(data, "meta"); ok {
		hint, hintPresent := r.field(meta, "resumeHint")
		add("---", "", "*"+templateOf(hint, hintPresent)+"*", "")
	}

	if transition, ok := r.top(data, "transition"); ok {
		add("## Next Steps", "")

		if o, isObject := transition.(*JSObject); isObject {
			for _, key := range o.orderedKeys() {
				if key != "iteration" {
					add("- **" + key + ":** `" + jsString(o.values[key]) + "`")
				}
			}
		} else if transition == nil {
			// Object.entries(null) throws.
			return "", &FormatOutputError{Key: "entries"}
		}

		add("")
	}

	if summary, ok := r.top(data, "summary"); ok {
		spec, specPresent := r.field(summary, "spec")
		iterations, iterationsPresent := r.field(summary, "iterations")
		decisions, decisionsPresent := r.field(summary, "decisionsCount")
		add("## Summary", "",
			"- Spec: "+templateOf(spec, specPresent),
			"- Iterations: "+templateOf(iterations, iterationsPresent),
			"- Decisions: "+templateOf(decisions, decisionsPresent), "")
	}

	if clear, ok := r.top(data, "clearContext"); ok {
		reason, reasonPresent := r.field(clear, "reason")
		add("---", "", "**Action required:** "+templateOf(reason, reasonPresent), "")
	}

	if r.err != nil {
		return "", r.err
	}

	return strings.Join(lines, "\n"), nil
}

func formatText(data any) (string, error) { //nolint:cyclop,funlen,gocognit // formatText, one block after another
	r := &fieldReader{}
	lines := []string{}
	add := func(more ...string) { lines = append(lines, more...) }

	if phase, ok := r.top(data, "phase"); ok {
		add("[" + jsString(phase) + "]")
	}

	if instruction, ok := r.top(data, "instruction"); ok {
		add(joinedString(instruction))
	}

	for _, q := range r.questionsOf(data) {
		id, idPresent := r.field(q, "id")
		text, textPresent := r.field(q, "text")
		add("", "Question ["+templateOf(id, idPresent)+"]: "+templateOf(text, textPresent))

		extrasValue, extrasPresent := r.field(q, "extras")
		if extras, _ := extrasValue.([]any); extrasPresent {
			if extrasValue == nil && r.err == nil {
				r.err = &FormatOutputError{Key: "extras"}
			}

			for _, extra := range extras {
				add("  - " + jsString(extra))
			}
		}
	}

	if report, ok := r.top(data, "statusReport"); ok {
		add("", "Criteria:")

		for _, criterion := range r.items(report, "criteria") {
			add("  - " + itemLabel(criterion))
		}
	}

	if debt, ok := r.top(data, "previousIterationDebt"); ok {
		note, notePresent := r.field(debt, "note")
		add("", joinedField(note, notePresent))

		for _, item := range r.items(debt, "items") {
			add("  - " + itemLabel(item))
		}
	}

	if failed, _ := r.top(data, "verificationFailed"); failed == true {
		output, _ := r.top(data, "verificationOutput")
		add("", "Verification failed: "+jsSliceUnits(nullishString(output), 200))
	}

	if by, summary, items, ok := r.validationLines(data); ok {
		add("", "Validation ("+by+"): "+summary)

		for _, item := range items {
			add("  - " + item)
		}
	}

	if meta, ok := r.top(data, "meta"); ok {
		hint, hintPresent := r.field(meta, "resumeHint")
		add("", joinedField(hint, hintPresent))
	}

	if summary, ok := r.top(data, "summary"); ok {
		spec, specPresent := r.field(summary, "spec")
		iterations, iterationsPresent := r.field(summary, "iterations")
		decisions, decisionsPresent := r.field(summary, "decisionsCount")
		add("Spec: " + templateOf(spec, specPresent) + ", Iterations: " + templateOf(iterations, iterationsPresent) +
			", Decisions: " + templateOf(decisions, decisionsPresent))
	}

	if clear, ok := r.top(data, "clearContext"); ok {
		reason, reasonPresent := r.field(clear, "reason")
		add("", joinedField(reason, reasonPresent))
	}

	if r.err != nil {
		return "", r.err
	}

	return strings.Join(lines, "\n"), nil
}

// nullishString is String(value ?? "").
func nullishString(value any) string {
	if value == nil {
		return ""
	}

	return jsString(value)
}

// undefinedValue stands for undefined inside a value list.
type undefinedValue struct{}

// joinedString is how Array.prototype.join prints an element: "" for null
// and undefined, String(value) otherwise. A value the renderer pushes onto
// its lines without a template prints this way.
func joinedString(value any) string {
	switch value.(type) {
	case nil, undefinedValue:
		return ""
	default:
		return jsString(value)
	}
}

// joinedField is joinedString for a field that may be missing.
func joinedField(value any, present bool) string {
	if !present {
		return ""
	}

	return joinedString(value)
}
