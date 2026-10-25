// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

package noskillsfx

import (
	"os"
	"path/filepath"
	"regexp"
	"slices"
	"time"
)

// The ask token (.eser/.state/progresses/ask-token.json): the
// AskUserQuestion hook writes it, and `noskills next` reads it so an answer
// to a question the user was asked is marked STATED instead of INFERRED.
// Port of state/ask-token.ts, the AskUserQuestion parts of
// commands/hook-decisions.ts and context/question-similarity.ts.

const (
	// AskTokenTTL is how long a token stays valid after the question.
	AskTokenTTL = 30 * time.Minute
	// SimilarityExactThreshold is the word overlap above which an asked
	// question counts as asked as written.
	SimilarityExactThreshold = 0.7
)

var questionNonWord = regexp.MustCompile(`[^\p{L}\p{N}` + jsSpaceClass + `]`) //nolint:gochecknoglobals // compiled once

// questionWords is the set of lowercased words longer than two UTF-16
// units, punctuation removed.
func questionWords(text string) map[string]bool {
	words := map[string]bool{}

	for _, word := range jsSplitWhitespace(questionNonWord.ReplaceAllLiteralString(jsToLower(text), " ")) {
		if jsLength(word) > 2 {
			words[word] = true
		}
	}

	return words
}

// CompareQuestions is the Jaccard similarity of two questions' words, from
// 0 to 1; an empty question gives 0.
func CompareQuestions(expected, asked string) float64 {
	a := questionWords(expected)
	b := questionWords(asked)

	if len(a) == 0 || len(b) == 0 {
		return 0
	}

	intersection := 0

	for word := range a {
		if b[word] {
			intersection++
		}
	}

	return float64(intersection) / float64(len(a)+len(b)-intersection)
}

// AskedQuestionsOf returns the questions an AskUserQuestion call asks: the
// text of each entry of `questions`, or the older single `question`.
func AskedQuestionsOf(toolInput HookInput) []string {
	if value, ok := toolInput.get("questions"); ok {
		if entries, isList := value.([]any); isList && len(entries) > 0 {
			asked := []string{}

			for _, entry := range entries {
				if o, isObject := entry.(*JSObject); isObject {
					if question := StringField(o, "question"); question != "" {
						asked = append(asked, question)
					}
				}
			}

			return asked
		}
	}

	if single := StringField(toolInput, "question"); single != "" {
		return []string{single}
	}

	return []string{}
}

// askStepOf is the step of a call that asks no base question.
func askStepOf(phase string) string {
	switch phase {
	case PhaseDiscovery:
		return "discovery"
	case PhaseDiscoveryRefinement:
		return "refinement"
	case PhaseSpecProposal:
		return "approval"
	default:
		return "unknown"
	}
}

func askMatch(expected, asked string) string {
	if CompareQuestions(expected, asked) >= SimilarityExactThreshold {
		return "exact"
	}

	return "modified"
}

func askStep(stepID, match, original, asked string) *JSObject {
	return JSObjectOf("stepId", stepID, "match", match, "originalQuestion", original, "askedQuestion", asked)
}

// discoveryAskSteps gives each asked question the open base question it
// shares the most words with, or the first one left; an open question takes
// one asked question at most.
func discoveryAskSteps(open []Question, asked []string) []any {
	left := slices.Clone(open)
	steps := []any{}

	for _, question := range asked {
		if len(left) == 0 {
			break
		}

		best, bestScore := 0, 0.0

		for i, candidate := range left {
			if score := CompareQuestions(candidate.Text, question); score > bestScore {
				best, bestScore = i, score
			}
		}

		chosen := left[best]
		left = slices.Delete(left, best, best+1)
		steps = append(steps, askStep(chosen.ID, askMatch(chosen.Text, question), chosen.Text, question))
	}

	return steps
}

// isDiscoveryCompleteRaw reports whether every base question has an answer.
func isDiscoveryCompleteRaw(answers []any) bool {
	answered := map[string]bool{}

	for _, answer := range answers {
		if o, ok := answer.(*JSObject); ok {
			answered[StringField(o, "questionId")] = true
		}
	}

	for _, question := range questions {
		if !answered[question.ID] {
			return false
		}
	}

	return true
}

func listLength(value any) int {
	switch v := value.(type) {
	case []any:
		return len(v)
	case string:
		return jsLength(v)
	default:
		return 0
	}
}

// discoveryStageOfRaw is questions.ts discoveryStageOf on unchecked state:
// "listen", "mode", "premises" or "questions".
func discoveryStageOfRaw(state *JSObject) string {
	discovery, _ := fieldObject(state, "discovery")
	description, _ := state.get("specDescription")
	hasDescription := description != nil && listLength(description) > 0

	_, hasMode := discovery.get("mode")
	answersValue, _ := discovery.get("answers")
	answers, _ := answersValue.([]any)
	planPath, planPresent := discovery.get("planPath")

	if !hasMode && hasDescription && len(answers) == 0 && planPresent && planPath == nil {
		userContext, present := discovery.get("userContext")
		if present && listLength(userContext) > 0 {
			return "mode"
		}

		return "listen"
	}

	premisesCompleted, _ := discovery.get("premisesCompleted")
	if hasMode && premisesCompleted != true && !isDiscoveryCompleteRaw(answers) {
		return "premises"
	}

	return "questions"
}

// AskTokenStepsAfter returns the steps the ask token holds after an
// AskUserQuestion call: while discovery collects the base answers, the steps
// of the base questions it asks are added to those of earlier calls (nil to
// keep the token as it is when it asks none and earlier calls recorded
// theirs); any other call gets the one step askStepOf names.
func AskTokenStepsAfter(state *JSObject, prior []any, asked []string) []any {
	phase := StringField(state, "phase")

	if phase == PhaseDiscovery && discoveryStageOfRaw(state) == "questions" {
		recorded := map[string]bool{}

		discovery, _ := fieldObject(state, "discovery")
		answersValue, _ := discovery.get("answers")
		answers, _ := answersValue.([]any)

		for _, answer := range answers {
			if o, ok := answer.(*JSObject); ok {
				recorded[StringField(o, "questionId")] = true
			}
		}

		for _, step := range prior {
			if o, ok := step.(*JSObject); ok {
				recorded[StringField(o, "stepId")] = true
			}
		}

		var open []Question

		for _, question := range questions {
			if !recorded[question.ID] {
				open = append(open, question)
			}
		}

		if added := discoveryAskSteps(open, asked); len(added) > 0 {
			return append(slices.Clone(prior), added...)
		}

		if len(prior) > 0 {
			return nil
		}
	}

	first := ""
	if len(asked) > 0 {
		first = asked[0]
	}

	return []any{askStep(askStepOf(phase), "modified", "", first)}
}

// parseISODate reads the dates the hooks write (toISOString); ok is false
// for anything else.
func parseISODate(text string) (time.Time, bool) {
	for _, layout := range []string{time.RFC3339Nano, "2006-01-02T15:04:05.000Z07:00", "2006-01-02"} {
		if t, err := time.Parse(layout, text); err == nil {
			return t, true
		}
	}

	return time.Time{}, false
}

// specOf reads a spec field: its string, and false when it is null,
// missing or not a string, which the TypeScript side reads as null.
func specOf(o *JSObject) (string, bool) {
	value, _ := o.get("spec")
	s, ok := value.(string)

	return s, ok
}

// ValidAskTokenSteps returns the steps of the token text raw when it
// belongs to the spec (hasSpec false for none) and is younger than
// AskTokenTTL at now; ok is false for any other text. A token from before
// tokens listed their steps holds one, in top-level stepId and match fields.
func ValidAskTokenSteps(raw, spec string, hasSpec bool, now time.Time) ([]any, bool) {
	parsed, err := parseJSON(raw)
	if err != nil {
		return nil, false
	}

	token, ok := parsed.(*JSObject)
	if !ok {
		return nil, false
	}

	if tokenSpec, tokenHasSpec := specOf(token); tokenHasSpec != hasSpec || tokenSpec != spec {
		return nil, false
	}

	createdAt, ok := parseISODate(StringField(token, "createdAt"))
	if !ok {
		return nil, false
	}

	age := now.Sub(createdAt)
	if age < 0 || age > AskTokenTTL {
		return nil, false
	}

	listed := []any{token}
	if stepsValue, present := token.get("steps"); present {
		if steps, isList := stepsValue.([]any); isList {
			listed = steps
		}
	}

	steps := []any{}

	for _, item := range listed {
		if step := askTokenStepOf(item); step != nil {
			steps = append(steps, step)
		}
	}

	return steps, true
}

func askTokenStepOf(value any) *JSObject {
	o, ok := value.(*JSObject)
	if !ok {
		return nil
	}

	stepValue, _ := o.get("stepId")

	stepID, ok := stepValue.(string)
	if !ok {
		return nil
	}

	match := "exact"
	if StringField(o, "match") == "modified" {
		match = "modified"
	}

	step := JSObjectOf("stepId", stepID, "match", match)

	for _, key := range []string{"originalQuestion", "askedQuestion"} {
		if value, present := o.get(key); present {
			if s, isString := value.(string); isString {
				step.set(key, s)
			}
		}
	}

	return step
}

// AskTokenFile is the token's path under the project root.
func AskTokenFile(root string) string {
	return filepath.Join(root, askTokenFile)
}

// ProcessAskUserQuestion is the core of the AskUserQuestion hook: it writes
// the ask token that `noskills next` takes to mark discovery answers STATED.
// token is the token's id (8 hex characters from a random source). Every
// failure is swallowed: the hook must never break the agent.
func ProcessAskUserQuestion(input HookInput, root string, now time.Time, token string, warn StateWarner) {
	if StringField(input, "tool_name") != "AskUserQuestion" {
		return
	}

	asked := AskedQuestionsOf(ToolInputOf(input))
	if len(asked) == 0 {
		return
	}

	state := ReadHookState(root, warn)
	spec, hasSpec := specOf(state)

	var prior []any

	if data, err := os.ReadFile(AskTokenFile(root)); err == nil { //nolint:gosec // G304: the project's own token
		if steps, ok := ValidAskTokenSteps(string(data), spec, hasSpec, now); ok {
			prior = steps
		}
	}

	steps := AskTokenStepsAfter(state, prior, asked)
	if steps == nil {
		return
	}

	var specValue any
	if hasSpec {
		specValue = spec
	}

	payload := JSObjectOf("token", token, "spec", specValue, "steps", steps, "createdAt", ISOTime(now))

	if err := os.MkdirAll(filepath.Join(root, progressesDir), 0o750); err != nil {
		return
	}

	_ = os.WriteFile(AskTokenFile(root), []byte(jsonStringify(payload)+"\n"), stateFilePerm) //nolint:gosec // G306: the mode the TypeScript CLI gives it
}
