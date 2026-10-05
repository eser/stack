package aifx

import (
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"net/http/httptest"
	"reflect"
	"slices"
	"sync/atomic"
	"testing"

	"github.com/eser/stack/pkg/ajan/acpfx/shim"
)

// These tests pin TASK-56 and TASK-157: how each provider sends
// GenerateTextOptions.Effort. Anthropic sends output_config.effort, OpenAI
// reasoning_effort, the claude CLI --effort, Gemini and Vertex AI
// thinkingConfig.thinkingLevel, and the other providers leave the request
// unchanged.

func TestCheckEffort(t *testing.T) {
	t.Parallel()

	valid := []Effort{EffortDefault, EffortLow, EffortMedium, EffortHigh, EffortXHigh, EffortMax}
	for _, effort := range valid {
		t.Run(fmt.Sprintf("accepts %q", effort), func(t *testing.T) {
			t.Parallel()

			if err := checkEffort(effort); err != nil {
				t.Errorf("checkEffort(%q) = %v, want nil", effort, err)
			}
		})
	}

	t.Run("rejects an unknown level as a bad request", func(t *testing.T) {
		t.Parallel()

		err := checkEffort("huge")
		if !errors.Is(err, ErrUnknownEffort) || !errors.Is(err, ErrBadRequest) {
			t.Fatalf("checkEffort(%q) = %v, want ErrUnknownEffort and ErrBadRequest", "huge", err)
		}
	})
}

// captureRequest runs one GenerateText against a server that records the
// request body, and returns the body, or nil when no request was sent.
func captureRequest(
	t *testing.T,
	respond []byte,
	generate func(srv *httptest.Server) error,
) (map[string]json.RawMessage, error) {
	t.Helper()

	var (
		body  map[string]json.RawMessage
		calls atomic.Int32
	)

	srv := newAnthropicTestServer(func(w http.ResponseWriter, r *http.Request) {
		calls.Add(1)
		_ = json.NewDecoder(r.Body).Decode(&body)
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusOK)
		_, _ = w.Write(respond)
	})
	defer srv.Close()

	err := generate(srv)
	if calls.Load() == 0 {
		return nil, err
	}

	return body, err
}

func TestAnthropicEffortRequest(t *testing.T) {
	t.Parallel()

	lowBudget := 500
	cases := []struct {
		name         string
		effort       Effort
		budget       *int
		thinking     string
		outputConfig string
	}{
		{"sends effort as output_config.effort", EffortXHigh, nil, "", `{"effort":"xhigh"}`},
		{"an explicit effort wins over the budget's level", EffortMax, &lowBudget, `{"type":"adaptive"}`, `{"effort":"max"}`},
		{"sends no effort when neither is set", EffortDefault, nil, "", ""},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			t.Parallel()

			body, err := captureRequest(t,
				anthropicTextResponse("ok", "claude-opus-4-5", 1, 1),
				func(srv *httptest.Server) error {
					model := makeTestAnthropicModel(t, srv)
					_, err := model.GenerateText(t.Context(), &GenerateTextOptions{ //nolint:exhaustruct
						Messages:       []Message{NewTextMessage(RoleUser, "hi")},
						Effort:         tc.effort,
						ThinkingBudget: tc.budget,
					})

					return err
				})
			if err != nil {
				t.Fatalf("GenerateText: %v", err)
			}

			if got := string(body["thinking"]); got != tc.thinking {
				t.Errorf("thinking = %s, want %s", got, tc.thinking)
			}

			if got := string(body["output_config"]); got != tc.outputConfig {
				t.Errorf("output_config = %s, want %s", got, tc.outputConfig)
			}
		})
	}

	t.Run("rejects an unknown level before sending", func(t *testing.T) {
		t.Parallel()

		body, err := captureRequest(t,
			anthropicTextResponse("ok", "claude-opus-4-5", 1, 1),
			func(srv *httptest.Server) error {
				model := makeTestAnthropicModel(t, srv)
				_, err := model.GenerateText(t.Context(), &GenerateTextOptions{ //nolint:exhaustruct
					Messages: []Message{NewTextMessage(RoleUser, "hi")},
					Effort:   "huge",
				})

				return err
			})
		if !errors.Is(err, ErrUnknownEffort) || !errors.Is(err, ErrBadRequest) {
			t.Fatalf("GenerateText error = %v, want ErrUnknownEffort and ErrBadRequest", err)
		}

		if body != nil {
			t.Errorf("a request was sent: %v", body)
		}
	})
}

func TestOpenAIEffortRequest(t *testing.T) {
	t.Parallel()

	highBudget := 20000
	lowBudget := 500
	cases := []struct {
		name            string
		effort          Effort
		budget          *int
		reasoningEffort string
	}{
		{"sends effort as reasoning_effort", EffortLow, nil, `"low"`},
		{"passes max through unchanged", EffortMax, nil, `"max"`},
		{"an explicit effort wins over the budget's level", EffortMedium, &highBudget, `"medium"`},
		{"a thinking budget alone maps to an effort level", EffortDefault, &lowBudget, `"low"`},
		{"sends no reasoning_effort when neither is set", EffortDefault, nil, ""},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			t.Parallel()

			body, err := captureRequest(t,
				openAITextResponse("ok", "gpt-4o", 1, 1),
				func(srv *httptest.Server) error {
					model := makeTestOpenAIModel(t, srv)
					_, err := model.GenerateText(t.Context(), &GenerateTextOptions{ //nolint:exhaustruct
						Messages:       []Message{NewTextMessage(RoleUser, "hi")},
						Effort:         tc.effort,
						ThinkingBudget: tc.budget,
					})

					return err
				})
			if err != nil {
				t.Fatalf("GenerateText: %v", err)
			}

			if got := string(body["reasoning_effort"]); got != tc.reasoningEffort {
				t.Errorf("reasoning_effort = %s, want %s", got, tc.reasoningEffort)
			}
		})
	}

	t.Run("rejects an unknown level before sending", func(t *testing.T) {
		t.Parallel()

		body, err := captureRequest(t,
			openAITextResponse("ok", "gpt-4o", 1, 1),
			func(srv *httptest.Server) error {
				model := makeTestOpenAIModel(t, srv)
				_, err := model.GenerateText(t.Context(), &GenerateTextOptions{ //nolint:exhaustruct
					Messages: []Message{NewTextMessage(RoleUser, "hi")},
					Effort:   "huge",
				})

				return err
			})
		if !errors.Is(err, ErrUnknownEffort) {
			t.Fatalf("GenerateText error = %v, want ErrUnknownEffort", err)
		}

		if body != nil {
			t.Errorf("a request was sent: %v", body)
		}
	})
}

func TestACPEffortArgs(t *testing.T) {
	t.Parallel()

	cases := []struct {
		name    string
		factory ProviderFactory
		effort  Effort
		want    []string // the trailing vendor args
	}{
		{"claude-code sends --effort", NewClaudeCodeModelFactory(), EffortLow, []string{"--effort", "low"}},
		{"claude-code sends no --effort by default", NewClaudeCodeModelFactory(), EffortDefault, nil},
		{"kiro ignores the level", NewKiroModelFactory(), EffortHigh, nil},
		{"opencode ignores the level", NewOpenCodeModelFactory(), EffortHigh, nil},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			t.Parallel()

			model := newTestACPModel(t, tc.factory)

			backend, err := model.backendImpl(&GenerateTextOptions{Effort: tc.effort}) //nolint:exhaustruct
			if err != nil {
				t.Fatalf("backendImpl(%q): %v", tc.effort, err)
			}

			args := backendExtraArgs(t, backend)
			hasEffort := slices.Contains(args, "--effort")

			if tc.want == nil {
				if hasEffort {
					t.Errorf("args = %v, want no --effort", args)
				}

				return
			}

			if len(args) < len(tc.want) || !slices.Equal(args[len(args)-len(tc.want):], tc.want) {
				t.Errorf("args = %v, want them to end with %v", args, tc.want)
			}
		})
	}

	t.Run("claude-code rejects an unknown level", func(t *testing.T) {
		t.Parallel()

		model := newTestACPModel(t, NewClaudeCodeModelFactory())

		_, err := model.backendImpl(&GenerateTextOptions{Effort: "huge"}) //nolint:exhaustruct
		if !errors.Is(err, ErrUnknownEffort) || !errors.Is(err, ErrACPFailed) {
			t.Fatalf("backendImpl error = %v, want ErrUnknownEffort and ErrACPFailed", err)
		}
	})
}

// genAIProviders returns the gemini and vertexai entries of schemaProviders,
// which build each model against a test server.
func genAIProviders() []schemaProvider {
	providers := make([]schemaProvider, 0, 2)

	for _, provider := range schemaProviders() {
		if provider.name == geminiProviderName || provider.name == vertexAIProviderName {
			providers = append(providers, provider)
		}
	}

	return providers
}

// TASK-157: Gemini and Vertex AI send the effort level as
// generationConfig.thinkingConfig.thinkingLevel. Gemini's levels stop at HIGH,
// and the API rejects thinkingLevel next to thinkingBudget, so an explicit
// effort wins and the budget is left out.
func TestGenAIEffortRequest(t *testing.T) {
	t.Parallel()

	budget := 2048
	cases := []struct {
		name           string
		effort         Effort
		budget         *int
		thinkingConfig string
	}{
		{"sends low as LOW", EffortLow, nil, `{"thinkingLevel":"LOW"}`},
		{"sends medium as MEDIUM", EffortMedium, nil, `{"thinkingLevel":"MEDIUM"}`},
		{"sends high as HIGH", EffortHigh, nil, `{"thinkingLevel":"HIGH"}`},
		{"sends xhigh as HIGH, the highest level", EffortXHigh, nil, `{"thinkingLevel":"HIGH"}`},
		{"sends max as HIGH, the highest level", EffortMax, nil, `{"thinkingLevel":"HIGH"}`},
		{"an explicit effort wins over the budget", EffortLow, &budget, `{"thinkingLevel":"LOW"}`},
		{"a thinking budget alone is sent as is", EffortDefault, &budget, `{"thinkingBudget":2048}`},
		{"sends no thinking config when neither is set", EffortDefault, nil, ""},
	}

	for _, provider := range genAIProviders() {
		for _, tc := range cases {
			t.Run(provider.name+" "+tc.name, func(t *testing.T) {
				t.Parallel()

				body, err := captureRequest(t, provider.reply, func(srv *httptest.Server) error {
					return generateOrStream(t, provider.model(t, srv), false, &GenerateTextOptions{ //nolint:exhaustruct
						Messages:       []Message{NewTextMessage(RoleUser, "hi")},
						Effort:         tc.effort,
						ThinkingBudget: tc.budget,
					})
				})
				if err != nil {
					t.Fatalf("GenerateText: %v", err)
				}

				var generationConfig map[string]json.RawMessage

				err = json.Unmarshal(body["generationConfig"], &generationConfig)
				if err != nil {
					t.Fatalf("decode generationConfig %s: %v", body["generationConfig"], err)
				}

				got, sent := generationConfig["thinkingConfig"]
				if tc.thinkingConfig == "" {
					if sent {
						t.Errorf("thinkingConfig = %s, want none", got)
					}

					return
				}

				if !reflect.DeepEqual(decodeJSONValue(t, got), decodeJSONValue(t, []byte(tc.thinkingConfig))) {
					t.Errorf("thinkingConfig = %s, want %s", got, tc.thinkingConfig)
				}
			})
		}

		for _, stream := range []bool{false, true} {
			t.Run(fmt.Sprintf("%s rejects an unknown level before sending (stream %v)", provider.name, stream), func(t *testing.T) {
				t.Parallel()

				body, err := captureRequest(t, provider.reply, func(srv *httptest.Server) error {
					return generateOrStream(t, provider.model(t, srv), stream, &GenerateTextOptions{ //nolint:exhaustruct
						Messages: []Message{NewTextMessage(RoleUser, "hi")},
						Effort:   "huge",
					})
				})
				if !errors.Is(err, ErrUnknownEffort) || !errors.Is(err, ErrBadRequest) {
					t.Fatalf("error = %v, want ErrUnknownEffort and ErrBadRequest", err)
				}

				if body != nil {
					t.Errorf("a request was sent: %v", body)
				}
			})
		}
	}
}

func TestOllamaIgnoresEffort(t *testing.T) {
	t.Parallel()

	model := &OllamaModel{config: &ConfigTarget{Model: "llama3"}} //nolint:exhaustruct

	without, err := model.buildChatBody(&GenerateTextOptions{ //nolint:exhaustruct
		Messages: []Message{NewTextMessage(RoleUser, "hi")},
	}, false)
	if err != nil {
		t.Fatalf("buildChatBody without effort: %v", err)
	}

	with, err := model.buildChatBody(&GenerateTextOptions{ //nolint:exhaustruct
		Messages: []Message{NewTextMessage(RoleUser, "hi")},
		Effort:   EffortMax,
	}, false)
	if err != nil {
		t.Fatalf("buildChatBody with effort: %v", err)
	}

	if !reflect.DeepEqual(without, with) {
		t.Errorf("effort changed the Ollama body: %v, want %v", with, without)
	}
}

// newTestACPModel builds an ACPModel the way the registry does.
func newTestACPModel(t *testing.T, factory ProviderFactory) *ACPModel {
	t.Helper()

	model, err := factory.CreateModel(t.Context(), &ConfigTarget{ //nolint:exhaustruct
		Provider: factory.GetProvider(),
		Model:    "test-model",
	})
	if err != nil {
		t.Fatalf("CreateModel %s: %v", factory.GetProvider(), err)
	}

	acpModel, ok := model.(*ACPModel)
	if !ok {
		t.Fatalf("%s did not produce an ACPModel", factory.GetProvider())
	}

	return acpModel
}

// backendExtraArgs returns the vendor args a shim backend was built with.
func backendExtraArgs(t *testing.T, backend shim.Backend) []string {
	t.Helper()

	switch b := backend.(type) {
	case *shim.ClaudeCode:
		return b.ExtraArgs
	case *shim.Kiro:
		return b.ExtraArgs
	case *shim.OpenCode:
		return b.ExtraArgs
	default:
		t.Fatalf("unexpected backend %T", backend)

		return nil
	}
}
