package aifx

import (
	"context"
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"

	"github.com/anthropics/anthropic-sdk-go"
	"github.com/anthropics/anthropic-sdk-go/option"
	"github.com/anthropics/anthropic-sdk-go/packages/ssestream"
)

// Sentinel errors for the Anthropic adapter.
var (
	ErrAnthropicGenerationFailed = errors.New("anthropic generation failed")
	ErrAnthropicStreamFailed     = errors.New("anthropic stream failed")
	ErrAnthropicBatchFailed      = errors.New("anthropic batch failed")
)

const anthropicProviderName = "anthropic"

// classifyAnthropicError wraps err with the provider sentinel and, when the
// underlying error is an Anthropic API error, inserts a provider-agnostic
// classification sentinel so callers can use errors.Is without importing the SDK.
func classifyAnthropicError(providerSentinel error, err error) error {
	ctxErr := classifyContextError(providerSentinel, err)
	if ctxErr != nil {
		return ctxErr
	}

	var apiErr *anthropic.Error
	if errors.As(err, &apiErr) {
		return classifyAndWrap(providerSentinel, apiErr.StatusCode, err)
	}

	return fmt.Errorf("%w: %w", providerSentinel, err)
}

// anthropicModelFactory creates Anthropic language models.
type anthropicModelFactory struct{}

// NewAnthropicModelFactory returns a ProviderFactory for Anthropic models.
func NewAnthropicModelFactory() ProviderFactory { //nolint:ireturn
	return &anthropicModelFactory{}
}

func (f *anthropicModelFactory) GetProvider() string {
	return anthropicProviderName
}

func (f *anthropicModelFactory) CreateModel(
	ctx context.Context,
	config *ConfigTarget,
) (LanguageModel, error) { //nolint:ireturn
	if config.APIKey == "" {
		return nil, fmt.Errorf("%w: %w", ErrAnthropicGenerationFailed, ErrInvalidAPIKey)
	}

	if config.Model == "" {
		return nil, fmt.Errorf("%w: %w", ErrAnthropicGenerationFailed, ErrInvalidModel)
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

	client := anthropic.NewClient(opts...)

	return &AnthropicModel{
		client: client,
		config: config,
	}, nil
}

// AnthropicModel implements LanguageModel and BatchCapableModel for Anthropic.
type AnthropicModel struct {
	client anthropic.Client
	config *ConfigTarget
}

func (m *AnthropicModel) GetCapabilities() []ProviderCapability {
	return []ProviderCapability{
		CapabilityTextGeneration,
		CapabilityStreaming,
		CapabilityToolCalling,
		CapabilityVision,
		CapabilityBatchProcessing,
	}
}

func (m *AnthropicModel) GetProvider() string {
	return anthropicProviderName
}

func (m *AnthropicModel) GetModelID() string {
	return m.config.Model
}

func (m *AnthropicModel) GetRawClient() any {
	return &m.client
}

func (m *AnthropicModel) Close(_ context.Context) error {
	return nil
}

// GenerateText performs a non-streaming text generation using the Anthropic API.
func (m *AnthropicModel) GenerateText(
	ctx context.Context,
	opts *GenerateTextOptions,
) (*GenerateTextResult, error) {
	params, err := m.buildMessageParams(opts)
	if err != nil {
		return nil, classifyAnthropicError(ErrAnthropicGenerationFailed, err)
	}

	message, err := m.client.Messages.New(ctx, params)
	if err != nil {
		return nil, classifyAnthropicError(ErrAnthropicGenerationFailed, err)
	}

	result := m.mapResponse(message)
	result.RawRequest = params
	result.RawResponse = message

	return result, nil
}

// StreamText performs a streaming text generation using the Anthropic API.
func (m *AnthropicModel) StreamText(
	ctx context.Context,
	opts *StreamTextOptions,
) (*StreamIterator, error) {
	params, err := m.buildMessageParams(opts)
	if err != nil {
		return nil, classifyAnthropicError(ErrAnthropicStreamFailed, err)
	}

	streamCtx, cancel := context.WithCancel(ctx)

	stream := m.client.Messages.NewStreaming(streamCtx, params)

	eventCh := make(chan StreamEvent, 64) //nolint:mnd

	go m.runStreamReader(stream, eventCh, cancel)

	return NewStreamIterator(eventCh, cancel), nil
}

// SubmitBatch submits a batch of generation requests via the Anthropic Message Batches API.
func (m *AnthropicModel) SubmitBatch(
	ctx context.Context,
	req *BatchRequest,
) (*BatchJob, error) {
	batchRequests := make([]anthropic.MessageBatchNewParamsRequest, 0, len(req.Items))

	for _, item := range req.Items {
		params, err := m.buildMessageParams(&item.Options)
		if err != nil {
			return nil, classifyAnthropicError(ErrAnthropicBatchFailed, err)
		}

		batchRequests = append(
			batchRequests,
			newAnthropicBatchRequest(item.CustomID, params),
		)
	}

	batch, err := m.client.Messages.Batches.New(ctx, anthropic.MessageBatchNewParams{
		Requests: batchRequests,
	})
	if err != nil {
		return nil, classifyAnthropicError(ErrAnthropicBatchFailed, err)
	}

	return mapAnthropicBatchJob(batch), nil
}

// GetBatchJob retrieves the current status of a batch job.
func (m *AnthropicModel) GetBatchJob(
	ctx context.Context,
	jobID string,
) (*BatchJob, error) {
	batch, err := m.client.Messages.Batches.Get(ctx, jobID)
	if err != nil {
		return nil, classifyAnthropicError(ErrAnthropicBatchFailed, err)
	}

	return mapAnthropicBatchJob(batch), nil
}

// ListBatchJobs lists batch jobs.
func (m *AnthropicModel) ListBatchJobs(
	ctx context.Context,
	opts *ListBatchOptions,
) ([]*BatchJob, error) {
	params := anthropic.MessageBatchListParams{} //nolint:exhaustruct

	if opts != nil {
		if opts.Limit > 0 {
			params.Limit = anthropic.Int(int64(opts.Limit))
		}

		if opts.After != "" {
			params.AfterID = anthropic.String(opts.After)
		}
	}

	page, err := m.client.Messages.Batches.List(ctx, params)
	if err != nil {
		return nil, classifyAnthropicError(ErrAnthropicBatchFailed, err)
	}

	jobs := make([]*BatchJob, 0, len(page.Data))
	for i := range page.Data {
		jobs = append(jobs, mapAnthropicBatchJob(&page.Data[i]))
	}

	return jobs, nil
}

// DownloadBatchResults downloads the results of a completed batch job.
func (m *AnthropicModel) DownloadBatchResults(
	ctx context.Context,
	job *BatchJob,
) ([]*BatchResult, error) {
	stream := m.client.Messages.Batches.ResultsStreaming(ctx, job.ID)

	var results []*BatchResult

	for stream.Next() {
		entry := stream.Current()

		batchResult := &BatchResult{
			CustomID: entry.CustomID,
			Result:   nil,
			Error:    "",
		}

		if entry.Result.Type == "succeeded" {
			batchResult.Result = m.mapResponse(&entry.Result.Message)
		} else {
			batchResult.Error = entry.Result.Type
		}

		results = append(results, batchResult)
	}

	if stream.Err() != nil {
		return nil, classifyAnthropicError(ErrAnthropicBatchFailed, stream.Err())
	}

	return results, nil
}

// CancelBatchJob cancels a running batch job.
func (m *AnthropicModel) CancelBatchJob(
	ctx context.Context,
	jobID string,
) error {
	_, err := m.client.Messages.Batches.Cancel(ctx, jobID)
	if err != nil {
		return classifyAnthropicError(ErrAnthropicBatchFailed, err)
	}

	return nil
}

// runStreamReader reads from the Anthropic stream and pushes events to the channel.
func (m *AnthropicModel) runStreamReader(
	stream *ssestream.Stream[anthropic.MessageStreamEventUnion],
	eventCh chan<- StreamEvent,
	cancel context.CancelFunc,
) {
	defer close(eventCh)
	defer cancel()

	accumulated := newEmptyAnthropicMessage()

	for stream.Next() {
		event := stream.Current()

		accErr := accumulated.Accumulate(event)
		if accErr != nil {
			eventCh <- newStreamEventError(
				classifyAnthropicError(ErrAnthropicStreamFailed, accErr),
			)

			return
		}

		switch variant := event.AsAny().(type) {
		case anthropic.ContentBlockDeltaEvent:
			m.handleContentBlockDelta(variant, eventCh)
		case anthropic.MessageDeltaEvent:
			m.handleMessageDelta(variant, &accumulated, eventCh)
		}
	}

	if stream.Err() != nil {
		eventCh <- newStreamEventError(
			classifyAnthropicError(ErrAnthropicStreamFailed, stream.Err()),
		)

		return
	}

	// Send final message-done event if not already sent via MessageDeltaEvent.
	eventCh <- newStreamEventDone(
		mapAnthropicStopReason(accumulated.StopReason),
		newAnthropicUsage(accumulated.Usage.InputTokens, accumulated.Usage.OutputTokens),
	)
}

func (m *AnthropicModel) handleContentBlockDelta(
	variant anthropic.ContentBlockDeltaEvent,
	eventCh chan<- StreamEvent,
) {
	switch delta := variant.Delta.AsAny().(type) {
	case anthropic.TextDelta:
		eventCh <- newStreamEventContentDelta(delta.Text)
	case anthropic.InputJSONDelta:
		// Partial JSON for tool call arguments; accumulate and emit as delta.
		eventCh <- newStreamEventToolCallTextDelta(delta.PartialJSON)
	}
}

func (m *AnthropicModel) handleMessageDelta(
	variant anthropic.MessageDeltaEvent,
	accumulated *anthropic.Message,
	eventCh chan<- StreamEvent,
) {
	// Extract completed tool calls from the accumulated message.
	for _, block := range accumulated.Content {
		if toolUse, ok := block.AsAny().(anthropic.ToolUseBlock); ok {
			inputJSON, marshalErr := json.Marshal(toolUse.Input)
			if marshalErr != nil {
				continue
			}

			eventCh <- newStreamEventToolCall(&ToolCall{
				ID:        toolUse.ID,
				Name:      toolUse.Name,
				Arguments: inputJSON,
			})
		}
	}

	outputTokens := accumulated.Usage.OutputTokens + variant.Usage.OutputTokens

	eventCh <- newStreamEventDone(
		mapAnthropicStopReason(variant.Delta.StopReason),
		newAnthropicUsage(accumulated.Usage.InputTokens, outputTokens),
	)
}

// buildMessageParams maps unified GenerateTextOptions to Anthropic MessageNewParams.
func (m *AnthropicModel) buildMessageParams(
	opts *GenerateTextOptions,
) (anthropic.MessageNewParams, error) {
	messages, err := m.mapMessages(opts.Messages)
	if err != nil {
		return anthropic.MessageNewParams{}, err
	}

	maxTokens := int64(m.config.MaxTokens)
	if opts.MaxTokens > 0 {
		maxTokens = int64(opts.MaxTokens)
	}

	params := anthropic.MessageNewParams{ //nolint:exhaustruct
		Model:     anthropic.Model(m.config.Model),
		Messages:  messages,
		MaxTokens: maxTokens,
	}

	m.applySystemPrompt(&params, opts)
	m.applyTemperature(&params, opts)
	m.applyTopP(&params, opts)
	m.applyStopSequences(&params, opts)
	m.applyTools(&params, opts)
	m.applyToolChoice(&params, opts)
	m.applyThinkingBudget(&params, opts)

	return params, nil
}

func (m *AnthropicModel) applySystemPrompt(
	params *anthropic.MessageNewParams,
	opts *GenerateTextOptions,
) {
	if opts.System != "" {
		params.System = []anthropic.TextBlockParam{
			{Text: opts.System}, //nolint:exhaustruct
		}
	}
}

func (m *AnthropicModel) applyTemperature(
	params *anthropic.MessageNewParams,
	opts *GenerateTextOptions,
) {
	if opts.Temperature != nil {
		params.Temperature = anthropic.Float(*opts.Temperature)
	} else if m.config.Temperature > 0 {
		params.Temperature = anthropic.Float(m.config.Temperature)
	}
}

func (m *AnthropicModel) applyTopP(
	params *anthropic.MessageNewParams,
	opts *GenerateTextOptions,
) {
	if opts.TopP != nil {
		params.TopP = anthropic.Float(*opts.TopP)
	}
}

func (m *AnthropicModel) applyStopSequences(
	params *anthropic.MessageNewParams,
	opts *GenerateTextOptions,
) {
	if len(opts.StopWords) > 0 {
		params.StopSequences = opts.StopWords
	}
}

func (m *AnthropicModel) applyTools(
	params *anthropic.MessageNewParams,
	opts *GenerateTextOptions,
) {
	if len(opts.Tools) > 0 {
		params.Tools = m.mapToolDefinitions(opts.Tools)
	}
}

func (m *AnthropicModel) applyToolChoice(
	params *anthropic.MessageNewParams,
	opts *GenerateTextOptions,
) {
	if opts.ToolChoice != "" {
		params.ToolChoice = mapAnthropicToolChoice(opts.ToolChoice)
	}
}

func (m *AnthropicModel) applyThinkingBudget(
	params *anthropic.MessageNewParams,
	opts *GenerateTextOptions,
) {
	if opts.ThinkingBudget != nil {
		params.Temperature = anthropic.Float(1.0) // required for thinking
		params.Thinking = anthropic.ThinkingConfigParamOfEnabled(int64(*opts.ThinkingBudget))
	}
}

// mapMessages converts unified messages to Anthropic message params.
func (m *AnthropicModel) mapMessages(messages []Message) ([]anthropic.MessageParam, error) {
	result := make([]anthropic.MessageParam, 0, len(messages))

	for _, msg := range messages {
		// Skip system messages; they are handled separately via the System param.
		if msg.Role == RoleSystem {
			continue
		}

		blocks, err := m.mapContentBlocks(msg)
		if err != nil {
			return nil, err
		}

		role := anthropic.MessageParamRoleUser
		if msg.Role == RoleAssistant {
			role = anthropic.MessageParamRoleAssistant
		}

		result = append(result, anthropic.MessageParam{
			Role:    role,
			Content: blocks,
		})
	}

	return result, nil
}

// mapContentBlocks converts a unified message's content blocks to Anthropic content block params.
func (m *AnthropicModel) mapContentBlocks(msg Message) ([]anthropic.ContentBlockParamUnion, error) {
	blocks := make([]anthropic.ContentBlockParamUnion, 0, len(msg.Content))

	for _, block := range msg.Content {
		mapped, err := m.mapSingleContentBlock(block)
		if err != nil {
			return nil, err
		}

		if mapped != nil {
			blocks = append(blocks, *mapped)
		}
	}

	return blocks, nil
}

// mapSingleContentBlock converts one unified content block to an Anthropic content block param.
func (m *AnthropicModel) mapSingleContentBlock(
	block ContentBlock,
) (*anthropic.ContentBlockParamUnion, error) {
	switch block.Type { //nolint:exhaustive
	case ContentBlockText:
		textBlock := &anthropic.ContentBlockParamUnion{ //nolint:exhaustruct
			OfText: &anthropic.TextBlockParam{ //nolint:exhaustruct
				Text: block.Text,
			},
		}

		return textBlock, nil

	case ContentBlockImage:
		return m.mapImageBlock(block.Image)

	case ContentBlockToolCall:
		return m.mapToolCallBlock(block.ToolCall)

	case ContentBlockToolResult:
		return m.mapToolResultBlock(block.ToolResult)

	default:
		// Unsupported block types (audio, file) are silently skipped.
		return nil, nil //nolint:nilnil
	}
}

func (m *AnthropicModel) mapToolCallBlock(
	toolCall *ToolCall,
) (*anthropic.ContentBlockParamUnion, error) {
	if toolCall == nil {
		return nil, nil //nolint:nilnil
	}

	return &anthropic.ContentBlockParamUnion{ //nolint:exhaustruct
		OfToolUse: &anthropic.ToolUseBlockParam{ //nolint:exhaustruct
			ID:    toolCall.ID,
			Name:  toolCall.Name,
			Input: toolCall.Arguments,
		},
	}, nil
}

func (m *AnthropicModel) mapToolResultBlock(
	toolResult *ToolResult,
) (*anthropic.ContentBlockParamUnion, error) {
	if toolResult == nil {
		return nil, nil //nolint:nilnil
	}

	return &anthropic.ContentBlockParamUnion{ //nolint:exhaustruct
		OfToolResult: &anthropic.ToolResultBlockParam{ //nolint:exhaustruct
			ToolUseID: toolResult.ToolCallID,
			Content: []anthropic.ToolResultBlockParamContentUnion{
				{ //nolint:exhaustruct
					OfText: &anthropic.TextBlockParam{ //nolint:exhaustruct
						Text: toolResult.Content,
					},
				},
			},
			IsError: anthropic.Bool(toolResult.IsError),
		},
	}, nil
}

// mapImageBlock converts a unified ImagePart to an Anthropic image content block.
func (m *AnthropicModel) mapImageBlock(img *ImagePart) (*anthropic.ContentBlockParamUnion, error) {
	if img == nil {
		return nil, nil //nolint:nilnil
	}

	var (
		imageData []byte
		mimeType  string
	)

	switch {
	case len(img.Data) > 0:
		imageData = img.Data
		mimeType = img.MIMEType

		if mimeType == "" {
			mimeType = "image/png"
		}

	case IsDataURL(img.URL):
		var err error

		mimeType, imageData, err = DecodeDataURL(img.URL)
		if err != nil {
			return nil, classifyAnthropicError(ErrAnthropicGenerationFailed, err)
		}

	default:
		// Anthropic supports URL-based images via the URL source type.
		return &anthropic.ContentBlockParamUnion{ //nolint:exhaustruct
			OfImage: &anthropic.ImageBlockParam{ //nolint:exhaustruct
				Source: anthropic.ImageBlockParamSourceUnion{ //nolint:exhaustruct
					OfURL: &anthropic.URLImageSourceParam{ //nolint:exhaustruct
						URL: img.URL,
					},
				},
			},
		}, nil
	}

	encoded := base64.StdEncoding.EncodeToString(imageData)

	return &anthropic.ContentBlockParamUnion{ //nolint:exhaustruct
		OfImage: &anthropic.ImageBlockParam{ //nolint:exhaustruct
			Source: anthropic.ImageBlockParamSourceUnion{ //nolint:exhaustruct
				OfBase64: &anthropic.Base64ImageSourceParam{ //nolint:exhaustruct
					Data:      encoded,
					MediaType: anthropic.Base64ImageSourceMediaType(mimeType),
				},
			},
		},
	}, nil
}

// mapToolDefinitions converts unified tool definitions to Anthropic tool params.
func (m *AnthropicModel) mapToolDefinitions(tools []ToolDefinition) []anthropic.ToolUnionParam {
	result := make([]anthropic.ToolUnionParam, 0, len(tools))

	for _, tool := range tools {
		inputSchema := anthropic.ToolInputSchemaParam{} //nolint:exhaustruct

		if len(tool.Parameters) > 0 {
			var schema map[string]any

			err := json.Unmarshal(tool.Parameters, &schema)
			if err == nil {
				inputSchema.Properties = schema
			}
		}

		result = append(result, anthropic.ToolUnionParam{ //nolint:exhaustruct
			OfTool: &anthropic.ToolParam{ //nolint:exhaustruct
				Name:        tool.Name,
				Description: anthropic.String(tool.Description),
				InputSchema: inputSchema,
			},
		})
	}

	return result
}

// mapAnthropicToolChoice converts a unified ToolChoice to the Anthropic tool choice param.
func mapAnthropicToolChoice(choice ToolChoice) anthropic.ToolChoiceUnionParam {
	switch choice {
	case ToolChoiceAuto:
		return anthropic.ToolChoiceUnionParam{ //nolint:exhaustruct
			OfAuto: &anthropic.ToolChoiceAutoParam{}, //nolint:exhaustruct
		}
	case ToolChoiceNone:
		return anthropic.ToolChoiceUnionParam{ //nolint:exhaustruct
			OfNone: &anthropic.ToolChoiceNoneParam{}, //nolint:exhaustruct
		}
	case ToolChoiceRequired:
		return anthropic.ToolChoiceUnionParam{ //nolint:exhaustruct
			OfAny: &anthropic.ToolChoiceAnyParam{}, //nolint:exhaustruct
		}
	default:
		return anthropic.ToolChoiceUnionParam{ //nolint:exhaustruct
			OfAuto: &anthropic.ToolChoiceAutoParam{}, //nolint:exhaustruct
		}
	}
}

// mapResponse converts an Anthropic Message to a unified GenerateTextResult.
func (m *AnthropicModel) mapResponse(msg *anthropic.Message) *GenerateTextResult {
	content := make([]ContentBlock, 0, len(msg.Content))

	for _, block := range msg.Content {
		switch variant := block.AsAny().(type) {
		case anthropic.TextBlock:
			content = append(content, ContentBlock{
				Type:       ContentBlockText,
				Text:       variant.Text,
				Image:      nil,
				Audio:      nil,
				File:       nil,
				ToolCall:   nil,
				ToolResult: nil,
			})
		case anthropic.ToolUseBlock:
			inputJSON, marshalErr := json.Marshal(variant.Input)
			if marshalErr != nil {
				// Fall back to empty JSON object on marshal failure.
				inputJSON = []byte("{}")
			}

			content = append(content, ContentBlock{
				Type:  ContentBlockToolCall,
				Text:  "",
				Image: nil,
				Audio: nil,
				File:  nil,
				ToolCall: &ToolCall{
					ID:        variant.ID,
					Name:      variant.Name,
					Arguments: inputJSON,
				},
				ToolResult: nil,
			})
		case anthropic.ThinkingBlock:
			// Thinking blocks are internal reasoning; include as text with a marker.
			content = append(content, ContentBlock{
				Type:       ContentBlockText,
				Text:       variant.Thinking,
				Image:      nil,
				Audio:      nil,
				File:       nil,
				ToolCall:   nil,
				ToolResult: nil,
			})
		}
	}

	return &GenerateTextResult{
		Content:    content,
		StopReason: mapAnthropicStopReason(msg.StopReason),
		Usage: Usage{
			InputTokens:    int(msg.Usage.InputTokens),
			OutputTokens:   int(msg.Usage.OutputTokens),
			TotalTokens:    int(msg.Usage.InputTokens) + int(msg.Usage.OutputTokens),
			ThinkingTokens: 0,
		},
		ModelID:     string(msg.Model),
		RawRequest:  nil,
		RawResponse: nil,
	}
}

// mapAnthropicStopReason converts an Anthropic stop reason to the unified type.
func mapAnthropicStopReason(reason anthropic.StopReason) StopReason {
	switch reason { //nolint:exhaustive
	case anthropic.StopReasonEndTurn:
		return StopReasonEndTurn
	case anthropic.StopReasonMaxTokens:
		return StopReasonMaxTokens
	case anthropic.StopReasonToolUse:
		return StopReasonToolUse
	case anthropic.StopReasonStopSequence:
		return StopReasonStop
	default:
		return StopReasonEndTurn
	}
}

// mapAnthropicBatchJob converts an Anthropic batch response to the unified BatchJob type.
func mapAnthropicBatchJob(batch *anthropic.MessageBatch) *BatchJob {
	job := &BatchJob{
		ID:          batch.ID,
		Status:      mapAnthropicBatchStatus(batch.ProcessingStatus),
		CreatedAt:   batch.CreatedAt.UTC(),
		CompletedAt: nil,
		TotalCount: int(batch.RequestCounts.Processing +
			batch.RequestCounts.Succeeded +
			batch.RequestCounts.Errored +
			batch.RequestCounts.Canceled +
			batch.RequestCounts.Expired),
		DoneCount:   int(batch.RequestCounts.Succeeded),
		FailedCount: int(batch.RequestCounts.Errored),
		Storage: &BatchStorage{
			Type:       "anthropic_batch",
			InputRef:   "",
			OutputRef:  batch.ResultsURL,
			Properties: map[string]any{"batch_id": batch.ID},
		},
		Error: "",
	}

	if !batch.EndedAt.IsZero() {
		endedAt := batch.EndedAt.UTC()
		job.CompletedAt = &endedAt
	}

	return job
}

// mapAnthropicBatchStatus converts an Anthropic batch processing status to the unified type.
func mapAnthropicBatchStatus(
	status anthropic.MessageBatchProcessingStatus,
) BatchStatus {
	switch status {
	case anthropic.MessageBatchProcessingStatusInProgress,
		anthropic.MessageBatchProcessingStatusCanceling:
		return BatchStatusProcessing
	case anthropic.MessageBatchProcessingStatusEnded:
		return BatchStatusCompleted
	default:
		return BatchStatusPending
	}
}

// newEmptyAnthropicMessage creates a zero-value Anthropic Message for accumulation.
func newEmptyAnthropicMessage() anthropic.Message {
	return anthropic.Message{} //nolint:exhaustruct
}

// newAnthropicBatchRequest creates a new Anthropic batch request line.
func newAnthropicBatchRequest(
	customID string,
	params anthropic.MessageNewParams,
) anthropic.MessageBatchNewParamsRequest {
	return anthropic.MessageBatchNewParamsRequest{
		CustomID: customID,
		Params: anthropic.MessageBatchNewParamsRequestParams{ //nolint:exhaustruct
			MaxTokens:     params.MaxTokens,
			Messages:      params.Messages,
			Model:         params.Model,
			System:        params.System,
			Temperature:   params.Temperature,
			TopP:          params.TopP,
			StopSequences: params.StopSequences,
			Tools:         params.Tools,
			ToolChoice:    params.ToolChoice,
			Thinking:      params.Thinking,
		},
	}
}

// newAnthropicUsage creates a Usage from Anthropic token counts.
func newAnthropicUsage(inputTokens, outputTokens int64) *Usage {
	return &Usage{
		InputTokens:    int(inputTokens),
		OutputTokens:   int(outputTokens),
		TotalTokens:    int(inputTokens) + int(outputTokens),
		ThinkingTokens: 0,
	}
}

// Compile-time interface assertions.
var (
	_ ProviderFactory   = (*anthropicModelFactory)(nil)
	_ LanguageModel     = (*AnthropicModel)(nil)
	_ BatchCapableModel = (*AnthropicModel)(nil)
)
