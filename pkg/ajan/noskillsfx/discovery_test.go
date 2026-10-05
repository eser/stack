// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

package noskillsfx_test

import (
	"encoding/json"
	"errors"
	"slices"
	"strings"
	"testing"

	"github.com/eser/stack/pkg/ajan/noskillsfx"
)

// baseIDs lists the six base question ids in the order noskills asks them.
func baseIDs() []string {
	questions := noskillsfx.GetQuestionsWithExtras(nil)
	ids := make([]string, len(questions))

	for i, q := range questions {
		ids[i] = q.ID
	}

	return ids
}

func agentDiscovery(answered int) noskillsfx.StateFile {
	state := stateIn(noskillsfx.PhaseDiscovery, 0)
	state.Discovery.Audience = "agent"

	for _, id := range baseIDs()[:answered] {
		state = noskillsfx.AddDiscoveryAnswer(state, noskillsfx.DiscoveryAnswer{
			QuestionID: id,
			Answer:     "an answer with enough detail for " + id,
		})
	}

	return state
}

func withFollowUps(state noskillsfx.StateFile, parents ...string) noskillsfx.StateFile { //nolint:gocritic // hugeParam: the test builds a new state from a copy
	for _, parent := range parents {
		state.Discovery.FollowUps = append(state.Discovery.FollowUps, noskillsfx.FollowUp{
			ID:               parent + "a",
			ParentQuestionID: parent,
			Question:         "What does " + parent + " leave out?",
			Status:           "pending",
		})
	}

	return state
}

func questionIDs(out *noskillsfx.NextOutput) []string {
	ids := make([]string, len(out.Questions))
	for i, q := range out.Questions {
		ids[i] = q.ID
	}

	return ids
}

// submittedKeys returns the keys of the JSON template in the submit command.
func submittedKeys(t *testing.T, command string) []string {
	t.Helper()

	start := strings.Index(command, "'")
	end := strings.LastIndex(command, "'")

	if start < 0 || end <= start {
		t.Fatalf("submit command %q holds no JSON template", command)
	}

	template := command[start+1 : end]

	decoder := json.NewDecoder(strings.NewReader(template))

	if _, err := decoder.Token(); err != nil {
		t.Fatalf("read template %q: %v", template, err)
	}

	keys := []string{}

	for decoder.More() {
		key, err := decoder.Token()
		if err != nil {
			t.Fatalf("read template key: %v", err)
		}

		keys = append(keys, key.(string)) //nolint:forcetypeassert // an object key token is always a string

		if _, err := decoder.Token(); err != nil {
			t.Fatalf("read template value: %v", err)
		}
	}

	return keys
}

func TestCompileDiscoveryAsksTheBaseQuestionsTogether(t *testing.T) {
	t.Parallel()

	cases := []struct {
		name     string
		answered int
		want     string
	}{
		{"all six together, up to 4 per call", 0, "these 6 discovery questions together through AskUserQuestion, up to 4 questions per call"},
		{"the four still open in one call", 2, "these 4 discovery questions together in one AskUserQuestion call"},
		{"the last one on its own", 5, "Ask the user this discovery question through AskUserQuestion"},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			t.Parallel()

			out := noskillsfx.Compile(agentDiscovery(tc.answered), noskillsfx.NosManifest{}, noskillsfx.CompileOptions{})
			open := baseIDs()[tc.answered:]

			if got := questionIDs(&out); !slices.Equal(got, open) {
				t.Errorf("questions = %v, want %v", got, open)
			}

			if !strings.Contains(out.Instruction, tc.want) {
				t.Errorf("instruction %q lacks %q", out.Instruction, tc.want)
			}

			if out.OnComplete == nil {
				t.Fatal("OnComplete is not set")
			}

			if !strings.Contains(*out.OnComplete, "next --agent --answer='") {
				t.Errorf("OnComplete = %q, want an agent JSON answer", *out.OnComplete)
			}

			if got := submittedKeys(t, *out.OnComplete); !slices.Equal(got, open) {
				t.Errorf("submitted keys = %v, want %v", got, open)
			}
		})
	}
}

func TestCompileDiscoveryWithoutAskUserQuestionListsTheQuestions(t *testing.T) {
	t.Parallel()

	hints := noskillsfx.DefaultInteractionHints
	hints.HasAskUserTool = false

	out := noskillsfx.Compile(agentDiscovery(0), noskillsfx.NosManifest{}, noskillsfx.CompileOptions{Hints: &hints})

	if !strings.Contains(out.Instruction, "together in one message, as a numbered list") {
		t.Errorf("instruction %q does not list the questions in one message", out.Instruction)
	}

	if strings.Contains(agentText(t, &out), "AskUserQuestion") {
		t.Error("output names AskUserQuestion for a tool without it")
	}
}

func TestCompileDiscoveryHandsOutFollowUpsOneAtATime(t *testing.T) {
	t.Parallel()

	cases := []struct {
		name    string
		parents []string
		wantID  string
		wantEnd string
	}{
		{"the first of two", []string{"reversibility", "user_impact"}, "reversibilitya", "1 more follow-up comes after this one"},
		{"the last one", []string{"user_impact"}, "user_impacta", "Discovery moves on to the review"},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			t.Parallel()

			state := withFollowUps(agentDiscovery(6), tc.parents...)
			out := noskillsfx.Compile(state, noskillsfx.NosManifest{}, noskillsfx.CompileOptions{})

			if got := questionIDs(&out); !slices.Equal(got, []string{tc.wantID}) {
				t.Errorf("questions = %v, want [%s]", got, tc.wantID)
			}

			if len(out.PendingFollowUps) != len(tc.parents) {
				t.Errorf("pending follow-ups = %d, want %d", len(out.PendingFollowUps), len(tc.parents))
			}

			wantSubmit := noskillsfx.DefaultCommandPrefix + " spec test-spec followup " + tc.wantID + ` --answer="<answer>"`
			if out.OnComplete == nil || *out.OnComplete != wantSubmit {
				t.Errorf("OnComplete = %v, want %q", out.OnComplete, wantSubmit)
			}

			for _, want := range []string{"as the only question of an AskUserQuestion call", "--skip", tc.wantEnd} {
				if !strings.Contains(out.Instruction, want) {
					t.Errorf("instruction %q lacks %q", out.Instruction, want)
				}
			}
		})
	}
}

func TestCompileDiscoveryListsFollowUpsBesideOpenQuestions(t *testing.T) {
	t.Parallel()

	out := noskillsfx.Compile(withFollowUps(agentDiscovery(0), "status_quo"), noskillsfx.NosManifest{}, noskillsfx.CompileOptions{})

	if len(out.Questions) != 6 {
		t.Errorf("questions = %d, want the 6 base questions first", len(out.Questions))
	}

	if len(out.PendingFollowUps) != 1 {
		t.Errorf("pending follow-ups = %d, want 1", len(out.PendingFollowUps))
	}
}

func TestBuildBehavioralStatesTheDiscoveryQuestionRule(t *testing.T) {
	t.Parallel()

	rule := "Ask the user the unanswered base discovery questions together, in one exchange, " +
		"and submit the confirmed answers as one JSON object keyed by question id. " +
		"Ask each follow-up question on its own and wait for its answer before you ask the next."

	for _, phase := range []noskillsfx.Phase{noskillsfx.PhaseDiscovery, noskillsfx.PhaseDiscoveryRefinement} {
		block := noskillsfx.BuildBehavioral(
			stateIn(phase, 0),
			false,
			nil,
			noskillsfx.DefaultInteractionHints,
			noskillsfx.DefaultCommandPrefix,
		)

		if n := countRules(block.Rules, rule); n != 1 {
			t.Errorf("%s: question rule appears %d time(s), want 1", phase, n)
		}

		for _, old := range []string{"ONE AT A TIME", "One question per call"} {
			if n := countRules(block.Rules, old); n != 0 {
				t.Errorf("%s: rules still say %q", phase, old)
			}
		}
	}
}

func TestDiscoveryAnswersOf(t *testing.T) {
	t.Parallel()

	cases := []struct {
		name       string
		answer     string
		wantIDs    []string
		wantObject bool
		wantErr    error
	}{
		{"an object keyed by question id", `{"ambition":"a 10-star plan","status_quo":"email"}`, []string{"status_quo", "ambition"}, true, nil},
		{"an empty value leaves its question open", `{"status_quo":"email","ambition":""}`, []string{"status_quo"}, true, nil},
		{"a sentence answers one question", "Users email files today", nil, false, nil},
		{"a JSON array answers one question", `["status_quo"]`, nil, false, nil},
		{"JSON null answers one question", "null", nil, false, nil},
		{"an unknown id is refused", `{"statusquo":"email"}`, nil, true, noskillsfx.ErrUnknownQuestionID},
		{"a value that is not text is refused", `{"ambition":10}`, nil, true, noskillsfx.ErrAnswerNotText},
		{"an object with no answer is refused", `{"status_quo":""}`, nil, true, noskillsfx.ErrNoAnswer},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			t.Parallel()

			answers, isObject, err := noskillsfx.DiscoveryAnswersOf(tc.answer)

			if tc.wantErr != nil {
				if !errors.Is(err, tc.wantErr) {
					t.Fatalf("err = %v, want %v", err, tc.wantErr)
				}

				return
			}

			if err != nil {
				t.Fatalf("unexpected error: %v", err)
			}

			if isObject != tc.wantObject {
				t.Errorf("isObject = %v, want %v", isObject, tc.wantObject)
			}

			ids := make([]string, len(answers))
			for i, a := range answers {
				ids[i] = a.QuestionID
			}

			if len(ids) != len(tc.wantIDs) || (len(ids) > 0 && !slices.Equal(ids, tc.wantIDs)) {
				t.Errorf("ids = %v, want %v", ids, tc.wantIDs)
			}
		})
	}
}

func TestApplyDiscoveryAnswer(t *testing.T) {
	t.Parallel()

	questions := noskillsfx.GetQuestionsWithExtras(nil)

	t.Run("a JSON object records each answer and flags the set", func(t *testing.T) {
		t.Parallel()

		state, err := noskillsfx.ApplyDiscoveryAnswer(agentDiscovery(0), `{"status_quo":"email","ambition":"drag and drop"}`, questions)
		if err != nil {
			t.Fatalf("ApplyDiscoveryAnswer: %v", err)
		}

		if len(state.Discovery.Answers) != 2 {
			t.Errorf("answers = %d, want 2", len(state.Discovery.Answers))
		}

		if state.Discovery.BatchSubmitted == nil || !*state.Discovery.BatchSubmitted {
			t.Error("answers sent together are not flagged")
		}
	})

	t.Run("plain text answers the first open question", func(t *testing.T) {
		t.Parallel()

		state, err := noskillsfx.ApplyDiscoveryAnswer(agentDiscovery(2), "nothing irreversible", questions)
		if err != nil {
			t.Fatalf("ApplyDiscoveryAnswer: %v", err)
		}

		last := state.Discovery.Answers[len(state.Discovery.Answers)-1]
		if last.QuestionID != "reversibility" {
			t.Errorf("answered %q, want reversibility", last.QuestionID)
		}
	})

	t.Run("plain text with nothing open is refused", func(t *testing.T) {
		t.Parallel()

		_, err := noskillsfx.ApplyDiscoveryAnswer(agentDiscovery(6), "one more thing", questions)
		if !errors.Is(err, noskillsfx.ErrNoOpenQuestion) {
			t.Errorf("err = %v, want ErrNoOpenQuestion", err)
		}
	})
}

func TestCompleteDiscoveryWhenReady(t *testing.T) {
	t.Parallel()

	settled := withFollowUps(agentDiscovery(6), "ambition")
	settled.Discovery.FollowUps[0].Status = "skipped"

	cases := []struct {
		name          string
		state         noskillsfx.StateFile
		wantCompleted bool
	}{
		{"waits while a base question is open", agentDiscovery(3), false},
		{"waits while a follow-up is pending", withFollowUps(agentDiscovery(6), "ambition"), false},
		{"completes once the follow-ups are settled", settled, true},
		{"completes the base answers with no follow-up", agentDiscovery(6), true},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			t.Parallel()

			state, err := noskillsfx.CompleteDiscoveryWhenReady(tc.state)
			if err != nil {
				t.Fatalf("CompleteDiscoveryWhenReady: %v", err)
			}

			if state.Discovery.Completed != tc.wantCompleted {
				t.Errorf("Completed = %v, want %v", state.Discovery.Completed, tc.wantCompleted)
			}
		})
	}
}
