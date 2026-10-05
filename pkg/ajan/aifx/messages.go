package aifx

import (
	"encoding/json"
	"errors"
)

var ErrInvalidDataURL = errors.New("invalid data URL")

// Role represents the role of a message sender.
type Role string

const (
	RoleUser      Role = "user"
	RoleAssistant Role = "assistant"
	RoleSystem    Role = "system"
	RoleTool      Role = "tool"
)

// ContentBlockType identifies the type of content in a block.
type ContentBlockType string

const (
	ContentBlockText       ContentBlockType = "text"
	ContentBlockImage      ContentBlockType = "image"
	ContentBlockAudio      ContentBlockType = "audio"
	ContentBlockFile       ContentBlockType = "file"
	ContentBlockToolCall   ContentBlockType = "tool_call"
	ContentBlockToolResult ContentBlockType = "tool_result"
	ContentBlockThinking   ContentBlockType = "thinking"
)

// Message represents a single message in a conversation.
type Message struct {
	Role    Role
	Content []ContentBlock
}

// ContentBlock represents a single piece of content within a message.
type ContentBlock struct {
	Type       ContentBlockType
	Text       string
	Image      *ImagePart
	Audio      *AudioPart
	File       *FilePart
	ToolCall   *ToolCall
	ToolResult *ToolResult
	Thinking   *ThinkingPart
}

// ThinkingPart is a block of the model's reasoning, kept apart from the answer
// text. A provider that signs its reasoning (Anthropic) checks the block when it
// comes back in the next request of a multi-turn call, so it must be sent back
// exactly as received.
type ThinkingPart struct {
	// Text is the reasoning; empty when the provider omits it.
	Text string
	// Signature is the provider's opaque check value for Text.
	Signature string
	// RedactedData is the provider's opaque, encrypted reasoning, set instead
	// of Text and Signature when the provider redacted the block.
	RedactedData string
}

// ToolCall represents a function/tool call made by the model.
type ToolCall struct {
	ID        string
	Name      string
	Arguments json.RawMessage
}

// ToolResult represents the result of a tool call.
type ToolResult struct {
	ToolCallID string
	Content    string
	IsError    bool
}

// ToolDefinition describes a tool available for the model to use.
type ToolDefinition struct {
	Name        string
	Description string
	Parameters  json.RawMessage // JSON Schema
}

// NewTextMessage creates a message with a single text content block.
func NewTextMessage(role Role, text string) Message {
	return Message{
		Role: role,
		Content: []ContentBlock{
			{
				Type:       ContentBlockText,
				Text:       text,
				Image:      nil,
				Audio:      nil,
				File:       nil,
				ToolCall:   nil,
				ToolResult: nil,
				Thinking:   nil,
			},
		},
	}
}

// NewImageMessage creates a message with an image content block.
func NewImageMessage(role Role, imageURL string, detail ImageDetail) Message {
	return Message{
		Role: role,
		Content: []ContentBlock{
			{
				Type: ContentBlockImage,
				Text: "",
				Image: &ImagePart{
					URL:      imageURL,
					MIMEType: "",
					Detail:   detail,
					Data:     nil,
				},
				Audio:      nil,
				File:       nil,
				ToolCall:   nil,
				ToolResult: nil,
				Thinking:   nil,
			},
		},
	}
}

// NewAudioMessage creates a message with an audio content block.
func NewAudioMessage(role Role, audioURL string) Message {
	return Message{
		Role: role,
		Content: []ContentBlock{
			{
				Type:  ContentBlockAudio,
				Text:  "",
				Image: nil,
				Audio: &AudioPart{
					URL:      audioURL,
					MIMEType: "",
					Data:     nil,
				},
				File:       nil,
				ToolCall:   nil,
				ToolResult: nil,
				Thinking:   nil,
			},
		},
	}
}

// NewToolCallBlock creates a tool call content block.
func NewToolCallBlock(toolCallID, name string, arguments json.RawMessage) ContentBlock {
	return ContentBlock{
		Type:  ContentBlockToolCall,
		Text:  "",
		Image: nil,
		Audio: nil,
		File:  nil,
		ToolCall: &ToolCall{
			ID:        toolCallID,
			Name:      name,
			Arguments: arguments,
		},
		ToolResult: nil,
		Thinking:   nil,
	}
}

// NewToolResultBlock creates a tool result content block.
func NewToolResultBlock(toolCallID, content string, isError bool) ContentBlock {
	return ContentBlock{
		Type:     ContentBlockToolResult,
		Text:     "",
		Image:    nil,
		Audio:    nil,
		File:     nil,
		ToolCall: nil,
		ToolResult: &ToolResult{
			ToolCallID: toolCallID,
			Content:    content,
			IsError:    isError,
		},
		Thinking: nil,
	}
}

// NewThinkingBlock creates a thinking content block. Pass the part exactly as
// the provider returned it; a signed block that was changed is rejected when it
// is sent back.
func NewThinkingBlock(part ThinkingPart) ContentBlock {
	return ContentBlock{
		Type:       ContentBlockThinking,
		Text:       "",
		Image:      nil,
		Audio:      nil,
		File:       nil,
		ToolCall:   nil,
		ToolResult: nil,
		Thinking:   &part,
	}
}
