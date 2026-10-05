// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

package noskillsfx

import (
	"encoding/json"
	"errors"
	"fmt"
	"slices"
	"strconv"
	"strings"
)

// Discovery answer errors.
var (
	ErrUnknownQuestionID = errors.New("not a discovery question id")
	ErrAnswerNotText     = errors.New("discovery answer is not text")
	ErrNoOpenQuestion    = errors.New("no unanswered discovery question")
	ErrNoAnswer          = errors.New("discovery answers hold no answer")
)

// followUpPending is the FollowUp.Status of a follow-up nobody answered or
// skipped yet.
const followUpPending = "pending"

// PendingFollowUps returns the follow-ups neither answered nor skipped, in
// the order they were added (mirrors getPendingFollowUps in machine.ts).
func PendingFollowUps(state StateFile) []FollowUp { //nolint:gocritic // hugeParam: StateFile is copied on purpose; transitions return a new state
	pending := []FollowUp{}

	for _, f := range state.Discovery.FollowUps {
		if f.Status == followUpPending {
			pending = append(pending, f)
		}
	}

	return pending
}

// UnansweredQuestions returns the questions without an answer, in order.
func UnansweredQuestions(questions []QuestionWithExtras, answers []DiscoveryAnswer) []QuestionWithExtras {
	answered := make(map[string]bool, len(answers))
	for _, a := range answers {
		answered[a.QuestionID] = true
	}

	open := []QuestionWithExtras{}

	for _, q := range questions {
		if !answered[q.ID] {
			open = append(open, q)
		}
	}

	return open
}

// DiscoveryAnswersOf returns the base answers a JSON object answer holds, in
// question order, and true; or nil and false when answer is not a JSON
// object, in which case it answers one question (mirrors discoveryAnswersOf
// in questions.ts). An empty string leaves its question open. A key that is
// not a base question id, a value that is not a string, or an object with no
// answer at all is an error, so a misspelt id is reported instead of stored
// where nothing reads it.
func DiscoveryAnswersOf(answer string) ([]DiscoveryAnswer, bool, error) {
	var fields map[string]json.RawMessage

	// Text that is not a JSON object (a sentence, an array, null) answers one
	// question, so the decode error is the expected case here.
	if err := json.Unmarshal([]byte(answer), &fields); err != nil || fields == nil {
		return nil, false, nil //nolint:nilerr // not a JSON object: a plain answer
	}

	keys := make([]string, 0, len(fields))
	for key := range fields {
		keys = append(keys, key)
	}

	slices.Sort(keys)

	values := make(map[string]string, len(fields))

	for _, key := range keys {
		if !slices.ContainsFunc(questions, func(q Question) bool { return q.ID == key }) {
			return nil, true, fmt.Errorf("record discovery answers: %w: %q", ErrUnknownQuestionID, key)
		}

		var value string
		if err := json.Unmarshal(fields[key], &value); err != nil {
			return nil, true, fmt.Errorf("record discovery answers: %w: %q: %w", ErrAnswerNotText, key, err)
		}

		values[key] = value
	}

	answers := []DiscoveryAnswer{}

	for _, q := range questions {
		if value := values[q.ID]; value != "" {
			answers = append(answers, DiscoveryAnswer{QuestionID: q.ID, Answer: value})
		}
	}

	if len(answers) == 0 {
		return nil, true, fmt.Errorf("record discovery answers: %w", ErrNoAnswer)
	}

	return answers, true, nil
}

// ApplyDiscoveryAnswer records a DISCOVERY answer (mirrors the DISCOVERY
// answer handling of commands/next.ts): a JSON object answers the base
// questions it names, as `next` asks for them, and any other text answers the
// first unanswered question. Answers that arrive together are flagged with
// BatchSubmitted, since nothing records that the user was asked each one.
func ApplyDiscoveryAnswer(
	state StateFile, //nolint:gocritic // hugeParam: StateFile is copied on purpose; transitions return a new state
	answer string,
	questions []QuestionWithExtras,
) (StateFile, error) {
	answers, isObject, err := DiscoveryAnswersOf(answer)
	if err != nil {
		return state, err
	}

	if isObject {
		for _, a := range answers {
			state = AddDiscoveryAnswer(state, a)
		}

		batch := true
		state.Discovery.BatchSubmitted = &batch

		return state, nil
	}

	next := GetNextUnanswered(questions, state.Discovery.Answers)
	if next == nil {
		return state, ErrNoOpenQuestion
	}

	return AddDiscoveryAnswer(state, DiscoveryAnswer{QuestionID: next.ID, Answer: answer}), nil
}

// CompleteDiscoveryWhenReady completes discovery once every base question has
// an answer and no follow-up is pending, and returns the state unchanged
// before that (mirrors completeDiscoveryWhenReady in machine.ts).
func CompleteDiscoveryWhenReady(state StateFile) (StateFile, error) { //nolint:gocritic // hugeParam: StateFile is copied on purpose; transitions return a new state
	if state.Phase != PhaseDiscovery ||
		!IsDiscoveryComplete(state.Discovery.Answers) ||
		len(PendingFollowUps(state)) > 0 {
		return state, nil
	}

	return CompleteDiscovery(state)
}

// answerTemplate is the JSON answer template for questions: each id with
// "..." as its value, in question order (mirrors answerTemplate in
// compiler.ts). The ids are plain ASCII, so Go quoting is JSON quoting.
func answerTemplate(questions []QuestionWithExtras) string {
	parts := make([]string, len(questions))
	for i, q := range questions {
		parts[i] = strconv.Quote(q.ID) + `:"..."`
	}

	return "{" + strings.Join(parts, ",") + "}"
}

// baseQuestionsInstruction mirrors baseQuestionsInstruction in compiler.ts:
// ask the unanswered base questions together, register follow-ups for
// unclear answers, submit one JSON answer.
func baseQuestionsInstruction(count int, hints InteractionHints, followUpCommand, submitCommand string) string {
	var ask string

	switch {
	case count == 1 && hints.HasAskUserTool:
		ask = "Ask the user this discovery question through AskUserQuestion and wait for the answer."
	case count == 1:
		ask = "Ask the user this discovery question and wait for the answer."
	case !hints.HasAskUserTool:
		ask = fmt.Sprintf("Ask the user these %d discovery questions together in one message, as a numbered list, and wait for the answers.", count)
	case count > 4:
		ask = fmt.Sprintf("Ask the user these %d discovery questions together through AskUserQuestion, up to 4 questions per call, and wait for the answers.", count)
	default:
		ask = fmt.Sprintf("Ask the user these %d discovery questions together in one AskUserQuestion call and wait for the answers.", count)
	}

	return ask + " For an answer that needs a follow-up, register it with `" + followUpCommand +
		"` first. Then submit the confirmed answers as one JSON object: `" + submitCommand +
		"`. noskills then gives you each follow-up on its own."
}

// followUpInstruction mirrors the instruction of compileFollowUpStep in
// compiler.ts: ask one follow-up on its own, then answer or skip it.
func followUpInstruction(
	hints InteractionHints,
	parent *QuestionWithExtras,
	remaining int,
	answerCommand string,
	skipCommand string,
) string {
	ask := "Ask the user this follow-up on its own and wait for the answer."
	if hints.HasAskUserTool {
		ask = "Ask the user this follow-up on its own, as the only question of an AskUserQuestion call, and wait for the answer."
	}

	parentNote := ""
	if parent != nil {
		parentNote = " It follows up the answer to \"" + parent.Text + "\"."
	}

	var after string

	switch remaining {
	case 0:
		after = "Discovery moves on to the review once this one is answered or skipped."
	case 1:
		after = "1 more follow-up comes after this one, each on its own."
	default:
		after = fmt.Sprintf("%d more follow-ups come after this one, each on its own.", remaining)
	}

	return ask + parentNote + " Submit the answer with `" + answerCommand +
		"`, or run `" + skipCommand + "` if the user declines it. " + after
}

// toDiscoveryQuestions converts questions to their output form.
func toDiscoveryQuestions(questions []QuestionWithExtras) []DiscoveryQuestion {
	out := make([]DiscoveryQuestion, len(questions))

	for i, q := range questions {
		extras := make([]string, len(q.Extras))
		for j, e := range q.Extras {
			extras[j] = e.Text
		}

		out[i] = DiscoveryQuestion{
			ID:       q.ID,
			Text:     q.Text,
			Concerns: q.Concerns,
			Extras:   extras,
		}
	}

	return out
}

// compileDiscoveryQuestions fills the DISCOVERY fields of out (mirrors
// compileDiscovery in compiler.ts once the premises are done): every
// unanswered base question together, then the pending follow-ups one at a
// time. Unlike compiler.ts it gives both audiences the same instruction;
// only the submit command carries `--agent` for an agent.
func compileDiscoveryQuestions(
	out *NextOutput,
	state StateFile, //nolint:gocritic // hugeParam: StateFile is copied on purpose; transitions return a new state
	questions []QuestionWithExtras,
	hints InteractionHints,
	prefix string,
	specName string,
) {
	answeredCount := len(state.Discovery.Answers)
	total := len(questions)
	out.AnsweredCount = &answeredCount
	out.TotalQuestions = &total

	unanswered := UnansweredQuestions(questions, state.Discovery.Answers)
	pending := PendingFollowUps(state)

	if len(pending) > 0 {
		out.PendingFollowUps = pending
	}

	switch {
	case len(unanswered) > 0:
		next := "next --answer='" + answerTemplate(unanswered) + "'"
		if state.Discovery.Audience == "agent" {
			next = "next --agent --answer='" + answerTemplate(unanswered) + "'"
		}

		submit := specCommand(prefix, specName, next)
		out.Questions = toDiscoveryQuestions(unanswered)
		out.OnComplete = &submit
		out.Instruction = baseQuestionsInstruction(
			len(unanswered),
			hints,
			specCommand(prefix, specName, `followup <questionId> "question"`),
			submit,
		)

	case len(pending) > 0:
		followUp := pending[0]

		var parent *QuestionWithExtras

		concerns := []string{}

		if i := slices.IndexFunc(questions, func(q QuestionWithExtras) bool {
			return q.ID == followUp.ParentQuestionID
		}); i >= 0 {
			parent = &questions[i]
			concerns = parent.Concerns
		}

		answerCommand := specCommand(prefix, specName, "followup "+followUp.ID+` --answer="<answer>"`)
		out.Questions = []DiscoveryQuestion{{
			ID:       followUp.ID,
			Text:     followUp.Question,
			Concerns: concerns,
			Extras:   []string{},
		}}
		out.OnComplete = &answerCommand
		out.Instruction = followUpInstruction(
			hints,
			parent,
			len(pending)-1,
			answerCommand,
			specCommand(prefix, specName, "followup "+followUp.ID+" --skip"),
		)

	default:
		out.Instruction = fmt.Sprintf(
			"All discovery questions answered. Run `%s` to complete discovery.",
			specCommand(prefix, specName, "next --answer='{...}'"),
		)
	}
}
