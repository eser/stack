package aifx

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
)

// Sentinel errors for the Ollama adapter.
var (
	ErrOllamaGenerationFailed = errors.New("ollama generation failed")
	ErrOllamaStreamFailed     = errors.New("ollama stream failed")
)

const (
	ollamaProviderName   = "ollama"
	ollamaDefaultBaseURL = "http://localhost:11434"
)

// ollamaModelFactory creates Ollama language models.
type ollamaModelFactory struct{}

// NewOllamaModelFactory returns a ProviderFactory for Ollama models.
func NewOllamaModelFactory() ProviderFactory { //nolint:ireturn
	return &ollamaModelFactory{}
}

func (f *ollamaModelFactory) GetProvider() string {
	return ollamaProviderName
}

func (f *ollamaModelFactory) CreateModel(
	_ context.Context,
	config *ConfigTarget,
) (LanguageModel, error) { //nolint:ireturn
	if config.Model == "" {
		return nil, fmt.Errorf("%w: %w", ErrOllamaGenerationFailed, ErrInvalidModel)
	}

	baseURL := ollamaDefaultBaseURL
	if bu, ok := config.Properties["baseUrl"].(string); ok && bu != "" {
		baseURL = bu
	}

	return &OllamaModel{ //nolint:exhaustruct
		baseURL: baseURL,
		client:  &http.Client{}, //nolint:exhaustruct
		config:  config,
	}, nil
}

// OllamaModel implements LanguageModel for the Ollama local AI runtime.
type OllamaModel struct {
	client  *http.Client
	config  *ConfigTarget
	baseURL string
}

func (m *OllamaModel) GetCapabilities() []ProviderCapability {
	return []ProviderCapability{
		CapabilityTextGeneration,
		CapabilityStreaming,
		CapabilityVision,
	}
}

func (m *OllamaModel) GetProvider() string { return ollamaProviderName }
func (m *OllamaModel) GetModelID() string  { return m.config.Model }
func (m *OllamaModel) GetRawClient() any   { return m.client }

func (m *OllamaModel) Close(_ context.Context) error { return nil }

// GenerateText performs a non-streaming text generation via the Ollama /api/chat endpoint.
func (m *OllamaModel) GenerateText(
	ctx context.Context,
	opts *GenerateTextOptions,
) (*GenerateTextResult, error) {
	body := m.buildChatBody(opts, false)

	payload, err := json.Marshal(body)
	if err != nil {
		return nil, fmt.Errorf("%w: marshal request: %w", ErrOllamaGenerationFailed, err)
	}

	req, err := http.NewRequestWithContext(
		ctx, http.MethodPost, m.baseURL+"/api/chat", bytes.NewReader(payload),
	)
	if err != nil {
		return nil, fmt.Errorf("%w: build request: %w", ErrOllamaGenerationFailed, err)
	}

	req.Header.Set("Content-Type", "application/json")

	resp, err := m.client.Do(req)
	if err != nil {
		return nil, fmt.Errorf("%w: %w", ErrOllamaGenerationFailed, err)
	}

	defer func() { _ = resp.Body.Close() }()

	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf(
			"%w: %w",
			ErrOllamaGenerationFailed,
			classifyAndWrap(ErrOllamaGenerationFailed, resp.StatusCode, fmt.Errorf("HTTP %d", resp.StatusCode)),
		)
	}

	data, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, fmt.Errorf("%w: read response: %w", ErrOllamaGenerationFailed, err)
	}

	var chatResp ollamaChatResponse
	if err = json.Unmarshal(data, &chatResp); err != nil {
		return nil, fmt.Errorf("%w: parse response: %w", ErrOllamaGenerationFailed, err)
	}

	return mapOllamaChatResponse(&chatResp, m.config.Model), nil
}

// StreamText performs streaming text generation via the Ollama /api/chat endpoint.
func (m *OllamaModel) StreamText(
	ctx context.Context,
	opts *StreamTextOptions,
) (*StreamIterator, error) {
	body := m.buildChatBody(opts, true)

	streamCtx, cancel := context.WithCancel(ctx)
	eventCh := make(chan StreamEvent, 64) //nolint:mnd

	go m.processStream(streamCtx, body, eventCh, cancel)

	return NewStreamIterator(eventCh, cancel), nil
}

// processStream runs in a goroutine: POSTs to /api/chat with stream=true and
// reads the JSONL response line by line, emitting StreamEvents.
func (m *OllamaModel) processStream(
	ctx context.Context,
	body map[string]any,
	eventCh chan<- StreamEvent,
	cancel context.CancelFunc,
) {
	defer close(eventCh)
	defer cancel()

	payload, err := json.Marshal(body)
	if err != nil {
		eventCh <- newStreamEventError(fmt.Errorf("%w: marshal request: %w", ErrOllamaStreamFailed, err))

		return
	}

	req, err := http.NewRequestWithContext(
		ctx, http.MethodPost, m.baseURL+"/api/chat", bytes.NewReader(payload),
	)
	if err != nil {
		eventCh <- newStreamEventError(fmt.Errorf("%w: build request: %w", ErrOllamaStreamFailed, err))

		return
	}

	req.Header.Set("Content-Type", "application/json")

	resp, err := m.client.Do(req)
	if err != nil {
		eventCh <- newStreamEventError(fmt.Errorf("%w: %w", ErrOllamaStreamFailed, err))

		return
	}

	defer func() { _ = resp.Body.Close() }()

	if resp.StatusCode != http.StatusOK {
		eventCh <- newStreamEventError(fmt.Errorf(
			"%w: HTTP %d", ErrOllamaStreamFailed, resp.StatusCode,
		))

		return
	}

	ParseJsonlStream(resp.Body, eventCh, mapOllamaStreamEvent)
}

// buildChatBody constructs the Ollama /api/chat request body.
func (m *OllamaModel) buildChatBody(opts *GenerateTextOptions, stream bool) map[string]any {
	messages := buildOllamaMessages(opts.Messages, opts.System)

	body := map[string]any{
		"model":    m.config.Model,
		"messages": messages,
		"stream":   stream,
	}

	ollamaOptions := map[string]any{}

	if opts.Temperature != nil {
		ollamaOptions["temperature"] = *opts.Temperature
	}

	if opts.MaxTokens > 0 {
		ollamaOptions["num_predict"] = opts.MaxTokens
	}

	if opts.TopP != nil {
		ollamaOptions["top_p"] = *opts.TopP
	}

	if len(opts.StopWords) > 0 {
		ollamaOptions["stop"] = opts.StopWords
	}

	if len(ollamaOptions) > 0 {
		body["options"] = ollamaOptions
	}

	if opts.ResponseFormat != nil {
		switch opts.ResponseFormat.Type {
		case "json_schema":
			var schema any
			if len(opts.ResponseFormat.JSONSchema) > 0 {
				_ = json.Unmarshal(opts.ResponseFormat.JSONSchema, &schema)
			}

			body["format"] = schema
		case "json_object":
			body["format"] = "json"
		}
	}

	return body
}

// buildOllamaMessages converts unified messages to the Ollama chat format.
func buildOllamaMessages(messages []Message, system string) []map[string]any {
	result := make([]map[string]any, 0, len(messages)+1)

	if system != "" {
		result = append(result, map[string]any{"role": "system", "content": system})
	}

	for _, msg := range messages {
		if msg.Role == RoleSystem {
			var textParts []string

			for _, block := range msg.Content {
				if block.Type == ContentBlockText {
					textParts = append(textParts, block.Text)
				}
			}

			result = append(result, map[string]any{
				"role":    "system",
				"content": joinStrings(textParts, "\n"),
			})

			continue
		}

		var textParts []string

		var images []string

		for _, block := range msg.Content {
			switch block.Type { //nolint:exhaustive
			case ContentBlockText:
				textParts = append(textParts, block.Text)
			case ContentBlockImage:
				if block.Image != nil {
					images = append(images, block.Image.URL)
				}
			}
		}

		role := string(msg.Role)
		if msg.Role == RoleTool {
			role = "user"
		}

		entry := map[string]any{
			"role":    role,
			"content": joinStrings(textParts, "\n"),
		}

		if len(images) > 0 {
			entry["images"] = images
		}

		result = append(result, entry)
	}

	return result
}

// ollamaChatResponse represents a non-streaming response from /api/chat.
type ollamaChatResponse struct {
	Message         *ollamaMessage `json:"message"`
	DoneReason      string         `json:"done_reason"`
	PromptEvalCount int            `json:"prompt_eval_count"`
	EvalCount       int            `json:"eval_count"`
}

// ollamaMessage is the message object in an Ollama response.
type ollamaMessage struct {
	Role    string `json:"role"`
	Content string `json:"content"`
}

// mapOllamaChatResponse maps an Ollama response to the unified GenerateTextResult.
func mapOllamaChatResponse(resp *ollamaChatResponse, modelID string) *GenerateTextResult {
	result := &GenerateTextResult{ //nolint:exhaustruct
		StopReason: StopReasonEndTurn,
		ModelID:    modelID,
		Usage: Usage{
			InputTokens:  resp.PromptEvalCount,
			OutputTokens: resp.EvalCount,
			TotalTokens:  resp.PromptEvalCount + resp.EvalCount,
		},
	}

	if resp.DoneReason == "length" {
		result.StopReason = StopReasonMaxTokens
	}

	if resp.Message != nil && resp.Message.Content != "" {
		result.Content = []ContentBlock{{ //nolint:exhaustruct
			Type: ContentBlockText,
			Text: resp.Message.Content,
		}}
	}

	return result
}

// mapOllamaStreamEvent maps a JSONL line from the streaming response to a StreamEvent.
func mapOllamaStreamEvent(raw json.RawMessage) *StreamEvent {
	var obj map[string]json.RawMessage
	if err := json.Unmarshal(raw, &obj); err != nil {
		return nil
	}

	// Check done flag.
	var done bool
	if doneRaw, ok := obj["done"]; ok {
		_ = json.Unmarshal(doneRaw, &done)
	}

	if done {
		var doneReason string
		if dr, ok := obj["done_reason"]; ok {
			_ = json.Unmarshal(dr, &doneReason)
		}

		stopReason := StopReasonEndTurn
		if doneReason == "length" {
			stopReason = StopReasonMaxTokens
		}

		usage := &Usage{}

		if pc, ok := obj["prompt_eval_count"]; ok {
			_ = json.Unmarshal(pc, &usage.InputTokens)
		}

		if ec, ok := obj["eval_count"]; ok {
			_ = json.Unmarshal(ec, &usage.OutputTokens)
		}

		usage.TotalTokens = usage.InputTokens + usage.OutputTokens

		event := newStreamEventDone(stopReason, usage)

		return &event
	}

	// Content delta from message.content.
	if msgRaw, ok := obj["message"]; ok {
		var msg ollamaMessage
		if err := json.Unmarshal(msgRaw, &msg); err == nil && msg.Content != "" {
			event := newStreamEventContentDelta(msg.Content)

			return &event
		}
	}

	// Legacy /api/generate format.
	if respRaw, ok := obj["response"]; ok {
		var text string
		if err := json.Unmarshal(respRaw, &text); err == nil && text != "" {
			event := newStreamEventContentDelta(text)

			return &event
		}
	}

	return nil
}

// joinStrings joins a slice of strings with sep, returning empty string if slice is empty.
func joinStrings(parts []string, sep string) string {
	if len(parts) == 0 {
		return ""
	}

	result := parts[0]
	for _, p := range parts[1:] {
		result += sep + p
	}

	return result
}

// Compile-time interface assertions.
var (
	_ ProviderFactory = (*ollamaModelFactory)(nil)
	_ LanguageModel   = (*OllamaModel)(nil)
)
