// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

package noskillsfx_test

import (
	"context"
	"encoding/json"
	"errors"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"github.com/eser/stack/pkg/ajan/noskillsfx"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

const findingsReply = `{
  "summary": "The answers leave the size limit open.",
  "findings": [
    {"severity": "high", "issue": "No answer says how large an upload may be.", "suggestion": "Add a size limit."},
    {"severity": "low", "issue": "The verification answer names no test.", "suggestion": ""}
  ]
}`

var judgeSettings = noskillsfx.ValidatorSettings{Agent: "fake-judge", Model: "judge-1"} //nolint:gochecknoglobals // read-only settings shared by every test

// inReview is a spec whose discovery answers all await the person's approval.
func inReview() noskillsfx.StateFile {
	spec := "test-spec"
	description := "Let users upload photos"
	state := noskillsfx.StateFile{ //nolint:exhaustruct // the fields the validator reads
		Version:         "0.1.0",
		Phase:           noskillsfx.PhaseDiscoveryRefinement,
		Spec:            &spec,
		SpecDescription: &description,
	}

	for _, id := range baseIDs() {
		state.Discovery.Answers = append(state.Discovery.Answers, noskillsfx.DiscoveryAnswer{
			QuestionID: id,
			Answer:     "an answer with enough detail for " + id,
		})
	}

	return state
}

// inReviewObject is inReview as the state file holds it.
func inReviewObject() *noskillsfx.JSObject {
	state := noskillsfx.InitialState()
	state.Set("phase", noskillsfx.PhaseDiscoveryRefinement)
	state.Set("spec", "test-spec")
	state.Set("specDescription", "Let users upload photos")

	return state
}

func compileReview() *noskillsfx.JSObject {
	return noskillsfx.CompileNext(&noskillsfx.NextInput{ //nolint:exhaustruct // the defaults are the case under test
		State:         inReviewObject(),
		Hints:         noskillsfx.DefaultInteractionHints,
		CommandPrefix: noskillsfx.DefaultCommandPrefix,
	})
}

func reviewInput(t *testing.T, document *string) noskillsfx.ValidationInput {
	t.Helper()

	state := inReview()
	transition := noskillsfx.TransitionToValidate(&state)
	require.NotNil(t, transition)

	return noskillsfx.BuildValidationInput(&state, *transition, document)
}

// fakeJudge answers with reply and records each request.
type fakeJudge struct {
	reply    func(ctx context.Context) (string, error)
	requests []noskillsfx.ValidationRequest
}

func (j *fakeJudge) Judge(ctx context.Context, request *noskillsfx.ValidationRequest) (string, error) {
	j.requests = append(j.requests, *request)

	return j.reply(ctx)
}

func answering(text string) *fakeJudge {
	return &fakeJudge{reply: func(context.Context) (string, error) { return text, nil }} //nolint:exhaustruct // the fake records calls in its other fields
}

func TestTransitionToValidate(t *testing.T) {
	t.Parallel()

	approved := inReview()
	approved.Discovery.Approved = true

	draft := inReview()
	draft.Phase = noskillsfx.PhaseSpecProposal

	classified := draft
	classified.Classification = &noskillsfx.SpecClassification{} //nolint:exhaustruct // every flag false is enough to classify the draft

	executing := inReview()
	executing.Phase = noskillsfx.PhaseExecuting

	tests := []struct {
		name     string
		state    noskillsfx.StateFile
		expected noskillsfx.ValidatedTransitionID
	}{
		{"checks the end of discovery while the answers await approval", inReview(), noskillsfx.TransitionEndOfDiscovery},
		{"skips refinement once the answers are approved", approved, ""},
		{"checks the spec proposal once the draft is classified", classified, noskillsfx.TransitionSpecProposal},
		{"skips a spec proposal with no draft yet", draft, ""},
		{"skips execution", executing, ""},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			t.Parallel()

			transition := noskillsfx.TransitionToValidate(&tt.state)
			if tt.expected == "" {
				assert.Nil(t, transition)

				return
			}

			require.NotNil(t, transition)
			assert.Equal(t, tt.expected, transition.ID)
		})
	}
}

func TestResolveValidatorSettings(t *testing.T) {
	t.Parallel()

	tests := []struct {
		name     string
		config   *noskillsfx.ValidatorConfig
		expected noskillsfx.ValidatorSettings
		field    string
	}{
		{"uses the noskills run agent without an entry", nil, noskillsfx.ValidatorSettings{Agent: "claude-code", Model: "claude-sonnet-5"}, ""},
		{"reads the agent and model", &noskillsfx.ValidatorConfig{Agent: " anthropic ", Model: "claude-opus-4-1"}, noskillsfx.ValidatorSettings{Agent: "anthropic", Model: "claude-opus-4-1"}, ""},
		{"refuses a missing agent", &noskillsfx.ValidatorConfig{Agent: "", Model: "m"}, noskillsfx.ValidatorSettings{}, "noskills.validate.agent"},
		{"refuses an empty model", &noskillsfx.ValidatorConfig{Agent: "openai", Model: " "}, noskillsfx.ValidatorSettings{}, "noskills.validate.model"},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			t.Parallel()

			settings, err := noskillsfx.ResolveValidatorSettings(tt.config)
			if tt.field != "" {
				require.ErrorIs(t, err, noskillsfx.ErrInvalidValidatorConfig)
				assert.Contains(t, err.Error(), tt.field)

				return
			}

			require.NoError(t, err)
			assert.Equal(t, tt.expected, settings)
		})
	}
}

func TestBuildValidationInput(t *testing.T) {
	t.Parallel()

	t.Run("holds the spec, the answers and the transition only", func(t *testing.T) {
		t.Parallel()

		document := "# Spec: test-spec"
		input := reviewInput(t, &document)

		prompt, err := noskillsfx.ValidationPrompt(&input)
		require.NoError(t, err)

		var data map[string]json.RawMessage
		require.NoError(t, json.Unmarshal([]byte(prompt), &data))
		assert.Len(t, data, 3)
		assert.Contains(t, data, "transition")
		assert.Contains(t, data, "spec")
		assert.Contains(t, data, "answers")

		assert.Equal(t, "test-spec", input.Spec.Name)
		assert.Equal(t, &document, input.Spec.Document)
		assert.Len(t, input.Answers, len(baseIDs()))
		assert.Equal(t, "What does the user do today without this feature?", input.Answers[0].Question)
	})

	t.Run("joins answers to one question and adds answered follow-ups", func(t *testing.T) {
		t.Parallel()

		state := inReview()
		state.Discovery.Answers = append(state.Discovery.Answers, noskillsfx.DiscoveryAnswer{
			QuestionID: "ambition",
			Answer:     "A second view",
		})
		answer := "A versioned bucket"
		state.Discovery.FollowUps = []noskillsfx.FollowUp{
			{ID: "reversibilitya", Question: "Rollback?", Answer: &answer, Status: "answered"}, //nolint:exhaustruct // only the fields the input reads
			{ID: "user_impacta", Question: "Who first?", Status: "pending"},                    //nolint:exhaustruct // only the fields the input reads
		}

		transition := noskillsfx.TransitionToValidate(&state)
		require.NotNil(t, transition)
		input := noskillsfx.BuildValidationInput(&state, *transition, nil)

		assert.Nil(t, input.Spec.Document)
		assert.Equal(t, "an answer with enough detail for ambition\n\nA second view", input.Answers[1].Answer)

		last := input.Answers[len(input.Answers)-1]
		assert.Equal(t, noskillsfx.ValidationAnswer{
			QuestionID: "reversibilitya",
			Question:   "Rollback?",
			Answer:     "A versioned bucket",
		}, last)
	})

	t.Run("cuts a spec document past the limit", func(t *testing.T) {
		t.Parallel()

		long := strings.Repeat("x", noskillsfx.MaxSpecDocumentChars+5)
		input := reviewInput(t, &long)

		require.NotNil(t, input.Spec.Document)
		assert.True(t, strings.HasSuffix(*input.Spec.Document, "[cut at 100000 characters]"))
	})
}

func TestParseValidationReply(t *testing.T) {
	t.Parallel()

	t.Run("reads a reply inside a code fence", func(t *testing.T) {
		t.Parallel()

		reply, err := noskillsfx.ParseValidationReply("```json\n" + findingsReply + "\n```")
		require.NoError(t, err)
		assert.Equal(t, "The answers leave the size limit open.", reply.Summary)
		assert.Len(t, reply.Findings, 2)
		assert.Equal(t, noskillsfx.SeverityHigh, reply.Findings[0].Severity)
	})

	t.Run("keeps at most MaxFindings findings", func(t *testing.T) {
		t.Parallel()

		entries := make([]string, 30)
		for i := range entries {
			entries[i] = `{"severity": "medium", "issue": "an issue", "suggestion": ""}`
		}

		reply, err := noskillsfx.ParseValidationReply(
			`{"summary": "Many.", "findings": [` + strings.Join(entries, ",") + `]}`,
		)
		require.NoError(t, err)
		assert.Len(t, reply.Findings, noskillsfx.MaxFindings)
	})

	refused := []struct {
		name   string
		text   string
		reason string
	}{
		{"prose", "Looks fine to me.", "no JSON object"},
		{"broken JSON", "{summary: }", "not valid JSON"},
		{"a reply without a summary", `{"findings": []}`, `"summary"`},
		{"a reply without findings", `{"summary": "ok"}`, `"findings"`},
		{"an unknown severity", `{"summary": "s", "findings": [{"severity": "critical", "issue": "i"}]}`, "findings[0]"},
		{"an empty issue", `{"summary": "s", "findings": [{"severity": "low", "issue": " "}]}`, "findings[0]"},
	}

	for _, tt := range refused {
		t.Run("refuses "+tt.name, func(t *testing.T) {
			t.Parallel()

			_, err := noskillsfx.ParseValidationReply(tt.text)
			require.ErrorIs(t, err, noskillsfx.ErrUnreadableValidationReply)
			assert.Contains(t, err.Error(), tt.reason)
		})
	}
}

func TestValidateTransition(t *testing.T) {
	t.Parallel()

	const retry = "noskills spec test-spec next --validate"

	t.Run("reports the judge's findings", func(t *testing.T) {
		t.Parallel()

		judge := answering(findingsReply)
		input := reviewInput(t, nil)

		validation := noskillsfx.ValidateTransition(
			t.Context(), judge, &input, judgeSettings, time.Second, retry,
		)

		assert.Equal(t, noskillsfx.ValidationReviewed, validation.Status)
		assert.Equal(t, noskillsfx.TransitionEndOfDiscovery, validation.Transition.ID)
		require.Len(t, validation.Findings, 2)
		assert.Equal(t, "Add a size limit.", validation.Findings[0].Suggestion)
		assert.Contains(t, validation.Instruction, "before asking for approval")

		require.Len(t, judge.requests, 1)
		request := judge.requests[0]
		assert.Equal(t, noskillsfx.ValidatorSystemPrompt, request.System)
		assert.Equal(t, judgeSettings, request.Settings)

		prompt, err := noskillsfx.ValidationPrompt(&input)
		require.NoError(t, err)
		assert.Equal(t, prompt, request.Prompt)
	})

	skipped := []struct {
		name   string
		judge  noskillsfx.ValidationJudge
		reason string
	}{
		{"no agent could be resolved", nil, `no @eserstack/ai provider is named "fake-judge"`},
		{"a failed call", &fakeJudge{reply: func(context.Context) (string, error) { //nolint:exhaustruct // the fake records calls in its other fields
			return "", errors.New("spawn claude: executable file not found") //nolint:err113 // a one-off error the fake returns
		}}, "the fake-judge call failed: spawn claude: executable file not found"},
		{"a refusal", &fakeJudge{reply: func(context.Context) (string, error) { //nolint:exhaustruct // the fake records calls in its other fields
			return "", noskillsfx.ErrValidatorDeclined
		}}, "fake-judge declined to review the transition."},
		{"a reply that is not the expected JSON", answering("All good!"), "the fake-judge reply could not be read: the reply holds no JSON object."},
		{"a timeout", &fakeJudge{reply: func(ctx context.Context) (string, error) { //nolint:exhaustruct // the fake records calls in its other fields
			<-ctx.Done()

			return "", ctx.Err()
		}}, "fake-judge (judge-1) did not answer within 0.02 seconds."},
	}

	for _, tt := range skipped {
		t.Run("skips on "+tt.name, func(t *testing.T) {
			t.Parallel()

			input := reviewInput(t, nil)
			validation := noskillsfx.ValidateTransition(
				t.Context(), tt.judge, &input, judgeSettings, 20*time.Millisecond, retry,
			)

			assert.Equal(t, noskillsfx.ValidationSkipped, validation.Status)
			assert.Contains(t, validation.Reason, tt.reason)
			assert.Contains(t, validation.Instruction, "the transition goes to the user's approval as usual")
			assert.Contains(t, validation.Instruction, retry)
		})
	}
}

func TestTransitionValidationJSON(t *testing.T) {
	t.Parallel()

	transition := noskillsfx.ValidatedTransition{
		ID:       noskillsfx.TransitionSpecProposal,
		From:     noskillsfx.PhaseSpecProposal,
		To:       noskillsfx.PhaseSpecApproved,
		Approval: "approve",
	}

	t.Run("a clean review lists no findings, as an empty list", func(t *testing.T) {
		t.Parallel()

		reviewed := noskillsfx.NewReviewedValidation(transition, judgeSettings, noskillsfx.ValidationReply{
			Summary: "Consistent.",
		})

		out, err := noskillsfx.AttachValidation(noskillsfx.JSObjectOf("phase", noskillsfx.PhaseSpecProposal), &reviewed)
		require.NoError(t, err)
		assert.Contains(t, out.String(), `"validation":{"status":"reviewed","transition":{"id":"spec-proposal","from":"SPEC_PROPOSAL","to":"SPEC_APPROVED","approval":"approve"},"agent":"fake-judge","model":"judge-1","summary":"Consistent.","findings":[],"instruction":`)
	})

	t.Run("a skipped result without settings has null agent and a reason", func(t *testing.T) {
		t.Parallel()

		skipped := noskillsfx.NewSkippedValidation(transition, nil, "the entry is unusable.", "retry")

		data, err := json.Marshal(skipped)
		require.NoError(t, err)

		var decoded map[string]any
		require.NoError(t, json.Unmarshal(data, &decoded))
		assert.Nil(t, decoded["agent"])
		assert.Equal(t, "the entry is unusable.", decoded["reason"])
		assert.NotContains(t, decoded, "findings")
		assert.NotContains(t, decoded, "summary")
	})

	t.Run("compile leaves validation out", func(t *testing.T) {
		t.Parallel()

		assert.NotContains(t, compileReview().String(), `"validation"`)
	})
}

func TestManifestValidateEntry(t *testing.T) {
	t.Parallel()

	root := t.TempDir()
	require.NoError(t, os.MkdirAll(filepath.Join(root, ".eser"), 0o750))
	require.NoError(t, os.WriteFile(
		filepath.Join(root, ".eser", "manifest.yml"),
		[]byte("noskills:\n  concerns: []\n  command: noskills\n  validate:\n    agent: anthropic\n    model: claude-opus-4-1\n"),
		0o600,
	))

	assert.True(t, noskillsfx.ReadHookManifest(root).Validates)

	// A section written without the entry turns the validator off.
	require.NoError(t, noskillsfx.WriteManifestSection(root, noskillsfx.JSObjectOf("concerns", []any{"security"})))
	assert.False(t, noskillsfx.ReadHookManifest(root).Validates)
}

func TestAttachValidation(t *testing.T) {
	t.Parallel()

	out := compileReview()
	before, _ := out.Get("instruction")
	input := reviewInput(t, nil)
	validation := noskillsfx.NewSkippedValidation(input.Transition, &judgeSettings, "timed out.", "retry")

	attached, err := noskillsfx.AttachValidation(out, &validation)
	require.NoError(t, err)

	instruction, _ := attached.Get("instruction")
	_, hasValidation := attached.Get("validation")

	assert.True(t, hasValidation)
	assert.True(t, strings.HasPrefix(instruction.(string), before.(string)+" "))
	assert.Contains(t, instruction, "follow `validation.instruction` before you ask the user for approval")
}

// baseIDs are the six base discovery question ids.
func baseIDs() []string {
	return []string{"status_quo", "ambition", "reversibility", "user_impact", "verification", "scope_boundary"}
}
