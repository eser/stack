package aifx

import (
	"encoding/json"
)

// The Chat Completions and Batch API wire format, limited to what aifx sends
// and reads. Field presence follows the request the vendor SDK built, which
// the fixtures in testdata/fixtures/openai pin.

// OpenAI reasoning effort levels.
const (
	openAIReasoningLow    = "low"
	openAIReasoningMedium = "medium"
	openAIReasoningHigh   = "high"
)

// openAIChatRequest is the body of POST /chat/completions and of one batch line.
type openAIChatRequest struct {
	ToolChoice          any                   `json:"tool_choice,omitempty"`
	ResponseFormat      *openAIResponseFormat `json:"response_format,omitempty"`
	MaxCompletionTokens *int64                `json:"max_completion_tokens,omitempty"`
	Temperature         *float64              `json:"temperature,omitempty"`
	TopP                *float64              `json:"top_p,omitempty"`
	Model               string                `json:"model"`
	ReasoningEffort     string                `json:"reasoning_effort,omitempty"`
	Messages            []any                 `json:"messages"`
	Stop                []string              `json:"stop,omitempty"`
	Tools               []openAITool          `json:"tools,omitempty"`
	Stream              bool                  `json:"stream,omitempty"`
}

// openAITextMessage is a developer, user or tool message whose content is a
// string or, for a multimodal user message, a list of parts.
type openAITextMessage struct {
	Content    any    `json:"content"`
	Role       string `json:"role"`
	ToolCallID string `json:"tool_call_id,omitempty"`
}

type openAIAssistantMessage struct {
	Content   *string              `json:"content,omitempty"`
	Role      string               `json:"role"`
	ToolCalls []openAIToolCallJSON `json:"tool_calls,omitempty"`
}

type openAIToolCallJSON struct {
	ID       string                 `json:"id"`
	Type     string                 `json:"type"`
	Function openAIToolCallFunction `json:"function"`
}

type openAIToolCallFunction struct {
	Name      string `json:"name"`
	Arguments string `json:"arguments"`
}

type openAITextPart struct {
	Type string `json:"type"`
	Text string `json:"text"`
}

type openAIImagePart struct {
	ImageURL openAIImageURL `json:"image_url"`
	Type     string         `json:"type"`
}

type openAIImageURL struct {
	URL    string `json:"url"`
	Detail string `json:"detail"`
}

type openAIAudioPart struct {
	InputAudio openAIInputAudio `json:"input_audio"`
	Type       string           `json:"type"`
}

type openAIInputAudio struct {
	Data   string `json:"data"`
	Format string `json:"format"`
}

type openAITool struct {
	Type     string             `json:"type"`
	Function openAIToolFunction `json:"function"`
}

type openAIToolFunction struct {
	Parameters  map[string]any `json:"parameters,omitempty"`
	Name        string         `json:"name"`
	Description string         `json:"description"`
}

type openAIResponseFormat struct {
	JSONSchema *openAIJSONSchemaFormat `json:"json_schema,omitempty"`
	Type       string                  `json:"type"`
}

type openAIJSONSchemaFormat struct {
	Schema map[string]any `json:"schema"`
	Name   string         `json:"name"`
	Strict bool           `json:"strict"`
}

// openAIChatCompletion is a reply of the Chat Completions API.
type openAIChatCompletion struct {
	Model   string         `json:"model"`
	Choices []openAIChoice `json:"choices"`
	Usage   openAIUsage    `json:"usage"`
}

type openAIChoice struct {
	FinishReason string             `json:"finish_reason"`
	Message      openAIReplyMessage `json:"message"`
}

type openAIReplyMessage struct {
	Content   string               `json:"content"`
	Refusal   string               `json:"refusal"`
	ToolCalls []openAIToolCallJSON `json:"tool_calls"`
}

type openAIUsage struct {
	PromptTokens     int64 `json:"prompt_tokens"`
	CompletionTokens int64 `json:"completion_tokens"`
	TotalTokens      int64 `json:"total_tokens"`
}

// openAIChunk is one event of a streamed completion.
type openAIChunk struct {
	ID      string              `json:"id"`
	Model   string              `json:"model"`
	Choices []openAIChunkChoice `json:"choices"`
	Usage   openAIUsage         `json:"usage"`
}

type openAIChunkChoice struct {
	FinishReason *string            `json:"finish_reason"`
	Delta        openAIDeltaMessage `json:"delta"`
	Index        int64              `json:"index"`
}

// openAIDeltaMessage is a chunk's delta. The pointers tell a field that was
// sent, even empty, from one that was absent or null, which is how the SDK's
// accumulator told content from refusal from tool calls.
type openAIDeltaMessage struct {
	Content   *string               `json:"content"`
	Refusal   *string               `json:"refusal"`
	Role      string                `json:"role"`
	ToolCalls []openAIDeltaToolCall `json:"tool_calls"`
}

type openAIDeltaToolCall struct {
	ID       string                 `json:"id"`
	Type     string                 `json:"type"`
	Function openAIToolCallFunction `json:"function"`
	Index    int64                  `json:"index"`
}

// openAIBatch is a Batch object.
type openAIBatch struct {
	Errors        *openAIBatchErrors `json:"errors"`
	ID            string             `json:"id"`
	Status        string             `json:"status"`
	InputFileID   string             `json:"input_file_id"`
	OutputFileID  string             `json:"output_file_id"`
	RequestCounts struct {
		Total     int64 `json:"total"`
		Completed int64 `json:"completed"`
		Failed    int64 `json:"failed"`
	} `json:"request_counts"`
	CreatedAt   int64 `json:"created_at"`
	CompletedAt int64 `json:"completed_at"`
}

type openAIBatchErrors struct {
	Data []struct {
		Message string `json:"message"`
	} `json:"data"`
}

type openAIBatchPage struct {
	Data []openAIBatch `json:"data"`
}

type openAIFile struct {
	ID string `json:"id"`
}

type openAIBatchCreateRequest struct {
	CompletionWindow string `json:"completion_window"`
	Endpoint         string `json:"endpoint"`
	InputFileID      string `json:"input_file_id"`
}

// openAIBatchRequestLine represents a single line in the JSONL batch input file.
type openAIBatchRequestLine struct {
	Body     *openAIChatRequest `json:"body"`
	CustomID string             `json:"custom_id"`
	Method   string             `json:"method"`
	URL      string             `json:"url"`
}

// openAIBatchResponseLine represents a single line in the JSONL batch output file.
type openAIBatchResponseLine struct {
	Error *struct {
		Code    string `json:"code"`
		Message string `json:"message"`
	} `json:"error"`
	ID       string `json:"id"`
	CustomID string `json:"custom_id"`
	Response struct {
		Body       json.RawMessage `json:"body"`
		StatusCode int             `json:"status_code"`
	} `json:"response"`
}

// openAIStreamState is which part of a choice the last chunk extended, as the
// SDK's ChatCompletionAccumulator tracked it: a tool call is finished when a
// chunk extends something else.
type openAIStreamState struct {
	kind  openAIStreamStateKind
	index int
}

type openAIStreamStateKind int

const (
	openAIStateEmpty openAIStreamStateKind = iota
	openAIStateContent
	openAIStateRefusal
	openAIStateToolCall
	openAIStateFinished
)

// openAIStreamAccumulator folds chunks into a completion and reports each tool
// call once it is finished.
type openAIStreamAccumulator struct {
	id       string
	choices  []openAIReplyMessage
	finish   []string
	states   []openAIStreamState
	usage    openAIUsage
	finished openAIStreamState
}

// add folds one chunk in. A chunk of another completion (a different id) is
// ignored, as the SDK did.
func (acc *openAIStreamAccumulator) add(chunk *openAIChunk) {
	acc.finished = openAIStreamState{kind: openAIStateEmpty, index: 0}

	if acc.id == "" {
		acc.id = chunk.ID
	} else if acc.id != chunk.ID {
		return
	}

	for idx := range chunk.Choices {
		choice := &chunk.Choices[idx]
		position := int(choice.Index)

		acc.choices = growTo(acc.choices, position)
		acc.finish = growTo(acc.finish, position)

		message := &acc.choices[position]

		acc.finish[position] = ""
		if choice.FinishReason != nil {
			acc.finish[position] = *choice.FinishReason
		}

		if choice.Delta.Content != nil {
			message.Content += *choice.Delta.Content
		}

		if choice.Delta.Refusal != nil {
			message.Refusal += *choice.Delta.Refusal
		}

		for callIdx := range choice.Delta.ToolCalls {
			delta := &choice.Delta.ToolCalls[callIdx]
			message.ToolCalls = growTo(message.ToolCalls, int(delta.Index))
			call := &message.ToolCalls[delta.Index]

			if delta.ID != "" {
				call.ID = delta.ID
			}

			call.Function.Name += delta.Function.Name
			call.Function.Arguments += delta.Function.Arguments
		}
	}

	acc.usage.PromptTokens += chunk.Usage.PromptTokens
	acc.usage.CompletionTokens += chunk.Usage.CompletionTokens
	acc.usage.TotalTokens += chunk.Usage.TotalTokens

	if len(chunk.Choices) == 0 {
		return
	}

	position := int(chunk.Choices[0].Index)
	acc.states = growTo(acc.states, position)

	delta := &chunk.Choices[0].Delta
	next := openAIStreamState{kind: openAIStateFinished, index: 0}

	switch {
	case delta.Content != nil:
		next.kind = openAIStateContent
	case delta.Refusal != nil:
		next.kind = openAIStateRefusal
	case delta.ToolCalls != nil:
		next.kind = openAIStateToolCall

		if len(delta.ToolCalls) > 0 {
			next.index = int(delta.ToolCalls[0].Index)
		}
	}

	if acc.states[position] != next {
		acc.finished = acc.states[position]
	}

	acc.states[position] = next
}

// justFinishedToolCall returns the tool call the last chunk finished.
func (acc *openAIStreamAccumulator) justFinishedToolCall() (*openAIToolCallJSON, bool) {
	if acc.finished.kind != openAIStateToolCall || len(acc.choices) == 0 {
		return nil, false
	}

	calls := acc.choices[0].ToolCalls
	if acc.finished.index >= len(calls) {
		return nil, false
	}

	return &calls[acc.finished.index], true
}

// growTo extends slice so index is in range.
func growTo[T any](slice []T, index int) []T {
	if index < len(slice) {
		return slice
	}

	grown := make([]T, index+1)
	copy(grown, slice)

	return grown
}
