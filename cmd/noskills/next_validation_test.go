// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

package main

import (
	"context"
	"encoding/json"
	"errors"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"testing"

	"github.com/eser/stack/pkg/ajan/aifx"
	"github.com/eser/stack/pkg/ajan/noskillsfx"
)

// fakeValidator is an aifx provider whose model answers every
// GenerateText with the same reply, and records what it was sent.
type fakeValidator struct {
	reply     string
	stop      aifx.StopReason
	createErr error
	replyErr  error

	mu       sync.Mutex
	configs  []*aifx.ConfigTarget
	requests []*aifx.GenerateTextOptions
	workDirs []string
}

func (f *fakeValidator) GetProvider() string { return "fake" }

func (f *fakeValidator) CreateModel(_ context.Context, config *aifx.ConfigTarget) (aifx.LanguageModel, error) { //nolint:ireturn // the aifx interface
	f.mu.Lock()
	defer f.mu.Unlock()

	f.configs = append(f.configs, config)

	if f.createErr != nil {
		return nil, f.createErr
	}

	return &fakeValidatorModel{f: f, cwd: config.Properties["cwd"].(string)}, nil //nolint:forcetypeassert // the judge always sets cwd
}

func (f *fakeValidator) calls() int {
	f.mu.Lock()
	defer f.mu.Unlock()

	return len(f.requests)
}

type fakeValidatorModel struct {
	f   *fakeValidator
	cwd string
}

func (m *fakeValidatorModel) GetCapabilities() []aifx.ProviderCapability {
	return []aifx.ProviderCapability{aifx.CapabilityTextGeneration}
}

func (m *fakeValidatorModel) GetProvider() string         { return "fake" }
func (m *fakeValidatorModel) GetModelID() string          { return "judge-1" }
func (m *fakeValidatorModel) GetRawClient() any           { return nil }
func (m *fakeValidatorModel) Close(context.Context) error { return nil }

func (m *fakeValidatorModel) StreamText(context.Context, *aifx.StreamTextOptions) (*aifx.StreamIterator, error) {
	return nil, errNotStreamed
}

func (m *fakeValidatorModel) GenerateText(_ context.Context, opts *aifx.GenerateTextOptions) (*aifx.GenerateTextResult, error) {
	m.f.mu.Lock()
	m.f.requests = append(m.f.requests, opts)
	m.f.workDirs = append(m.f.workDirs, m.cwd)
	m.f.mu.Unlock()

	// The validator runs in an empty directory.
	if entries, err := os.ReadDir(m.cwd); err != nil || len(entries) != 0 {
		return nil, errors.New("the validator's directory is not empty") //nolint:err113 // the test's own failure
	}

	if m.f.replyErr != nil {
		return nil, m.f.replyErr
	}

	stop := m.f.stop
	if stop == "" {
		stop = aifx.StopReasonEndTurn
	}

	return &aifx.GenerateTextResult{ //nolint:exhaustruct
		Content:    []aifx.ContentBlock{{Type: aifx.ContentBlockText, Text: m.f.reply}}, //nolint:exhaustruct
		StopReason: stop,
	}, nil
}

const validatorReply = `Here it is:
` + "```json" + `
{"summary": "The answers leave the session lifetime open.",
 "findings": [{"severity": "medium", "issue": "No answer says how long a session lasts.", "suggestion": "Name a lifetime."}]}
` + "```"

// projectInReview runs the CLI up to the end of discovery of add-login-page,
// with the manifest's validate entry naming the fake agent.
func projectInReview(t *testing.T, fake *fakeValidator) (*testEnv, string) {
	t.Helper()

	root := t.TempDir()
	writeFile(t, filepath.Join(root, "package.json"), `{"name":"fixture"}`+"\n")

	te := newTestEnv(t, root)
	te.validators = func(agent string) aifx.ProviderFactory {
		if agent == "fake" {
			return fake
		}

		return nil
	}

	spec := func(args ...string) []string { return append([]string{"spec", "add-login-page"}, args...) }
	answers := `{"status_quo":"They share one account and pass the password around in chat.",` +
		`"ambition":"1-star: a form that checks a password. 10-star: passwordless sign-in with magic links.",` +
		`"reversibility":"It is reversible: the old shared account stays until everyone moved.",` +
		`"user_impact":"Every user signs in once with their own account instead of the shared one.",` +
		`"verification":"Unit tests for the session endpoint and an end-to-end test of the login form",` +
		`"scope_boundary":"No social login. No password reset flow in this spec."}`

	for _, args := range [][]string{
		{"init", "--non-interactive"},
		{"spec", "new", "add a login page"},
		spec("next", "--answer=Users sign in with an email and a password"),
		spec("next", "--answer=validate"),
		spec("next", `--answer={"premises":[{"text":"Every user has an email address","agreed":true}]}`),
		spec("next", "--agent", "--answer="+answers),
	} {
		if code := run(context.Background(), te.env, args); code != 0 {
			t.Fatalf("%v: exit %d\nstdout: %s\nstderr: %s", args, code, te.stdout, te.stderr)
		}
	}

	editManifest(t, root, func(text string) string { return text + validateFake })

	return te, root
}

const validateFake = "  validate:\n    agent: fake\n    model: judge-1\n"

// editManifest rewrites the project's manifest with edit.
func editManifest(t *testing.T, root string, edit func(text string) string) {
	t.Helper()

	manifest := filepath.Join(root, ".eser", "manifest.yml")

	data, err := os.ReadFile(manifest) //nolint:gosec // G304: the test's own project
	if err != nil {
		t.Fatal(err)
	}

	if err := os.WriteFile(manifest, []byte(edit(string(data))), 0o600); err != nil { //nolint:gosec // G703: the test's own project
		t.Fatal(err)
	}
}

// nextOutput runs `spec add-login-page next` with args and returns the JSON
// it printed and its stderr.
func nextOutput(t *testing.T, te *testEnv, args ...string) (map[string]any, string) {
	t.Helper()

	te.stdout.Reset()
	te.stderr.Reset()

	if code := run(context.Background(), te.env, append([]string{"spec", "add-login-page", "next"}, args...)); code != 0 {
		t.Fatalf("next %v: exit %d\nstdout: %s\nstderr: %s", args, code, te.stdout, te.stderr)
	}

	var out map[string]any
	if err := json.Unmarshal(te.stdout.Bytes(), &out); err != nil {
		t.Fatalf("next %v printed no JSON: %v\n%s", args, err, te.stdout)
	}

	return out, te.stderr.String()
}

func validationOf(t *testing.T, out map[string]any) map[string]any {
	t.Helper()

	validation, ok := out["validation"].(map[string]any)
	if !ok {
		t.Fatalf("no validation in %v", out)
	}

	return validation
}

func TestNextValidationReviewed(t *testing.T) {
	t.Parallel()

	fake := &fakeValidator{reply: validatorReply} //nolint:exhaustruct
	te, root := projectInReview(t, fake)

	out, stderr := nextOutput(t, te)
	validation := validationOf(t, out)

	if validation["status"] != "reviewed" || validation["agent"] != "fake" || validation["model"] != "judge-1" ||
		validation["summary"] != "The answers leave the session lifetime open." {
		t.Fatalf("validation = %v", validation)
	}

	findings, _ := validation["findings"].([]any)
	if len(findings) != 1 {
		t.Fatalf("findings = %v", findings)
	}

	if instruction, _ := out["instruction"].(string); !strings.HasSuffix(instruction,
		"A second agent checked this transition: follow `validation.instruction` before you ask the user for approval.") {
		t.Errorf("instruction = %q", instruction)
	}

	if want := "noskills: fake (judge-1) is checking the end-of-discovery transition; this can take up to 120 seconds.\n"; stderr != want {
		t.Errorf("stderr = %q, want %q", stderr, want)
	}

	// What the model got: the system prompt, the input as one JSON
	// document, the reply schema, and an empty directory that is gone now.
	request := fake.requests[0]
	if request.System != noskillsfx.ValidatorSystemPrompt || request.ResponseFormat.Type != "json_schema" ||
		request.ResponseFormat.Name != "transition_validation" {
		t.Errorf("request = %+v", request)
	}

	var input map[string]any
	if err := json.Unmarshal([]byte(request.Messages[0].Content[0].Text), &input); err != nil {
		t.Fatalf("the prompt is not JSON: %v", err)
	}

	if spec, _ := input["spec"].(map[string]any); spec["name"] != "add-login-page" || spec["document"] == nil {
		t.Errorf("input spec = %v", input["spec"])
	}

	if config := fake.configs[0]; config.Provider != "fake" || config.Model != "judge-1" || config.MaxTokens != 16_000 {
		t.Errorf("config = %+v", config)
	}

	if _, err := os.Stat(fake.workDirs[0]); !errors.Is(err, os.ErrNotExist) {
		t.Errorf("the validator directory %s was left behind: %v", fake.workDirs[0], err)
	}

	record := filepath.Join(root, ".eser", ".state", "progresses", "validations", "add-login-page.json")
	if _, err := os.Stat(record); err != nil {
		t.Fatalf("no stored result: %v", err)
	}

	// The same input repeats the stored result; --validate runs it again.
	again, stderr := nextOutput(t, te)
	if fake.calls() != 1 || stderr != "" || validationOf(t, again)["status"] != "reviewed" {
		t.Errorf("second call: %d calls, stderr %q", fake.calls(), stderr)
	}

	if _, stderr = nextOutput(t, te, "--validate"); fake.calls() != 2 || stderr == "" {
		t.Errorf("--validate: %d calls, stderr %q", fake.calls(), stderr)
	}
}

func TestNextValidationSkipped(t *testing.T) {
	t.Parallel()

	errBoom := errors.New("boom")       //nolint:err113 // the test's own failure
	errNope := errors.New("not set up") //nolint:err113 // the test's own failure

	tests := []struct {
		name   string
		fake   *fakeValidator
		reason string
	}{
		{"refusal", &fakeValidator{reply: "", stop: aifx.StopReasonRefusal}, "fake declined to review the transition."},                              //nolint:exhaustruct
		{"reply error", &fakeValidator{replyErr: errBoom}, "fake returned an error: boom."},                                                          //nolint:exhaustruct
		{"create error", &fakeValidator{createErr: errNope}, "the fake call failed: not set up."},                                                    //nolint:exhaustruct
		{"unreadable reply", &fakeValidator{reply: "I cannot answer in JSON."}, "the fake reply could not be read: the reply holds no JSON object."}, //nolint:exhaustruct
		{"bad finding", &fakeValidator{reply: `{"summary":"s","findings":[{"severity":"urgent","issue":"x"}]}`}, //nolint:exhaustruct
			"the fake reply could not be read: findings[0] needs a severity of high, medium or low and a non-empty issue."},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			t.Parallel()

			te, _ := projectInReview(t, tt.fake)

			validation := validationOf(t, func() map[string]any { out, _ := nextOutput(t, te); return out }())
			if validation["status"] != "skipped" || validation["reason"] != tt.reason {
				t.Errorf("validation = %v, want reason %q", validation, tt.reason)
			}
		})
	}
}

// TestNextValidationOffWithoutEntry checks that next without --validate and
// without a manifest entry calls no validator.
func TestNextValidationOffWithoutEntry(t *testing.T) {
	t.Parallel()

	fake := &fakeValidator{reply: validatorReply} //nolint:exhaustruct
	te, root := projectInReview(t, fake)

	editManifest(t, root, func(text string) string { return strings.Replace(text, validateFake, "", 1) })

	if out, _ := nextOutput(t, te); out["validation"] != nil || fake.calls() != 0 {
		t.Errorf("validation = %v, %d calls", out["validation"], fake.calls())
	}
}
