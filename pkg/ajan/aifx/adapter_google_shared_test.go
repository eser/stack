package aifx

import (
	"context"
	"encoding/json"
	"errors"
	"testing"

	"google.golang.org/genai"
)

func TestMapRoleToGenAI(t *testing.T) {
	t.Parallel()

	tests := []struct {
		role Role
		want string
	}{
		{RoleUser, genaiRoleUser},
		{RoleTool, genaiRoleUser},
		{RoleAssistant, genaiRoleModel},
		{RoleSystem, genaiRoleUser}, // default fallback
	}

	for _, tc := range tests {
		t.Run(string(tc.role), func(t *testing.T) {
			t.Parallel()

			got := mapRoleToGenAI(tc.role)
			if got != tc.want {
				t.Errorf("mapRoleToGenAI(%q) = %q, want %q", tc.role, got, tc.want)
			}
		})
	}
}

func TestMapMessagesToGenAI(t *testing.T) {
	t.Parallel()

	msgs := []Message{
		NewTextMessage(RoleSystem, "system"),
		NewTextMessage(RoleUser, "user question"),
		NewTextMessage(RoleAssistant, "reply"),
	}

	contents := mapMessagesToGenAI(msgs)

	// System message should be excluded.
	if len(contents) != 2 {
		t.Fatalf("expected 2 contents (system excluded), got %d", len(contents))
	}

	if contents[0].Role != genaiRoleUser {
		t.Errorf("expected user role, got %q", contents[0].Role)
	}

	if contents[1].Role != genaiRoleModel {
		t.Errorf("expected model role, got %q", contents[1].Role)
	}
}

func TestMapSingleBlockToGenAIPart_Text(t *testing.T) {
	t.Parallel()

	block := &ContentBlock{Type: ContentBlockText, Text: "hello"}
	part := mapSingleBlockToGenAIPart(block)

	if part == nil {
		t.Fatal("expected non-nil part")
	}

	if part.Text != "hello" {
		t.Errorf("expected text 'hello', got %q", part.Text)
	}
}

func TestMapSingleBlockToGenAIPart_Image_URL(t *testing.T) {
	t.Parallel()

	block := &ContentBlock{
		Type: ContentBlockImage,
		Image: &ImagePart{
			URL:      "https://example.com/img.jpg",
			MIMEType: "image/jpeg",
		},
	}

	part := mapSingleBlockToGenAIPart(block)

	if part == nil {
		t.Fatal("expected non-nil part")
	}

	if part.FileData == nil {
		t.Fatal("expected FileData for HTTP URL")
	}

	if part.FileData.FileURI != "https://example.com/img.jpg" {
		t.Errorf("unexpected URI: %s", part.FileData.FileURI)
	}
}

func TestMapSingleBlockToGenAIPart_Image_InlineData(t *testing.T) {
	t.Parallel()

	block := &ContentBlock{
		Type: ContentBlockImage,
		Image: &ImagePart{
			MIMEType: "image/png",
			Data:     []byte{0x89, 0x50, 0x4e, 0x47}, // PNG magic bytes
		},
	}

	part := mapSingleBlockToGenAIPart(block)

	if part == nil || part.InlineData == nil {
		t.Fatal("expected InlineData for raw bytes")
	}

	if part.InlineData.MIMEType != "image/png" {
		t.Errorf("unexpected MIME type: %s", part.InlineData.MIMEType)
	}
}

func TestMapSingleBlockToGenAIPart_Image_DataURL(t *testing.T) {
	t.Parallel()

	block := &ContentBlock{
		Type: ContentBlockImage,
		Image: &ImagePart{
			URL: "data:image/jpeg;base64,aGVsbG8=",
		},
	}

	part := mapSingleBlockToGenAIPart(block)

	if part == nil || part.InlineData == nil {
		t.Fatal("expected InlineData for data URL")
	}

	if part.InlineData.MIMEType != "image/jpeg" {
		t.Errorf("unexpected MIME type: %s", part.InlineData.MIMEType)
	}
}

func TestMapSingleBlockToGenAIPart_ToolCall(t *testing.T) {
	t.Parallel()

	block := &ContentBlock{
		Type: ContentBlockToolCall,
		ToolCall: &ToolCall{
			ID:        "tc-1",
			Name:      "search",
			Arguments: json.RawMessage(`{"query":"test"}`),
		},
	}

	part := mapSingleBlockToGenAIPart(block)

	if part == nil || part.FunctionCall == nil {
		t.Fatal("expected FunctionCall part")
	}

	if part.FunctionCall.Name != "search" {
		t.Errorf("expected name 'search', got %q", part.FunctionCall.Name)
	}
}

func TestMapSingleBlockToGenAIPart_ToolResult(t *testing.T) {
	t.Parallel()

	block := &ContentBlock{
		Type: ContentBlockToolResult,
		ToolResult: &ToolResult{
			ToolCallID: "tc-1",
			Content:    "search result text",
		},
	}

	part := mapSingleBlockToGenAIPart(block)

	if part == nil || part.FunctionResponse == nil {
		t.Fatal("expected FunctionResponse part")
	}
}

func TestMapSingleBlockToGenAIPart_Unsupported(t *testing.T) {
	t.Parallel()

	// Audio block with nil Audio returns nil (no panic)
	block := &ContentBlock{Type: ContentBlockAudio}
	part := mapSingleBlockToGenAIPart(block)

	if part != nil {
		t.Errorf("expected nil part for audio block with nil Audio, got %+v", part)
	}
}

func TestMapSingleBlockToGenAIPart_Audio(t *testing.T) {
	t.Parallel()

	block := &ContentBlock{
		Type: ContentBlockAudio,
		Audio: &AudioPart{
			URL:      "https://example.com/audio.mp3",
			MIMEType: "audio/mpeg",
		},
	}

	part := mapSingleBlockToGenAIPart(block)
	if part == nil || part.FileData == nil {
		t.Fatal("expected FileData for audio URL")
	}
}

func TestMapSingleBlockToGenAIPart_AudioInline(t *testing.T) {
	t.Parallel()

	block := &ContentBlock{
		Type: ContentBlockAudio,
		Audio: &AudioPart{
			MIMEType: "audio/wav",
			Data:     []byte("RIFF"),
		},
	}

	part := mapSingleBlockToGenAIPart(block)
	if part == nil || part.InlineData == nil {
		t.Fatal("expected InlineData for audio bytes")
	}
}

func TestMapSingleBlockToGenAIPart_File(t *testing.T) {
	t.Parallel()

	block := &ContentBlock{
		Type: ContentBlockFile,
		File: &FilePart{
			URI:      "gs://bucket/file.pdf",
			MIMEType: "application/pdf",
		},
	}

	part := mapSingleBlockToGenAIPart(block)
	if part == nil || part.FileData == nil {
		t.Fatal("expected FileData for file block")
	}

	if part.FileData.FileURI != "gs://bucket/file.pdf" {
		t.Errorf("unexpected URI: %s", part.FileData.FileURI)
	}
}

func TestBuildGenerateContentConfig(t *testing.T) {
	t.Parallel()

	temp := 0.7
	topP := 0.9
	budget := 4096

	opts := &GenerateTextOptions{
		System:      "be helpful",
		Temperature: &temp,
		TopP:        &topP,
		MaxTokens:   512,
		StopWords:   []string{"END"},
		Tools: []ToolDefinition{
			{Name: "search", Description: "search", Parameters: json.RawMessage(`{"type":"object"}`)},
		},
		SafetySettings: []SafetySetting{
			{Category: "HARM_CATEGORY_HARASSMENT", Threshold: "BLOCK_NONE"},
		},
		ThinkingBudget: &budget,
	}

	config := buildGenerateContentConfig(opts)

	if config.SystemInstruction == nil {
		t.Error("expected SystemInstruction")
	}

	if config.MaxOutputTokens != 512 {
		t.Errorf("expected MaxOutputTokens 512, got %d", config.MaxOutputTokens)
	}

	if config.Temperature == nil || *config.Temperature != float32(0.7) {
		t.Errorf("unexpected temperature: %+v", config.Temperature)
	}

	if len(config.Tools) == 0 {
		t.Error("expected tools in config")
	}

	if len(config.SafetySettings) == 0 {
		t.Error("expected safety settings")
	}

	if config.ThinkingConfig == nil {
		t.Error("expected ThinkingConfig")
	}
}

func TestBuildSystemInstruction(t *testing.T) {
	t.Parallel()

	t.Run("non-empty system", func(t *testing.T) {
		t.Parallel()

		inst := buildSystemInstruction("you are helpful")
		if inst == nil {
			t.Fatal("expected non-nil instruction")
		}

		if len(inst.Parts) != 1 || inst.Parts[0].Text != "you are helpful" {
			t.Errorf("unexpected instruction: %+v", inst)
		}
	})

	t.Run("empty system returns nil", func(t *testing.T) {
		t.Parallel()

		inst := buildSystemInstruction("")
		if inst != nil {
			t.Errorf("expected nil for empty system, got %+v", inst)
		}
	})
}

func TestMapGenAIResponse_Nil(t *testing.T) {
	t.Parallel()

	_, err := mapGenAIResponse(nil)
	if !errors.Is(err, ErrGenAINilResponse) {
		t.Errorf("expected ErrGenAINilResponse, got %v", err)
	}
}

func TestMapGenAIResponse_EmptyCandidates(t *testing.T) {
	t.Parallel()

	resp := &genai.GenerateContentResponse{ //nolint:exhaustruct
		Candidates: nil,
	}

	result, err := mapGenAIResponse(resp)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	if result == nil {
		t.Fatal("expected non-nil result")
	}
}

func TestMapGenAIResponse_WithUsage(t *testing.T) {
	t.Parallel()

	resp := &genai.GenerateContentResponse{ //nolint:exhaustruct
		UsageMetadata: &genai.GenerateContentResponseUsageMetadata{ //nolint:exhaustruct
			PromptTokenCount:     10,
			CandidatesTokenCount: 5,
			TotalTokenCount:      15,
			ThoughtsTokenCount:   2,
		},
	}

	result, err := mapGenAIResponse(resp)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	if result.Usage.InputTokens != 10 {
		t.Errorf("expected 10 input tokens, got %d", result.Usage.InputTokens)
	}

	if result.Usage.ThinkingTokens != 2 {
		t.Errorf("expected 2 thinking tokens, got %d", result.Usage.ThinkingTokens)
	}
}

func TestApplyGenAIResponseFormat(t *testing.T) {
	t.Parallel()

	t.Run("json_schema format", func(t *testing.T) {
		t.Parallel()

		config := &genai.GenerateContentConfig{} //nolint:exhaustruct
		opts := &GenerateTextOptions{
			ResponseFormat: &ResponseFormat{
				Type:       "json_schema",
				JSONSchema: json.RawMessage(`{"type":"object"}`),
			},
		}

		applyGenAIResponseFormat(config, opts)

		if config.ResponseMIMEType != "application/json" {
			t.Errorf("unexpected MIME type: %s", config.ResponseMIMEType)
		}
	})

	t.Run("text format", func(t *testing.T) {
		t.Parallel()

		config := &genai.GenerateContentConfig{} //nolint:exhaustruct
		opts := &GenerateTextOptions{
			ResponseFormat: &ResponseFormat{Type: "text"},
		}

		applyGenAIResponseFormat(config, opts)

		if config.ResponseMIMEType != "text/plain" {
			t.Errorf("unexpected MIME type: %s", config.ResponseMIMEType)
		}
	})

	t.Run("nil response format is no-op", func(t *testing.T) {
		t.Parallel()

		config := &genai.GenerateContentConfig{} //nolint:exhaustruct
		opts := &GenerateTextOptions{}

		applyGenAIResponseFormat(config, opts)

		if config.ResponseMIMEType != "" {
			t.Errorf("expected empty MIME type for nil format, got %s", config.ResponseMIMEType)
		}
	})
}

func TestMapGenAIFinishReason(t *testing.T) {
	t.Parallel()

	tests := []struct {
		input genai.FinishReason
		want  StopReason
	}{
		{genai.FinishReasonStop, StopReasonEndTurn},
		{genai.FinishReasonMaxTokens, StopReasonMaxTokens},
		{genai.FinishReasonSafety, StopReasonStop}, // default
		{genai.FinishReasonOther, StopReasonStop},  // default
	}

	for _, tc := range tests {
		t.Run(string(tc.input), func(t *testing.T) {
			t.Parallel()

			got := mapGenAIFinishReason(tc.input)
			if got != tc.want {
				t.Errorf("mapGenAIFinishReason(%q) = %q, want %q", tc.input, got, tc.want)
			}
		})
	}
}

func TestMapGenAIPartsToContentBlocks(t *testing.T) {
	t.Parallel()

	t.Run("text part", func(t *testing.T) {
		t.Parallel()

		parts := []*genai.Part{
			{Text: "hello world"},
		}

		blocks := mapGenAIPartsToContentBlocks(parts)
		if len(blocks) != 1 {
			t.Fatalf("expected 1 block, got %d", len(blocks))
		}

		if blocks[0].Type != ContentBlockText || blocks[0].Text != "hello world" {
			t.Errorf("unexpected block: %+v", blocks[0])
		}
	})

	t.Run("function call part", func(t *testing.T) {
		t.Parallel()

		parts := []*genai.Part{
			{FunctionCall: &genai.FunctionCall{Name: "search", Args: map[string]any{"q": "test"}}}, //nolint:exhaustruct
		}

		blocks := mapGenAIPartsToContentBlocks(parts)
		if len(blocks) != 1 {
			t.Fatalf("expected 1 block, got %d", len(blocks))
		}

		if blocks[0].Type != ContentBlockToolCall {
			t.Errorf("expected tool call block, got %v", blocks[0].Type)
		}

		if blocks[0].ToolCall.Name != "search" {
			t.Errorf("expected name 'search', got %q", blocks[0].ToolCall.Name)
		}
	})

	t.Run("inline data part", func(t *testing.T) {
		t.Parallel()

		parts := []*genai.Part{
			{InlineData: &genai.Blob{MIMEType: "image/png", Data: []byte{0x89, 0x50}}}, //nolint:exhaustruct
		}

		blocks := mapGenAIPartsToContentBlocks(parts)
		if len(blocks) != 1 {
			t.Fatalf("expected 1 block, got %d", len(blocks))
		}

		if blocks[0].Type != ContentBlockImage {
			t.Errorf("expected image block, got %v", blocks[0].Type)
		}
	})

	t.Run("nil part skipped", func(t *testing.T) {
		t.Parallel()

		parts := []*genai.Part{nil, {Text: "hi"}}

		blocks := mapGenAIPartsToContentBlocks(parts)
		if len(blocks) != 1 {
			t.Fatalf("expected 1 block (nil skipped), got %d", len(blocks))
		}
	})
}

func TestMapGenAIResponse_WithContent(t *testing.T) {
	t.Parallel()

	resp := &genai.GenerateContentResponse{ //nolint:exhaustruct
		Candidates: []*genai.Candidate{
			{
				Content: &genai.Content{ //nolint:exhaustruct
					Parts: []*genai.Part{
						{Text: "response text"},
					},
				},
				FinishReason: genai.FinishReasonStop,
			},
		},
	}

	result, err := mapGenAIResponse(resp)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	if result.Text() != "response text" {
		t.Errorf("expected 'response text', got %q", result.Text())
	}

	if result.StopReason != StopReasonEndTurn {
		t.Errorf("expected end_turn, got %q", result.StopReason)
	}
}

func TestMapAudioPartToGenAI_DataURL(t *testing.T) {
	t.Parallel()

	audio := &AudioPart{
		URL: "data:audio/mpeg;base64,AAAAAAAA",
	}

	part := mapAudioPartToGenAI(audio)
	if part == nil || part.InlineData == nil {
		t.Fatal("expected InlineData for data URL audio")
	}

	if part.InlineData.MIMEType != "audio/mpeg" {
		t.Errorf("unexpected MIME type: %s", part.InlineData.MIMEType)
	}
}

func TestMapAudioPartToGenAI_MissingMIMEType(t *testing.T) {
	t.Parallel()

	// No MIME type and no data — should fall back to detecting from URL.
	audio := &AudioPart{
		URL: "https://example.com/sound.mp3",
	}

	part := mapAudioPartToGenAI(audio)
	if part == nil || part.FileData == nil {
		t.Fatal("expected FileData for URL audio with no MIME type")
	}
}

func TestMapFilePartToGenAI_MissingMIMEType(t *testing.T) {
	t.Parallel()

	file := &FilePart{
		URI: "gs://bucket/document.pdf",
	}

	part := mapFilePartToGenAI(file)
	if part == nil || part.FileData == nil {
		t.Fatal("expected FileData")
	}

	if part.FileData.FileURI != "gs://bucket/document.pdf" {
		t.Errorf("unexpected URI: %s", part.FileData.FileURI)
	}
}

func TestMapToolResultToGenAIPart_IsError(t *testing.T) {
	t.Parallel()

	tr := &ToolResult{
		ToolCallID: "tc-err",
		Content:    "something went wrong",
		IsError:    true,
	}

	part := mapToolResultToGenAIPart(tr)
	if part == nil || part.FunctionResponse == nil {
		t.Fatal("expected FunctionResponse")
	}

	if part.FunctionResponse.Response["error"] != "something went wrong" {
		t.Errorf("expected error field in response, got %+v", part.FunctionResponse.Response)
	}
}

func TestEmitStreamEventsFromResponse_WithContent(t *testing.T) {
	t.Parallel()

	ch := make(chan StreamEvent, 16)
	ctx := context.Background()

	resp := &genai.GenerateContentResponse{ //nolint:exhaustruct
		Candidates: []*genai.Candidate{
			{
				Content: &genai.Content{ //nolint:exhaustruct
					Parts: []*genai.Part{
						{Text: "streamed text"},
					},
				},
				FinishReason: genai.FinishReasonStop,
			},
		},
		UsageMetadata: &genai.GenerateContentResponseUsageMetadata{ //nolint:exhaustruct
			PromptTokenCount:     5,
			CandidatesTokenCount: 3,
			TotalTokenCount:      8,
		},
	}

	emitStreamEventsFromResponse(ctx, ch, resp)
	close(ch)

	var events []StreamEvent

	for ev := range ch {
		events = append(events, ev)
	}

	if len(events) == 0 {
		t.Fatal("expected at least one event")
	}

	// First event should be content delta.
	if events[0].Type != StreamEventContentDelta {
		t.Errorf("expected content_delta, got %q", events[0].Type)
	}
}

func TestEmitStreamEventsFromResponse_NilResponse(t *testing.T) {
	t.Parallel()

	ch := make(chan StreamEvent, 4)
	emitStreamEventsFromResponse(context.Background(), ch, nil)
	close(ch)

	if len(ch) != 0 {
		t.Error("expected no events for nil response")
	}
}

func TestEmitStreamEventsFromResponse_NoContent(t *testing.T) {
	t.Parallel()

	ch := make(chan StreamEvent, 4)
	resp := &genai.GenerateContentResponse{ //nolint:exhaustruct
		Candidates: []*genai.Candidate{
			{Content: nil, FinishReason: genai.FinishReasonStop}, //nolint:exhaustruct
		},
	}

	emitStreamEventsFromResponse(context.Background(), ch, resp)
	close(ch)

	if len(ch) != 0 {
		t.Error("expected no events when candidate has nil content")
	}
}

func TestEmitGenAIContentParts_FunctionCall(t *testing.T) {
	t.Parallel()

	ch := make(chan StreamEvent, 8)
	ctx := context.Background()

	parts := []*genai.Part{
		{FunctionCall: &genai.FunctionCall{Name: "lookup", Args: map[string]any{"q": "go"}}}, //nolint:exhaustruct
	}

	emitGenAIContentParts(ctx, ch, parts)
	close(ch)

	var events []StreamEvent

	for ev := range ch {
		events = append(events, ev)
	}

	if len(events) != 1 {
		t.Fatalf("expected 1 event, got %d", len(events))
	}

	if events[0].Type != StreamEventToolCallDelta {
		t.Errorf("expected tool_call_delta, got %q", events[0].Type)
	}
}

func TestEmitGenAIUsageMetadata_NilSkipped(t *testing.T) {
	t.Parallel()

	ch := make(chan StreamEvent, 4)
	emitGenAIUsageMetadata(context.Background(), ch, nil, genai.FinishReasonStop)
	close(ch)

	if len(ch) != 0 {
		t.Error("expected no events for nil usage metadata")
	}
}

func TestEmitGenAIUsageMetadata_WithData(t *testing.T) {
	t.Parallel()

	ch := make(chan StreamEvent, 4)
	meta := &genai.GenerateContentResponseUsageMetadata{ //nolint:exhaustruct
		PromptTokenCount:     10,
		CandidatesTokenCount: 5,
		TotalTokenCount:      15,
	}

	emitGenAIUsageMetadata(context.Background(), ch, meta, genai.FinishReasonStop)
	close(ch)

	var events []StreamEvent

	for ev := range ch {
		events = append(events, ev)
	}

	if len(events) != 1 {
		t.Fatalf("expected 1 done event, got %d", len(events))
	}

	if events[0].Type != StreamEventMessageDone {
		t.Errorf("expected message_done, got %q", events[0].Type)
	}

	if events[0].Usage == nil || events[0].Usage.InputTokens != 10 {
		t.Errorf("expected 10 input tokens, got %+v", events[0].Usage)
	}
}

func TestMapSafetySettings_Empty(t *testing.T) {
	t.Parallel()

	result := mapSafetySettings(nil)
	if result != nil {
		t.Error("expected nil for empty safety settings")
	}

	result = mapSafetySettings([]SafetySetting{})
	if result != nil {
		t.Error("expected nil for empty safety settings slice")
	}
}

func TestEmitGenAIUsageMetadata_WithThinkingTokens(t *testing.T) {
	t.Parallel()

	ch := make(chan StreamEvent, 2)
	ctx := context.Background()

	metadata := &genai.GenerateContentResponseUsageMetadata{
		PromptTokenCount:     5,
		CandidatesTokenCount: 3,
		TotalTokenCount:      20,
		ThoughtsTokenCount:   12,
	}

	emitGenAIUsageMetadata(ctx, ch, metadata, genai.FinishReasonStop)
	close(ch)

	var events []StreamEvent
	for ev := range ch {
		events = append(events, ev)
	}

	if len(events) != 1 {
		t.Fatalf("expected 1 event, got %d", len(events))
	}

	if events[0].Usage == nil || events[0].Usage.ThinkingTokens != 12 {
		t.Errorf("expected ThinkingTokens=12, got %+v", events[0].Usage)
	}
}

func TestSendStreamEvent_ContextCanceled(t *testing.T) {
	t.Parallel()

	ch := make(chan StreamEvent) // unbuffered — will block unless context cancelled

	ctx, cancel := context.WithCancel(context.Background())
	cancel() // cancel immediately

	// Should not block or panic.
	event := newStreamEventContentDelta("text")
	sendStreamEvent(ctx, ch, event)
}
