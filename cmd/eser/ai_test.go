// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

package main

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync"
	"testing"

	"github.com/eser/stack/pkg/ajan/aifx"
)

// fakeModel answers every prompt with its reply; a nil reply streams until
// the request is cancelled.
type fakeModel struct {
	provider, model string
	reply           []string
	started         chan struct{}

	mu   sync.Mutex
	seen []*aifx.GenerateTextOptions
}

func (m *fakeModel) GetCapabilities() []aifx.ProviderCapability { return nil }
func (m *fakeModel) GetProvider() string                        { return m.provider }
func (m *fakeModel) GetModelID() string                         { return m.model }
func (m *fakeModel) GetRawClient() any                          { return nil }
func (m *fakeModel) Close(context.Context) error                { return nil }

func (m *fakeModel) record(opts *aifx.GenerateTextOptions) {
	m.mu.Lock()
	defer m.mu.Unlock()

	m.seen = append(m.seen, opts)
}

func (m *fakeModel) GenerateText(_ context.Context, opts *aifx.GenerateTextOptions) (*aifx.GenerateTextResult, error) {
	m.record(opts)

	return &aifx.GenerateTextResult{ //nolint:exhaustruct
		Content: []aifx.ContentBlock{
			aifx.NewThinkingBlock(aifx.ThinkingPart{Text: "hmm", Signature: "sig"}), //nolint:exhaustruct
			{Type: aifx.ContentBlockText, Text: strings.Join(m.reply, "")},          //nolint:exhaustruct
		},
		StopReason: aifx.StopReasonEndTurn,
		Usage:      aifx.Usage{InputTokens: 3, OutputTokens: 2, TotalTokens: 5}, //nolint:exhaustruct
		ModelID:    m.model,
	}, nil
}

func (m *fakeModel) StreamText(ctx context.Context, opts *aifx.StreamTextOptions) (*aifx.StreamIterator, error) {
	m.record(opts)

	ctx, cancel := context.WithCancel(ctx)
	events := make(chan aifx.StreamEvent)

	go func() {
		defer close(events)

		if m.reply == nil {
			close(m.started)
			<-ctx.Done()
			events <- aifx.StreamEvent{Type: aifx.StreamEventError, Error: ctx.Err()} //nolint:exhaustruct

			return
		}

		for _, delta := range m.reply {
			events <- aifx.StreamEvent{Type: aifx.StreamEventContentDelta, TextDelta: delta} //nolint:exhaustruct
		}

		events <- aifx.StreamEvent{Type: aifx.StreamEventMessageDone, StopReason: aifx.StopReasonEndTurn} //nolint:exhaustruct
	}()

	return aifx.NewStreamIterator(events, cancel), nil
}

type fakeFactory struct {
	provider string
	model    *fakeModel
}

func (f *fakeFactory) GetProvider() string { return f.provider }

func (f *fakeFactory) CreateModel(_ context.Context, config *aifx.ConfigTarget) (aifx.LanguageModel, error) { //nolint:ireturn
	f.model.provider, f.model.model = config.Provider, config.Model

	return f.model, nil
}

func aiTestEnv(t *testing.T, provider string, reply []string) (*env, *fakeModel) {
	t.Helper()

	e := testEnv(t)
	e.ollamaURL = "http://127.0.0.1:1"                              // nothing listens there
	model := &fakeModel{reply: reply, started: make(chan struct{})} //nolint:exhaustruct
	e.aiFactories = func() []aifx.ProviderFactory {
		return []aifx.ProviderFactory{&fakeFactory{provider: provider, model: model}}
	}

	return e, model
}

func TestAIAskStreams(t *testing.T) {
	t.Parallel()

	e, model := aiTestEnv(t, "anthropic", []string{"Hello", ", ", "world"})

	out, stderr, code := runCLI(t, e, "ai", "ask", "say", "hello", "-p", "ant", "--max-tokens", "64", "--effort", "high", "-v")
	if code != 0 {
		t.Fatalf("exit %d: %s", code, stderr)
	}

	if out != "Hello, world\n" {
		t.Errorf("stdout %q", out)
	}

	if !strings.Contains(stderr, "Using Anthropic API (claude-sonnet-5)") || !strings.Contains(stderr, "Sending prompt (9 chars)...") {
		t.Errorf("verbose log %q", stderr)
	}

	opts := model.seen[0]
	if opts.MaxTokens != 64 || opts.Effort != aifx.EffortHigh || opts.Messages[0].Content[0].Text != "say hello" {
		t.Errorf("options %+v", opts)
	}
}

func TestAIAskJSON(t *testing.T) {
	t.Parallel()

	e, model := aiTestEnv(t, "ollama", []string{"forty-two"})

	out, stderr, code := runCLI(t, e, "ai", "ask", "--json", "-p", "ol", "-m", "llama3.3", "what is it?")
	if code != 0 {
		t.Fatalf("exit %d: %s", code, stderr)
	}

	want := `{
  "content": [
    {
      "kind": "thinking",
      "thinking": {
        "text": "hmm",
        "signature": "sig"
      }
    },
    {
      "kind": "text",
      "text": "forty-two"
    }
  ],
  "stopReason": "end_turn",
  "usage": {
    "inputTokens": 3,
    "outputTokens": 2,
    "totalTokens": 5
  },
  "modelId": "llama3.3"
}
`
	if out != want {
		t.Errorf("got\n%s\nwant\n%s", out, want)
	}

	if model.provider != "ollama" {
		t.Errorf("provider %q", model.provider)
	}

	var decoded map[string]any
	if err := json.Unmarshal([]byte(out), &decoded); err != nil {
		t.Error(err)
	}
}

func TestAIAskDetectsTheProvider(t *testing.T) {
	t.Parallel()

	e, model := aiTestEnv(t, "openai", []string{"ok"})
	e.environ = func() []string { return []string{"OPENAI_API_KEY="} }

	if out, stderr, code := runCLI(t, e, "ai", "ask", "hi", "--verbose"); code != 0 || out != "ok\n" {
		t.Fatalf("exit %d, %q: %s", code, out, stderr)
	}

	if model.model != "gpt-5.6-terra" {
		t.Errorf("default model %q", model.model)
	}

	e.environ = func() []string { return nil }

	_, stderr, code := runCLI(t, e, "ai", "ask", "hi")
	if code != 1 || !strings.Contains(stderr, "No AI provider detected") && !strings.Contains(stderr, "no AI provider detected") {
		t.Errorf("no provider: exit %d: %s", code, stderr)
	}
}

func TestAIAskUsageErrors(t *testing.T) {
	t.Parallel()

	e, _ := aiTestEnv(t, "anthropic", []string{"x"})

	for _, args := range [][]string{
		{"ai", "ask"},
		{"ai", "ask", "hi", "--max-tokens", "0"},
		{"ai", "ask", "hi", "--max-tokens", "lots"},
		{"ai", "ask", "hi", "--effort", "extreme"},
	} {
		if _, _, code := runCLI(t, e, args...); code != 2 {
			t.Errorf("%v: exit %d, want 2", args, code)
		}
	}
}

func TestAIAskCancels(t *testing.T) {
	t.Parallel()

	e, model := aiTestEnv(t, "anthropic", nil)
	ctx, cancel := context.WithCancel(context.Background())

	go func() {
		<-model.started
		cancel()
	}()

	stdout, stderr := &strings.Builder{}, &strings.Builder{}
	e.stdout, e.stderr = stdout, stderr

	if code := run(ctx, e, []string{"ai", "ask", "-p", "anthropic", "wait"}); code != 130 {
		t.Errorf("exit %d, want 130: %s", code, stderr)
	}

	if !strings.Contains(stderr.String(), "cancelled") {
		t.Errorf("stderr %q", stderr)
	}
}

func TestAIList(t *testing.T) {
	t.Parallel()

	ollama := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/api/version" {
			http.NotFound(w, r)

			return
		}

		_, _ = w.Write([]byte(`{"version":"0.9.0"}`))
	}))
	t.Cleanup(ollama.Close)

	e := testEnv(t)
	e.ollamaURL = ollama.URL
	e.environ = func() []string { return []string{"ANTHROPIC_AUTH_TOKEN=x", "GOOGLE_API_KEY=y"} }
	e.lookPath = func(name string) (string, error) {
		if name == "kiro" {
			return "/usr/local/bin/kiro", nil
		}

		return "", errors.New("not found") //nolint:err113
	}

	out, _, code := runCLI(t, e, "ai", "list")
	if code != 0 {
		t.Fatalf("exit %d", code)
	}

	for _, want := range []string{
		"AI Providers\n\n",
		"○  claude-code (cc)  CLI   claude not on PATH",
		"●  ollama (ol)       HTTP  localhost:11434 reachable",
		"●  kiro (kr)         CLI   kiro binary found",
		"●  anthropic (ant)   API   ANTHROPIC_AUTH_TOKEN set",
		"○  openai (oai)      API   OPENAI_API_KEY not set",
		"●  gemini (gem)      API   API key set",
		"4/8 providers available\n",
	} {
		if !strings.Contains(out, want) {
			t.Errorf("list should contain %q:\n%s", want, out)
		}
	}

	out, _, _ = runCLI(t, e, "ai", "list", "--json")

	var statuses []providerStatus
	if err := json.Unmarshal([]byte(out), &statuses); err != nil || len(statuses) != 8 || !statuses[1].Available {
		t.Errorf("--json: %v %+v", err, statuses)
	}
}
