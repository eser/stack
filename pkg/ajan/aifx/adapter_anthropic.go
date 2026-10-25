package aifx

import (
	"bufio"
	"context"
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"net/url"
	"os"
	"strconv"
)

// Sentinel errors for the Anthropic adapter.
var (
	ErrAnthropicGenerationFailed = errors.New("anthropic generation failed")
	ErrAnthropicStreamFailed     = errors.New("anthropic stream failed")
	ErrAnthropicBatchFailed      = errors.New("anthropic batch failed")
)

const (
	anthropicProviderName   = "anthropic"
	anthropicDefaultBaseURL = "https://api.anthropic.com/"
	anthropicAPIVersion     = "2023-06-01"

	// anthropicMaxRetries is how often a request that failed with a
	// connection error, a timeout or a transient status is sent again.
	anthropicMaxRetries = 2

	anthropicMessagesPath = "v1/messages"
	anthropicBatchesPath  = "v1/messages/batches"
)

// classifyAnthropicError wraps err with the provider sentinel and, when the
// underlying error is an Anthropic API error, inserts a provider-agnostic
// classification sentinel so callers can use errors.Is.
func classifyAnthropicError(providerSentinel error, err error) error {
	return classifyProviderError(providerSentinel, err)
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
	credential := ResolveCredential(config)
	if !credential.Found() {
		return nil, fmt.Errorf("%w: %w", ErrAnthropicGenerationFailed, ErrInvalidAPIKey)
	}

	if config.Model == "" {
		return nil, fmt.Errorf("%w: %w", ErrAnthropicGenerationFailed, ErrInvalidModel)
	}

	return &AnthropicModel{
		transport: newAnthropicTransport(config, credential, &http.Client{}), //nolint:exhaustruct
		config:    config,
	}, nil
}

// newAnthropicTransport builds the transport the model sends through.
//
// Exactly one credential is sent: the one ResolveCredential picked. An API key
// goes in X-Api-Key and a bearer token in Authorization, never both, so a token
// in the environment cannot ride along with a configured key.
//
// The base URL is config.BaseURL, else ANTHROPIC_BASE_URL, else the public
// API; a machine pointing at a proxy through the environment alone keeps
// reaching the proxy.
func newAnthropicTransport(config *ConfigTarget, credential Credential, client *http.Client) *providerTransport {
	headers := http.Header{}
	headers.Set("Anthropic-Version", anthropicAPIVersion)

	if credential.Kind == CredentialAuthToken {
		headers.Set("Authorization", "Bearer "+credential.Value)
	} else {
		headers.Set("X-Api-Key", credential.Value)
	}

	baseURL := config.BaseURL
	if baseURL == "" {
		baseURL = os.Getenv("ANTHROPIC_BASE_URL")
	}

	if baseURL == "" {
		baseURL = anthropicDefaultBaseURL
	}

	return &providerTransport{
		client:    client,
		headers:   headers,
		authorize: nil,
		newStatusError: func(req *http.Request, resp *http.Response, body []byte) error {
			return newProviderStatusError(req, resp, string(body), "request-id")
		},
		baseURL:       baseURL,
		defaultAccept: mediaTypeJSON,
		timeout:       config.RequestTimeout,
		retry:         providerRetryPolicy{maxRetries: anthropicMaxRetries, retryAttemptTimeout: true},
	}
}

// AnthropicModel implements LanguageModel and BatchCapableModel for Anthropic.
type AnthropicModel struct {
	transport *providerTransport
	config    *ConfigTarget
}

func (m *AnthropicModel) GetCapabilities() []ProviderCapability {
	return []ProviderCapability{
		CapabilityTextGeneration,
		CapabilityStreaming,
		CapabilityToolCalling,
		CapabilityVision,
		CapabilityBatchProcessing,
		CapabilityStructuredOut,
		// A thinking budget turns on adaptive thinking, and the reply carries
		// the thinking blocks.
		CapabilityReasoning,
	}
}

func (m *AnthropicModel) GetProvider() string {
	return anthropicProviderName
}

func (m *AnthropicModel) GetModelID() string {
	return m.config.Model
}

// GetRawClient returns the *http.Client the model sends through.
func (m *AnthropicModel) GetRawClient() any {
	if m.transport == nil {
		return nil
	}

	return m.transport.client
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

	var message anthropicMessage

	err = m.transport.doJSON(ctx, http.MethodPost, anthropicMessagesPath, nil, params, &message)
	if err != nil {
		return nil, classifyAnthropicError(ErrAnthropicGenerationFailed, err)
	}

	result := m.mapResponse(&message)
	result.RawRequest = params
	result.RawResponse = &message

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

	params.Stream = true

	body, err := json.Marshal(params)
	if err != nil {
		return nil, classifyAnthropicError(ErrAnthropicStreamFailed, fmt.Errorf("encode messages request: %w", err))
	}

	streamCtx, cancel := context.WithCancel(ctx)

	eventCh := make(chan StreamEvent, 64) //nolint:mnd

	go m.runStreamReader(streamCtx, body, eventCh, cancel)

	return NewStreamIterator(eventCh, cancel), nil
}

// SubmitBatch submits a batch of generation requests via the Anthropic Message Batches API.
func (m *AnthropicModel) SubmitBatch(
	ctx context.Context,
	req *BatchRequest,
) (*BatchJob, error) {
	batchRequests := make([]anthropicBatchItem, 0, len(req.Items))

	for _, item := range req.Items {
		params, err := m.buildMessageParams(&item.Options)
		if err != nil {
			return nil, classifyAnthropicError(ErrAnthropicBatchFailed, err)
		}

		batchRequests = append(batchRequests, newAnthropicBatchRequest(item.CustomID, params))
	}

	var batch anthropicBatch

	err := m.transport.doJSON(ctx, http.MethodPost, anthropicBatchesPath, nil,
		&anthropicBatchCreateRequest{Requests: batchRequests}, &batch)
	if err != nil {
		return nil, classifyAnthropicError(ErrAnthropicBatchFailed, err)
	}

	return mapAnthropicBatchJob(&batch), nil
}

// GetBatchJob retrieves the current status of a batch job.
func (m *AnthropicModel) GetBatchJob(
	ctx context.Context,
	jobID string,
) (*BatchJob, error) {
	var batch anthropicBatch

	err := m.transport.doJSON(ctx, http.MethodGet, anthropicBatchesPath+"/"+url.PathEscape(jobID), nil, nil, &batch)
	if err != nil {
		return nil, classifyAnthropicError(ErrAnthropicBatchFailed, err)
	}

	return mapAnthropicBatchJob(&batch), nil
}

// ListBatchJobs lists batch jobs.
func (m *AnthropicModel) ListBatchJobs(
	ctx context.Context,
	opts *ListBatchOptions,
) ([]*BatchJob, error) {
	query := url.Values{}

	if opts != nil {
		if opts.Limit > 0 {
			query.Set("limit", strconv.Itoa(opts.Limit))
		}

		if opts.After != "" {
			query.Set("after_id", opts.After)
		}
	}

	var page anthropicBatchPage

	err := m.transport.doJSON(ctx, http.MethodGet, anthropicBatchesPath, query, nil, &page)
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
	resp, err := m.transport.send(ctx, &providerRequest{
		query:       nil,
		method:      http.MethodGet,
		path:        anthropicBatchesPath + "/" + url.PathEscape(job.ID) + "/results",
		contentType: "",
		accept:      "application/x-jsonl",
		body:        nil,
	})
	if err != nil {
		return nil, classifyAnthropicError(ErrAnthropicBatchFailed, err)
	}

	defer closeResponse(resp)

	scanner := bufio.NewScanner(resp.Body)
	scanner.Buffer(nil, sseMaxLineBytes)

	var results []*BatchResult

	for scanner.Scan() {
		line := scanner.Bytes()
		if len(line) == 0 {
			continue
		}

		var entry anthropicBatchResultLine

		err = json.Unmarshal(line, &entry)
		if err != nil {
			return nil, classifyAnthropicError(ErrAnthropicBatchFailed,
				fmt.Errorf("%w: batch %q results line: %w", ErrProviderResponseDecode, job.ID, err))
		}

		batchResult := &BatchResult{
			CustomID: entry.CustomID,
			Result:   nil,
			Error:    "",
		}

		if entry.Result.Type == "succeeded" && entry.Result.Message != nil {
			batchResult.Result = m.mapResponse(entry.Result.Message)
		} else {
			batchResult.Error = entry.Result.Type
		}

		results = append(results, batchResult)
	}

	err = scanner.Err()
	if err != nil {
		return nil, classifyAnthropicError(ErrAnthropicBatchFailed,
			fmt.Errorf("read batch %q results (line limit %d bytes): %w", job.ID, sseMaxLineBytes, err))
	}

	return results, nil
}

// CancelBatchJob cancels a running batch job.
func (m *AnthropicModel) CancelBatchJob(
	ctx context.Context,
	jobID string,
) error {
	var batch anthropicBatch

	err := m.transport.doJSON(ctx, http.MethodPost,
		anthropicBatchesPath+"/"+url.PathEscape(jobID)+"/cancel", nil, nil, &batch)
	if err != nil {
		return classifyAnthropicError(ErrAnthropicBatchFailed, err)
	}

	return nil
}

// runStreamReader sends the streaming request, reads the server-sent events
// and pushes stream events to the channel.
func (m *AnthropicModel) runStreamReader(
	ctx context.Context,
	body []byte,
	eventCh chan<- StreamEvent,
	cancel context.CancelFunc,
) {
	defer close(eventCh)
	defer cancel()

	resp, err := m.transport.send(ctx, &providerRequest{
		query: nil, method: http.MethodPost, path: anthropicMessagesPath,
		contentType: mediaTypeJSON, accept: "", body: body,
	})
	if err != nil {
		sendStreamEvent(ctx, eventCh, newStreamEventError(classifyAnthropicError(ErrAnthropicStreamFailed, err)))

		return
	}

	defer closeResponse(resp)

	accumulated := anthropicMessage{} //nolint:exhaustruct
	decoder := newSSEDecoder(resp.Body)

	for decoder.next() {
		err = m.handleStreamEvent(ctx, resp, &decoder.event, &accumulated, eventCh)
		if err != nil {
			sendStreamEvent(ctx, eventCh, newStreamEventError(classifyAnthropicError(ErrAnthropicStreamFailed, err)))

			return
		}
	}

	if err := decoder.err; err != nil {
		if ctxErr := ctx.Err(); ctxErr != nil {
			err = ctxErr
		}

		sendStreamEvent(ctx, eventCh, newStreamEventError(classifyAnthropicError(ErrAnthropicStreamFailed, err)))

		return
	}

	// The one and only message_done, reached only when the stream ended
	// cleanly. Usage comes from the accumulated message alone: message_delta
	// carries whole-message totals, so adding them up would count twice.
	sendStreamEvent(ctx, eventCh, newStreamEventDone(
		mapAnthropicStopReason(accumulated.StopReason),
		newAnthropicUsage(accumulated.Usage.InputTokens, accumulated.Usage.OutputTokens),
	))
}

// handleStreamEvent applies one server-sent event. An error event, an event
// that does not decode and an event out of order end the stream with an error.
func (m *AnthropicModel) handleStreamEvent(
	ctx context.Context,
	resp *http.Response,
	raw *sseEvent,
	accumulated *anthropicMessage,
	eventCh chan<- StreamEvent,
) error {
	switch raw.name {
	case "error":
		return newAnthropicStreamError(resp, raw.data)
	case "message_start", "message_delta", "message_stop",
		"content_block_start", "content_block_delta", "content_block_stop":
	default:
		// ping and event types this adapter does not read.
		return nil
	}

	var event anthropicStreamEvent

	err := json.Unmarshal(raw.data, &event)
	if err != nil {
		return fmt.Errorf("%w: %s event: %w", ErrProviderResponseDecode, raw.name, err)
	}

	err = accumulated.accumulate(&event)
	if err != nil {
		return err
	}

	switch event.Type {
	case "content_block_delta":
		m.handleContentBlockDelta(ctx, event.Delta, eventCh)
	case "content_block_stop":
		emitAccumulatedThinking(ctx, accumulated, event.Index, eventCh)
	case "message_delta":
		m.emitAccumulatedToolCalls(ctx, accumulated, eventCh)
	}

	return nil
}

// newAnthropicStreamError is the error an error event reports. It carries
// the stream's own status, 200, as the SDK's did.
func newAnthropicStreamError(resp *http.Response, data []byte) error {
	if !json.Valid(data) {
		return fmt.Errorf("%w: %s", ErrStreamErrorEvent, data)
	}

	method, target := "", ""
	if resp.Request != nil {
		method = resp.Request.Method
		target = resp.Request.URL.Redacted()
	}

	return &providerStreamError{
		method:     method,
		url:        target,
		status:     resp.Status,
		body:       string(data),
		StatusCode: resp.StatusCode,
	}
}

func (m *AnthropicModel) handleContentBlockDelta(
	ctx context.Context,
	delta *anthropicStreamDelta,
	eventCh chan<- StreamEvent,
) {
	if delta == nil {
		return
	}

	switch delta.Type {
	case "text_delta":
		sendStreamEvent(ctx, eventCh, newStreamEventContentDelta(delta.Text))
	case "input_json_delta":
		// Partial JSON for tool call arguments; accumulate and emit as delta.
		sendStreamEvent(ctx, eventCh, newStreamEventToolCallTextDelta(delta.PartialJSON))
	}
}

// emitAccumulatedThinking streams the block at index once it is complete, when
// it is a thinking block. Its text and signature arrive in separate deltas, and
// only the finished block can be replayed: the API checks the signature against
// the whole text.
func emitAccumulatedThinking(
	ctx context.Context,
	accumulated *anthropicMessage,
	index int64,
	eventCh chan<- StreamEvent,
) {
	// accumulate has already rejected an index outside the content.
	if index < 0 || index >= int64(len(accumulated.Content)) {
		return
	}

	if part, ok := anthropicThinkingPart(&accumulated.Content[index]); ok {
		sendStreamEvent(ctx, eventCh, newStreamEventThinking(part))
	}
}

// emitAccumulatedToolCalls streams the tool calls the message has accumulated.
//
// It deliberately does NOT emit message_done. There is exactly one done event
// per stream and it is emitted after the read loop, once the stream's error
// has been checked -- which is what makes a late failure reportable.
// StreamIterator latches on the FIRST done, so a done emitted here would end
// the iteration and swallow an error event raised afterwards.
func (m *AnthropicModel) emitAccumulatedToolCalls(
	ctx context.Context,
	accumulated *anthropicMessage,
	eventCh chan<- StreamEvent,
) {
	for idx := range accumulated.Content {
		block := &accumulated.Content[idx]
		if block.Type != "tool_use" {
			continue
		}

		inputJSON, ok := compactToolInput(block.Input)
		if !ok {
			continue
		}

		sendStreamEvent(ctx, eventCh, newStreamEventToolCall(&ToolCall{
			ID:        block.ID,
			Name:      block.Name,
			Arguments: inputJSON,
		}))
	}
}

// buildMessageParams maps unified GenerateTextOptions to a Messages API request.
func (m *AnthropicModel) buildMessageParams(
	opts *GenerateTextOptions,
) (*anthropicMessageRequest, error) {
	messages, err := m.mapMessages(opts.Messages)
	if err != nil {
		return nil, err
	}

	maxTokens := int64(m.config.MaxTokens)
	if opts.MaxTokens > 0 {
		maxTokens = int64(opts.MaxTokens)
	}

	params := &anthropicMessageRequest{ //nolint:exhaustruct
		Model:     m.config.Model,
		Messages:  messages,
		MaxTokens: maxTokens,
	}

	if opts.System != "" {
		params.System = []anthropicTextBlock{{Type: "text", Text: opts.System}}
	}

	if len(opts.StopWords) > 0 {
		params.StopSequences = opts.StopWords
	}

	if len(opts.Tools) > 0 {
		tools, err := m.mapToolDefinitions(opts.Tools)
		if err != nil {
			return nil, err
		}

		params.Tools = tools
	}

	if opts.ToolChoice != "" {
		params.ToolChoice = mapAnthropicToolChoice(opts.ToolChoice)
	}

	err = m.applyEffort(params, opts)
	if err != nil {
		return nil, err
	}

	err = m.applyResponseFormat(params, opts)
	if err != nil {
		return nil, err
	}

	return params, nil
}

// applyEffort sends output_config.effort, and adaptive thinking when the caller
// set a thinking budget. An explicit Effort wins over the level the budget maps
// to; with neither set, nothing is sent and the model's default applies.
func (m *AnthropicModel) applyEffort(
	params *anthropicMessageRequest,
	opts *GenerateTextOptions,
) error {
	err := checkEffort(opts.Effort)
	if err != nil {
		return err
	}

	if opts.ThinkingBudget != nil {
		// Claude 4.7+ and the Claude 5 models reject a fixed thinking budget and
		// sampling parameters; the budget maps to an effort level instead.
		params.Thinking = &anthropicThinkingConfig{Type: "adaptive"}
	}

	// The Effort constants are the API's own level names.
	effort := string(opts.Effort)
	if opts.Effort == EffortDefault && opts.ThinkingBudget != nil {
		effort = mapAnthropicEffort(*opts.ThinkingBudget)
	}

	// Set as a field rather than replacing output_config, which also holds the
	// format that applyResponseFormat sets.
	if effort != "" {
		outputConfig(params).Effort = effort
	}

	return nil
}

// applyResponseFormat sends a json_schema response format as
// output_config.format, next to the effort in the same object. Claude has no
// JSON mode without a schema, so json_object and text send nothing and the
// prompt alone decides the shape of the reply. The format's Name has no field
// in the API and is not sent.
func (m *AnthropicModel) applyResponseFormat(
	params *anthropicMessageRequest,
	opts *GenerateTextOptions,
) error {
	if opts.ResponseFormat == nil || opts.ResponseFormat.Type != "json_schema" {
		return nil
	}

	schema, err := decodeResponseSchema(opts.ResponseFormat.JSONSchema)
	if err != nil {
		return err
	}

	outputConfig(params).Format = &anthropicOutputFormat{Schema: schema, Type: "json_schema"}

	return nil
}

func outputConfig(params *anthropicMessageRequest) *anthropicOutputConfig {
	if params.OutputConfig == nil {
		params.OutputConfig = &anthropicOutputConfig{Format: nil, Effort: ""}
	}

	return params.OutputConfig
}

// mapAnthropicEffort maps a legacy thinking budget to an effort level, with
// the same thresholds as the OpenAI reasoning-effort mapping.
func mapAnthropicEffort(budget int) string {
	switch {
	case budget <= 1000:
		return anthropicEffortLow
	case budget >= 10000:
		return anthropicEffortHigh
	default:
		return anthropicEffortMedium
	}
}

// mapMessages converts unified messages to Anthropic message params.
func (m *AnthropicModel) mapMessages(messages []Message) ([]anthropicMessageParam, error) {
	result := make([]anthropicMessageParam, 0, len(messages))

	for _, msg := range messages {
		// Skip system messages; they are handled separately via the system param.
		if msg.Role == RoleSystem {
			continue
		}

		blocks, err := m.mapContentBlocks(msg)
		if err != nil {
			return nil, err
		}

		role := "user"
		if msg.Role == RoleAssistant {
			role = "assistant"
		}

		result = append(result, anthropicMessageParam{
			Role:    role,
			Content: blocks,
		})
	}

	return result, nil
}

// mapContentBlocks converts a unified message's content blocks to Anthropic content blocks.
func (m *AnthropicModel) mapContentBlocks(msg Message) ([]any, error) {
	blocks := make([]any, 0, len(msg.Content))

	for i := range msg.Content {
		mapped, err := m.mapSingleContentBlock(&msg.Content[i])
		if err != nil {
			return nil, err
		}

		if mapped != nil {
			blocks = append(blocks, mapped)
		}
	}

	return blocks, nil
}

// mapSingleContentBlock converts one unified content block to an Anthropic
// content block, or nil for a block the API has no place for.
func (m *AnthropicModel) mapSingleContentBlock(block *ContentBlock) (any, error) {
	switch block.Type { //nolint:exhaustive
	case ContentBlockText:
		return &anthropicTextBlock{Type: "text", Text: block.Text}, nil

	case ContentBlockImage:
		return m.mapImageBlock(block.Image)

	case ContentBlockToolCall:
		return m.mapToolCallBlock(block.ToolCall)

	case ContentBlockToolResult:
		return m.mapToolResultBlock(block.ToolResult)

	case ContentBlockThinking:
		return mapThinkingBlock(block.Thinking), nil

	default:
		// Unsupported block types (audio, file) are silently skipped.
		return nil, nil
	}
}

// mapThinkingBlock replays a thinking block exactly as the API returned it.
//
// The API checks the signature, or the redacted data, of every thinking block
// it gets back. A block with neither, such as one another provider produced,
// cannot pass that check, so it is left out of the request.
func mapThinkingBlock(part *ThinkingPart) any {
	if part == nil {
		return nil
	}

	if part.RedactedData != "" {
		return &anthropicRedactedThinkingBlockParam{Type: "redacted_thinking", Data: part.RedactedData}
	}

	if part.Signature == "" {
		return nil
	}

	return &anthropicThinkingBlockParam{Type: "thinking", Signature: part.Signature, Thinking: part.Text}
}

// anthropicThinkingPart returns the thinking part of a thinking or
// redacted_thinking block, and false for every other block.
func anthropicThinkingPart(block *anthropicContentBlock) (*ThinkingPart, bool) {
	switch block.Type {
	case "thinking":
		return &ThinkingPart{
			Text:         block.Thinking,
			Signature:    block.Signature,
			RedactedData: "",
		}, true
	case "redacted_thinking":
		return &ThinkingPart{
			Text:         "",
			Signature:    "",
			RedactedData: block.Data,
		}, true
	default:
		return nil, false
	}
}

func (m *AnthropicModel) mapToolCallBlock(toolCall *ToolCall) (any, error) {
	if toolCall == nil {
		return nil, nil
	}

	return &anthropicToolUseBlock{
		Type:  "tool_use",
		ID:    toolCall.ID,
		Name:  toolCall.Name,
		Input: toolCall.Arguments,
	}, nil
}

func (m *AnthropicModel) mapToolResultBlock(toolResult *ToolResult) (any, error) {
	if toolResult == nil {
		return nil, nil
	}

	return &anthropicToolResultBlock{
		Type:      "tool_result",
		ToolUseID: toolResult.ToolCallID,
		Content:   []anthropicTextBlock{{Type: "text", Text: toolResult.Content}},
		IsError:   toolResult.IsError,
	}, nil
}

// mapImageBlock converts a unified ImagePart to an Anthropic image content block.
func (m *AnthropicModel) mapImageBlock(img *ImagePart) (any, error) {
	if img == nil {
		return nil, nil
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
		return &anthropicImageBlock{
			Source: &anthropicURLImageSource{Type: "url", URL: img.URL},
			Type:   "image",
		}, nil
	}

	return &anthropicImageBlock{
		Source: &anthropicBase64ImageSource{
			Type:      "base64",
			MediaType: mimeType,
			Data:      base64.StdEncoding.EncodeToString(imageData),
		},
		Type: "image",
	}, nil
}

// mapToolDefinitions converts unified tool definitions to Anthropic tools. A
// tool whose Parameters do not decode fails the request rather than reaching
// the model with no schema.
func (m *AnthropicModel) mapToolDefinitions(tools []ToolDefinition) ([]anthropicTool, error) {
	result := make([]anthropicTool, 0, len(tools))

	for idx := range tools {
		tool := &tools[idx]

		// ToolDefinition.Parameters is a whole JSON Schema document. The API's
		// input_schema is that document with "type" fixed to "object": the
		// document's properties and required list keep their places, and every
		// other key -- additionalProperties, $defs, description, oneOf -- is
		// carried through, so a tool declared with additionalProperties false
		// is not described to the model as accepting anything.
		schema, err := decodeToolParameters(tool)
		if err != nil {
			return nil, err
		}

		result = append(result, anthropicTool{
			InputSchema: anthropicInputSchema(schema),
			Name:        tool.Name,
			Description: tool.Description,
		})
	}

	return result, nil
}

// anthropicInputSchema is the input_schema of a tool, or nil for a tool
// without parameters.
//
// "type" never comes from the document: the API takes only "object", and a
// schema declaring anything else ("type":"array", say) would make it reject
// the whole request.
func anthropicInputSchema(schema map[string]any) map[string]any {
	if schema == nil {
		return nil
	}

	input := schemaExtraFields(schema)
	if input == nil {
		input = make(map[string]any, 3) //nolint:mnd
	}

	input["type"] = "object"

	if properties, ok := schema["properties"].(map[string]any); ok {
		input["properties"] = properties
	}

	if required := schemaRequired(schema); required != nil {
		input["required"] = required
	}

	return input
}

// mapAnthropicToolChoice converts a unified ToolChoice to the Anthropic tool choice.
func mapAnthropicToolChoice(choice ToolChoice) *anthropicToolChoice {
	switch choice {
	case ToolChoiceAuto:
		return &anthropicToolChoice{Type: "auto"}
	case ToolChoiceNone:
		return &anthropicToolChoice{Type: "none"}
	case ToolChoiceRequired:
		return &anthropicToolChoice{Type: "any"}
	default:
		return &anthropicToolChoice{Type: "auto"}
	}
}

// mapResponse converts an Anthropic message to a unified GenerateTextResult.
func (m *AnthropicModel) mapResponse(msg *anthropicMessage) *GenerateTextResult {
	content := make([]ContentBlock, 0, len(msg.Content))

	for idx := range msg.Content {
		block := &msg.Content[idx]

		switch block.Type {
		case "text":
			content = append(content, ContentBlock{
				Type:       ContentBlockText,
				Text:       block.Text,
				Image:      nil,
				Audio:      nil,
				File:       nil,
				ToolCall:   nil,
				ToolResult: nil,
				Thinking:   nil,
			})
		case "tool_use":
			inputJSON, ok := compactToolInput(block.Input)
			if !ok {
				// Fall back to an empty JSON object when the input is not JSON.
				inputJSON = []byte("{}")
			}

			content = append(content, ContentBlock{
				Type:  ContentBlockToolCall,
				Text:  "",
				Image: nil,
				Audio: nil,
				File:  nil,
				ToolCall: &ToolCall{
					ID:        block.ID,
					Name:      block.Name,
					Arguments: inputJSON,
				},
				ToolResult: nil,
				Thinking:   nil,
			})
		case "thinking", "redacted_thinking":
			// Kept as its own kind, never as text, and kept when the text is
			// empty (Claude 5 omits it by default): the signature is what the
			// next request of a tool-use loop must send back.
			if part, ok := anthropicThinkingPart(block); ok {
				content = append(content, NewThinkingBlock(*part))
			}
		}
	}

	return &GenerateTextResult{
		Content:     content,
		StopReason:  mapAnthropicStopReason(msg.StopReason),
		Usage:       *newAnthropicUsage(msg.Usage.InputTokens, msg.Usage.OutputTokens),
		ModelID:     msg.Model,
		RawRequest:  nil,
		RawResponse: nil,
	}
}

// mapAnthropicStopReason converts an Anthropic stop reason to the unified type.
// model_context_window_exceeded is a truncation like max_tokens: the reply was
// cut off because the context window filled up.
func mapAnthropicStopReason(reason string) StopReason {
	switch reason {
	case anthropicStopEndTurn:
		return StopReasonEndTurn
	case anthropicStopMaxTokens, anthropicStopModelContextWindowExceeded:
		return StopReasonMaxTokens
	case anthropicStopToolUse:
		return StopReasonToolUse
	case anthropicStopSequence:
		return StopReasonStop
	case anthropicStopRefusal:
		return StopReasonRefusal
	default:
		return StopReasonEndTurn
	}
}

// mapAnthropicBatchJob converts an Anthropic batch to the unified BatchJob type.
func mapAnthropicBatchJob(batch *anthropicBatch) *BatchJob {
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

	if batch.EndedAt != nil && !batch.EndedAt.IsZero() {
		endedAt := batch.EndedAt.UTC()
		job.CompletedAt = &endedAt
	}

	return job
}

// mapAnthropicBatchStatus converts an Anthropic batch processing status to the unified type.
func mapAnthropicBatchStatus(status string) BatchStatus {
	switch status {
	case anthropicBatchInProgress, anthropicBatchCanceling:
		return BatchStatusProcessing
	case anthropicBatchEnded:
		return BatchStatusCompleted
	default:
		return BatchStatusPending
	}
}

// newAnthropicBatchRequest creates one request of a batch.
func newAnthropicBatchRequest(customID string, params *anthropicMessageRequest) anthropicBatchItem {
	return anthropicBatchItem{CustomID: customID, Params: params}
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

// schemaRequired extracts a JSON Schema's "required" list.
//
// JSON decoding yields []any, so the []string has to be rebuilt rather than
// asserted.
func schemaRequired(schema map[string]any) []string {
	raw, ok := schema["required"].([]any)
	if !ok {
		return nil
	}

	required := make([]string, 0, len(raw))

	for _, item := range raw {
		if name, ok := item.(string); ok {
			required = append(required, name)
		}
	}

	return required
}

// schemaExtraFields is a JSON Schema document without the keys
// anthropicInputSchema sets itself: "properties", "required" and "type".
func schemaExtraFields(schema map[string]any) map[string]any {
	extras := make(map[string]any, len(schema))

	for key, value := range schema {
		switch key {
		case "properties", "required", "type":
			continue
		default:
			extras[key] = value
		}
	}

	if len(extras) == 0 {
		return nil
	}

	return extras
}
