package aifx

import (
	"bufio"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"strings"
)

// Sentinel errors for the Kiro adapter.
var (
	ErrKiroGenerationFailed = errors.New("kiro generation failed")
	ErrKiroStreamFailed     = errors.New("kiro stream failed")
)

const kiroProviderName = "kiro"

// kiroModelFactory creates Kiro language models.
type kiroModelFactory struct{}

// NewKiroModelFactory returns a ProviderFactory for the Kiro CLI.
func NewKiroModelFactory() ProviderFactory { //nolint:ireturn
	return &kiroModelFactory{}
}

func (f *kiroModelFactory) GetProvider() string {
	return kiroProviderName
}

func (f *kiroModelFactory) CreateModel(
	_ context.Context,
	config *ConfigTarget,
) (LanguageModel, error) { //nolint:ireturn
	if config.Model == "" {
		return nil, fmt.Errorf("%w: %w", ErrKiroGenerationFailed, ErrInvalidModel)
	}

	binaryPath, err := ResolveBinary("kiro", config)
	if err != nil {
		return nil, fmt.Errorf("%w: %w", ErrKiroGenerationFailed, err)
	}

	return &KiroModel{ //nolint:exhaustruct
		binaryPath: binaryPath,
		config:     config,
	}, nil
}

// KiroModel implements LanguageModel using the Kiro CLI.
type KiroModel struct {
	config     *ConfigTarget
	binaryPath string
}

func (m *KiroModel) GetCapabilities() []ProviderCapability {
	return []ProviderCapability{
		CapabilityTextGeneration,
		CapabilityStreaming,
	}
}

func (m *KiroModel) GetProvider() string { return kiroProviderName }
func (m *KiroModel) GetModelID() string  { return m.config.Model }
func (m *KiroModel) GetRawClient() any   { return nil }

func (m *KiroModel) Close(_ context.Context) error { return nil }

// GenerateText spawns the kiro CLI with --output json and pipes the prompt
// via stdin, returning the plain text output.
func (m *KiroModel) GenerateText(
	ctx context.Context,
	opts *GenerateTextOptions,
) (*GenerateTextResult, error) {
	args := m.buildArgs(opts)
	prompt := FormatMessagesAsText(opts.Messages, opts.System)

	proc, err := SpawnCliProcess(ctx, SpawnOptions{ //nolint:exhaustruct
		Binary:    m.binaryPath,
		Args:      args,
		StdinData: prompt,
	})
	if err != nil {
		return nil, fmt.Errorf("%w: %w", ErrKiroGenerationFailed, err)
	}

	stderrCh := make(chan string, 1)

	go func() {
		stderrCh <- proc.CaptureStderr()
	}()

	text, readErr := ReadTextOutput(proc.Stdout)
	exitCode, waitErr := proc.WaitForExit()
	stderr := <-stderrCh

	if waitErr != nil {
		return nil, fmt.Errorf("%w: wait: %w", ErrKiroGenerationFailed, waitErr)
	}

	if readErr != nil {
		return nil, fmt.Errorf("%w: read stdout: %w", ErrKiroGenerationFailed, readErr)
	}

	if exitErr := ClassifyExitCode(kiroProviderName, exitCode, stderr); exitErr != nil {
		return nil, fmt.Errorf("%w: %w", ErrKiroGenerationFailed, exitErr)
	}

	return &GenerateTextResult{ //nolint:exhaustruct
		Content:    []ContentBlock{{Type: ContentBlockText, Text: text}}, //nolint:exhaustruct
		StopReason: StopReasonEndTurn,
		ModelID:    m.config.Model,
	}, nil
}

// StreamText spawns the kiro CLI and streams output, attempting JSONL parsing
// with a fallback to plain text per line.
func (m *KiroModel) StreamText(
	ctx context.Context,
	opts *StreamTextOptions,
) (*StreamIterator, error) {
	args := m.buildArgs(opts)
	prompt := FormatMessagesAsText(opts.Messages, opts.System)

	proc, err := SpawnCliProcess(ctx, SpawnOptions{ //nolint:exhaustruct
		Binary:    m.binaryPath,
		Args:      args,
		StdinData: prompt,
	})
	if err != nil {
		return nil, fmt.Errorf("%w: %w", ErrKiroStreamFailed, err)
	}

	streamCtx, cancel := context.WithCancel(ctx)
	eventCh := make(chan StreamEvent, 64) //nolint:mnd

	go m.processStream(streamCtx, proc, eventCh, cancel)

	return NewStreamIterator(eventCh, cancel), nil
}

// processStream reads stdout line by line, attempting JSON parse on each line.
// Lines that fail JSON parse are emitted as plain text content deltas.
func (m *KiroModel) processStream(
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

	scanner := bufio.NewScanner(proc.Stdout)

	for scanner.Scan() {
		line := strings.TrimSpace(scanner.Text())
		if line == "" {
			continue
		}

		// Attempt JSON parsing for structured events.
		if json.Valid([]byte(line)) {
			event := mapKiroStreamEvent(json.RawMessage(line))
			if event != nil {
				eventCh <- *event

				continue
			}
		}

		// Fallback: emit as plain text delta.
		eventCh <- newStreamEventContentDelta(line + "\n")
	}

	// Flush any partial last line (no trailing newline).
	exitCode, waitErr := proc.WaitForExit()
	stderr := <-stderrCh

	if waitErr != nil {
		eventCh <- newStreamEventError(fmt.Errorf("%w: wait: %w", ErrKiroStreamFailed, waitErr))

		return
	}

	if exitErr := ClassifyExitCode(kiroProviderName, exitCode, stderr); exitErr != nil {
		eventCh <- newStreamEventError(fmt.Errorf("%w: %w", ErrKiroStreamFailed, exitErr))

		return
	}

	eventCh <- newStreamEventDone(StopReasonEndTurn, &Usage{}) //nolint:exhaustruct
}

// buildArgs constructs the kiro CLI argument list.
func (m *KiroModel) buildArgs(opts *GenerateTextOptions) []string {
	args := []string{"--output", "json", "--model", m.config.Model}

	if opts.MaxTokens > 0 {
		args = append(args, "--max-tokens", fmt.Sprintf("%d", opts.MaxTokens))
	}

	if extraArgs, ok := m.config.Properties["args"].([]string); ok {
		args = append(args, extraArgs...)
	}

	return args
}

// mapKiroStreamEvent maps a JSONL line from Kiro output to a StreamEvent.
func mapKiroStreamEvent(raw json.RawMessage) *StreamEvent {
	var obj map[string]json.RawMessage
	if err := json.Unmarshal(raw, &obj); err != nil {
		return nil
	}

	typeRaw, hasType := obj["type"]
	if !hasType {
		// Check for done flag.
		if doneRaw, ok := obj["done"]; ok {
			var done bool
			if err := json.Unmarshal(doneRaw, &done); err == nil && done {
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
	case "content", "text":
		// { type: "content", text: "..." } or { type: "text", text: "..." }
		var textField string

		if textRaw, ok := obj["text"]; ok {
			_ = json.Unmarshal(textRaw, &textField)
		}

		if textField == "" {
			if contentRaw, ok := obj["content"]; ok {
				_ = json.Unmarshal(contentRaw, &textField)
			}
		}

		if textField != "" {
			event := newStreamEventContentDelta(textField)

			return &event
		}

	case "done", "result":
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
		msg := "unknown Kiro error"

		if errRaw, ok := obj["error"]; ok {
			var errObj struct {
				Message string `json:"message"`
			}

			if err := json.Unmarshal(errRaw, &errObj); err == nil && errObj.Message != "" {
				msg = errObj.Message
			}
		} else if msgRaw, ok := obj["message"]; ok {
			_ = json.Unmarshal(msgRaw, &msg)
		}

		event := newStreamEventError(fmt.Errorf("%w: %s", ErrKiroStreamFailed, msg))

		return &event
	}

	return nil
}

// Compile-time interface assertions.
var (
	_ ProviderFactory = (*kiroModelFactory)(nil)
	_ LanguageModel   = (*KiroModel)(nil)
)
