package aifx

import (
	"context"
	"encoding/json"
	"errors"

	"google.golang.org/genai"
)

// genaiRoleUser is the role name for user messages in the genai SDK.
const genaiRoleUser = "user"

// genaiRoleModel is the role name for assistant/model messages in the genai SDK.
const genaiRoleModel = "model"

// Sentinel errors shared across Google adapters.
var ErrGenAINilResponse = errors.New("genai returned nil response")

// mapMessagesToGenAI converts unified messages to genai Content slices.
// Gemini uses "user" and "model" as role names; "assistant" is mapped to "model".
// System messages are excluded here (they go into SystemInstruction).
// Tool result messages are mapped as "user" role with FunctionResponse parts.
func mapMessagesToGenAI(messages []Message) []*genai.Content {
	contents := make([]*genai.Content, 0, len(messages))

	for _, msg := range messages {
		// Skip system messages -- they are handled separately via SystemInstruction.
		if msg.Role == RoleSystem {
			continue
		}

		role := mapRoleToGenAI(msg.Role)
		parts := mapContentBlocksToGenAIParts(msg.Content)

		if len(parts) > 0 {
			contents = append(contents, &genai.Content{
				Role:  role,
				Parts: parts,
			})
		}
	}

	return contents
}

// mapRoleToGenAI converts a unified role to the genai role string.
func mapRoleToGenAI(role Role) string {
	switch role { //nolint:exhaustive
	case RoleUser, RoleTool:
		return genaiRoleUser
	case RoleAssistant:
		return genaiRoleModel
	default:
		return genaiRoleUser
	}
}

// mapContentBlocksToGenAIParts converts content blocks to genai Part slices.
func mapContentBlocksToGenAIParts(blocks []ContentBlock) []*genai.Part {
	parts := make([]*genai.Part, 0, len(blocks))

	for idx := range blocks {
		block := &blocks[idx]

		mapped := mapSingleBlockToGenAIPart(block)
		if mapped != nil {
			parts = append(parts, mapped)
		}
	}

	return parts
}

// mapSingleBlockToGenAIPart converts a single content block to a genai Part.
func mapSingleBlockToGenAIPart(block *ContentBlock) *genai.Part { //nolint:cyclop
	switch block.Type {
	case ContentBlockText:
		return &genai.Part{ //nolint:exhaustruct
			Text: block.Text,
		}

	case ContentBlockImage:
		if block.Image != nil {
			return mapImagePartToGenAI(block.Image)
		}

	case ContentBlockAudio:
		if block.Audio != nil {
			return mapAudioPartToGenAI(block.Audio)
		}

	case ContentBlockFile:
		if block.File != nil {
			return mapFilePartToGenAI(block.File)
		}

	case ContentBlockToolCall:
		if block.ToolCall != nil {
			return mapToolCallToGenAIPart(block.ToolCall)
		}

	case ContentBlockToolResult:
		if block.ToolResult != nil {
			return mapToolResultToGenAIPart(block.ToolResult)
		}
	}

	return nil
}

// mapImagePartToGenAI converts an ImagePart to a genai Part.
// Data URLs and raw bytes produce InlineData; HTTP URLs produce FileData.
func mapImagePartToGenAI(img *ImagePart) *genai.Part {
	// If raw data is already available, use InlineData.
	if len(img.Data) > 0 {
		mimeType := img.MIMEType
		if mimeType == "" {
			mimeType = "image/png"
		}

		return &genai.Part{ //nolint:exhaustruct
			InlineData: &genai.Blob{ //nolint:exhaustruct
				MIMEType: mimeType,
				Data:     img.Data,
			},
		}
	}

	// If the URL is a data: URI, decode it.
	if IsDataURL(img.URL) {
		mimeType, data, err := DecodeDataURL(img.URL)
		if err == nil {
			return &genai.Part{ //nolint:exhaustruct
				InlineData: &genai.Blob{ //nolint:exhaustruct
					MIMEType: mimeType,
					Data:     data,
				},
			}
		}
	}

	// Fall back to FileData for HTTP/GCS URIs.
	mimeType := img.MIMEType
	if mimeType == "" {
		mimeType = DetectMIMEFromURL(img.URL)
	}

	return &genai.Part{ //nolint:exhaustruct
		FileData: &genai.FileData{ //nolint:exhaustruct
			MIMEType: mimeType,
			FileURI:  img.URL,
		},
	}
}

// mapAudioPartToGenAI converts an AudioPart to a genai Part.
func mapAudioPartToGenAI(audio *AudioPart) *genai.Part {
	if len(audio.Data) > 0 {
		mimeType := audio.MIMEType
		if mimeType == "" {
			mimeType = "audio/mpeg"
		}

		return &genai.Part{ //nolint:exhaustruct
			InlineData: &genai.Blob{ //nolint:exhaustruct
				MIMEType: mimeType,
				Data:     audio.Data,
			},
		}
	}

	if IsDataURL(audio.URL) {
		mimeType, data, err := DecodeDataURL(audio.URL)
		if err == nil {
			return &genai.Part{ //nolint:exhaustruct
				InlineData: &genai.Blob{ //nolint:exhaustruct
					MIMEType: mimeType,
					Data:     data,
				},
			}
		}
	}

	mimeType := audio.MIMEType
	if mimeType == "" {
		mimeType = DetectMIMEFromURL(audio.URL)
	}

	return &genai.Part{ //nolint:exhaustruct
		FileData: &genai.FileData{ //nolint:exhaustruct
			MIMEType: mimeType,
			FileURI:  audio.URL,
		},
	}
}

// mapFilePartToGenAI converts a FilePart to a genai Part.
func mapFilePartToGenAI(file *FilePart) *genai.Part {
	mimeType := file.MIMEType
	if mimeType == "" {
		mimeType = DetectMIMEFromURL(file.URI)
	}

	return &genai.Part{ //nolint:exhaustruct
		FileData: &genai.FileData{ //nolint:exhaustruct
			MIMEType: mimeType,
			FileURI:  file.URI,
		},
	}
}

// mapToolCallToGenAIPart converts a ToolCall to a genai FunctionCall Part.
func mapToolCallToGenAIPart(toolCall *ToolCall) *genai.Part {
	var args map[string]any
	if len(toolCall.Arguments) > 0 {
		_ = json.Unmarshal(toolCall.Arguments, &args)
	}

	return &genai.Part{ //nolint:exhaustruct
		FunctionCall: &genai.FunctionCall{ //nolint:exhaustruct
			Name: toolCall.Name,
			Args: args,
		},
	}
}

// mapToolResultToGenAIPart converts a ToolResult to a genai FunctionResponse Part.
func mapToolResultToGenAIPart(toolResult *ToolResult) *genai.Part {
	response := map[string]any{
		"result": toolResult.Content,
	}

	if toolResult.IsError {
		response["error"] = toolResult.Content
	}

	return &genai.Part{ //nolint:exhaustruct
		FunctionResponse: &genai.FunctionResponse{ //nolint:exhaustruct
			Name:     toolResult.ToolCallID,
			Response: response,
		},
	}
}

// mapToolsToGenAI converts unified tool definitions to genai Tool format.
// Uses ParametersJsonSchema for JSON Schema parameters.
func mapToolsToGenAI(tools []ToolDefinition) []*genai.Tool {
	if len(tools) == 0 {
		return nil
	}

	declarations := make([]*genai.FunctionDeclaration, 0, len(tools))

	for idx := range tools {
		tool := &tools[idx]
		decl := &genai.FunctionDeclaration{ //nolint:exhaustruct
			Name:        tool.Name,
			Description: tool.Description,
		}

		// Convert JSON Schema parameters to the map[string]any format
		// expected by ParametersJsonSchema.
		if len(tool.Parameters) > 0 {
			var schemaMap map[string]any

			err := json.Unmarshal(tool.Parameters, &schemaMap)
			if err == nil {
				decl.ParametersJsonSchema = schemaMap
			}
		}

		declarations = append(declarations, decl)
	}

	return []*genai.Tool{
		{
			FunctionDeclarations: declarations,
		},
	}
}

// mapSafetySettings converts unified safety settings to genai SafetySetting format.
func mapSafetySettings(settings []SafetySetting) []*genai.SafetySetting {
	if len(settings) == 0 {
		return nil
	}

	genaiSettings := make([]*genai.SafetySetting, 0, len(settings))

	for idx := range settings {
		setting := &settings[idx]

		genaiSettings = append(genaiSettings, &genai.SafetySetting{ //nolint:exhaustruct
			Category:  genai.HarmCategory(setting.Category),
			Threshold: genai.HarmBlockThreshold(setting.Threshold),
		})
	}

	return genaiSettings
}

// buildSystemInstruction creates a genai.Content for the system instruction.
func buildSystemInstruction(system string) *genai.Content {
	if system == "" {
		return nil
	}

	return &genai.Content{ //nolint:exhaustruct
		Parts: []*genai.Part{
			{Text: system},
		},
	}
}

// buildGenerateContentConfig constructs the genai.GenerateContentConfig from unified options.
func buildGenerateContentConfig(
	opts *GenerateTextOptions,
) *genai.GenerateContentConfig {
	config := &genai.GenerateContentConfig{} //nolint:exhaustruct

	// System instruction.
	config.SystemInstruction = buildSystemInstruction(opts.System)

	applyGenAIGenerationParams(config, opts)
	applyGenAITools(config, opts)
	applyGenAISafetySettings(config, opts)
	applyGenAIResponseFormat(config, opts)
	applyGenAIThinkingConfig(config, opts)

	return config
}

func applyGenAIGenerationParams(
	config *genai.GenerateContentConfig,
	opts *GenerateTextOptions,
) {
	if opts.MaxTokens > 0 {
		config.MaxOutputTokens = int32(opts.MaxTokens)
	}

	if opts.Temperature != nil {
		config.Temperature = genai.Ptr(float32(*opts.Temperature))
	}

	if opts.TopP != nil {
		config.TopP = genai.Ptr(float32(*opts.TopP))
	}

	if len(opts.StopWords) > 0 {
		config.StopSequences = opts.StopWords
	}
}

func applyGenAITools(
	config *genai.GenerateContentConfig,
	opts *GenerateTextOptions,
) {
	if len(opts.Tools) > 0 {
		config.Tools = mapToolsToGenAI(opts.Tools)
	}
}

func applyGenAISafetySettings(
	config *genai.GenerateContentConfig,
	opts *GenerateTextOptions,
) {
	if len(opts.SafetySettings) > 0 {
		config.SafetySettings = mapSafetySettings(opts.SafetySettings)
	}
}

func applyGenAIResponseFormat(
	config *genai.GenerateContentConfig,
	opts *GenerateTextOptions,
) {
	if opts.ResponseFormat == nil {
		return
	}

	switch opts.ResponseFormat.Type {
	case "json_schema", "json_object":
		config.ResponseMIMEType = "application/json"

		if len(opts.ResponseFormat.JSONSchema) > 0 {
			var schemaMap map[string]any

			err := json.Unmarshal(opts.ResponseFormat.JSONSchema, &schemaMap)
			if err == nil {
				config.ResponseSchema = &genai.Schema{} //nolint:exhaustruct
				config.ResponseJsonSchema = schemaMap
			}
		}
	case "text":
		config.ResponseMIMEType = "text/plain"
	}
}

func applyGenAIThinkingConfig(
	config *genai.GenerateContentConfig,
	opts *GenerateTextOptions,
) {
	if opts.ThinkingBudget != nil {
		config.ThinkingConfig = &genai.ThinkingConfig{ //nolint:exhaustruct
			ThinkingBudget: genai.Ptr(int32(*opts.ThinkingBudget)),
		}
	}
}

// mapGenAIResponse converts a genai GenerateContentResponse to the unified GenerateTextResult.
func mapGenAIResponse(
	resp *genai.GenerateContentResponse,
) (*GenerateTextResult, error) {
	if resp == nil {
		return nil, ErrGenAINilResponse
	}

	result := &GenerateTextResult{
		Content:     nil,
		StopReason:  "",
		Usage:       Usage{}, //nolint:exhaustruct
		ModelID:     "",
		RawRequest:  nil,
		RawResponse: resp,
	}

	// Map usage metadata.
	if resp.UsageMetadata != nil {
		result.Usage = Usage{
			InputTokens:    int(resp.UsageMetadata.PromptTokenCount),
			OutputTokens:   int(resp.UsageMetadata.CandidatesTokenCount),
			TotalTokens:    int(resp.UsageMetadata.TotalTokenCount),
			ThinkingTokens: 0,
		}

		if resp.UsageMetadata.ThoughtsTokenCount > 0 {
			result.Usage.ThinkingTokens = int(resp.UsageMetadata.ThoughtsTokenCount)
		}
	}

	// Extract content from first candidate.
	if len(resp.Candidates) == 0 {
		return result, nil
	}

	candidate := resp.Candidates[0]

	// Map finish reason.
	result.StopReason = mapGenAIFinishReason(candidate.FinishReason)

	// Map content parts.
	if candidate.Content != nil {
		result.Content = mapGenAIPartsToContentBlocks(candidate.Content.Parts)
	}

	return result, nil
}

// mapGenAIFinishReason converts a genai FinishReason to unified StopReason.
func mapGenAIFinishReason(reason genai.FinishReason) StopReason {
	switch reason { //nolint:exhaustive
	case genai.FinishReasonStop:
		return StopReasonEndTurn
	case genai.FinishReasonMaxTokens:
		return StopReasonMaxTokens
	default:
		return StopReasonStop
	}
}

// mapGenAIPartsToContentBlocks converts genai Parts to unified ContentBlock slices.
func mapGenAIPartsToContentBlocks(parts []*genai.Part) []ContentBlock {
	blocks := make([]ContentBlock, 0, len(parts))

	for _, part := range parts {
		if part == nil {
			continue
		}

		if part.Text != "" {
			blocks = append(blocks, ContentBlock{
				Type:       ContentBlockText,
				Text:       part.Text,
				Image:      nil,
				Audio:      nil,
				File:       nil,
				ToolCall:   nil,
				ToolResult: nil,
			})
		}

		if part.FunctionCall != nil {
			argsJSON, err := json.Marshal(part.FunctionCall.Args)
			if err != nil {
				argsJSON = []byte("{}")
			}

			blocks = append(blocks, ContentBlock{
				Type:  ContentBlockToolCall,
				Text:  "",
				Image: nil,
				Audio: nil,
				File:  nil,
				ToolCall: &ToolCall{
					ID:        "call_" + part.FunctionCall.Name,
					Name:      part.FunctionCall.Name,
					Arguments: argsJSON,
				},
				ToolResult: nil,
			})
		}

		if part.InlineData != nil {
			blocks = append(blocks, ContentBlock{
				Type: ContentBlockImage,
				Text: "",
				Image: &ImagePart{
					URL:      "",
					MIMEType: part.InlineData.MIMEType,
					Detail:   "",
					Data:     part.InlineData.Data,
				},
				Audio:      nil,
				File:       nil,
				ToolCall:   nil,
				ToolResult: nil,
			})
		}
	}

	return blocks
}

// emitStreamEventsFromResponse extracts stream events from a genai response chunk
// and sends them to the event channel. Shared by Gemini and Vertex AI streaming.
func emitStreamEventsFromResponse(
	ctx context.Context,
	eventCh chan<- StreamEvent,
	resp *genai.GenerateContentResponse,
) {
	if resp == nil {
		return
	}

	if len(resp.Candidates) == 0 {
		return
	}

	candidate := resp.Candidates[0]
	if candidate.Content == nil {
		return
	}

	emitGenAIContentParts(ctx, eventCh, candidate.Content.Parts)
	emitGenAIUsageMetadata(ctx, eventCh, resp.UsageMetadata, candidate.FinishReason)
}

func emitGenAIContentParts(
	ctx context.Context,
	eventCh chan<- StreamEvent,
	parts []*genai.Part,
) {
	for _, part := range parts {
		if part == nil {
			continue
		}

		if part.Text != "" {
			sendStreamEvent(ctx, eventCh, newStreamEventContentDelta(part.Text))
		}

		if part.FunctionCall != nil {
			argsJSON, err := json.Marshal(part.FunctionCall.Args)
			if err != nil {
				argsJSON = []byte("{}")
			}

			sendStreamEvent(ctx, eventCh, newStreamEventToolCall(&ToolCall{
				ID:        "call_" + part.FunctionCall.Name,
				Name:      part.FunctionCall.Name,
				Arguments: argsJSON,
			}))
		}
	}
}

func emitGenAIUsageMetadata(
	ctx context.Context,
	eventCh chan<- StreamEvent,
	usageMetadata *genai.GenerateContentResponseUsageMetadata,
	finishReason genai.FinishReason,
) {
	if usageMetadata == nil || finishReason == "" {
		return
	}

	usage := &Usage{
		InputTokens:    int(usageMetadata.PromptTokenCount),
		OutputTokens:   int(usageMetadata.CandidatesTokenCount),
		TotalTokens:    int(usageMetadata.TotalTokenCount),
		ThinkingTokens: 0,
	}

	if usageMetadata.ThoughtsTokenCount > 0 {
		usage.ThinkingTokens = int(usageMetadata.ThoughtsTokenCount)
	}

	sendStreamEvent(ctx, eventCh, newStreamEventDone(
		mapGenAIFinishReason(finishReason),
		usage,
	))
}

// sendStreamEvent sends an event to the channel, respecting context cancellation.
func sendStreamEvent(ctx context.Context, eventCh chan<- StreamEvent, event StreamEvent) {
	select {
	case eventCh <- event:
	case <-ctx.Done():
	}
}
