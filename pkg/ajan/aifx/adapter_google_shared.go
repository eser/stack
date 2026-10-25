package aifx

import (
	"context"
	"encoding/json"
	"errors"
)

// genaiRoleUser is the role name for user messages in the generateContent API.
const genaiRoleUser = "user"

// genaiRoleModel is the role name for assistant/model messages in the generateContent API.
const genaiRoleModel = "model"

// Sentinel errors shared across Google adapters.
var ErrGenAINilResponse = errors.New("genai returned nil response")

// mapMessagesToGenAI converts unified messages to genai Content slices.
// Gemini uses "user" and "model" as role names; "assistant" is mapped to "model".
// System messages are excluded here (they go into SystemInstruction).
// Tool result messages are mapped as "user" role with FunctionResponse parts.
func mapMessagesToGenAI(messages []Message) []*genaiContent {
	contents := make([]*genaiContent, 0, len(messages))

	for _, msg := range messages {
		// Skip system messages -- they are handled separately via SystemInstruction.
		if msg.Role == RoleSystem {
			continue
		}

		role := mapRoleToGenAI(msg.Role)
		parts := mapContentBlocksToGenAIParts(msg.Content)

		if len(parts) > 0 {
			contents = append(contents, &genaiContent{
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
func mapContentBlocksToGenAIParts(blocks []ContentBlock) []*genaiPart {
	parts := make([]*genaiPart, 0, len(blocks))

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
func mapSingleBlockToGenAIPart(block *ContentBlock) *genaiPart { //nolint:cyclop
	switch block.Type {
	case ContentBlockText:
		return &genaiPart{ //nolint:exhaustruct
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
func mapImagePartToGenAI(img *ImagePart) *genaiPart {
	// If raw data is already available, use InlineData.
	if len(img.Data) > 0 {
		mimeType := img.MIMEType
		if mimeType == "" {
			mimeType = "image/png"
		}

		return &genaiPart{ //nolint:exhaustruct
			InlineData: &genaiBlob{ //nolint:exhaustruct
				MIMEType: mimeType,
				Data:     img.Data,
			},
		}
	}

	// If the URL is a data: URI, decode it.
	if IsDataURL(img.URL) {
		mimeType, data, err := DecodeDataURL(img.URL)
		if err == nil {
			return &genaiPart{ //nolint:exhaustruct
				InlineData: &genaiBlob{ //nolint:exhaustruct
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

	return &genaiPart{ //nolint:exhaustruct
		FileData: &genaiFileData{ //nolint:exhaustruct
			MIMEType: mimeType,
			FileURI:  img.URL,
		},
	}
}

// mapAudioPartToGenAI converts an AudioPart to a genai Part.
func mapAudioPartToGenAI(audio *AudioPart) *genaiPart {
	if len(audio.Data) > 0 {
		mimeType := audio.MIMEType
		if mimeType == "" {
			mimeType = "audio/mpeg"
		}

		return &genaiPart{ //nolint:exhaustruct
			InlineData: &genaiBlob{ //nolint:exhaustruct
				MIMEType: mimeType,
				Data:     audio.Data,
			},
		}
	}

	if IsDataURL(audio.URL) {
		mimeType, data, err := DecodeDataURL(audio.URL)
		if err == nil {
			return &genaiPart{ //nolint:exhaustruct
				InlineData: &genaiBlob{ //nolint:exhaustruct
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

	return &genaiPart{ //nolint:exhaustruct
		FileData: &genaiFileData{ //nolint:exhaustruct
			MIMEType: mimeType,
			FileURI:  audio.URL,
		},
	}
}

// mapFilePartToGenAI converts a FilePart to a genai Part.
func mapFilePartToGenAI(file *FilePart) *genaiPart {
	mimeType := file.MIMEType
	if mimeType == "" {
		mimeType = DetectMIMEFromURL(file.URI)
	}

	return &genaiPart{ //nolint:exhaustruct
		FileData: &genaiFileData{ //nolint:exhaustruct
			MIMEType: mimeType,
			FileURI:  file.URI,
		},
	}
}

// mapToolCallToGenAIPart converts a ToolCall to a genai FunctionCall Part.
func mapToolCallToGenAIPart(toolCall *ToolCall) *genaiPart {
	var args map[string]any
	if len(toolCall.Arguments) > 0 {
		_ = json.Unmarshal(toolCall.Arguments, &args)
	}

	return &genaiPart{ //nolint:exhaustruct
		FunctionCall: &genaiFunctionCall{ //nolint:exhaustruct
			Name: toolCall.Name,
			Args: args,
		},
	}
}

// mapToolResultToGenAIPart converts a ToolResult to a genai FunctionResponse Part.
func mapToolResultToGenAIPart(toolResult *ToolResult) *genaiPart {
	response := map[string]any{
		"result": toolResult.Content,
	}

	if toolResult.IsError {
		response["error"] = toolResult.Content
	}

	return &genaiPart{ //nolint:exhaustruct
		FunctionResponse: &genaiFunctionResponse{ //nolint:exhaustruct
			Name:     toolResult.ToolCallID,
			Response: response,
		},
	}
}

// mapToolsToGenAI converts unified tool definitions to genai Tool format.
// Uses ParametersJsonSchema for JSON Schema parameters.
func mapToolsToGenAI(tools []ToolDefinition) ([]*genaiTool, error) {
	if len(tools) == 0 {
		return nil, nil
	}

	declarations := make([]*genaiFunctionDeclaration, 0, len(tools))

	for idx := range tools {
		tool := &tools[idx]
		decl := &genaiFunctionDeclaration{ //nolint:exhaustruct
			Name:        tool.Name,
			Description: tool.Description,
		}

		// Convert JSON Schema parameters to the map[string]any format
		// expected by ParametersJsonSchema.
		schemaMap, err := decodeToolParameters(tool)
		if err != nil {
			return nil, err
		}

		// A nil map stored in the field would be sent as null.
		if schemaMap != nil {
			decl.ParametersJSONSchema = schemaMap
		}

		declarations = append(declarations, decl)
	}

	return []*genaiTool{
		{
			FunctionDeclarations: declarations,
		},
	}, nil
}

// mapSafetySettings converts unified safety settings to genai SafetySetting format.
func mapSafetySettings(settings []SafetySetting) []*genaiSafetySetting {
	if len(settings) == 0 {
		return nil
	}

	genaiSettings := make([]*genaiSafetySetting, 0, len(settings))

	for idx := range settings {
		setting := &settings[idx]

		genaiSettings = append(genaiSettings, &genaiSafetySetting{ //nolint:exhaustruct
			Category:  setting.Category,
			Threshold: setting.Threshold,
		})
	}

	return genaiSettings
}

// buildSystemInstruction creates the content of the system instruction.
func buildSystemInstruction(system string) *genaiContent {
	if system == "" {
		return nil
	}

	return &genaiContent{ //nolint:exhaustruct
		Parts: []*genaiPart{
			{Text: system},
		},
	}
}

// buildGenerateContentConfig constructs the generateContent settings from
// unified options. A tool or response schema that does not decode fails here,
// before the request is sent.
func buildGenerateContentConfig(
	opts *GenerateTextOptions,
) (*genaiGenerateContentConfig, error) {
	config := &genaiGenerateContentConfig{} //nolint:exhaustruct

	// System instruction.
	config.SystemInstruction = buildSystemInstruction(opts.System)

	applyGenAIGenerationParams(config, opts)

	err := applyGenAITools(config, opts)
	if err != nil {
		return nil, err
	}

	applyGenAISafetySettings(config, opts)

	err = applyGenAIResponseFormat(config, opts)
	if err != nil {
		return nil, err
	}

	err = applyGenAIThinkingConfig(config, opts)
	if err != nil {
		return nil, err
	}

	return config, nil
}

func applyGenAIGenerationParams(
	config *genaiGenerateContentConfig,
	opts *GenerateTextOptions,
) {
	if opts.MaxTokens > 0 {
		config.MaxOutputTokens = int32(opts.MaxTokens)
	}

	if opts.Temperature != nil {
		config.Temperature = new(float32(*opts.Temperature))
	}

	if opts.TopP != nil {
		config.TopP = new(float32(*opts.TopP))
	}

	if len(opts.StopWords) > 0 {
		config.StopSequences = opts.StopWords
	}
}

func applyGenAITools(
	config *genaiGenerateContentConfig,
	opts *GenerateTextOptions,
) error {
	tools, err := mapToolsToGenAI(opts.Tools)
	if err != nil {
		return err
	}

	config.Tools = tools

	return nil
}

func applyGenAISafetySettings(
	config *genaiGenerateContentConfig,
	opts *GenerateTextOptions,
) {
	if len(opts.SafetySettings) > 0 {
		config.SafetySettings = mapSafetySettings(opts.SafetySettings)
	}
}

// applyGenAIResponseFormat sends a json_schema format as responseJsonSchema
// with the application/json MIME type, and json_object as the MIME type alone,
// which asks for any JSON. responseSchema stays unset: the API takes only one
// of the two schema fields.
func applyGenAIResponseFormat(
	config *genaiGenerateContentConfig,
	opts *GenerateTextOptions,
) error {
	if opts.ResponseFormat == nil {
		return nil
	}

	switch opts.ResponseFormat.Type {
	case "json_schema":
		schema, err := decodeResponseSchema(opts.ResponseFormat.JSONSchema)
		if err != nil {
			return err
		}

		config.ResponseMIMEType = "application/json"
		config.ResponseJSONSchema = schema
	case "json_object":
		config.ResponseMIMEType = "application/json"
	case "text":
		config.ResponseMIMEType = "text/plain"
	}

	return nil
}

// applyGenAIThinkingConfig sends the effort level as thinkingLevel, or else the
// thinking budget as thinkingBudget. The API rejects a request that sets both,
// so an explicit Effort wins over the budget, as it does on anthropic and
// openai. An unknown level fails here, before the request is sent.
func applyGenAIThinkingConfig(
	config *genaiGenerateContentConfig,
	opts *GenerateTextOptions,
) error {
	err := checkEffort(opts.Effort)
	if err != nil {
		return err
	}

	if opts.Effort != EffortDefault {
		config.ThinkingConfig = &genaiThinkingConfig{ //nolint:exhaustruct
			ThinkingLevel: mapGenAIThinkingLevel(opts.Effort),
		}

		return nil
	}

	if opts.ThinkingBudget != nil {
		config.ThinkingConfig = &genaiThinkingConfig{ //nolint:exhaustruct
			ThinkingBudget: new(int32(*opts.ThinkingBudget)),
		}
	}

	return nil
}

// mapGenAIThinkingLevel maps an effort level to a Gemini thinking level.
// Gemini's levels stop at HIGH, so xhigh and max send HIGH. The levels a model
// takes differ per model (gemini-3-pro-preview has no MEDIUM) and are not
// checked here; the API answers for the model, as on openai.
func mapGenAIThinkingLevel(effort Effort) genaiThinkingLevel {
	switch effort {
	case EffortLow:
		return genaiThinkingLevelLow
	case EffortMedium:
		return genaiThinkingLevelMedium
	case EffortHigh, EffortXHigh, EffortMax:
		return genaiThinkingLevelHigh
	case EffortDefault:
		return ""
	}

	return ""
}

// mapGenAIResponse converts a genai GenerateContentResponse to the unified GenerateTextResult.
func mapGenAIResponse(
	resp *genaiGenerateContentResponse,
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

	// Extract content from first candidate. A blocked prompt has none.
	if len(resp.Candidates) == 0 {
		if genAIPromptBlocked(resp) {
			result.StopReason = StopReasonRefusal
		}

		return result, nil
	}

	candidate := resp.Candidates[0]

	// Map content parts.
	if candidate.Content != nil {
		result.Content = mapGenAIPartsToContentBlocks(candidate.Content.Parts)
	}

	// Map finish reason.
	result.StopReason = mapGenAIFinishReason(candidate.FinishReason, hasToolCall(result.Content))

	return result, nil
}

// genAIPromptBlocked reports whether a filter blocked the prompt itself. The
// response then has no candidates and names the filter in promptFeedback.
func genAIPromptBlocked(resp *genaiGenerateContentResponse) bool {
	if resp.PromptFeedback == nil {
		return false
	}

	reason := resp.PromptFeedback.BlockReason

	return reason != "" && reason != genaiBlockedReasonUnspecified
}

// hasToolCall reports whether any block is a tool call.
func hasToolCall(blocks []ContentBlock) bool {
	for _, block := range blocks {
		if block.Type == ContentBlockToolCall {
			return true
		}
	}

	return false
}

// mapGenAIFinishReason converts a genai FinishReason to the unified StopReason.
//
// The content filters (safety, blocklist, prohibited content, personal data,
// recitation and their image variants) withhold the answer, so they map to
// refusal. Gemini ends a turn that called a tool with STOP, so calledTool turns
// that into tool_use. Any other reason has no closer match than stop.
func mapGenAIFinishReason(reason genaiFinishReason, calledTool bool) StopReason {
	switch reason { //nolint:exhaustive
	case genaiFinishReasonStop:
		if calledTool {
			return StopReasonToolUse
		}

		return StopReasonEndTurn
	case genaiFinishReasonMaxTokens:
		return StopReasonMaxTokens
	case genaiFinishReasonSafety,
		genaiFinishReasonBlocklist,
		genaiFinishReasonProhibitedContent,
		genaiFinishReasonSPII,
		genaiFinishReasonRecitation,
		genaiFinishReasonImageSafety,
		genaiFinishReasonImageProhibitedContent,
		genaiFinishReasonImageRecitation:
		return StopReasonRefusal
	default:
		return StopReasonStop
	}
}

// mapGenAIPartsToContentBlocks converts genai Parts to unified ContentBlock slices.
func mapGenAIPartsToContentBlocks(parts []*genaiPart) []ContentBlock {
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
				Thinking:   nil,
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
				Thinking:   nil,
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
				Thinking:   nil,
			})
		}
	}

	return blocks
}

// genAIStreamMapper turns the chunks of one genai stream into stream events.
// Shared by Gemini and Vertex AI streaming. It remembers a tool call across
// chunks, since the chunk that ends the turn need not be the one with the call.
type genAIStreamMapper struct {
	calledTool bool
}

// emit sends the events of one chunk. The chunk that ends the turn sends the
// done event even without content: a filtered answer can arrive as a finish
// reason with no parts, and a blocked prompt as a chunk with no candidates.
func (s *genAIStreamMapper) emit(
	ctx context.Context,
	eventCh chan<- StreamEvent,
	resp *genaiGenerateContentResponse,
) {
	if resp == nil {
		return
	}

	if len(resp.Candidates) == 0 {
		if genAIPromptBlocked(resp) {
			emitGenAIDone(ctx, eventCh, resp.UsageMetadata, StopReasonRefusal)
		}

		return
	}

	candidate := resp.Candidates[0]

	if candidate.Content != nil && emitGenAIContentParts(ctx, eventCh, candidate.Content.Parts) {
		s.calledTool = true
	}

	if candidate.FinishReason != "" {
		emitGenAIDone(
			ctx, eventCh, resp.UsageMetadata, mapGenAIFinishReason(candidate.FinishReason, s.calledTool),
		)
	}
}

// emitGenAIContentParts sends the text and tool calls of parts, and reports
// whether one of them called a tool.
func emitGenAIContentParts(
	ctx context.Context,
	eventCh chan<- StreamEvent,
	parts []*genaiPart,
) bool {
	calledTool := false

	for _, part := range parts {
		if part == nil {
			continue
		}

		if part.Text != "" {
			sendStreamEvent(ctx, eventCh, newStreamEventContentDelta(part.Text))
		}

		if part.FunctionCall != nil {
			calledTool = true

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

	return calledTool
}

// emitGenAIDone sends the done event with the usage, which is nil when the
// chunk carried no usage metadata.
func emitGenAIDone(
	ctx context.Context,
	eventCh chan<- StreamEvent,
	usageMetadata *genaiUsageMetadata,
	stopReason StopReason,
) {
	var usage *Usage

	if usageMetadata != nil {
		usage = &Usage{
			InputTokens:    int(usageMetadata.PromptTokenCount),
			OutputTokens:   int(usageMetadata.CandidatesTokenCount),
			TotalTokens:    int(usageMetadata.TotalTokenCount),
			ThinkingTokens: int(usageMetadata.ThoughtsTokenCount),
		}
	}

	sendStreamEvent(ctx, eventCh, newStreamEventDone(stopReason, usage))
}

// sendStreamEvent sends an event to the channel, respecting context cancellation.
