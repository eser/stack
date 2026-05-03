package aifx

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
)

// Sentinel errors for the OpenCode adapter.
var (
	ErrOpenCodeGenerationFailed = errors.New("opencode generation failed")
	ErrOpenCodeStreamFailed     = errors.New("opencode stream failed")
)

const openCodeProviderName = "opencode"

// openCodeModelFactory creates OpenCode language models.
type openCodeModelFactory struct{}

// NewOpenCodeModelFactory returns a ProviderFactory for the OpenCode CLI.
func NewOpenCodeModelFactory() ProviderFactory { //nolint:ireturn
	return &openCodeModelFactory{}
}

func (f *openCodeModelFactory) GetProvider() string {
	return openCodeProviderName
}

func (f *openCodeModelFactory) CreateModel(
	_ context.Context,
	config *ConfigTarget,
) (LanguageModel, error) { //nolint:ireturn
	if config.Model == "" {
		return nil, fmt.Errorf("%w: %w", ErrOpenCodeGenerationFailed, ErrInvalidModel)
	}

	binaryPath, err := ResolveBinary("opencode", config)
	if err != nil {
		return nil, fmt.Errorf("%w: %w", ErrOpenCodeGenerationFailed, err)
	}

	return &OpenCodeModel{ //nolint:exhaustruct
		binaryPath: binaryPath,
		config:     config,
	}, nil
}

// OpenCodeModel implements LanguageModel using the OpenCode CLI.
type OpenCodeModel struct {
	config     *ConfigTarget
	binaryPath string
}

func (m *OpenCodeModel) GetCapabilities() []ProviderCapability {
	return []ProviderCapability{
		CapabilityTextGeneration,
		CapabilityStreaming,
	}
}

func (m *OpenCodeModel) GetProvider() string { return openCodeProviderName }
func (m *OpenCodeModel) GetModelID() string  { return m.config.Model }
func (m *OpenCodeModel) GetRawClient() any   { return nil }

func (m *OpenCodeModel) Close(_ context.Context) error { return nil }

// GenerateText spawns the opencode CLI with --output-format json and pipes
// the prompt via stdin.
func (m *OpenCodeModel) GenerateText(
	ctx context.Context,
	opts *GenerateTextOptions,
) (*GenerateTextResult, error) {
	args := m.buildArgs(opts, "json")
	prompt := FormatMessagesAsText(opts.Messages, opts.System)

	proc, err := SpawnCliProcess(ctx, SpawnOptions{ //nolint:exhaustruct
		Binary:    m.binaryPath,
		Args:      args,
		StdinData: prompt,
	})
	if err != nil {
		return nil, fmt.Errorf("%w: %w", ErrOpenCodeGenerationFailed, err)
	}

	stderrCh := make(chan string, 1)

	go func() {
		stderrCh <- proc.CaptureStderr()
	}()

	text, readErr := ReadTextOutput(proc.Stdout)
	exitCode, waitErr := proc.WaitForExit()
	stderr := <-stderrCh

	if waitErr != nil {
		return nil, fmt.Errorf("%w: wait: %w", ErrOpenCodeGenerationFailed, waitErr)
	}

	if readErr != nil {
		return nil, fmt.Errorf("%w: read stdout: %w", ErrOpenCodeGenerationFailed, readErr)
	}

	if exitErr := ClassifyExitCode(openCodeProviderName, exitCode, stderr); exitErr != nil {
		return nil, fmt.Errorf("%w: %w", ErrOpenCodeGenerationFailed, exitErr)
	}

	return &GenerateTextResult{ //nolint:exhaustruct
		Content:    []ContentBlock{{Type: ContentBlockText, Text: text}}, //nolint:exhaustruct
		StopReason: StopReasonEndTurn,
		ModelID:    m.config.Model,
	}, nil
}

// StreamText spawns the opencode CLI with --output-format stream-json and
// emits JSONL events as a StreamIterator.
func (m *OpenCodeModel) StreamText(
	ctx context.Context,
	opts *StreamTextOptions,
) (*StreamIterator, error) {
	args := m.buildArgs(opts, "stream-json")
	prompt := FormatMessagesAsText(opts.Messages, opts.System)

	proc, err := SpawnCliProcess(ctx, SpawnOptions{ //nolint:exhaustruct
		Binary:    m.binaryPath,
		Args:      args,
		StdinData: prompt,
	})
	if err != nil {
		return nil, fmt.Errorf("%w: %w", ErrOpenCodeStreamFailed, err)
	}

	streamCtx, cancel := context.WithCancel(ctx)
	eventCh := make(chan StreamEvent, 64) //nolint:mnd

	go m.processStream(streamCtx, proc, eventCh, cancel)

	return NewStreamIterator(eventCh, cancel), nil
}

// processStream reads the JSONL stream from the subprocess stdout.
func (m *OpenCodeModel) processStream(
	_ context.Context,
	proc *CliProcess,
	eventCh chan<- StreamEvent,
	cancel context.CancelFunc,
) {
	defer close(eventCh)
	defer cancel()

	stderrCh := make(chan string, 1)

	go func() {
		stderrCh <- proc.CaptureStderr()
	}()

	ParseJsonlStream(proc.Stdout, eventCh, mapOpenCodeStreamEvent)

	exitCode, waitErr := proc.WaitForExit()
	stderr := <-stderrCh

	if waitErr != nil {
		eventCh <- newStreamEventError(fmt.Errorf("%w: wait: %w", ErrOpenCodeStreamFailed, waitErr))

		return
	}

	if exitErr := ClassifyExitCode(openCodeProviderName, exitCode, stderr); exitErr != nil {
		eventCh <- newStreamEventError(fmt.Errorf("%w: %w", ErrOpenCodeStreamFailed, exitErr))
	}
}

// buildArgs constructs the opencode CLI argument list.
func (m *OpenCodeModel) buildArgs(opts *GenerateTextOptions, outputFormat string) []string {
	args := []string{"--output-format", outputFormat, "--model", m.config.Model}

	if opts.MaxTokens > 0 {
		args = append(args, "--max-tokens", fmt.Sprintf("%d", opts.MaxTokens))
	}

	if extraArgs, ok := m.config.Properties["args"].([]string); ok {
		args = append(args, extraArgs...)
	}

	return args
}

// mapOpenCodeStreamEvent maps a JSONL line to a StreamEvent.
func mapOpenCodeStreamEvent(raw json.RawMessage) *StreamEvent {
	var obj map[string]json.RawMessage
	if err := json.Unmarshal(raw, &obj); err != nil {
		return nil
	}

	typeRaw, hasType := obj["type"]
	if !hasType {
		// Check for done flag (Ollama-style fallback).
		var doneFlag bool
		if doneRaw, ok := obj["done"]; ok {
			if err := json.Unmarshal(doneRaw, &doneFlag); err == nil && doneFlag {
				event := newStreamEventDone(StopReasonEndTurn, &Usage{}) //nolint:exhaustruct
				return &event
			}
		}

		return nil
	}

	var eventType string
	if err := json.Unmarshal(typeRaw, &eventType); err != nil {
		return nil
	}

	switch eventType {
	case "content_block_delta", "assistant":
		// content_block_delta: { delta: { text: "..." } }
		// assistant:           { message: { content: [{ text: "..." }] } }
		text := extractOpenCodeText(obj)
		if text != "" {
			event := newStreamEventContentDelta(text)

			return &event
		}

	case "result":
		usage := &Usage{} //nolint:exhaustruct

		if usageRaw, ok := obj["usage"]; ok {
			var u struct {
				InputTokens  int `json:"input_tokens"`
				OutputTokens int `json:"output_tokens"`
			}

			if err := json.Unmarshal(usageRaw, &u); err == nil {
				usage.InputTokens = u.InputTokens
				usage.OutputTokens = u.OutputTokens
				usage.TotalTokens = u.InputTokens + u.OutputTokens
			}
		}

		event := newStreamEventDone(StopReasonEndTurn, usage)

		return &event

	case "error":
		var errObj struct {
			Error struct {
				Message string `json:"message"`
			} `json:"error"`
		}

		msg := "unknown OpenCode error"
		if err := json.Unmarshal(raw, &errObj); err == nil && errObj.Error.Message != "" {
			msg = errObj.Error.Message
		}

		event := newStreamEventError(fmt.Errorf("%w: %s", ErrOpenCodeStreamFailed, msg))

		return &event
	}

	// Generic content field fallback.
	if contentRaw, ok := obj["content"]; ok {
		var text string
		if err := json.Unmarshal(contentRaw, &text); err == nil && text != "" {
			event := newStreamEventContentDelta(text)

			return &event
		}
	}

	return nil
}

// extractOpenCodeText extracts text from content_block_delta or assistant event objects.
func extractOpenCodeText(obj map[string]json.RawMessage) string {
	// content_block_delta: { delta: { text: "..." } }
	if deltaRaw, ok := obj["delta"]; ok {
		var delta struct {
			Text string `json:"text"`
		}

		if err := json.Unmarshal(deltaRaw, &delta); err == nil {
			return delta.Text
		}
	}

	// assistant: { message: { content: [{ text: "..." }] } }
	if msgRaw, ok := obj["message"]; ok {
		var msg struct {
			Content []struct {
				Text string `json:"text"`
			} `json:"content"`
		}

		if err := json.Unmarshal(msgRaw, &msg); err == nil && len(msg.Content) > 0 {
			return msg.Content[0].Text
		}
	}

	return ""
}

// Compile-time interface assertions.
var (
	_ ProviderFactory = (*openCodeModelFactory)(nil)
	_ LanguageModel   = (*OpenCodeModel)(nil)
)
