package aifx

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
)

// Sentinel errors for the Claude Code adapter.
var (
	ErrClaudeCodeGenerationFailed = errors.New("claude-code generation failed")
	ErrClaudeCodeStreamFailed     = errors.New("claude-code stream failed")
)

const claudeCodeProviderName = "claude-code"

// claudeCodeModelFactory creates ClaudeCode language models.
type claudeCodeModelFactory struct{}

// NewClaudeCodeModelFactory returns a ProviderFactory for Claude Code CLI.
func NewClaudeCodeModelFactory() ProviderFactory { //nolint:ireturn
	return &claudeCodeModelFactory{}
}

func (f *claudeCodeModelFactory) GetProvider() string {
	return claudeCodeProviderName
}

func (f *claudeCodeModelFactory) CreateModel(
	_ context.Context,
	config *ConfigTarget,
) (LanguageModel, error) { //nolint:ireturn
	if config.Model == "" {
		return nil, fmt.Errorf("%w: %w", ErrClaudeCodeGenerationFailed, ErrInvalidModel)
	}

	binaryPath, err := ResolveBinary("claude", config)
	if err != nil {
		return nil, fmt.Errorf("%w: %w", ErrClaudeCodeGenerationFailed, err)
	}

	return &ClaudeCodeModel{ //nolint:exhaustruct
		binaryPath: binaryPath,
		config:     config,
	}, nil
}

// ClaudeCodeModel implements LanguageModel using the Claude Code CLI.
type ClaudeCodeModel struct {
	config     *ConfigTarget
	binaryPath string
}

func (m *ClaudeCodeModel) GetCapabilities() []ProviderCapability {
	return []ProviderCapability{
		CapabilityTextGeneration,
		CapabilityStreaming,
		CapabilityToolCalling,
	}
}

func (m *ClaudeCodeModel) GetProvider() string { return claudeCodeProviderName }
func (m *ClaudeCodeModel) GetModelID() string  { return m.config.Model }
func (m *ClaudeCodeModel) GetRawClient() any   { return nil }

func (m *ClaudeCodeModel) Close(_ context.Context) error { return nil }

// GenerateText spawns the claude CLI, pipes the prompt via stdin, and parses
// the JSON output. Uses --output-format json for structured results.
func (m *ClaudeCodeModel) GenerateText(
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
		return nil, fmt.Errorf("%w: %w", ErrClaudeCodeGenerationFailed, err)
	}

	stderrCh := make(chan string, 1)

	go func() {
		stderrCh <- proc.CaptureStderr()
	}()

	rawOutput, readErr := ReadTextOutput(proc.Stdout)
	exitCode, waitErr := proc.WaitForExit()
	stderr := <-stderrCh

	if waitErr != nil {
		return nil, fmt.Errorf("%w: wait: %w", ErrClaudeCodeGenerationFailed, waitErr)
	}

	if readErr != nil {
		return nil, fmt.Errorf("%w: read stdout: %w", ErrClaudeCodeGenerationFailed, readErr)
	}

	if exitErr := ClassifyExitCode(claudeCodeProviderName, exitCode, stderr); exitErr != nil {
		return nil, fmt.Errorf("%w: %w", ErrClaudeCodeGenerationFailed, exitErr)
	}

	return parseClaudeCodeJsonResult(rawOutput, m.config.Model)
}

// StreamText spawns the claude CLI with --output-format stream-json --verbose
// and emits JSONL events as a StreamIterator.
func (m *ClaudeCodeModel) StreamText(
	ctx context.Context,
	opts *StreamTextOptions,
) (*StreamIterator, error) {
	// Configurable via properties.streamFormat: "text" (default) or "stream-json"
	streamFormat := "text"
	if sf, ok := m.config.Properties["streamFormat"].(string); ok && sf != "" {
		streamFormat = sf
	}

	args := m.buildArgs(opts, streamFormat)
	prompt := FormatMessagesAsText(opts.Messages, opts.System)

	proc, err := SpawnCliProcess(ctx, SpawnOptions{ //nolint:exhaustruct
		Binary:    m.binaryPath,
		Args:      args,
		StdinData: prompt,
	})
	if err != nil {
		return nil, fmt.Errorf("%w: %w", ErrClaudeCodeStreamFailed, err)
	}

	streamCtx, cancel := context.WithCancel(ctx)
	eventCh := make(chan StreamEvent, 64) //nolint:mnd

	go m.processStream(streamCtx, proc, streamFormat, eventCh, cancel)

	return NewStreamIterator(eventCh, cancel), nil
}

// processStream reads from the subprocess stdout and sends events to eventCh.
func (m *ClaudeCodeModel) processStream(
	_ context.Context,
	proc *CliProcess,
	streamFormat string,
	eventCh chan<- StreamEvent,
	cancel context.CancelFunc,
) {
	defer close(eventCh)
	defer cancel()

	stderrCh := make(chan string, 1)

	go func() {
		stderrCh <- proc.CaptureStderr()
	}()

	if streamFormat == "stream-json" {
		ParseJsonlStream(proc.Stdout, eventCh, mapClaudeCodeStreamEvent)
	} else {
		// Raw text streaming: each read chunk becomes a content delta.
		buf := make([]byte, 4096) //nolint:mnd

		for {
			n, readErr := proc.Stdout.Read(buf)
			if n > 0 {
				eventCh <- newStreamEventContentDelta(string(buf[:n]))
			}

			if readErr != nil {
				break
			}
		}
	}

	exitCode, waitErr := proc.WaitForExit()
	stderr := <-stderrCh

	if waitErr != nil {
		eventCh <- newStreamEventError(fmt.Errorf("%w: wait: %w", ErrClaudeCodeStreamFailed, waitErr))

		return
	}

	if exitErr := ClassifyExitCode(claudeCodeProviderName, exitCode, stderr); exitErr != nil {
		eventCh <- newStreamEventError(fmt.Errorf("%w: %w", ErrClaudeCodeStreamFailed, exitErr))

		return
	}

	if streamFormat != "stream-json" {
		// For raw text streaming, emit the done event here.
		eventCh <- newStreamEventDone(StopReasonEndTurn, &Usage{})
	}
}

// buildArgs constructs the claude CLI argument list.
func (m *ClaudeCodeModel) buildArgs(opts *GenerateTextOptions, outputFormat string) []string {
	var args []string

	// "text" format streams raw text — no --output-format flag needed (it's the default).
	if outputFormat != "text" {
		args = append(args, "--output-format", outputFormat)
	}

	// stream-json requires --verbose in Claude Code CLI.
	if outputFormat == "stream-json" {
		args = append(args, "--verbose")
	}

	args = append(args, "--model", m.config.Model)

	if maxTurns, ok := m.config.Properties["maxTurns"].(int); ok && maxTurns > 0 {
		args = append(args, "--max-turns", fmt.Sprintf("%d", maxTurns))
	}

	if allowedTools, ok := m.config.Properties["allowedTools"].([]string); ok {
		for _, tool := range allowedTools {
			args = append(args, "--allowedTools", tool)
		}
	}

	if extraArgs, ok := m.config.Properties["args"].([]string); ok {
		args = append(args, extraArgs...)
	}

	_ = opts // reserved for future use (e.g. --max-tokens when CLI supports it)

	return args
}

// parseClaudeCodeJsonResult parses the claude CLI JSON output into a GenerateTextResult.
func parseClaudeCodeJsonResult(rawOutput, modelID string) (*GenerateTextResult, error) {
	var parsed map[string]json.RawMessage
	if err := json.Unmarshal([]byte(rawOutput), &parsed); err != nil {
		// Treat as plain text on parse failure.
		return &GenerateTextResult{ //nolint:exhaustruct
			Content:    []ContentBlock{{Type: ContentBlockText, Text: rawOutput}}, //nolint:exhaustruct
			StopReason: StopReasonEndTurn,
			ModelID:    modelID,
		}, nil
	}

	return mapClaudeCodeJsonResult(parsed, modelID), nil
}

// mapClaudeCodeJsonResult maps the parsed Claude Code JSON output.
// Handles both { result: "text" } and { message: { content: [...] } } formats.
func mapClaudeCodeJsonResult(parsed map[string]json.RawMessage, modelID string) *GenerateTextResult {
	var content []ContentBlock
	stopReason := StopReasonEndTurn
	usage := Usage{} //nolint:exhaustruct

	// Parse { result: "text" } format.
	if resultRaw, ok := parsed["result"]; ok {
		var text string
		if err := json.Unmarshal(resultRaw, &text); err == nil {
			content = append(content, ContentBlock{Type: ContentBlockText, Text: text}) //nolint:exhaustruct
		}
	}

	// Parse { message: { content: [...] } } format.
	if msgRaw, ok := parsed["message"]; ok {
		var msg struct {
			Content []struct {
				Type  string          `json:"type"`
				Text  string          `json:"text"`
				ID    string          `json:"id"`
				Name  string          `json:"name"`
				Input json.RawMessage `json:"input"`
			} `json:"content"`
		}

		if err := json.Unmarshal(msgRaw, &msg); err == nil {
			for _, block := range msg.Content {
				switch block.Type {
				case "text":
					content = append(content, ContentBlock{Type: ContentBlockText, Text: block.Text}) //nolint:exhaustruct
				case "tool_use":
					toolID := block.ID
					if toolID == "" {
						toolID = block.Name
					}

					content = append(content, ContentBlock{ //nolint:exhaustruct
						Type: ContentBlockToolCall,
						ToolCall: &ToolCall{
							ID:        toolID,
							Name:      block.Name,
							Arguments: block.Input,
						},
					})
				}
			}
		}
	}

	// Parse stop reason.
	if srRaw, ok := parsed["stop_reason"]; ok {
		var sr string
		if err := json.Unmarshal(srRaw, &sr); err == nil && sr == "tool_use" {
			stopReason = StopReasonToolUse
		}
	}

	// Parse usage.
	if usageRaw, ok := parsed["usage"]; ok {
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

	if len(content) == 0 {
		// Fallback: serialize entire parsed object as text.
		raw, _ := json.Marshal(parsed)
		content = []ContentBlock{{Type: ContentBlockText, Text: string(raw)}} //nolint:exhaustruct
	}

	return &GenerateTextResult{ //nolint:exhaustruct
		Content:    content,
		StopReason: stopReason,
		Usage:      usage,
		ModelID:    modelID,
	}
}

// mapClaudeCodeStreamEvent maps a JSONL line to a StreamEvent for stream-json format.
func mapClaudeCodeStreamEvent(raw json.RawMessage) *StreamEvent {
	var obj map[string]json.RawMessage
	if err := json.Unmarshal(raw, &obj); err != nil {
		return nil
	}

	typeRaw, hasType := obj["type"]
	if !hasType {
		return nil
	}

	var eventType string
	if err := json.Unmarshal(typeRaw, &eventType); err != nil {
		return nil
	}

	switch eventType {
	case "assistant":
		// { type: "assistant", message: { content: [...] } }
		if msgRaw, ok := obj["message"]; ok {
			var msg struct {
				Content []struct {
					Type string `json:"type"`
					Text string `json:"text"`
				} `json:"content"`
			}

			if err := json.Unmarshal(msgRaw, &msg); err == nil {
				for _, block := range msg.Content {
					if block.Type == "text" && block.Text != "" {
						event := newStreamEventContentDelta(block.Text)

						return &event
					}
				}
			}
		}

	case "content_block_delta":
		// { type: "content_block_delta", delta: { type: "text_delta", text: "..." } }
		if deltaRaw, ok := obj["delta"]; ok {
			var delta struct {
				Type string `json:"type"`
				Text string `json:"text"`
			}

			if err := json.Unmarshal(deltaRaw, &delta); err == nil && delta.Type == "text_delta" {
				event := newStreamEventContentDelta(delta.Text)

				return &event
			}
		}

	case "result":
		// { type: "result", subtype: "...", usage: {...} }
		stopReason := StopReasonEndTurn

		if subtypeRaw, ok := obj["subtype"]; ok {
			var subtype string
			if err := json.Unmarshal(subtypeRaw, &subtype); err == nil && subtype == "tool_use" {
				stopReason = StopReasonToolUse
			}
		}

		usage := parseClaudeCodeUsage(obj)
		event := newStreamEventDone(stopReason, usage)

		return &event

	case "error":
		msg := extractErrorMessage(obj)
		event := newStreamEventError(fmt.Errorf("%w: %s", ErrClaudeCodeStreamFailed, msg))

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

// parseClaudeCodeUsage extracts usage from a Claude Code JSON event.
func parseClaudeCodeUsage(obj map[string]json.RawMessage) *Usage {
	usage := &Usage{} //nolint:exhaustruct

	usageRaw, ok := obj["usage"]
	if !ok {
		return usage
	}

	var u struct {
		InputTokens  int `json:"input_tokens"`
		OutputTokens int `json:"output_tokens"`
	}

	if err := json.Unmarshal(usageRaw, &u); err == nil {
		usage.InputTokens = u.InputTokens
		usage.OutputTokens = u.OutputTokens
		usage.TotalTokens = u.InputTokens + u.OutputTokens
	}

	return usage
}

// extractErrorMessage gets the error message from a Claude Code error event.
func extractErrorMessage(obj map[string]json.RawMessage) string {
	errRaw, ok := obj["error"]
	if !ok {
		return "unknown Claude Code error"
	}

	var errObj struct {
		Message string `json:"message"`
	}

	if err := json.Unmarshal(errRaw, &errObj); err == nil && errObj.Message != "" {
		return errObj.Message
	}

	return "unknown Claude Code error"
}

// Compile-time interface assertions.
var (
	_ ProviderFactory = (*claudeCodeModelFactory)(nil)
	_ LanguageModel   = (*ClaudeCodeModel)(nil)
)
