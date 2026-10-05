// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

package noskillsfx_test

import (
	"bytes"
	"encoding/json"
	"strings"
	"testing"

	"github.com/eser/stack/pkg/ajan/noskillsfx"
)

func stateIn(phase noskillsfx.Phase, iteration int) noskillsfx.StateFile {
	state := noskillsfx.CreateInitialState()
	spec := "test-spec"
	state.Phase = phase
	state.Spec = &spec
	state.Execution.Iteration = iteration

	return state
}

func countRules(rules []string, substr string) int {
	count := 0

	for _, rule := range rules {
		if strings.Contains(rule, substr) {
			count++
		}
	}

	return count
}

func TestCompileRestartIsAFlagNotPrompt(t *testing.T) {
	t.Parallel()

	manifest := noskillsfx.NosManifest{MaxIterationsBeforeRestart: 15}

	cases := []struct {
		name        string
		iteration   int
		wantRestart bool
	}{
		{"below the threshold sets no flag", 14, false},
		{"at the threshold sets the flag", 15, true},
		{"past the threshold sets the flag", 40, true},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			t.Parallel()

			out := noskillsfx.Compile(
				stateIn(noskillsfx.PhaseExecuting, tc.iteration),
				manifest,
				noskillsfx.CompileOptions{},
			)

			gotRestart := out.RestartRecommended != nil && *out.RestartRecommended
			if gotRestart != tc.wantRestart {
				t.Errorf("RestartRecommended = %v, want %v", gotRestart, tc.wantRestart)
			}

			for _, word := range []string{"degrading", "fresh session", "iterations"} {
				if n := countRules(out.Behavioral.Rules, word); n != 0 {
					t.Errorf("behavioral rules mention %q %d time(s); the agent gets no countdown", word, n)
				}
			}
		})
	}
}

func TestBuildBehavioralReadOnlyPhases(t *testing.T) {
	t.Parallel()

	cases := []struct {
		name  string
		phase noskillsfx.Phase
	}{
		{"discovery", noskillsfx.PhaseDiscovery},
		{"discovery refinement", noskillsfx.PhaseDiscoveryRefinement},
		{"spec proposal", noskillsfx.PhaseSpecProposal},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			t.Parallel()

			block := noskillsfx.BuildBehavioral(
				stateIn(tc.phase, 0),
				false,
				nil,
				noskillsfx.DefaultInteractionHints,
				noskillsfx.DefaultCommandPrefix,
			)

			if block.ModeOverride == nil || *block.ModeOverride != "plan mode" {
				t.Errorf("ModeOverride = %v, want %q", block.ModeOverride, "plan mode")
			}

			if n := countRules(block.Rules, "This phase is read-only"); n != 1 {
				t.Errorf("read-only rule appears %d time(s), want 1", n)
			}

			for _, banned := range []string{"DO NOT create", "You MUST be in plan mode", "You MAY read"} {
				if n := countRules(block.Rules, banned); n != 0 {
					t.Errorf("rules still contain %q %d time(s)", banned, n)
				}
			}
		})
	}
}

func TestBuildBehavioralDiscoveryAnswerRule(t *testing.T) {
	t.Parallel()

	block := noskillsfx.BuildBehavioral(
		stateIn(noskillsfx.PhaseDiscovery, 0),
		false,
		nil,
		noskillsfx.DefaultInteractionHints,
		noskillsfx.DefaultCommandPrefix,
	)

	if n := countRules(block.Rules, "transition.onComplete"); n != 1 {
		t.Errorf("answer rule appears %d time(s), want 1", n)
	}

	if n := countRules(block.Rules, noskillsfx.DefaultCommandPrefix+" spec test-spec next --answer"); n != 1 {
		t.Errorf("answer rule does not name the spec-scoped submit command")
	}

	if n := countRules(block.Rules, "batch-submit"); n != 0 {
		t.Errorf("rules still forbid batch-submit %d time(s), contradicting the answer rule", n)
	}
}

func TestBuildBehavioralBlockedAsksForTheDecision(t *testing.T) {
	t.Parallel()

	block := noskillsfx.BuildBehavioral(
		stateIn(noskillsfx.PhaseBlocked, 3),
		false,
		nil,
		noskillsfx.DefaultInteractionHints,
		noskillsfx.DefaultCommandPrefix,
	)

	if n := countRules(block.Rules, "Do not elaborate"); n != 0 {
		t.Errorf("BLOCKED rules still say %q", "Do not elaborate")
	}

	if n := countRules(block.Rules, "submit the decision"); n != 1 {
		t.Errorf("BLOCKED rules do not say how to submit the decision")
	}
}

// customPrefix does not end in "noskills", so a bare `noskills spec` command
// cannot pass for one built from the prefix.
const customPrefix = "deno run -A ./tools/nos.ts"

// agentText returns every string of the output an agent reads, as JSON
// without HTML escaping so `<name>` stays readable.
func agentText(t *testing.T, out *noskillsfx.NextOutput) string {
	t.Helper()

	var buf bytes.Buffer

	encoder := json.NewEncoder(&buf)
	encoder.SetEscapeHTML(false)

	if err := encoder.Encode(out); err != nil {
		t.Fatalf("encode next output: %v", err)
	}

	return buf.String()
}

func allAnswered() []noskillsfx.DiscoveryAnswer {
	questions := noskillsfx.GetQuestionsWithExtras(nil)
	answers := make([]noskillsfx.DiscoveryAnswer, len(questions))

	for i, q := range questions {
		answers[i] = noskillsfx.DiscoveryAnswer{QuestionID: q.ID, Answer: "answered"}
	}

	return answers
}

func TestCompileRoutesCommandsThroughThePrefix(t *testing.T) {
	t.Parallel()

	discoveryDone := stateIn(noskillsfx.PhaseDiscovery, 0)
	discoveryDone.Discovery.Answers = allAnswered()

	idle := noskillsfx.CreateInitialState()

	cases := []struct {
		name  string
		state noskillsfx.StateFile
		want  []string
	}{
		{
			"idle spec creation rule",
			idle,
			[]string{"`" + customPrefix + " spec new \"description\"`"},
		},
		{
			"discovery answer rule and completion instruction",
			discoveryDone,
			[]string{
				"`" + customPrefix + " spec test-spec next --answer`",
				"`" + customPrefix + " spec test-spec next --answer='{...}'`",
			},
		},
		{
			"discovery follow-up and submit commands",
			stateIn(noskillsfx.PhaseDiscovery, 0),
			[]string{
				"`" + customPrefix + " spec test-spec followup <questionId> \"question\"`",
				customPrefix + " spec test-spec next --answer='{\"status_quo\":\"...\",\"ambition\":\"...\"",
			},
		},
		{
			"executing report command",
			stateIn(noskillsfx.PhaseExecuting, 1),
			[]string{customPrefix + " spec test-spec next --answer='{\"completed\":[...]"},
		},
		{
			"blocked resolution and decision commands",
			stateIn(noskillsfx.PhaseBlocked, 1),
			[]string{
				customPrefix + " spec test-spec next --answer='{\"unblocked\": true}'",
				"`" + customPrefix + " spec test-spec next --answer=\"<decision>\"`",
			},
		},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			t.Parallel()

			out := noskillsfx.Compile(
				tc.state,
				noskillsfx.NosManifest{Command: customPrefix},
				noskillsfx.CompileOptions{},
			)
			text := agentText(t, &out)

			for _, want := range tc.want {
				// The JSON encoder escapes quotes inside strings.
				escaped := strings.ReplaceAll(want, `"`, `\"`)
				if !strings.Contains(text, escaped) {
					t.Errorf("output lacks %s", want)
				}
			}

			for _, bare := range []string{"`noskills ", "\"noskills spec", "noskills spec "} {
				if strings.Contains(text, bare) {
					t.Errorf("output still holds a bare command (%q)", bare)
				}
			}
		})
	}
}

func TestCompileFallsBackToTheDefaultPrefix(t *testing.T) {
	t.Parallel()

	out := noskillsfx.Compile(
		stateIn(noskillsfx.PhaseExecuting, 1),
		noskillsfx.NosManifest{},
		noskillsfx.CompileOptions{},
	)

	got := ""
	if out.OnComplete != nil {
		got = *out.OnComplete
	}

	want := noskillsfx.DefaultCommandPrefix + " spec test-spec next --answer="
	if !strings.HasPrefix(got, want) {
		t.Errorf("OnComplete = %q, want prefix %q", got, want)
	}
}

func TestBuildBehavioralFallsBackToTheDefaultPrefix(t *testing.T) {
	t.Parallel()

	block := noskillsfx.BuildBehavioral(
		noskillsfx.CreateInitialState(),
		false,
		nil,
		noskillsfx.DefaultInteractionHints,
		"",
	)

	want := "`" + noskillsfx.DefaultCommandPrefix + " spec new \"description\"`"
	if n := countRules(block.Rules, want); n != 1 {
		t.Errorf("rules name %s %d time(s), want 1", want, n)
	}

	if n := countRules(block.Rules, "` spec new"); n != 0 {
		t.Errorf("a rule starts a command with a space %d time(s)", n)
	}
}

// TestCompileUsesTheCommandTheManifestRecords follows the prefix from the
// manifest the TypeScript CLI writes, through ReadManifest, into the output.
func TestCompileUsesTheCommandTheManifestRecords(t *testing.T) {
	t.Parallel()

	root := t.TempDir()
	writeManifestFixture(
		t,
		root,
		"stack:\n  - golang\nnoskills:\n  concerns: []\n  command: "+customPrefix+"\n",
	)

	manifest, err := noskillsfx.ReadManifest(root)
	if err != nil {
		t.Fatalf("ReadManifest: %v", err)
	}

	out := noskillsfx.Compile(
		stateIn(noskillsfx.PhaseBlocked, 1),
		manifest,
		noskillsfx.CompileOptions{},
	)

	got := ""
	if out.OnResolved != nil {
		got = *out.OnResolved
	}

	want := customPrefix + " spec test-spec next --answer="
	if !strings.HasPrefix(got, want) {
		t.Errorf("OnResolved = %q, want prefix %q", got, want)
	}
}

func TestBuildBehavioralPlanModeShortcutFollowsTheHints(t *testing.T) {
	t.Parallel()

	withoutShortcut := noskillsfx.DefaultInteractionHints
	withoutShortcut.PlanModeShortcut = ""

	cases := []struct {
		name  string
		hints noskillsfx.InteractionHints
		want  int
	}{
		{"claude code names its key", noskillsfx.DefaultInteractionHints, 1},
		{"a tool without a known key gets none", withoutShortcut, 0},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			t.Parallel()

			block := noskillsfx.BuildBehavioral(
				stateIn(noskillsfx.PhaseDiscovery, 0),
				false,
				nil,
				tc.hints,
				noskillsfx.DefaultCommandPrefix,
			)

			if n := countRules(block.Rules, "Shift+Tab"); n != tc.want {
				t.Errorf("rules mention Shift+Tab %d time(s), want %d", n, tc.want)
			}

			if n := countRules(block.Rules, "This phase is read-only"); n != 1 {
				t.Errorf("read-only rule appears %d time(s), want 1", n)
			}
		})
	}
}
