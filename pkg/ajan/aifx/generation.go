package aifx

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"strings"
	"sync"
)

// ToolChoice controls how the model selects tools.
type ToolChoice string

const (
	ToolChoiceAuto     ToolChoice = "auto"
	ToolChoiceNone     ToolChoice = "none"
	ToolChoiceRequired ToolChoice = "required"
)

// Effort sets how much the model thinks and how many tokens it spends on a
// reply. Lower effort answers faster and cheaper.
//
// The anthropic provider sends it as output_config.effort, the openai provider
// as reasoning_effort (a model that lacks a level rejects the request), and the
// claude-code provider as the CLI's --effort flag. The gemini and vertexai
// providers send it as thinkingConfig.thinkingLevel, unchecked against the
// levels the model takes: xhigh and max send HIGH, Gemini's highest level. The
// ollama, opencode and kiro providers ignore it.
type Effort string

const (
	// EffortDefault is the zero value: nothing is sent, so the provider's own
	// default applies. Anthropic's default differs per model.
	EffortDefault Effort = ""
	EffortLow     Effort = "low"
	EffortMedium  Effort = "medium"
	EffortHigh    Effort = "high"
	EffortXHigh   Effort = "xhigh"
	EffortMax     Effort = "max"
)

// ErrUnknownEffort reports an effort level outside the Effort constants.
var ErrUnknownEffort = errors.New("unknown effort level")

// checkEffort returns an error for a level outside the Effort constants. The
// level can come from outside Go (the FFI bridge sends a plain string), and a
// provider that received it would fail with a less specific message.
func checkEffort(effort Effort) error {
	switch effort {
	case EffortDefault, EffortLow, EffortMedium, EffortHigh, EffortXHigh, EffortMax:
		return nil
	default:
		return fmt.Errorf(
			"%w: %w %q; use low, medium, high, xhigh or max, or leave it empty for the provider default",
			ErrBadRequest,
			ErrUnknownEffort,
			effort,
		)
	}
}

// StopReason indicates why generation stopped.
type StopReason string

const (
	StopReasonEndTurn StopReason = "end_turn"
	// StopReasonMaxTokens covers every truncation: the output token limit and,
	// on anthropic, a full context window.
	StopReasonMaxTokens StopReason = "max_tokens"
	StopReasonToolUse   StopReason = "tool_use"
	// StopReasonStop is a stop sequence, or a provider reason that has no
	// closer match here.
	StopReasonStop StopReason = "stop"
	// StopReasonRefusal means the model declined the request or a provider's
	// content filter withheld the answer. The content, if any, explains the
	// refusal or was cut off by the filter; it is not an answer to the request.
	StopReasonRefusal StopReason = "refusal"
)

// ProviderCapability represents a capability supported by a provider.
type ProviderCapability string

const (
	CapabilityTextGeneration  ProviderCapability = "text_generation"
	CapabilityStreaming       ProviderCapability = "streaming"
	CapabilityToolCalling     ProviderCapability = "tool_calling"
	CapabilityVision          ProviderCapability = "vision"
	CapabilityAudio           ProviderCapability = "audio"
	CapabilityBatchProcessing ProviderCapability = "batch_processing"
	CapabilityStructuredOut   ProviderCapability = "structured_output"
	CapabilityReasoning       ProviderCapability = "reasoning"
)

// ResponseFormat enables structured outputs with JSON schemas.
//
// The anthropic provider sends a json_schema format as output_config.format,
// and the claude-code provider as the CLI's --json-schema flag. Claude has no
// JSON mode without a schema, so both ignore json_object and text. Every
// provider that sends the schema (anthropic, openai, gemini, vertexai, ollama
// and claude-code) reports a missing or non-object one before any request is
// sent; kiro and opencode ignore the format.
type ResponseFormat struct {
	Type       string // "json_schema", "json_object", "text"
	Name       string // schema name (for OpenAI structured output)
	JSONSchema []byte // JSON Schema definition
}

// ErrInvalidResponseSchema reports a json_schema response format whose schema
// is missing or is not a JSON object.
var ErrInvalidResponseSchema = errors.New("invalid response schema")

// decodeResponseSchema reads a json_schema response format's schema as a JSON
// object. A missing or non-object schema is reported before any request is
// sent, since a provider would reject it with a less specific message or, worse,
// answer without the schema.
func decodeResponseSchema(raw []byte) (map[string]any, error) {
	var schema map[string]any

	if len(raw) > 0 {
		err := json.Unmarshal(raw, &schema)
		if err != nil {
			return nil, fmt.Errorf(
				"%w: %w: read the json_schema response format's schema: %w; set JSONSchema to a JSON Schema object",
				ErrBadRequest,
				ErrInvalidResponseSchema,
				err,
			)
		}
	}

	// Both an empty JSONSchema and the JSON literal null leave the map nil.
	if schema == nil {
		return nil, fmt.Errorf(
			"%w: %w: the json_schema response format has no schema; set JSONSchema to a JSON Schema object",
			ErrBadRequest,
			ErrInvalidResponseSchema,
		)
	}

	return schema, nil
}

// decodeToolParameters reads a tool's Parameters as a JSON Schema object. Empty
// Parameters mean the tool takes no arguments and decode to nil. A schema that
// does not decode is reported before any request is sent, rather than sending
// the tool without one.
func decodeToolParameters(tool *ToolDefinition) (map[string]any, error) {
	if len(tool.Parameters) == 0 {
		return nil, nil
	}

	var schema map[string]any

	err := json.Unmarshal(tool.Parameters, &schema)
	if err != nil {
		return nil, fmt.Errorf(
			"%w: read the parameters of tool %q: %w; set Parameters to a JSON Schema object",
			ErrBadRequest,
			tool.Name,
			err,
		)
	}

	return schema, nil
}

// SafetySetting configures content safety thresholds (Google providers).
type SafetySetting struct {
	Category  string // e.g. "HARM_CATEGORY_HARASSMENT"
	Threshold string // e.g. "BLOCK_NONE", "BLOCK_LOW_AND_ABOVE"
}

// Usage contains token usage statistics for a generation.
type Usage struct {
	InputTokens    int
	OutputTokens   int
	TotalTokens    int
	ThinkingTokens int // reasoning model tokens (separate from output)
}

// GenerateTextOptions configures a text generation request.
type GenerateTextOptions struct {
	Messages       []Message
	Tools          []ToolDefinition
	System         string
	MaxTokens      int
	Temperature    *float64
	TopP           *float64
	StopWords      []string
	ToolChoice     ToolChoice      // "auto", "none", "required"
	ResponseFormat *ResponseFormat // structured output (JSON schema)
	ThinkingBudget *int            // reasoning/thinking token budget
	Effort         Effort          // thinking depth and token spend; overrides the level ThinkingBudget maps to
	SafetySettings []SafetySetting // Google providers: harm category thresholds
	Extensions     map[string]any  // provider-specific extra options
}

// StreamTextOptions configures a streaming text generation request.
// Same as GenerateTextOptions but used for StreamText to clarify intent.
type StreamTextOptions = GenerateTextOptions

// GenerateTextResult contains the result of a text generation request.
type GenerateTextResult struct {
	Content     []ContentBlock
	StopReason  StopReason
	Usage       Usage
	ModelID     string
	RawRequest  any // provider-specific raw request (for debugging)
	RawResponse any // provider-specific raw response (for debugging)
}

// Text returns concatenated text from all text content blocks.
func (r *GenerateTextResult) Text() string {
	var builder strings.Builder

	for _, block := range r.Content {
		if block.Type == ContentBlockText {
			builder.WriteString(block.Text)
		}
	}

	return builder.String()
}

// ToolCalls extracts all tool calls from the result.
func (r *GenerateTextResult) ToolCalls() []ToolCall {
	var calls []ToolCall

	for _, block := range r.Content {
		if block.Type == ContentBlockToolCall && block.ToolCall != nil {
			calls = append(calls, *block.ToolCall)
		}
	}

	return calls
}

// StreamEventType identifies the type of stream event.
type StreamEventType string

const (
	StreamEventContentDelta  StreamEventType = "content_delta"
	StreamEventToolCallDelta StreamEventType = "tool_call_delta"
	StreamEventMessageDone   StreamEventType = "message_done"
	StreamEventError         StreamEventType = "error"
	// StreamEventThinking carries one finished thinking block, so a streamed
	// answer can be replayed in the next request like a generated one.
	StreamEventThinking StreamEventType = "thinking"
)

// StreamEvent represents a single event in a streaming response.
type StreamEvent struct {
	Type       StreamEventType
	TextDelta  string
	ToolCall   *ToolCall
	Thinking   *ThinkingPart
	StopReason StopReason
	Usage      *Usage
	Error      error
}

// newStreamEventContentDelta creates a content delta stream event.
func newStreamEventContentDelta(textDelta string) StreamEvent {
	return StreamEvent{
		Type:       StreamEventContentDelta,
		TextDelta:  textDelta,
		ToolCall:   nil,
		Thinking:   nil,
		StopReason: "",
		Usage:      nil,
		Error:      nil,
	}
}

// newStreamEventToolCallTextDelta creates a tool call text delta stream event.
func newStreamEventToolCallTextDelta(textDelta string) StreamEvent {
	return StreamEvent{
		Type:       StreamEventToolCallDelta,
		TextDelta:  textDelta,
		ToolCall:   nil,
		Thinking:   nil,
		StopReason: "",
		Usage:      nil,
		Error:      nil,
	}
}

// newStreamEventToolCall creates a tool call stream event with a completed tool call.
func newStreamEventToolCall(toolCall *ToolCall) StreamEvent {
	return StreamEvent{
		Type:       StreamEventToolCallDelta,
		TextDelta:  "",
		ToolCall:   toolCall,
		Thinking:   nil,
		StopReason: "",
		Usage:      nil,
		Error:      nil,
	}
}

// newStreamEventDone creates a message-done stream event.
func newStreamEventDone(stopReason StopReason, usage *Usage) StreamEvent {
	return StreamEvent{
		Type:       StreamEventMessageDone,
		TextDelta:  "",
		ToolCall:   nil,
		Thinking:   nil,
		StopReason: stopReason,
		Usage:      usage,
		Error:      nil,
	}
}

// newStreamEventThinking creates a stream event carrying one finished thinking block.
func newStreamEventThinking(part *ThinkingPart) StreamEvent {
	return StreamEvent{
		Type:       StreamEventThinking,
		TextDelta:  "",
		ToolCall:   nil,
		Thinking:   part,
		StopReason: "",
		Usage:      nil,
		Error:      nil,
	}
}

// newStreamEventError creates an error stream event.
func newStreamEventError(err error) StreamEvent {
	return StreamEvent{
		Type:       StreamEventError,
		TextDelta:  "",
		ToolCall:   nil,
		Thinking:   nil,
		StopReason: "",
		Usage:      nil,
		Error:      err,
	}
}

// StreamIterator provides a pull-based API for consuming stream events.
// Follows the Go iterator pattern (similar to sql.Rows).
type StreamIterator struct {
	eventCh <-chan StreamEvent
	cancel  context.CancelFunc
	current StreamEvent
	err     error
	done    bool
	mu      sync.Mutex
}

// NewStreamIterator creates a new stream iterator from an event channel.
func NewStreamIterator(eventCh <-chan StreamEvent, cancel context.CancelFunc) *StreamIterator {
	return &StreamIterator{ //nolint:exhaustruct
		eventCh: eventCh,
		cancel:  cancel,
	}
}

// Next advances the iterator to the next event.
// Returns true if there is a new event, false when the stream is done or errored.
func (iter *StreamIterator) Next() bool {
	iter.mu.Lock()

	if iter.done {
		iter.mu.Unlock()

		return false
	}

	eventCh := iter.eventCh
	iter.mu.Unlock()

	// The receive happens with the mutex released. Holding it across a blocking
	// receive meant Close -- which takes the same mutex -- could not run, so the
	// documented remedy for a stalled Next deadlocked against Next itself.
	event, ok := <-eventCh

	iter.mu.Lock()
	defer iter.mu.Unlock()

	if !ok {
		iter.done = true

		return false
	}

	// Close may have run while the receive was in flight. Honour it rather than
	// publishing an event the caller has already said it does not want.
	if iter.done {
		return false
	}

	iter.current = event

	if event.Type == StreamEventError {
		iter.err = event.Error
		iter.done = true

		return false
	}

	if event.Type == StreamEventMessageDone {
		iter.done = true
	}

	return true
}

// Current returns the most recently read stream event.
func (iter *StreamIterator) Current() StreamEvent {
	iter.mu.Lock()
	defer iter.mu.Unlock()

	return iter.current
}

// Err returns the first error encountered during streaming.
func (iter *StreamIterator) Err() error {
	iter.mu.Lock()
	defer iter.mu.Unlock()

	return iter.err
}

// Close cancels the stream and releases resources.
func (iter *StreamIterator) Close() error {
	iter.mu.Lock()
	defer iter.mu.Unlock()

	if iter.cancel != nil {
		iter.cancel()
	}

	iter.done = true

	return nil
}

// Collect drains the entire stream and returns a combined result.
func (iter *StreamIterator) Collect() (*GenerateTextResult, error) {
	var textBuilder strings.Builder

	var (
		thinking   []ContentBlock
		toolCalls  []ContentBlock
		stopReason StopReason
		usage      Usage
	)

	for iter.Next() {
		event := iter.Current()

		switch event.Type {
		case StreamEventContentDelta:
			textBuilder.WriteString(event.TextDelta)
		case StreamEventToolCallDelta:
			if event.ToolCall != nil {
				toolCalls = append(toolCalls, newToolCallContentBlock(event.ToolCall))
			}
		case StreamEventThinking:
			if event.Thinking != nil {
				thinking = append(thinking, NewThinkingBlock(*event.Thinking))
			}
		case StreamEventMessageDone:
			stopReason = event.StopReason

			if event.Usage != nil {
				usage = *event.Usage
			}
		case StreamEventError:
			// handled by iter.Err()
		}
	}

	err := iter.Err()
	if err != nil {
		return nil, err
	}

	return buildCollectedResult(thinking, textBuilder, toolCalls, stopReason, usage), nil
}

func newToolCallContentBlock(toolCall *ToolCall) ContentBlock {
	return ContentBlock{
		Type:       ContentBlockToolCall,
		Text:       "",
		Image:      nil,
		Audio:      nil,
		File:       nil,
		ToolCall:   toolCall,
		ToolResult: nil,
		Thinking:   nil,
	}
}

// buildCollectedResult orders the blocks the way the provider sent them:
// thinking first, then the text, then the tool calls. Anthropic rejects a
// replayed assistant turn whose tool calls are not preceded by its thinking.
func buildCollectedResult(
	thinking []ContentBlock,
	textBuilder strings.Builder,
	toolCalls []ContentBlock,
	stopReason StopReason,
	usage Usage,
) *GenerateTextResult {
	content := make([]ContentBlock, 0, len(thinking)+1+len(toolCalls))
	content = append(content, thinking...)

	if textBuilder.Len() > 0 {
		content = append(content, ContentBlock{
			Type:       ContentBlockText,
			Text:       textBuilder.String(),
			Image:      nil,
			Audio:      nil,
			File:       nil,
			ToolCall:   nil,
			ToolResult: nil,
			Thinking:   nil,
		})
	}

	content = append(content, toolCalls...)

	return &GenerateTextResult{
		Content:     content,
		StopReason:  stopReason,
		Usage:       usage,
		ModelID:     "",
		RawRequest:  nil,
		RawResponse: nil,
	}
}
