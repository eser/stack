// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

package noskillsfx

import (
	"strings"
	"testing"
	"unicode/utf16"
)

// tsKeyState is the state the TypeScript key below was computed from, with
// validationInputOf and validationKeyOf of context/transition-validation.ts:
// repeated answers, an answer over the cut limit, a follow-up of each status,
// characters JSON escapes, and a spec document over its limit.
const tsKeyState = `{
  "phase": "DISCOVERY_REFINEMENT",
  "spec": "add-login-page",
  "specDescription": null,
  "classification": null,
  "discovery": {
    "approved": false,
    "answers": [
      {"questionId": "status_quo", "answer": "They share one account — café <b>&</b> \"quotes\" 🎉"},
      {"questionId": "ambition", "answer": "line sep and tab\t"},
      {"questionId": "status_quo", "answer": "A second contributor's view."},
      {"questionId": "custom_q", "answer": "LONG"}
    ],
    "followUps": [
      {"id": "status_quoa", "question": "Which browsers?", "answer": "Chrome and Firefox", "status": "answered"},
      {"id": "status_quob", "question": "Skipped?", "answer": null, "status": "skipped"}
    ]
  }
}`

// The TypeScript results for tsKeyState with settings anthropic and
// claude-sonnet-5: the key, and the prompt's length in UTF-16 code units.
const (
	tsKey          = "89b36ffb985efdc642df6e6c58ed3c6969ba8f6c0b226af59e941eda5f75ee5d"
	tsPromptLength = 110967
)

func TestValidationKeyMatchesTypeScript(t *testing.T) {
	t.Parallel()

	parsed, err := parseJSON(strings.Replace(tsKeyState, "LONG", strings.Repeat("x", 10005), 1))
	if err != nil {
		t.Fatal(err)
	}

	state, _ := parsed.(*JSObject)

	transition := transitionOfState(state)
	if transition == nil || transition.ID != TransitionEndOfDiscovery {
		t.Fatalf("transition = %v", transition)
	}

	document := strings.Repeat("a", 100005)
	input := validationInputObject(state, *transition, &document)

	if got := validationKey(input, ValidatorSettings{Agent: "anthropic", Model: "claude-sonnet-5"}); got != tsKey {
		t.Errorf("key = %s, want %s", got, tsKey)
	}

	if got := len(utf16.Encode([]rune(jsonStringifyIndent(input)))); got != tsPromptLength {
		t.Errorf("prompt length = %d, want %d", got, tsPromptLength)
	}
}

func TestValidatorSettingsOfValue(t *testing.T) {
	t.Parallel()

	parse := func(text string) any {
		value, err := parseYAMLCore(text)
		if err != nil {
			t.Fatal(err)
		}

		return value.(*JSObject).getOr("validate") //nolint:forcetypeassert // the test's own YAML
	}

	tests := []struct {
		name    string
		yaml    string
		want    ValidatorSettings
		failure string
	}{
		{"trimmed", "validate:\n  agent: ' anthropic '\n  model: m1\n", ValidatorSettings{Agent: "anthropic", Model: "m1"}, ""},
		{"boolean", "validate: true\n", ValidatorSettings{}, "noskills.validate in .eser/manifest.yml is a boolean; set it to a mapping with agent and model, for example agent: claude-code and model: claude-sonnet-5."},
		{"agent object", "validate:\n  agent: {a: 1}\n", ValidatorSettings{}, "noskills.validate.agent in .eser/manifest.yml is an object; set it to an @eserstack/ai provider: " + knownAgents + "."},
		{"model null", "validate:\n  agent: kiro\n  model:\n", ValidatorSettings{}, "noskills.validate.model in .eser/manifest.yml is empty; set it to a model id that kiro runs, for example claude-sonnet-5 for claude-code."},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			t.Parallel()

			got, failure := validatorSettingsOfValue(parse(tt.yaml), true)
			if got != tt.want || failure != tt.failure {
				t.Errorf("got %+v %q, want %+v %q", got, failure, tt.want, tt.failure)
			}
		})
	}

	if got, failure := validatorSettingsOfValue(nil, false); got.Agent != DefaultAgentProvider || got.Model != DefaultAgentModel || failure != "" {
		t.Errorf("defaults = %+v %q", got, failure)
	}
}

func TestTransitionOfState(t *testing.T) {
	t.Parallel()

	tests := []struct {
		state string
		want  ValidatedTransitionID
	}{
		{`{"phase":"DISCOVERY_REFINEMENT","discovery":{"approved":false}}`, TransitionEndOfDiscovery},
		{`{"phase":"DISCOVERY_REFINEMENT","discovery":{"approved":true}}`, ""},
		{`{"phase":"SPEC_PROPOSAL","classification":{"involvesUI":true}}`, TransitionSpecProposal},
		{`{"phase":"SPEC_PROPOSAL"}`, TransitionSpecProposal},
		{`{"phase":"SPEC_PROPOSAL","classification":null}`, ""},
		{`{"phase":"EXECUTING"}`, ""},
	}

	for _, tt := range tests {
		parsed, err := parseJSON(tt.state)
		if err != nil {
			t.Fatal(err)
		}

		got := transitionOfState(parsed.(*JSObject)) //nolint:forcetypeassert // the test's own JSON

		var id ValidatedTransitionID
		if got != nil {
			id = got.ID
		}

		if id != tt.want {
			t.Errorf("%s: transition %q, want %q", tt.state, id, tt.want)
		}
	}
}
