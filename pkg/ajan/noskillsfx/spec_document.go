// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

package noskillsfx

import (
	"fmt"
	"os"
	"path/filepath"
	"regexp"
	"strings"
	"unicode"
	"unicode/utf16"
)

// spec.md as the execution phase reads and updates it (spec/parser.ts,
// spec/updater.ts), and the full spec document `approve` renders for a spec
// that reached SPEC_PROPOSAL without a classification (spec/template.ts,
// spec/generator.ts).

// ParsedTask is a `- [ ] task-N: Title` line of the Tasks section.
type ParsedTask struct {
	ID    string
	Title string
	// Files are the paths of a `Files:` line under the task.
	Files []string
}

// ParsedSpec is what the compiler reads from spec.md.
type ParsedSpec struct {
	Name         string
	Tasks        []ParsedTask
	OutOfScope   []string
	Verification []string
}

var (
	taskLine  = regexp.MustCompile(`(?i)^-` + jsSpace + `*\[[ x]\]` + jsSpace + `*(task-\d+):` + jsSpace + `*(.+)$`) //nolint:gochecknoglobals // compiled once
	filesLine = regexp.MustCompile(`(?i)^Files?:` + jsSpace + `*(.+)$`)                                              //nolint:gochecknoglobals // compiled once
)

// ParseSpecContent is parseSpecContent: the tasks, out-of-scope items and
// verification items of a spec document.
func ParseSpecContent(specName, content string) ParsedSpec {
	parsed := ParsedSpec{Name: specName}
	section := ""

	for _, line := range strings.Split(content, "\n") {
		trimmed := jsTrim(line)

		if strings.HasPrefix(trimmed, "## ") {
			section = jsToLower(jsTrim(trimmed[3:]))

			continue
		}

		if strings.HasPrefix(section, "tasks") {
			if m := taskLine.FindStringSubmatch(trimmed); m != nil {
				parsed.Tasks = append(parsed.Tasks, ParsedTask{ID: m[1], Title: jsTrim(m[2])})
			}

			if m := filesLine.FindStringSubmatch(trimmed); m != nil && len(parsed.Tasks) > 0 {
				var files []string

				for _, f := range strings.Split(m[1], ",") {
					f = strings.TrimSuffix(strings.TrimPrefix(jsTrim(f), "`"), "`")
					if f != "" {
						files = append(files, f)
					}
				}

				if len(files) > 0 {
					parsed.Tasks[len(parsed.Tasks)-1].Files = files
				}
			}
		}

		if strings.HasPrefix(section, "out of scope") && strings.HasPrefix(trimmed, "- ") {
			parsed.OutOfScope = append(parsed.OutOfScope, jsTrim(trimmed[2:]))
		}

		if strings.HasPrefix(section, "verification") && strings.HasPrefix(trimmed, "- ") {
			parsed.Verification = append(parsed.Verification, jsTrim(trimmed[2:]))
		}
	}

	return parsed
}

// specFilePath is the absolute path of a spec's spec.md.
func specFilePath(root, specName string) string {
	return filepath.Join(root, specsDir, specName, "spec.md")
}

// ReadParsedSpec is parseSpec: nil when the spec has no spec.md.
func ReadParsedSpec(root, specName string) *ParsedSpec {
	if !validSpecPathName(specName) {
		return nil
	}

	data, err := os.ReadFile(specFilePath(root, specName))
	if err != nil {
		return nil
	}

	parsed := ParseSpecContent(specName, string(data))

	return &parsed
}

var specStatusLine = regexp.MustCompile(`(?m)^## Status: .+$`) //nolint:gochecknoglobals // compiled once

// updateSpecStatus rewrites the `## Status:` line; a spec without spec.md
// is left alone.
func updateSpecStatus(root, specName, status string) {
	path := specFilePath(root, specName)

	data, err := os.ReadFile(path) //nolint:gosec // G304: the spec of the project
	if err != nil {
		return
	}

	updated := jsReplaceFirstRegexp(string(data), specStatusLine, "## Status: "+status)
	_ = os.WriteFile(path, []byte(updated), stateFilePerm) //nolint:gosec // G306: spec.md is not secret
}

// markTaskCompleted ticks a task's checkbox.
func markTaskCompleted(root, specName, taskID string) {
	path := specFilePath(root, specName)

	data, err := os.ReadFile(path) //nolint:gosec // G304: the spec of the project
	if err != nil {
		return
	}

	pattern := regexp.MustCompile(`(?m)^(- )\[ \]( ` + regexp.QuoteMeta(taskID) + `:.*)$`)
	updated := jsReplaceFirstRegexp(string(data), pattern, "$1[x]$2")
	_ = os.WriteFile(path, []byte(updated), stateFilePerm) //nolint:gosec // G306: spec.md is not secret
}

// updateProgress rewrites the spec's progress.json through change; a spec
// without one is left alone.
func updateProgress(root, specName, nowISO string, change func(progress *JSObject)) {
	path := filepath.Join(root, specsDir, specName, "progress.json")

	data, err := os.ReadFile(path) //nolint:gosec // G304: the progress file of the project
	if err != nil {
		return
	}

	parsed, err := parseJSON(string(data))
	if err != nil {
		return
	}

	progress, ok := parsed.(*JSObject)
	if !ok {
		return
	}

	change(progress)
	progress.set("updatedAt", nowISO)
	_ = os.WriteFile(path, stateJSON(progress), stateFilePerm) //nolint:gosec // G306: progress.json is not secret
}

// updateProgressTask sets a task's status in progress.json.
func updateProgressTask(root, specName, taskID, status, nowISO string) {
	updateProgress(root, specName, nowISO, func(progress *JSObject) {
		for _, task := range objectsOf(progress.arr("tasks")) {
			if task.str("id") == taskID {
				task.set("status", status)
			}
		}
	})
}

// updateProgressStatus sets the spec's status in progress.json.
func updateProgressStatus(root, specName, status, nowISO string) {
	updateProgress(root, specName, nowISO, func(progress *JSObject) { progress.set("status", status) })
}

// jsSliceUnits is `s.slice(0, n)` in UTF-16 code units.
func jsSliceUnits(s string, n int) string {
	units := utf16.Encode([]rune(s))
	if len(units) <= n {
		return s
	}

	return string(utf16.Decode(units[:n]))
}

// jsCapitalize is `s.charAt(0).toUpperCase() + s.slice(1)`.
func jsCapitalize(s string) string {
	for i, r := range s {
		return string(unicode.ToUpper(r)) + s[i+len(string(r)):]
	}

	return s
}

// toBulletList splits text into list items at line breaks, or at sentence
// ends (a period before whitespace and a capital letter) and semicolons.
func toBulletList(text string) []string {
	var lines []string

	for _, line := range strings.Split(text, "\n") {
		if t := jsTrim(line); t != "" {
			lines = append(lines, t)
		}
	}

	if len(lines) > 1 {
		return lines
	}

	var parts []string

	start := 0
	runes := []rune(text)

	for i := 0; i < len(runes); i++ {
		switch runes[i] {
		case '.':
			j := i + 1
			for j < len(runes) && isJSSpace(runes[j]) {
				j++
			}

			if j > i+1 && j < len(runes) && runes[j] >= 'A' && runes[j] <= 'Z' {
				parts = append(parts, string(runes[start:i]))
				start = i + 1
			}
		case ';':
			j := i + 1
			for j < len(runes) && isJSSpace(runes[j]) {
				j++
			}

			if j > i+1 {
				parts = append(parts, string(runes[start:i]))
				start = j
				i = j - 1
			}
		}
	}

	parts = append(parts, string(runes[start:]))

	var items []string

	for _, part := range parts {
		if t := jsTrim(part); jsLength(t) > 5 {
			items = append(items, t)
		}
	}

	return items
}

var (
	tenStar         = regexp.MustCompile(`(?is)10[- ]?star[:` + jsSpaceClass + `]+(.+?)(?:\n|$)`)                      //nolint:gochecknoglobals // compiled once
	fiveStar        = regexp.MustCompile(`(?is)5[- ]?star[:` + jsSpaceClass + `]+(.+?)(?:\n|$)`)                       //nolint:gochecknoglobals // compiled once
	oneStar         = regexp.MustCompile(`(?i)1[- ]?star[:` + jsSpaceClass + `]+[^.]*\.` + jsSpace + `*`)              //nolint:gochecknoglobals // compiled once
	leadingFiller   = regexp.MustCompile(`(?i)^(the|a|an|with|plus|also)` + jsSpace + `+`)                             //nolint:gochecknoglobals // compiled once
	leadingGoal     = regexp.MustCompile(`(?i)^(the` + jsSpace + `+)?(target|goal|objective)[:` + jsSpaceClass + `]+`) //nolint:gochecknoglobals // compiled once
	trailingStops   = regexp.MustCompile(`[.\x{2026}]+$`)                                                              //nolint:gochecknoglobals // compiled once
	bulletPrefix    = regexp.MustCompile(`^` + jsSpace + `*[-\x{2022}*]` + jsSpace + `*`)                              //nolint:gochecknoglobals // compiled once
	shouldWePrefix  = regexp.MustCompile(`(?i)^should` + jsSpace + `+(we|i)` + jsSpace + `+`)                          //nolint:gochecknoglobals // compiled once
	trailingQueries = regexp.MustCompile(`\?+$`)                                                                       //nolint:gochecknoglobals // compiled once
)

// deriveTasks is deriveTasks in spec/template.ts.
func deriveTasks(answers []*JSObject, decisions []*JSObject) []string {
	var tasks []string

	if ambition := answerFor(answers, "ambition"); ambition != nil {
		text := ambition.str("answer")

		var goal string

		switch {
		case tenStar.MatchString(text):
			goal = jsTrim(tenStar.FindStringSubmatch(text)[1])
		case fiveStar.MatchString(text):
			goal = jsTrim(fiveStar.FindStringSubmatch(text)[1])
		default:
			goal = jsTrim(jsReplaceFirstRegexp(text, oneStar, ""))
		}

		cleaned := jsReplaceFirstRegexp(goal, leadingFiller, "")
		cleaned = jsTrim(jsReplaceFirstRegexp(cleaned, leadingGoal, ""))
		cleaned = jsCapitalize(cleaned)
		cleaned = jsTrim(trailingStops.ReplaceAllString(cleaned, ""))

		if jsLength(cleaned) > 140 {
			cleaned = jsSliceUnits(cleaned, 137) + "..."
		}

		if jsLength(cleaned) > 3 {
			tasks = append(tasks, cleaned)
		}
	}

	if verification := answerFor(answers, "verification"); verification != nil {
		for _, item := range strings.Split(verification.str("answer"), "\n") {
			if t := jsTrim(jsReplaceFirstRegexp(item, bulletPrefix, "")); t != "" {
				tasks = append(tasks, t)
			}
		}
	}

	for _, decision := range decisions {
		lower := jsToLower(decision.str("choice"))
		if strings.Contains(lower, "accepted") || strings.Contains(lower, "add to scope") {
			text := jsReplaceFirstRegexp(decision.str("question"), shouldWePrefix, "")
			text = jsTrim(trailingQueries.ReplaceAllString(text, ""))
			tasks = append(tasks, jsCapitalize(text))
		}
	}

	if len(tasks) == 0 {
		tasks = append(tasks,
			"_Tasks need to be defined before execution. Add tasks manually or run discovery with more detail._")
	}

	return append(tasks,
		"Write or update tests for all new and changed behavior",
		"Update documentation for all public-facing changes (README, API docs, CHANGELOG)",
	)
}

func answerFor(answers []*JSObject, questionID string) *JSObject {
	for _, a := range answers {
		if a.str("questionId") == questionID {
			return a
		}
	}

	return nil
}

// renderSpecDocument is renderSpec in spec/template.ts.
func renderSpecDocument(state *JSObject, concerns []ConcernDefinition) string { //nolint:cyclop,funlen,gocognit // one section after another, as the template has them
	specName := state.str("spec")
	answers := answersObjects(state)
	decisions := objectsOf(state.arr("decisions"))
	classification := classificationFromObject(state.obj("classification"))

	lines := []string{"# Spec: " + specName, "", "## Status: draft", ""}

	if len(concerns) > 0 {
		ids := make([]string, len(concerns))
		for i, c := range concerns {
			ids[i] = c.ID
		}

		lines = append(lines, "## Concerns: "+strings.Join(ids, ", "), "")
	}

	lines = append(lines, "## Discovery Answers", "")

	for _, answer := range answers {
		lines = append(lines, "### "+answer.str("questionId"), "", answer.str("answer"))

		if user, ok := answer.get("user"); ok && user != "Unknown User" {
			lines = append(lines, "", "_-- "+jsDisplay(user)+"_")
		}

		lines = append(lines, "")
	}

	for _, concern := range concerns {
		for _, raw := range concern.SpecSections {
			section := normalizeLivingSection(concern.ID, raw, 0, func(string) string { return "_To be addressed during execution._" })
			if section.conditional() && (classification == nil ||
				!sectionMatchesClassification(section.Scope, section.Condition, classification)) {
				continue
			}

			lines = append(lines, "## "+section.Title+" ("+concern.ID+")", "", section.Placeholder, "")
		}
	}

	for _, concern := range concerns {
		for _, registry := range concern.Registries {
			var dim *ReviewDimension

			for i := range concern.ReviewDimensions {
				if concern.ReviewDimensions[i].ID == registry {
					dim = &concern.ReviewDimensions[i]

					break
				}
			}

			if dim == nil {
				continue
			}

			lines = append(lines, "## "+dim.Label+" ("+concern.ID+")", "", "_"+dim.Prompt+"_", "")

			switch registry {
			case "error-rescue":
				lines = append(lines,
					"| Codepath | What Can Go Wrong | Exception Class | Rescued? | Recovery Action | User Sees |",
					"|----------|-------------------|-----------------|----------|----------------|-----------|",
					"| _To be filled during execution._ | | | | | |")
			case "failure-modes":
				lines = append(lines,
					"| Codepath | Failure Mode | Rescued? | Tested? | User Sees | Logged? |",
					"|----------|--------------|----------|---------|-----------|---------|",
					"| _To be filled during execution._ | | | | | |")
			case "test-plan":
				lines = append(lines,
					"| Behavior | Test Layer | Happy Path | Failure Path | Edge Case |",
					"|----------|------------|------------|--------------|-----------|",
					"| _To be filled during execution._ | | | | |")
			default:
				lines = append(lines, "_To be filled during execution._")
			}

			lines = append(lines, "")
		}
	}

	if len(decisions) > 0 {
		lines = append(lines, "## Decisions", "", "| # | Decision | Choice | Promoted |", "|---|----------|--------|----------|")

		for i, d := range decisions {
			promoted := "no"
			if jsTruthy(d.getOr("promoted")) {
				promoted = "yes"
			}

			lines = append(lines, fmt.Sprintf("| %d | %s | %s | %s |", i+1, d.str("question"), d.str("choice"), promoted))
		}

		lines = append(lines, "")
	}

	if scope := answerFor(answers, "scope_boundary"); scope != nil {
		lines = append(lines, "## Out of Scope", "")
		for _, item := range toBulletList(scope.str("answer")) {
			lines = append(lines, "- "+item)
		}

		lines = append(lines, "")
	}

	lines = append(lines, "## Tasks", "")
	for i, task := range deriveTasks(answers, decisions) {
		lines = append(lines, fmt.Sprintf("- [ ] task-%d: %s", i+1, task))
	}

	lines = append(lines, "", "## Verification", "")

	if verification := answerFor(answers, "verification"); verification != nil {
		for _, item := range toBulletList(verification.str("answer")) {
			lines = append(lines, "- "+item)
		}
	} else {
		lines = append(lines, "_To be defined._")
	}

	lines = append(lines, "")

	if acs := objectsOf(state.arr("customACs")); len(acs) > 0 {
		lines = append(lines, "## Custom Acceptance Criteria", "")
		for _, ac := range acs {
			lines = append(lines, "- "+ac.str("text")+" _-- "+ac.str("user")+", "+ac.str("addedInPhase")+"_")
		}

		lines = append(lines, "")
	}

	var notes []*JSObject

	for _, note := range objectsOf(state.arr("specNotes")) {
		if !strings.HasPrefix(note.str("text"), "[TASK] ") {
			notes = append(notes, note)
		}
	}

	if len(notes) > 0 {
		lines = append(lines, "## Notes", "")
		for _, note := range notes {
			lines = append(lines, "- "+note.str("text")+" _-- "+note.str("user")+", "+note.str("phase")+"_")
		}

		lines = append(lines, "")
	}

	if transitions := objectsOf(state.arr("transitionHistory")); len(transitions) > 0 {
		lines = append(lines, "## Transition History", "", "| From | To | User | Timestamp | Reason |",
			"|------|----|------|-----------|--------|")

		for _, t := range transitions {
			reason := "-"
			if r, ok := t.strOK("reason"); ok {
				reason = r
			}

			lines = append(lines, "| "+t.str("from")+" | "+t.str("to")+" | "+t.str("user")+" | "+t.str("timestamp")+" | "+reason+" |")
		}

		lines = append(lines, "")
	}

	return strings.Join(lines, "\n")
}

// jsDisplay is a value as a template literal prints it, for the strings and
// numbers a state file holds.
func jsDisplay(value any) string {
	switch v := value.(type) {
	case string:
		return v
	case nil:
		return "null"
	case bool, float64, int:
		return jsonStringify(v)
	default:
		return fmt.Sprint(v)
	}
}

// generateSpecDocument is generateSpec: spec.md rendered from the state
// and a progress.json listing its tasks.
func generateSpecDocument(root string, state *JSObject, concerns []ConcernDefinition, nowISO string) error {
	specName, ok := state.strOK("spec")
	if !ok || !validSpecPathName(specName) {
		return lifecycleError("No active spec")
	}

	dir := filepath.Join(root, specsDir, specName)
	if err := os.MkdirAll(dir, 0o750); err != nil {
		return fmt.Errorf("create %s: %w", dir, err)
	}

	content := renderSpecDocument(state, concerns)
	if err := os.WriteFile(filepath.Join(dir, "spec.md"), []byte(content), stateFilePerm); err != nil { //nolint:gosec // G306: spec.md is not secret
		return fmt.Errorf("write spec.md: %w", err)
	}

	parsed := ParseSpecContent(specName, content)
	tasks := make([]any, len(parsed.Tasks))

	for i, t := range parsed.Tasks {
		tasks[i] = JSObjectOf("id", t.ID, "title", t.Title, "status", "pending")
	}

	decisions := []any{}
	for _, d := range objectsOf(state.arr("decisions")) {
		decisions = append(decisions, JSObjectOf("question", d.getOr("question"), "choice", d.getOr("choice"), "promoted", d.getOr("promoted")))
	}

	progress := JSObjectOf("spec", specName, "status", "draft", "tasks", tasks, "decisions", decisions, "debt", []any{}, "updatedAt", nowISO)

	if err := os.WriteFile(filepath.Join(dir, "progress.json"), stateJSON(progress), stateFilePerm); err != nil { //nolint:gosec // G306: progress.json is not secret
		return fmt.Errorf("write progress.json: %w", err)
	}

	return nil
}
