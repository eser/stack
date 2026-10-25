// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

package noskillsfx

import (
	"os"
	"path/filepath"
	"regexp"
	"slices"
	"strconv"
	"strings"
	"time"
)

// The decision ledger (state/decision-ledger.ts) records, per spec, every
// decision a state write resolved: one JSON line per record in
// ledger/<spec>/ledger.jsonl and a summary.json rebuilt on each write. It
// only observes: every failure here is ignored, so it never stops a write.
// Record ids are pure functions of the content, which makes the capture
// idempotent.

// ledgerQuestionCategory maps a discovery question id to its category.
func ledgerQuestionCategory(questionID string) string {
	switch questionID {
	case "status_quo", "ambition":
		return "scope"
	case "reversibility", "user_impact":
		return "constraint"
	case "verification":
		return "acceptance-criteria"
	case "scope_boundary":
		return "out-of-scope"
	default:
		return "other"
	}
}

func questionTextFor(questionID string) string {
	for _, q := range questions {
		if q.ID == questionID {
			return q.Text
		}
	}

	return questionID
}

// stableStamp is the epoch milliseconds of an ISO timestamp, as text; a
// timestamp that does not parse is used as it is ("0" when empty).
func stableStamp(timestamp string) string {
	if t, ok := parseISODate(timestamp); ok {
		return strconv.FormatInt(t.UnixMilli(), 10)
	}

	if timestamp != "" {
		return timestamp
	}

	return "0"
}

// djb2Hash is the ledger's hashStr: djb2 over UTF-16 code units, in base 36.
func djb2Hash(value string) string {
	h := uint32(5381)

	for _, unit := range utf16Units(value) {
		h = (h << 5) + h + uint32(unit)
	}

	return strconv.FormatUint(uint64(h), 36)
}

// ledgerCaptureTimestamp is the state's lastCalledAt, or now.
func ledgerCaptureTimestamp(state *JSObject, now time.Time) string {
	if at, ok := state.strOK("lastCalledAt"); ok {
		return at
	}

	return ISOTime(now)
}

var blockedDecisionID = regexp.MustCompile(`^d\d+$`) //nolint:gochecknoglobals // compiled once

func ledgerRecord(id, phase, category, question, resolution, provenance, timestamp string, artifacts []any) *JSObject {
	return JSObjectOf(
		"id", id,
		"state", phase,
		"category", category,
		"question", question,
		"resolution", resolution,
		"provenance", provenance,
		"timestamp", timestamp,
		"artifacts", artifacts,
	)
}

func ledgerRecords(state *JSObject, manifest *JSObject, now time.Time) []*JSObject {
	phase := state.str("phase")
	discovery := state.objOrEmpty("discovery")
	captured := ledgerCaptureTimestamp(state, now)

	var records []*JSObject

	for _, answer := range objectsOf(discovery.arr("answers")) {
		kind := "original"
		if t, ok := answer.strOK("type"); ok {
			kind = t
		}

		timestamp, hasTimestamp := answer.strOK("timestamp")
		suffix := djb2Hash(answer.str("answer"))
		recordTime := captured

		if hasTimestamp && timestamp != "" {
			suffix = stableStamp(timestamp)
			recordTime = timestamp
		}

		provenance := "inferred"
		if source := answer.str("source"); source == "STATED" || source == "CONFIRMED" {
			provenance = "ratified"
		}

		questionID := answer.str("questionId")
		records = append(records, ledgerRecord(
			"ans:"+questionID+":"+kind+":"+suffix, phase, ledgerQuestionCategory(questionID),
			questionTextFor(questionID), answer.str("answer"), provenance, recordTime, []any{},
		))
	}

	for _, decision := range objectsOf(state.arr("decisions")) {
		id := decision.str("id")
		category := "other"

		switch {
		case strings.HasPrefix(id, "decision-split-keep"):
			category = "scope"
		case blockedDecisionID.MatchString(id):
			category = "dependency"
		}

		timestamp := decision.str("timestamp")
		if timestamp == "" {
			timestamp = captured
		}

		records = append(records, ledgerRecord(
			"dec:"+id, phase, category, decision.str("question"), decision.str("choice"), "ratified", timestamp, []any{},
		))
	}

	specPath, hasPath := state.obj("specState").strOK("path")

	for _, transition := range objectsOf(state.arr("transitionHistory")) {
		from, to := transition.str("from"), transition.str("to")
		resolution := from + " → " + to + " approved"

		if reason, ok := transition.strOK("reason"); ok {
			resolution = reason
		}

		timestamp := transition.str("timestamp")
		if timestamp == "" {
			timestamp = captured
		}

		artifacts := []any{}
		if hasPath {
			artifacts = []any{specPath}
		}

		records = append(records, ledgerRecord(
			"tr:"+from+":"+to+":"+stableStamp(transition.str("timestamp")), to, ledgerTransitionCategory(to),
			"Transition "+from+" → "+to, resolution, "ratified", timestamp, artifacts,
		))
	}

	if posture, ok := discovery.obj("refinement").strOK("reviewPosture"); ok {
		provenance := "ratified"
		if defaultPosture, set := manifest.strOK("defaultReviewPosture"); set && defaultPosture == posture {
			provenance = "default"
		}

		records = append(records, ledgerRecord(
			"posture:"+posture, phase, "scope", "Review posture for spec refinement", posture, provenance, captured, []any{},
		))
	}

	if classification := state.obj("classification"); classification != nil {
		flags := classificationFlagNames(classification)
		resolution, idPart := "none", "none"

		if len(flags) > 0 {
			resolution, idPart = strings.Join(flags, ", "), strings.Join(flags, ",")
		}

		provenance := "inferred"
		if source := classification.str("source"); source == "confirmed" || source == "manual" {
			provenance = "ratified"
		}

		records = append(records, ledgerRecord(
			"class:"+idPart, phase, "constraint", "Spec classification (UI / CLI / API / migration / data handling)",
			resolution, provenance, captured, []any{},
		))
	}

	for _, ac := range objectsOf(state.arr("customACs")) {
		timestamp := ac.str("timestamp")
		if timestamp == "" {
			timestamp = captured
		}

		records = append(records, ledgerRecord(
			"ac:"+ac.str("id"), ac.str("addedInPhase"), "acceptance-criteria", "Acceptance criterion", ac.str("text"),
			"ratified", timestamp, []any{},
		))
	}

	return records
}

func ledgerTransitionCategory(to string) string {
	switch to {
	case PhaseSpecProposal, PhaseDiscovery:
		return "scope"
	case PhaseSpecApproved, PhaseCompleted:
		return "acceptance-criteria"
	case PhaseBlocked:
		return "dependency"
	default:
		return "sequencing"
	}
}

// classificationFlagNames are the set flags, sorted.
func classificationFlagNames(classification *JSObject) []string {
	var flags []string

	for _, flag := range []string{"involvesWebUI", "involvesCLI", "involvesPublicAPI", "involvesMigration", "involvesDataHandling"} {
		if jsTruthy(classification.getOr(flag)) {
			flags = append(flags, flag)
		}
	}

	slices.Sort(flags)

	return flags
}

// ledgerOpenQuestions is countOpenQuestions.
func ledgerOpenQuestions(state *JSObject, tensions int) int {
	discovery := state.objOrEmpty("discovery")
	count := 0

	for _, followUp := range objectsOf(discovery.arr("followUps")) {
		if followUp.str("status") == "pending" {
			count++
		}
	}

	completeness := CheckSpecCompletenessObject(state.objOrEmpty("specState"))
	count += len(completeness.Unresolved) + len(completeness.PendingDecisions)

	for _, finding := range objectsOf(state.objOrEmpty("execution").arr("confidenceFindings")) {
		if finding.num("confidence") < 5 {
			count++
		}
	}

	switch state.str("phase") {
	case PhaseIdle, PhaseUninitialized, PhaseCompleted:
	default:
		answered := answeredQuestionIDs(discovery.arr("answers"))
		for _, q := range questions {
			if !answered[q.ID] {
				count++
			}
		}
	}

	return count + tensions
}

func answeredQuestionIDs(answers []any) map[string]bool {
	answered := map[string]bool{}
	for _, answer := range objectsOf(answers) {
		answered[answer.str("questionId")] = true
	}

	return answered
}

func ledgerSummary(state *JSObject, ledger []*JSObject, openQuestions int) *JSObject {
	breakdown := map[string]int{"ratified": 0, "inferred": 0, "default": 0}
	artifacts := map[string]bool{}
	execution := state.objOrEmpty("execution")

	for _, file := range stringsOf(execution.arr("modifiedFiles")) {
		artifacts[file] = true
	}

	for _, task := range stringsOf(execution.arr("completedTasks")) {
		artifacts[task] = true
	}

	acPresent := len(state.arr("customACs")) > 0
	outOfScope := false

	for _, record := range ledger {
		breakdown[record.str("provenance")]++

		for _, artifact := range stringsOf(record.arr("artifacts")) {
			artifacts[artifact] = true
		}

		switch record.str("category") {
		case "acceptance-criteria":
			acPresent = true
		case "out-of-scope":
			outOfScope = true
		}
	}

	if path, ok := state.obj("specState").strOK("path"); ok {
		artifacts[path] = true
	}

	for _, answer := range objectsOf(state.objOrEmpty("discovery").arr("answers")) {
		if jsTrim(answer.str("answer")) == "" {
			continue
		}

		switch answer.str("questionId") {
		case "verification":
			acPresent = true
		case "scope_boundary":
			outOfScope = true
		}
	}

	return JSObjectOf(
		"resolved_decisions", jsInteger(len(ledger)),
		"provenance_breakdown", JSObjectOf(
			"ratified", jsInteger(breakdown["ratified"]),
			"inferred", jsInteger(breakdown["inferred"]),
			"default", jsInteger(breakdown["default"]),
		),
		"open_questions", jsInteger(openQuestions),
		"specificity", JSObjectOf(
			"named_artifacts_count", jsInteger(len(artifacts)),
			"acceptance_criteria_present", acPresent,
			"out_of_scope_present", outOfScope,
		),
	)
}

// readLedgerRecords reads ledger.jsonl, skipping lines that do not parse.
func readLedgerRecords(root, spec string) []*JSObject {
	data, err := os.ReadFile(filepath.Join(root, progressesDir, "ledger", spec, "ledger.jsonl")) //nolint:gosec // G304: a ledger of the project
	if err != nil {
		return nil
	}

	var records []*JSObject

	for line := range strings.SplitSeq(jsTrim(string(data)), "\n") {
		if line == "" {
			continue
		}

		if parsed, err := parseJSON(line); err == nil {
			if record, ok := parsed.(*JSObject); ok {
				records = append(records, record)
			}
		}
	}

	return records
}

// CaptureLedger is captureTransition: it appends the records the write from
// previous to next resolved and rebuilds the summary. It runs after the
// state write and ignores every failure.
func CaptureLedger(root string, previous, next *JSObject, warn StateWarner) {
	captureLedgerAt(root, previous, next, warn, time.Now())
}

func captureLedgerAt(root string, previous, next *JSObject, warn StateWarner, now time.Time) {
	spec, ok := next.strOK("spec")
	if !ok {
		spec, ok = previous.strOK("spec")
	}

	if !ok || spec == "" || !validSpecPathName(spec) {
		return
	}

	manifest, _ := readManifestSection(root)

	// Ids already in the previous state or on disk are not new; two equal
	// ids in the new state both count, as the TypeScript filter keeps them.
	seen := map[string]bool{}
	for _, record := range ledgerRecords(previous, manifest, now) {
		seen[record.str("id")] = true
	}

	existing := readLedgerRecords(root, spec)
	for _, record := range existing {
		seen[record.str("id")] = true
	}

	var fresh []*JSObject

	for _, record := range ledgerRecords(next, manifest, now) {
		if !seen[record.str("id")] {
			fresh = append(fresh, record)
		}
	}

	dir := filepath.Join(root, progressesDir, "ledger", spec)
	_ = os.MkdirAll(dir, 0o750) //nolint:gosec // G301: the ledger directory of the project

	if len(fresh) > 0 {
		file := filepath.Join(dir, "ledger.jsonl")
		body, _ := os.ReadFile(file) //nolint:gosec // G304: the ledger of the project

		var b strings.Builder

		b.Write(body)

		for _, record := range fresh {
			b.WriteString(jsonStringify(record))
			b.WriteByte('\n')
		}

		_ = os.WriteFile(file, []byte(b.String()), stateFilePerm) //nolint:gosec // G306: the ledger is not secret
	}

	tensions := 0
	if manifest != nil {
		active := filterConcernsByIDs(ListHookConcerns(root, warn), stringsOf(manifest.arr("concerns")))
		tensions = len(DetectTensions(active))
	}

	summary := ledgerSummary(next, append(existing, fresh...), ledgerOpenQuestions(next, tensions))
	_ = os.WriteFile(filepath.Join(dir, "summary.json"), stateJSON(summary), stateFilePerm) //nolint:gosec // G306: the summary is not secret
}

// filterConcernsByIDs keeps the concerns whose id the list holds, in the
// concerns' own order (`all.filter((c) => ids.includes(c.id))`).
func filterConcernsByIDs(all []ConcernDefinition, ids []string) []ConcernDefinition {
	var active []ConcernDefinition

	for _, concern := range all {
		if containsString(ids, concern.ID) {
			active = append(active, concern)
		}
	}

	return active
}
