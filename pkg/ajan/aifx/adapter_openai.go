package aifx

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"strings"
	"time"

	"github.com/openai/openai-go"
	"github.com/openai/openai-go/option"
	"github.com/openai/openai-go/packages/ssestream"
	"github.com/openai/openai-go/shared"
)

// Sentinel errors for the OpenAI adapter.
var (
	ErrOpenAIGenerationFailed = errors.New("openai generation failed")
	ErrOpenAIStreamFailed     = errors.New("openai stream failed")
	ErrOpenAIBatchFailed      = errors.New("openai batch failed")
)

const openaiProviderName = "openai"

// classifyOpenAIError wraps err with the provider sentinel and, when the underlying
// error is an OpenAI API error, inserts a provider-agnostic classification sentinel
// (e.g. ErrRateLimited) so callers can use errors.Is without importing the SDK.
func classifyOpenAIError(providerSentinel error, err error) error {
	ctxErr := classifyContextError(providerSentinel, err)
	if ctxErr != nil {
		return ctxErr
	}

	var apiErr *openai.Error
	if errors.As(err, &apiErr) {
		return classifyAndWrap(providerSentinel, apiErr.StatusCode, err)
	}

	return fmt.Errorf("%w: %w", providerSentinel, err)
}

// openAIModelFactory creates OpenAI language models.
type openAIModelFactory struct{}

// NewOpenAIModelFactory returns a ProviderFactory for OpenAI models.
func NewOpenAIModelFactory() ProviderFactory { //nolint:ireturn
	return &openAIModelFactory{}
}

func (f *openAIModelFactory) GetProvider() string {
	return openaiProviderName
}

func (f *openAIModelFactory) CreateModel(
	ctx context.Context,
	config *ConfigTarget,
) (LanguageModel, error) { //nolint:ireturn
	if config.APIKey == "" {
		return nil, fmt.Errorf("%w: %w", ErrOpenAIGenerationFailed, ErrInvalidAPIKey)
	}

	if config.Model == "" {
		return nil, fmt.Errorf("%w: %w", ErrOpenAIGenerationFailed, ErrInvalidModel)
	}

	opts := []option.RequestOption{
		option.WithAPIKey(config.APIKey),
	}

	if config.BaseURL != "" {
		opts = append(opts, option.WithBaseURL(config.BaseURL))
	}

	if config.RequestTimeout > 0 {
		opts = append(opts, option.WithRequestTimeout(config.RequestTimeout))
	}

	client := openai.NewClient(opts...)

	return &OpenAIModel{
		client: client,
		config: config,
	}, nil
}

// OpenAIModel implements LanguageModel and BatchCapableModel for OpenAI.
type OpenAIModel struct {
	client openai.Client
	config *ConfigTarget
}

func (m *OpenAIModel) GetCapabilities() []ProviderCapability {
	return []ProviderCapability{
		CapabilityTextGeneration,
		CapabilityStreaming,
		CapabilityToolCalling,
		CapabilityVision,
		CapabilityAudio,
		CapabilityBatchProcessing,
		CapabilityStructuredOut,
		CapabilityReasoning,
	}
}

func (m *OpenAIModel) GetProvider() string {
	return openaiProviderName
}

func (m *OpenAIModel) GetModelID() string {
	return m.config.Model
}

func (m *OpenAIModel) GetRawClient() any {
	return &m.client
}

func (m *OpenAIModel) Close(_ context.Context) error {
	return nil
}

// GenerateText performs a non-streaming text generation via OpenAI Chat Completions.
func (m *OpenAIModel) GenerateText(
	ctx context.Context,
	opts *GenerateTextOptions,
) (*GenerateTextResult, error) {
	params, err := m.buildParams(opts)
	if err != nil {
		return nil, classifyOpenAIError(ErrOpenAIGenerationFailed, err)
	}

	completion, err := m.client.Chat.Completions.New(ctx, params)
	if err != nil {
		return nil, classifyOpenAIError(ErrOpenAIGenerationFailed, err)
	}

	result := m.mapCompletionToResult(completion)
	result.RawRequest = params
	result.RawResponse = completion

	return result, nil
}

// StreamText performs a streaming text generation via OpenAI Chat Completions.
func (m *OpenAIModel) StreamText(
	ctx context.Context,
	opts *StreamTextOptions,
) (*StreamIterator, error) {
	params, err := m.buildParams(opts)
	if err != nil {
		return nil, classifyOpenAIError(ErrOpenAIStreamFailed, err)
	}

	streamCtx, cancel := context.WithCancel(ctx)
	eventCh := make(chan StreamEvent, 64) //nolint:mnd

	stream := m.client.Chat.Completions.NewStreaming(streamCtx, params)

	go m.processStream(stream, eventCh, cancel)

	return NewStreamIterator(eventCh, cancel), nil
}

// SubmitBatch submits a batch of generation requests via the OpenAI Batch API.
func (m *OpenAIModel) SubmitBatch(
	ctx context.Context,
	req *BatchRequest,
) (*BatchJob, error) {
	// Build JSONL payload for the batch.
	jsonlData, err := m.buildBatchJSONL(req)
	if err != nil {
		return nil, classifyOpenAIError(ErrOpenAIBatchFailed, err)
	}

	// Upload the JSONL file.
	uploadedFile, err := m.client.Files.New(ctx, openai.FileNewParams{
		File:    bytes.NewReader(jsonlData),
		Purpose: openai.FilePurposeBatch,
	})
	if err != nil {
		return nil, fmt.Errorf("file upload: %w", classifyOpenAIError(ErrOpenAIBatchFailed, err))
	}

	// Create the batch.
	batch, err := m.client.Batches.New(ctx, openai.BatchNewParams{ //nolint:exhaustruct
		InputFileID:      uploadedFile.ID,
		Endpoint:         openai.BatchNewParamsEndpointV1ChatCompletions,
		CompletionWindow: openai.BatchNewParamsCompletionWindow24h,
	})
	if err != nil {
		return nil, fmt.Errorf("batch create: %w", classifyOpenAIError(ErrOpenAIBatchFailed, err))
	}

	return mapOpenAIBatchToJob(batch), nil
}

// GetBatchJob retrieves the current status of a batch job.
func (m *OpenAIModel) GetBatchJob(
	ctx context.Context,
	jobID string,
) (*BatchJob, error) {
	batch, err := m.client.Batches.Get(ctx, jobID)
	if err != nil {
		return nil, classifyOpenAIError(ErrOpenAIBatchFailed, err)
	}

	return mapOpenAIBatchToJob(batch), nil
}

// ListBatchJobs lists batch jobs.
func (m *OpenAIModel) ListBatchJobs(
	ctx context.Context,
	opts *ListBatchOptions,
) ([]*BatchJob, error) {
	params := openai.BatchListParams{} //nolint:exhaustruct

	if opts != nil {
		if opts.Limit > 0 {
			params.Limit = openai.Int(int64(opts.Limit))
		}

		if opts.After != "" {
			params.After = openai.String(opts.After)
		}
	}

	page, err := m.client.Batches.List(ctx, params)
	if err != nil {
		return nil, classifyOpenAIError(ErrOpenAIBatchFailed, err)
	}

	jobs := make([]*BatchJob, 0, len(page.Data))
	for idx := range page.Data {
		jobs = append(jobs, mapOpenAIBatchToJob(&page.Data[idx]))
	}

	return jobs, nil
}

// DownloadBatchResults downloads the results of a completed batch job.
func (m *OpenAIModel) DownloadBatchResults(
	ctx context.Context,
	job *BatchJob,
) ([]*BatchResult, error) {
	if job.Storage == nil || job.Storage.OutputRef == "" {
		return nil, fmt.Errorf("%w: no output file reference", ErrOpenAIBatchFailed)
	}

	content, err := m.client.Files.Content(ctx, job.Storage.OutputRef)
	if err != nil {
		return nil, fmt.Errorf(
			"download output: %w",
			classifyOpenAIError(ErrOpenAIBatchFailed, err),
		)
	}

	defer func() { _ = content.Body.Close() }()

	body, err := io.ReadAll(content.Body)
	if err != nil {
		return nil, fmt.Errorf("read output: %w", classifyOpenAIError(ErrOpenAIBatchFailed, err))
	}

	return m.parseBatchResults(body)
}

// CancelBatchJob cancels a running batch job.
func (m *OpenAIModel) CancelBatchJob(
	ctx context.Context,
	jobID string,
) error {
	_, err := m.client.Batches.Cancel(ctx, jobID)
	if err != nil {
		return classifyOpenAIError(ErrOpenAIBatchFailed, err)
	}

	return nil
}

// processStream reads from the OpenAI streaming response and maps events to the
// unified StreamEvent channel.
func (m *OpenAIModel) processStream(
	stream *ssestream.Stream[openai.ChatCompletionChunk],
	eventCh chan<- StreamEvent,
	cancel context.CancelFunc,
) {
	defer close(eventCh)
	defer cancel()

	acc := openai.ChatCompletionAccumulator{} //nolint:exhaustruct

	for stream.Next() {
		chunk := stream.Current()
		acc.AddChunk(chunk)

		// Emit text content deltas.
		if len(chunk.Choices) > 0 && chunk.Choices[0].Delta.Content != "" {
			eventCh <- newStreamEventContentDelta(chunk.Choices[0].Delta.Content)
		}

		// Detect finished tool calls via the accumulator.
		if tool, ok := acc.JustFinishedToolCall(); ok {
			eventCh <- newStreamEventToolCall(&ToolCall{
				ID:        tool.ID,
				Name:      tool.Name,
				Arguments: json.RawMessage(tool.Arguments),
			})
		}
	}

	err := stream.Err()
	if err != nil {
		eventCh <- newStreamEventError(classifyOpenAIError(ErrOpenAIStreamFailed, err))

		return
	}

	// Emit the final message-done event with usage and stop reason.
	var usage *Usage
	if acc.Usage.TotalTokens > 0 {
		usage = &Usage{
			InputTokens:    int(acc.Usage.PromptTokens),
			OutputTokens:   int(acc.Usage.CompletionTokens),
			TotalTokens:    int(acc.Usage.TotalTokens),
			ThinkingTokens: 0,
		}
	}

	var stopReason StopReason
	if len(acc.Choices) > 0 {
		stopReason = mapOpenAIFinishReason(acc.Choices[0].FinishReason)
	}

	eventCh <- newStreamEventDone(stopReason, usage)
}

// buildParams maps unified GenerateTextOptions to OpenAI ChatCompletionNewParams.
func (m *OpenAIModel) buildParams(
	opts *GenerateTextOptions,
) (openai.ChatCompletionNewParams, error) {
	params := openai.ChatCompletionNewParams{ //nolint:exhaustruct
		Model: m.config.Model,
	}

	messages, err := m.buildOpenAIMessages(opts)
	if err != nil {
		return params, err
	}

	params.Messages = messages

	err = m.applyOpenAITools(&params, opts)
	if err != nil {
		return params, err
	}

	m.applyOpenAIOptions(&params, opts)

	return params, nil
}

func (m *OpenAIModel) buildOpenAIMessages(
	opts *GenerateTextOptions,
) ([]openai.ChatCompletionMessageParamUnion, error) {
	messages := make([]openai.ChatCompletionMessageParamUnion, 0, len(opts.Messages)+1)

	if opts.System != "" {
		messages = append(messages, openai.DeveloperMessage(opts.System))
	}

	for _, msg := range opts.Messages {
		mapped, err := m.mapMessage(msg)
		if err != nil {
			return nil, err
		}

		messages = append(messages, mapped...)
	}

	return messages, nil
}

func (m *OpenAIModel) applyOpenAITools(
	params *openai.ChatCompletionNewParams,
	opts *GenerateTextOptions,
) error {
	if len(opts.Tools) > 0 {
		tools := make([]openai.ChatCompletionToolParam, 0, len(opts.Tools))

		for _, tool := range opts.Tools {
			var schemaMap map[string]any
			if len(tool.Parameters) > 0 {
				err := json.Unmarshal(tool.Parameters, &schemaMap)
				if err != nil {
					return fmt.Errorf(
						"failed to unmarshal tool parameters for %q: %w",
						tool.Name,
						err,
					)
				}
			}

			tools = append(tools, openai.ChatCompletionToolParam{ //nolint:exhaustruct
				Function: shared.FunctionDefinitionParam{ //nolint:exhaustruct
					Name:        tool.Name,
					Description: openai.String(tool.Description),
					Parameters:  shared.FunctionParameters(schemaMap),
				},
			})
		}

		params.Tools = tools
	}

	if opts.ToolChoice != "" {
		params.ToolChoice = mapOpenAIToolChoice(opts.ToolChoice)
	}

	return nil
}

func (m *OpenAIModel) applyOpenAIOptions(
	params *openai.ChatCompletionNewParams,
	opts *GenerateTextOptions,
) {
	if opts.ResponseFormat != nil {
		params.ResponseFormat = mapOpenAIResponseFormat(opts.ResponseFormat)
	}

	if opts.ThinkingBudget != nil {
		params.ReasoningEffort = mapOpenAIReasoningEffort(*opts.ThinkingBudget)
	}

	if opts.MaxTokens > 0 {
		params.MaxCompletionTokens = openai.Int(int64(opts.MaxTokens))
	}

	if opts.Temperature != nil {
		params.Temperature = openai.Float(*opts.Temperature)
	}

	if opts.TopP != nil {
		params.TopP = openai.Float(*opts.TopP)
	}

	if len(opts.StopWords) > 0 {
		params.Stop = openai.ChatCompletionNewParamsStopUnion{ //nolint:exhaustruct
			OfStringArray: opts.StopWords,
		}
	}
}

// mapMessage converts a unified Message to one or more OpenAI message params.
func (m *OpenAIModel) mapMessage(msg Message) ([]openai.ChatCompletionMessageParamUnion, error) {
	switch msg.Role {
	case RoleUser:
		return m.mapUserMessage(msg)
	case RoleAssistant:
		return m.mapAssistantMessage(msg)
	case RoleSystem:
		return m.mapSystemMessage(msg)
	case RoleTool:
		return m.mapToolMessage(msg)
	default:
		return nil, fmt.Errorf("%w: unknown role %q", ErrOpenAIGenerationFailed, msg.Role)
	}
}

func (m *OpenAIModel) mapUserMessage(
	msg Message,
) ([]openai.ChatCompletionMessageParamUnion, error) {
	// If there are multimodal content blocks, build content parts.
	hasMultimodal := false

	for _, block := range msg.Content {
		if block.Type == ContentBlockImage || block.Type == ContentBlockAudio {
			hasMultimodal = true

			break
		}
	}

	if !hasMultimodal {
		// Simple text message.
		text := openaiExtractText(msg.Content)

		return []openai.ChatCompletionMessageParamUnion{
			openai.UserMessage(text),
		}, nil
	}

	return m.mapMultimodalUserMessage(msg)
}

func (m *OpenAIModel) mapMultimodalUserMessage(
	msg Message,
) ([]openai.ChatCompletionMessageParamUnion, error) {
	parts := make([]openai.ChatCompletionContentPartUnionParam, 0, len(msg.Content))

	for _, block := range msg.Content {
		switch block.Type { //nolint:exhaustive
		case ContentBlockText:
			parts = append(parts, openai.TextContentPart(block.Text))

		case ContentBlockImage:
			if block.Image != nil {
				detail := "auto"

				switch block.Image.Detail {
				case ImageDetailLow:
					detail = "low"
				case ImageDetailHigh:
					detail = "high"
				case ImageDetailAuto, "":
					detail = "auto"
				}

				parts = append(
					parts,
					openai.ImageContentPart(openai.ChatCompletionContentPartImageImageURLParam{
						URL:    block.Image.URL,
						Detail: detail,
					}),
				)
			}

		case ContentBlockAudio:
			if block.Audio != nil {
				audioFormat := mapOpenAIAudioFormat(block.Audio.MIMEType)

				parts = append(
					parts,
					openai.ChatCompletionContentPartUnionParam{ //nolint:exhaustruct
						OfInputAudio: &openai.ChatCompletionContentPartInputAudioParam{ //nolint:exhaustruct
							InputAudio: openai.ChatCompletionContentPartInputAudioInputAudioParam{
								Data:   block.Audio.URL,
								Format: audioFormat,
							},
						},
					},
				)
			}
		}
	}

	return []openai.ChatCompletionMessageParamUnion{
		openai.UserMessage(parts),
	}, nil
}

func (m *OpenAIModel) mapAssistantMessage(
	msg Message,
) ([]openai.ChatCompletionMessageParamUnion, error) {
	results := make([]openai.ChatCompletionMessageParamUnion, 0, 1)

	// Check if this message has tool calls.
	var toolCalls []openai.ChatCompletionMessageToolCallParam

	text := ""

	for _, block := range msg.Content {
		switch block.Type { //nolint:exhaustive
		case ContentBlockText:
			text += block.Text

		case ContentBlockToolCall:
			if block.ToolCall != nil {
				toolCalls = append(
					toolCalls,
					openai.ChatCompletionMessageToolCallParam{ //nolint:exhaustruct
						ID: block.ToolCall.ID,
						Function: openai.ChatCompletionMessageToolCallFunctionParam{
							Name:      block.ToolCall.Name,
							Arguments: string(block.ToolCall.Arguments),
						},
					},
				)
			}
		}
	}

	assistantMsg := openai.ChatCompletionAssistantMessageParam{} //nolint:exhaustruct
	if text != "" {
		assistantMsg.Content = openai.ChatCompletionAssistantMessageParamContentUnion{ //nolint:exhaustruct
			OfString: openai.String(text),
		}
	}

	if len(toolCalls) > 0 {
		assistantMsg.ToolCalls = toolCalls
	}

	results = append(results, openai.ChatCompletionMessageParamUnion{ //nolint:exhaustruct
		OfAssistant: &assistantMsg,
	})

	return results, nil
}

func (m *OpenAIModel) mapSystemMessage(
	msg Message,
) ([]openai.ChatCompletionMessageParamUnion, error) {
	text := openaiExtractText(msg.Content)

	return []openai.ChatCompletionMessageParamUnion{
		openai.DeveloperMessage(text),
	}, nil
}

func (m *OpenAIModel) mapToolMessage(
	msg Message,
) ([]openai.ChatCompletionMessageParamUnion, error) {
	var results []openai.ChatCompletionMessageParamUnion

	for _, block := range msg.Content {
		if block.Type == ContentBlockToolResult && block.ToolResult != nil {
			results = append(results, openai.ToolMessage(
				block.ToolResult.ToolCallID,
				block.ToolResult.Content,
			))
		}
	}

	return results, nil
}

// mapCompletionToResult maps an OpenAI ChatCompletion to our unified GenerateTextResult.
func (m *OpenAIModel) mapCompletionToResult(completion *openai.ChatCompletion) *GenerateTextResult {
	result := &GenerateTextResult{
		Content:    nil,
		StopReason: "",
		ModelID:    completion.Model,
		Usage: Usage{
			InputTokens:    int(completion.Usage.PromptTokens),
			OutputTokens:   int(completion.Usage.CompletionTokens),
			TotalTokens:    int(completion.Usage.TotalTokens),
			ThinkingTokens: 0,
		},
		RawRequest:  nil,
		RawResponse: nil,
	}

	if len(completion.Choices) == 0 {
		return result
	}

	choice := completion.Choices[0]
	result.StopReason = mapOpenAIFinishReason(choice.FinishReason)

	content := make([]ContentBlock, 0, len(choice.Message.ToolCalls)+1)

	// Add text content.
	if choice.Message.Content != "" {
		content = append(content, ContentBlock{
			Type:       ContentBlockText,
			Text:       choice.Message.Content,
			Image:      nil,
			Audio:      nil,
			File:       nil,
			ToolCall:   nil,
			ToolResult: nil,
		})
	}

	// Add tool calls.
	for _, toolCall := range choice.Message.ToolCalls {
		content = append(content, ContentBlock{
			Type:  ContentBlockToolCall,
			Text:  "",
			Image: nil,
			Audio: nil,
			File:  nil,
			ToolCall: &ToolCall{
				ID:        toolCall.ID,
				Name:      toolCall.Function.Name,
				Arguments: json.RawMessage(toolCall.Function.Arguments),
			},
			ToolResult: nil,
		})
	}

	result.Content = content

	return result
}

// buildBatchJSONL constructs a JSONL payload for the OpenAI Batch API.
func (m *OpenAIModel) buildBatchJSONL(req *BatchRequest) ([]byte, error) {
	var buf bytes.Buffer

	for _, item := range req.Items {
		params, err := m.buildParams(&item.Options)
		if err != nil {
			return nil, fmt.Errorf("build params for %q: %w", item.CustomID, err)
		}

		line := openAIBatchRequestLine{
			CustomID: item.CustomID,
			Method:   "POST",
			URL:      "/v1/chat/completions",
			Body:     params,
		}

		data, err := json.Marshal(line)
		if err != nil {
			return nil, fmt.Errorf("marshal batch line for %q: %w", item.CustomID, err)
		}

		buf.Write(data)
		buf.WriteByte('\n')
	}

	return buf.Bytes(), nil
}

// openAIBatchRequestLine represents a single line in the JSONL batch input file.
type openAIBatchRequestLine struct {
	CustomID string                         `json:"custom_id"`
	Method   string                         `json:"method"`
	URL      string                         `json:"url"`
	Body     openai.ChatCompletionNewParams `json:"body"`
}

// openAIBatchResponseLine represents a single line in the JSONL batch output file.
type openAIBatchResponseLine struct {
	ID       string `json:"id"`
	CustomID string `json:"custom_id"`
	Response struct {
		StatusCode int             `json:"status_code"`
		Body       json.RawMessage `json:"body"`
	} `json:"response"`
	Error *struct {
		Code    string `json:"code"`
		Message string `json:"message"`
	} `json:"error"`
}

// parseBatchResults parses the JSONL output from a completed batch.
func (m *OpenAIModel) parseBatchResults(data []byte) ([]*BatchResult, error) {
	results := make([]*BatchResult, 0, bytes.Count(data, []byte("\n"))+1)

	lines := bytes.SplitSeq(data, []byte("\n"))
	for line := range lines {
		trimmed := bytes.TrimSpace(line)
		if len(trimmed) == 0 {
			continue
		}

		var respLine openAIBatchResponseLine

		err := json.Unmarshal(trimmed, &respLine)
		if err != nil {
			return nil, fmt.Errorf("%w: parse response line: %w", ErrOpenAIBatchFailed, err)
		}

		batchResult := &BatchResult{
			CustomID: respLine.CustomID,
			Result:   nil,
			Error:    "",
		}

		if respLine.Error != nil {
			batchResult.Error = respLine.Error.Message
			results = append(results, batchResult)

			continue
		}

		// Parse the completion from the response body.
		var completion openai.ChatCompletion

		err = json.Unmarshal(respLine.Response.Body, &completion)
		if err != nil {
			batchResult.Error = "failed to parse completion: " + err.Error()
			results = append(results, batchResult)

			continue
		}

		batchResult.Result = m.mapCompletionToResult(&completion)
		results = append(results, batchResult)
	}

	return results, nil
}

// mapOpenAIBatchToJob maps an OpenAI Batch object to our unified BatchJob.
func mapOpenAIBatchToJob(batch *openai.Batch) *BatchJob {
	job := &BatchJob{
		ID:          batch.ID,
		Status:      mapOpenAIBatchStatus(string(batch.Status)),
		CreatedAt:   time.Time{},
		CompletedAt: nil,
		TotalCount:  int(batch.RequestCounts.Total),
		DoneCount:   int(batch.RequestCounts.Completed),
		FailedCount: int(batch.RequestCounts.Failed),
		Storage: &BatchStorage{
			Type:       "openai_file",
			InputRef:   batch.InputFileID,
			OutputRef:  batch.OutputFileID,
			Properties: nil,
		},
		Error: "",
	}

	if batch.CreatedAt > 0 {
		created := time.Unix(batch.CreatedAt, 0)
		job.CreatedAt = created
	}

	if batch.CompletedAt > 0 {
		completed := time.Unix(batch.CompletedAt, 0)
		job.CompletedAt = &completed
	}

	if len(batch.Errors.Data) > 0 {
		errMsgs := make([]string, 0, len(batch.Errors.Data))
		for _, batchErr := range batch.Errors.Data {
			errMsgs = append(errMsgs, batchErr.Message)
		}

		job.Error = strings.Join(errMsgs, "; ")
	}

	return job
}

// mapOpenAIFinishReason converts OpenAI finish_reason to our unified StopReason.
func mapOpenAIFinishReason(reason string) StopReason {
	switch reason {
	case "stop":
		return StopReasonEndTurn
	case "length":
		return StopReasonMaxTokens
	case "tool_calls":
		return StopReasonToolUse
	case "content_filter":
		return StopReasonStop
	default:
		return StopReasonStop
	}
}

// mapOpenAIBatchStatus converts OpenAI batch status to our unified BatchStatus.
func mapOpenAIBatchStatus(status string) BatchStatus {
	switch status {
	case "validating", "in_progress":
		return BatchStatusProcessing
	case "completed":
		return BatchStatusCompleted
	case "failed", "expired":
		return BatchStatusFailed
	case "cancelling", "cancelled":
		return BatchStatusCancelled
	default:
		return BatchStatusPending
	}
}

// mapOpenAIToolChoice converts our ToolChoice to OpenAI's tool_choice parameter.
func mapOpenAIToolChoice(
	choice ToolChoice,
) openai.ChatCompletionToolChoiceOptionUnionParam {
	switch choice {
	case ToolChoiceAuto:
		return openai.ChatCompletionToolChoiceOptionUnionParam{ //nolint:exhaustruct
			OfAuto: openai.String("auto"),
		}
	case ToolChoiceNone:
		return openai.ChatCompletionToolChoiceOptionUnionParam{ //nolint:exhaustruct
			OfAuto: openai.String("none"),
		}
	case ToolChoiceRequired:
		return openai.ChatCompletionToolChoiceOptionUnionParam{ //nolint:exhaustruct
			OfAuto: openai.String("required"),
		}
	default:
		return openai.ChatCompletionToolChoiceOptionUnionParam{ //nolint:exhaustruct
			OfAuto: openai.String("auto"),
		}
	}
}

// mapOpenAIResponseFormat converts our ResponseFormat to OpenAI's response_format parameter.
func mapOpenAIResponseFormat(
	responseFormat *ResponseFormat,
) openai.ChatCompletionNewParamsResponseFormatUnion {
	switch responseFormat.Type {
	case "json_schema":
		var schema map[string]any
		if len(responseFormat.JSONSchema) > 0 {
			_ = json.Unmarshal(responseFormat.JSONSchema, &schema)
		}

		return openai.ChatCompletionNewParamsResponseFormatUnion{ //nolint:exhaustruct
			OfJSONSchema: &shared.ResponseFormatJSONSchemaParam{ //nolint:exhaustruct
				JSONSchema: shared.ResponseFormatJSONSchemaJSONSchemaParam{ //nolint:exhaustruct
					Name:   responseFormat.Name,
					Schema: schema,
					Strict: openai.Bool(true),
				},
			},
		}

	case "json_object":
		return openai.ChatCompletionNewParamsResponseFormatUnion{ //nolint:exhaustruct
			OfJSONObject: &shared.ResponseFormatJSONObjectParam{}, //nolint:exhaustruct
		}

	default:
		return openai.ChatCompletionNewParamsResponseFormatUnion{ //nolint:exhaustruct
			OfText: &shared.ResponseFormatTextParam{}, //nolint:exhaustruct
		}
	}
}

// mapOpenAIReasoningEffort maps a thinking budget to OpenAI's reasoning_effort parameter.
// Budget values are mapped to low/medium/high effort levels.
func mapOpenAIReasoningEffort(budget int) shared.ReasoningEffort {
	const (
		lowThreshold  = 1000
		highThreshold = 10000
	)

	switch {
	case budget <= lowThreshold:
		return shared.ReasoningEffortLow
	case budget >= highThreshold:
		return shared.ReasoningEffortHigh
	default:
		return shared.ReasoningEffortMedium
	}
}

// mapOpenAIAudioFormat converts a MIME type to an OpenAI audio format string.
func mapOpenAIAudioFormat(mimeType string) string {
	switch mimeType {
	case "audio/mpeg", "audio/mp3":
		return "mp3"
	case "audio/wav":
		return "wav"
	default:
		return "mp3"
	}
}

// openaiExtractText concatenates all text content blocks in a message.
func openaiExtractText(blocks []ContentBlock) string {
	var builder strings.Builder

	for _, block := range blocks {
		if block.Type == ContentBlockText {
			builder.WriteString(block.Text)
		}
	}

	return builder.String()
}

// Compile-time interface assertions.
var (
	_ ProviderFactory   = (*openAIModelFactory)(nil)
	_ LanguageModel     = (*OpenAIModel)(nil)
	_ BatchCapableModel = (*OpenAIModel)(nil)
)
