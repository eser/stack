package aifx

import (
	"encoding/json"
	"errors"
	"fmt"
	"net/http/httptest"
	"reflect"
	"slices"
	"strings"
	"testing"
)

// These tests pin TASK-57: a json_schema response format reaches the Anthropic
// API as output_config.format, in the same object as the effort. Claude has no
// JSON mode without a schema, so the other format types send nothing.

const titleSchema = `{
	"type": "object",
	"properties": {"title": {"type": "string"}},
	"required": ["title"],
	"additionalProperties": false
}`

// decodeJSONValue decodes raw for a comparison that ignores key order and
// whitespace; empty input decodes to nil.
func decodeJSONValue(t *testing.T, raw []byte) any {
	t.Helper()

	if len(raw) == 0 {
		return nil
	}

	var value any

	err := json.Unmarshal(raw, &value)
	if err != nil {
		t.Fatalf("decode %s: %v", raw, err)
	}

	return value
}

func TestAnthropicResponseFormatRequest(t *testing.T) {
	t.Parallel()

	format := `{"type":"json_schema","schema":` + titleSchema + `}`
	cases := []struct {
		name           string
		responseFormat *ResponseFormat
		effort         Effort
		outputConfig   string
	}{
		{
			name:           "sends a json_schema format as output_config.format, without its name",
			responseFormat: &ResponseFormat{Type: "json_schema", Name: "post", JSONSchema: []byte(titleSchema)},
			effort:         EffortDefault,
			outputConfig:   `{"format":` + format + `}`,
		},
		{
			name:           "merges the format with the effort",
			responseFormat: &ResponseFormat{Type: "json_schema", Name: "", JSONSchema: []byte(titleSchema)},
			effort:         EffortLow,
			outputConfig:   `{"effort":"low","format":` + format + `}`,
		},
		{
			name:           "sends nothing for json_object",
			responseFormat: &ResponseFormat{Type: "json_object", Name: "", JSONSchema: nil},
			effort:         EffortDefault,
			outputConfig:   "",
		},
		{
			name:           "keeps only the effort for text",
			responseFormat: &ResponseFormat{Type: "text", Name: "", JSONSchema: nil},
			effort:         EffortHigh,
			outputConfig:   `{"effort":"high"}`,
		},
		{
			name:           "sends nothing without a response format",
			responseFormat: nil,
			effort:         EffortDefault,
			outputConfig:   "",
		},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			t.Parallel()

			body, err := captureRequest(t,
				anthropicTextResponse(`{"title":"ok"}`, "claude-opus-4-5", 1, 1),
				func(srv *httptest.Server) error {
					model := makeTestAnthropicModel(t, srv)
					_, err := model.GenerateText(t.Context(), &GenerateTextOptions{ //nolint:exhaustruct
						Messages:       []Message{NewTextMessage(RoleUser, "name this post")},
						ResponseFormat: tc.responseFormat,
						Effort:         tc.effort,
					})

					return err
				})
			if err != nil {
				t.Fatalf("GenerateText: %v", err)
			}

			got := decodeJSONValue(t, body["output_config"])
			want := decodeJSONValue(t, []byte(tc.outputConfig))

			if !reflect.DeepEqual(got, want) {
				t.Errorf("output_config = %s, want %s", body["output_config"], tc.outputConfig)
			}
		})
	}
}

func TestAnthropicResponseFormatRejectsBadSchema(t *testing.T) {
	t.Parallel()

	cases := []struct {
		name   string
		schema []byte
	}{
		{"no schema", nil},
		{"a null schema", []byte(`null`)},
		{"a schema that is not an object", []byte(`["title"]`)},
		{"a schema that is not JSON", []byte(`{"type":`)},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			t.Parallel()

			body, err := captureRequest(t,
				anthropicTextResponse("ok", "claude-opus-4-5", 1, 1),
				func(srv *httptest.Server) error {
					model := makeTestAnthropicModel(t, srv)
					_, err := model.GenerateText(t.Context(), &GenerateTextOptions{ //nolint:exhaustruct
						Messages: []Message{NewTextMessage(RoleUser, "hi")},
						ResponseFormat: &ResponseFormat{
							Type:       "json_schema",
							Name:       "",
							JSONSchema: tc.schema,
						},
					})

					return err
				})
			if !errors.Is(err, ErrInvalidResponseSchema) || !errors.Is(err, ErrBadRequest) {
				t.Fatalf("GenerateText error = %v, want ErrInvalidResponseSchema and ErrBadRequest", err)
			}

			if body != nil {
				t.Errorf("a request was sent: %v", body)
			}
		})
	}
}

func TestAnthropicBatchRequestKeepsResponseFormat(t *testing.T) {
	t.Parallel()

	model := &AnthropicModel{config: &ConfigTarget{Model: "claude-opus-4-5"}} //nolint:exhaustruct

	params, err := model.buildMessageParams(&GenerateTextOptions{ //nolint:exhaustruct
		Messages: []Message{NewTextMessage(RoleUser, "name this post")},
		ResponseFormat: &ResponseFormat{
			Type:       "json_schema",
			Name:       "",
			JSONSchema: []byte(titleSchema),
		},
		Effort: EffortMedium,
	})
	if err != nil {
		t.Fatalf("buildMessageParams: %v", err)
	}

	encoded, err := json.Marshal(newAnthropicBatchRequest("req-1", params).Params)
	if err != nil {
		t.Fatalf("marshal batch params: %v", err)
	}

	var sent map[string]json.RawMessage

	err = json.Unmarshal(encoded, &sent)
	if err != nil {
		t.Fatalf("decode batch params: %v", err)
	}

	want := `{"effort":"medium","format":{"type":"json_schema","schema":` + titleSchema + `}}`
	if !reflect.DeepEqual(decodeJSONValue(t, sent["output_config"]), decodeJSONValue(t, []byte(want))) {
		t.Errorf("batch output_config = %s, want %s", sent["output_config"], want)
	}
}

// The tests below pin TASK-158: the openai, ollama, gemini and vertexai
// adapters reject a missing or non-object schema with ErrInvalidResponseSchema
// before any request is sent, instead of sending the request without it, and
// send a valid one where the API reads it.

// schemaProvider builds a provider's model against srv, with a reply its API
// would send.
type schemaProvider struct {
	name  string
	reply []byte
	model func(t *testing.T, srv *httptest.Server) LanguageModel
}

func schemaProviders() []schemaProvider {
	genAIReply := []byte(`{"candidates":[{"content":{"role":"model","parts":[{"text":"{\"title\":\"ok\"}"}]},"finishReason":"STOP"}]}`)

	return []schemaProvider{
		{
			name:  "openai",
			reply: openAITextResponse(`{"title":"ok"}`, "gpt-4o", 1, 1),
			model: func(t *testing.T, srv *httptest.Server) LanguageModel { //nolint:ireturn // each case builds a different provider behind one interface
				t.Helper()

				return makeTestOpenAIModel(t, srv)
			},
		},
		{
			name:  "ollama",
			reply: ollamaChatResponseJSON(`{"title":"ok"}`, 1, 1),
			model: func(t *testing.T, srv *httptest.Server) LanguageModel { //nolint:ireturn // each case builds a different provider behind one interface
				t.Helper()

				model, err := NewOllamaModelFactory().CreateModel(t.Context(), ollamaConfig(srv, "llama3"))
				if err != nil {
					t.Fatalf("CreateModel ollama: %v", err)
				}

				return model
			},
		},
		{
			name:  "gemini",
			reply: genAIReply,
			model: func(t *testing.T, srv *httptest.Server) LanguageModel { //nolint:ireturn // each case builds a different provider behind one interface
				t.Helper()

				return &GeminiModel{client: newGenAITestClient(t, srv), modelID: "gemini-test"}
			},
		},
		{
			name:  "vertexai",
			reply: genAIReply,
			model: func(t *testing.T, srv *httptest.Server) LanguageModel { //nolint:ireturn // each case builds a different provider behind one interface
				t.Helper()

				// The client's backend does not matter here: the model's own
				// request building is under test.
				return &VertexAIModel{client: newGenAITestClient(t, srv), modelID: "gemini-test"}
			},
		},
	}
}

// generateOrStream runs one GenerateText or one collected StreamText.
func generateOrStream(t *testing.T, model LanguageModel, stream bool, opts *GenerateTextOptions) error {
	t.Helper()

	if !stream {
		_, err := model.GenerateText(t.Context(), opts)

		return err
	}

	iter, err := model.StreamText(t.Context(), opts)
	if err != nil {
		return err
	}

	defer func() { _ = iter.Close() }()

	_, err = iter.Collect()

	return err
}

func TestResponseSchemaFailsBeforeSending(t *testing.T) {
	t.Parallel()

	schemas := []struct {
		name   string
		schema []byte
	}{
		{"no schema", nil},
		{"a null schema", []byte(`null`)},
		{"a schema that is not an object", []byte(`["title"]`)},
		{"a schema that is not JSON", []byte(`{"type":`)},
	}

	for _, provider := range schemaProviders() {
		for _, schema := range schemas {
			for _, stream := range []bool{false, true} {
				name := fmt.Sprintf("%s rejects %s (stream %v)", provider.name, schema.name, stream)

				t.Run(name, func(t *testing.T) {
					t.Parallel()

					body, err := captureRequest(t, provider.reply, func(srv *httptest.Server) error {
						return generateOrStream(t, provider.model(t, srv), stream, &GenerateTextOptions{ //nolint:exhaustruct
							Messages: []Message{NewTextMessage(RoleUser, "name this post")},
							ResponseFormat: &ResponseFormat{
								Type:       "json_schema",
								Name:       "post",
								JSONSchema: schema.schema,
							},
						})
					})
					if !errors.Is(err, ErrInvalidResponseSchema) || !errors.Is(err, ErrBadRequest) {
						t.Fatalf("error = %v, want ErrInvalidResponseSchema and ErrBadRequest", err)
					}

					if body != nil {
						t.Errorf("a request was sent: %v", body)
					}
				})
			}
		}
	}
}

func TestResponseSchemaReachesTheWire(t *testing.T) {
	t.Parallel()

	// Where each API reads the schema in the request body.
	paths := map[string][]string{
		"openai":   {"response_format", "json_schema", "schema"},
		"ollama":   {"format"},
		"gemini":   {"generationConfig", "responseJsonSchema"},
		"vertexai": {"generationConfig", "responseJsonSchema"},
	}

	for _, provider := range schemaProviders() {
		t.Run(provider.name, func(t *testing.T) {
			t.Parallel()

			body, err := captureRequest(t, provider.reply, func(srv *httptest.Server) error {
				return generateOrStream(t, provider.model(t, srv), false, &GenerateTextOptions{ //nolint:exhaustruct
					Messages: []Message{NewTextMessage(RoleUser, "name this post")},
					ResponseFormat: &ResponseFormat{
						Type:       "json_schema",
						Name:       "post",
						JSONSchema: []byte(titleSchema),
					},
				})
			})
			if err != nil {
				t.Fatalf("GenerateText: %v", err)
			}

			sent := decodeJSONValue(t, mustMarshal(t, body))

			for _, key := range paths[provider.name] {
				object, ok := sent.(map[string]any)
				if !ok {
					t.Fatalf("request body has no %v: %v", paths[provider.name], body)
				}

				sent = object[key]
			}

			if want := decodeJSONValue(t, []byte(titleSchema)); !reflect.DeepEqual(sent, want) {
				t.Errorf("schema sent = %v, want %v", sent, want)
			}

			// Gemini takes only one of its two schema fields.
			if config, ok := decodeJSONValue(t, body["generationConfig"]).(map[string]any); ok {
				if _, both := config["responseSchema"]; both {
					t.Errorf("responseSchema was sent next to responseJsonSchema: %v", config)
				}
			}
		})
	}
}

func mustMarshal(t *testing.T, value any) []byte {
	t.Helper()

	data, err := json.Marshal(value)
	if err != nil {
		t.Fatalf("marshal %v: %v", value, err)
	}

	return data
}

// TestToolParametersFailBeforeSending pins the same rule for tool schemas: a
// tool whose Parameters do not decode is not sent without its schema.
func TestToolParametersFailBeforeSending(t *testing.T) {
	t.Parallel()

	providers := append(schemaProviders(), schemaProvider{
		name:  "anthropic",
		reply: anthropicTextResponse("ok", "claude-opus-4-5", 1, 1),
		model: func(t *testing.T, srv *httptest.Server) LanguageModel { //nolint:ireturn // each case builds a different provider behind one interface
			t.Helper()

			return makeTestAnthropicModel(t, srv)
		},
	})

	for _, provider := range providers {
		// Ollama's request has no tools.
		if provider.name == "ollama" {
			continue
		}

		t.Run(provider.name, func(t *testing.T) {
			t.Parallel()

			body, err := captureRequest(t, provider.reply, func(srv *httptest.Server) error {
				return generateOrStream(t, provider.model(t, srv), false, &GenerateTextOptions{ //nolint:exhaustruct
					Messages: []Message{NewTextMessage(RoleUser, "weather?")},
					Tools: []ToolDefinition{{
						Name:        "get_weather",
						Description: "current weather",
						Parameters:  json.RawMessage(`{"type":`),
					}},
				})
			})
			if !errors.Is(err, ErrBadRequest) || !strings.Contains(err.Error(), `"get_weather"`) {
				t.Fatalf("error = %v, want ErrBadRequest naming the tool", err)
			}

			if body != nil {
				t.Errorf("a request was sent: %v", body)
			}
		})
	}
}

func TestACPJSONSchemaArgs(t *testing.T) {
	t.Parallel()

	compact := `{"type":"object","properties":{"title":{"type":"string"}}}`

	cases := []struct {
		name    string
		factory ProviderFactory
		format  *ResponseFormat
		want    []string // the trailing vendor args, nil for no --json-schema
	}{
		{
			name:    "claude-code sends the schema as --json-schema",
			factory: NewClaudeCodeModelFactory(),
			format:  &ResponseFormat{Type: "json_schema", Name: "post", JSONSchema: []byte(compact)},
			want:    []string{"--json-schema", compact},
		},
		{
			name:    "claude-code sends nothing for json_object",
			factory: NewClaudeCodeModelFactory(),
			format:  &ResponseFormat{Type: "json_object", Name: "", JSONSchema: nil},
			want:    nil,
		},
		{
			name:    "claude-code sends nothing without a response format",
			factory: NewClaudeCodeModelFactory(),
			format:  nil,
			want:    nil,
		},
		{
			name:    "kiro ignores the format",
			factory: NewKiroModelFactory(),
			format:  &ResponseFormat{Type: "json_schema", Name: "", JSONSchema: []byte(compact)},
			want:    nil,
		},
		{
			name:    "opencode ignores the format",
			factory: NewOpenCodeModelFactory(),
			format:  &ResponseFormat{Type: "json_schema", Name: "", JSONSchema: []byte(compact)},
			want:    nil,
		},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			t.Parallel()

			model := newTestACPModel(t, tc.factory)

			backend, err := model.backendImpl(&GenerateTextOptions{ResponseFormat: tc.format}) //nolint:exhaustruct
			if err != nil {
				t.Fatalf("backendImpl: %v", err)
			}

			args := backendExtraArgs(t, backend)

			if tc.want == nil {
				if slices.Contains(args, "--json-schema") {
					t.Errorf("args = %v, want no --json-schema", args)
				}

				return
			}

			if len(args) < len(tc.want) || !slices.Equal(args[len(args)-len(tc.want):], tc.want) {
				t.Errorf("args = %v, want them to end with %v", args, tc.want)
			}
		})
	}

	t.Run("claude-code rejects a schema that is not an object", func(t *testing.T) {
		t.Parallel()

		model := newTestACPModel(t, NewClaudeCodeModelFactory())

		_, err := model.backendImpl(&GenerateTextOptions{ //nolint:exhaustruct
			ResponseFormat: &ResponseFormat{Type: "json_schema", Name: "", JSONSchema: []byte(`["title"]`)},
		})
		if !errors.Is(err, ErrInvalidResponseSchema) || !errors.Is(err, ErrACPFailed) {
			t.Fatalf("backendImpl error = %v, want ErrInvalidResponseSchema and ErrACPFailed", err)
		}
	})

	t.Run("claude-code declares structured output, kiro does not", func(t *testing.T) {
		t.Parallel()

		claude := newTestACPModel(t, NewClaudeCodeModelFactory()).GetCapabilities()
		kiro := newTestACPModel(t, NewKiroModelFactory()).GetCapabilities()

		if !slices.Contains(claude, CapabilityStructuredOut) || slices.Contains(kiro, CapabilityStructuredOut) {
			t.Errorf("claude-code %v, kiro %v; want structured_output on claude-code only", claude, kiro)
		}
	})
}
