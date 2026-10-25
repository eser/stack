package aifx

import (
	"bytes"
	"encoding/json"
	"fmt"
	"time"
)

// The Messages API wire format, limited to what aifx sends and reads. Field
// presence follows the request the vendor SDK built, which the fixtures in
// testdata/fixtures/anthropic pin.

// Anthropic stop reasons.
const (
	anthropicStopEndTurn                    = "end_turn"
	anthropicStopMaxTokens                  = "max_tokens"
	anthropicStopModelContextWindowExceeded = "model_context_window_exceeded"
	anthropicStopToolUse                    = "tool_use"
	anthropicStopSequence                   = "stop_sequence"
	anthropicStopRefusal                    = "refusal"
)

// Anthropic batch processing statuses.
const (
	anthropicBatchInProgress = "in_progress"
	anthropicBatchCanceling  = "canceling"
	anthropicBatchEnded      = "ended"
)

// Anthropic effort levels.
const (
	anthropicEffortLow    = "low"
	anthropicEffortMedium = "medium"
	anthropicEffortHigh   = "high"
)

// anthropicMessageRequest is the body of POST /v1/messages and the params of
// one batch request.
type anthropicMessageRequest struct {
	ToolChoice    *anthropicToolChoice     `json:"tool_choice,omitempty"`
	Thinking      *anthropicThinkingConfig `json:"thinking,omitempty"`
	OutputConfig  *anthropicOutputConfig   `json:"output_config,omitempty"`
	Model         string                   `json:"model"`
	Messages      []anthropicMessageParam  `json:"messages"`
	System        []anthropicTextBlock     `json:"system,omitempty"`
	StopSequences []string                 `json:"stop_sequences,omitempty"`
	Tools         []anthropicTool          `json:"tools,omitempty"`
	MaxTokens     int64                    `json:"max_tokens"`
	Stream        bool                     `json:"stream,omitempty"`
}

// anthropicMessageParam is one message of the conversation. Content holds the
// block structs below.
type anthropicMessageParam struct {
	Role    string `json:"role"`
	Content []any  `json:"content"`
}

type anthropicTextBlock struct {
	Type string `json:"type"`
	Text string `json:"text"`
}

type anthropicImageBlock struct {
	Source any    `json:"source"`
	Type   string `json:"type"`
}

type anthropicURLImageSource struct {
	Type string `json:"type"`
	URL  string `json:"url"`
}

type anthropicBase64ImageSource struct {
	Type      string `json:"type"`
	MediaType string `json:"media_type"`
	Data      string `json:"data"`
}

type anthropicToolUseBlock struct {
	Type  string          `json:"type"`
	ID    string          `json:"id"`
	Name  string          `json:"name"`
	Input json.RawMessage `json:"input"`
}

type anthropicToolResultBlock struct {
	Type      string               `json:"type"`
	ToolUseID string               `json:"tool_use_id"`
	Content   []anthropicTextBlock `json:"content"`
	IsError   bool                 `json:"is_error"`
}

type anthropicThinkingBlockParam struct {
	Type      string `json:"type"`
	Signature string `json:"signature"`
	Thinking  string `json:"thinking"`
}

type anthropicRedactedThinkingBlockParam struct {
	Type string `json:"type"`
	Data string `json:"data"`
}

// anthropicTool is one tool definition. InputSchema is the whole schema
// document as the API reads it; a tool without parameters sends none.
type anthropicTool struct {
	InputSchema map[string]any `json:"input_schema,omitempty"`
	Name        string         `json:"name"`
	Description string         `json:"description"`
}

type anthropicToolChoice struct {
	Type string `json:"type"`
}

type anthropicThinkingConfig struct {
	Type string `json:"type"`
}

type anthropicOutputConfig struct {
	Format *anthropicOutputFormat `json:"format,omitempty"`
	Effort string                 `json:"effort,omitempty"`
}

type anthropicOutputFormat struct {
	Schema map[string]any `json:"schema"`
	Type   string         `json:"type"`
}

// anthropicMessage is a reply of the Messages API, and the message a stream
// accumulates.
type anthropicMessage struct {
	ID         string                  `json:"id"`
	Model      string                  `json:"model"`
	StopReason string                  `json:"stop_reason"`
	Content    []anthropicContentBlock `json:"content"`
	Usage      anthropicUsage          `json:"usage"`
}

type anthropicUsage struct {
	InputTokens  int64 `json:"input_tokens"`
	OutputTokens int64 `json:"output_tokens"`
}

// anthropicContentBlock is any content block of a reply; Type says which
// fields apply.
type anthropicContentBlock struct {
	Type      string          `json:"type"`
	Text      string          `json:"text"`
	ID        string          `json:"id"`
	Name      string          `json:"name"`
	Thinking  string          `json:"thinking"`
	Signature string          `json:"signature"`
	Data      string          `json:"data"`
	Input     json.RawMessage `json:"input"`
}

// anthropicStreamEvent is one event of a streamed reply.
type anthropicStreamEvent struct {
	Message      *anthropicMessage      `json:"message"`
	ContentBlock *anthropicContentBlock `json:"content_block"`
	Delta        *anthropicStreamDelta  `json:"delta"`
	Usage        *anthropicDeltaUsage   `json:"usage"`
	Type         string                 `json:"type"`
	Index        int64                  `json:"index"`
}

// anthropicStreamDelta is the delta of a content_block_delta event, or of a
// message_delta event (which uses StopReason only).
type anthropicStreamDelta struct {
	Type        string `json:"type"`
	Text        string `json:"text"`
	PartialJSON string `json:"partial_json"`
	Thinking    string `json:"thinking"`
	Signature   string `json:"signature"`
	StopReason  string `json:"stop_reason"`
}

// anthropicDeltaUsage is the usage of a message_delta event. Each count is a
// whole-message total; the input count is present only when it changed.
type anthropicDeltaUsage struct {
	InputTokens  *int64 `json:"input_tokens"`
	OutputTokens int64  `json:"output_tokens"`
}

// accumulate applies one stream event to the message, as the SDK's
// Message.Accumulate did: message_start replaces the message, blocks start in
// index order, deltas extend the block they name, and message_delta replaces
// the stop reason and the usage counts it carries.
func (acc *anthropicMessage) accumulate(event *anthropicStreamEvent) error {
	switch event.Type {
	case "message_start":
		if event.Message != nil {
			*acc = *event.Message
		}
	case "message_delta":
		if event.Delta != nil {
			acc.StopReason = event.Delta.StopReason
		}

		if event.Usage != nil {
			acc.Usage.OutputTokens = event.Usage.OutputTokens

			if event.Usage.InputTokens != nil {
				acc.Usage.InputTokens = *event.Usage.InputTokens
			}
		}
	case "content_block_start":
		if event.Index != int64(len(acc.Content)) {
			return fmt.Errorf(
				"%w: received event of type %s for content block at index %d, expected index %d",
				ErrProviderResponseDecode, event.Type, event.Index, len(acc.Content),
			)
		}

		block := anthropicContentBlock{} //nolint:exhaustruct
		if event.ContentBlock != nil {
			block = *event.ContentBlock
		}

		acc.Content = append(acc.Content, block)
	case "content_block_delta":
		err := acc.checkIndex(event)
		if err != nil {
			return err
		}

		acc.applyDelta(&acc.Content[event.Index], event.Delta)
	case "content_block_stop":
		err := acc.checkIndex(event)
		if err != nil {
			return err
		}

		// A tool call cut off mid-input is left with input that is not JSON;
		// the SDK reset it to an empty object.
		block := &acc.Content[event.Index]
		if len(block.Input) > 0 && !json.Valid(block.Input) {
			block.Input = json.RawMessage(`{}`)
		}
	}

	return nil
}

func (acc *anthropicMessage) checkIndex(event *anthropicStreamEvent) error {
	if event.Index < 0 || event.Index >= int64(len(acc.Content)) {
		return fmt.Errorf(
			"%w: received event of type %s for content block at index %d but there are only %d content blocks",
			ErrProviderResponseDecode, event.Type, event.Index, len(acc.Content),
		)
	}

	return nil
}

func (acc *anthropicMessage) applyDelta(block *anthropicContentBlock, delta *anthropicStreamDelta) {
	if delta == nil {
		return
	}

	switch delta.Type {
	case "text_delta":
		block.Text += delta.Text
	case "input_json_delta":
		if delta.PartialJSON == "" {
			return
		}

		if string(block.Input) == "{}" {
			block.Input = []byte(delta.PartialJSON)
		} else {
			block.Input = append(block.Input, delta.PartialJSON...)
		}
	case "thinking_delta":
		block.Thinking += delta.Thinking
	case "signature_delta":
		block.Signature += delta.Signature
	}
}

// compactToolInput is a tool call's input as JSON without insignificant
// whitespace, the form the SDK's json.Marshal of the raw input produced. An
// input that is not JSON reports ok false.
func compactToolInput(input json.RawMessage) ([]byte, bool) {
	if len(input) == 0 {
		return []byte("null"), true
	}

	var buf bytes.Buffer

	if err := json.Compact(&buf, input); err != nil {
		return nil, false
	}

	return buf.Bytes(), true
}

// anthropicBatchCreateRequest is the body of POST /v1/messages/batches.
type anthropicBatchCreateRequest struct {
	Requests []anthropicBatchItem `json:"requests"`
}

type anthropicBatchItem struct {
	CustomID string                   `json:"custom_id"`
	Params   *anthropicMessageRequest `json:"params"`
}

// anthropicBatch is a Message Batch object.
type anthropicBatch struct {
	CreatedAt        time.Time              `json:"created_at"`
	EndedAt          *time.Time             `json:"ended_at"`
	ID               string                 `json:"id"`
	ProcessingStatus string                 `json:"processing_status"`
	ResultsURL       string                 `json:"results_url"`
	RequestCounts    anthropicBatchCounters `json:"request_counts"`
}

type anthropicBatchCounters struct {
	Processing int64 `json:"processing"`
	Succeeded  int64 `json:"succeeded"`
	Errored    int64 `json:"errored"`
	Canceled   int64 `json:"canceled"`
	Expired    int64 `json:"expired"`
}

type anthropicBatchPage struct {
	Data []anthropicBatch `json:"data"`
}

// anthropicBatchResultLine is one line of a batch's results file.
type anthropicBatchResultLine struct {
	CustomID string `json:"custom_id"`
	Result   struct {
		Message *anthropicMessage `json:"message"`
		Type    string            `json:"type"`
	} `json:"result"`
}
