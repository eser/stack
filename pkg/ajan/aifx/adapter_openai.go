package aifx

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"mime/multipart"
	"net/http"
	"net/textproto"
	"net/url"
	"os"
	"strconv"
	"strings"
	"time"

	"github.com/eser/stack/pkg/ajan/lib"
)

// Sentinel errors for the OpenAI adapter.
var (
	ErrOpenAIGenerationFailed = errors.New("openai generation failed")
	ErrOpenAIStreamFailed     = errors.New("openai stream failed")
	ErrOpenAIBatchFailed      = errors.New("openai batch failed")
)

const (
	openaiProviderName   = "openai"
	openAIDefaultBaseURL = "https://api.openai.com/v1/"

	// openAIMaxRetries is how often a request that failed with a connection
	// error or a transient status is sent again. An attempt that ran out of
	// its timeout is not, as in the SDK.
	openAIMaxRetries = 2

	// openAIMaxBatchOutputBytes caps the batch output file read into memory.
	// OpenAI limits a batch input file to 200 MB, and the output holds one
	// completion per input line, so 512 MiB leaves room for long answers.
	openAIMaxBatchOutputBytes = 512 << 20

	openAIChatPath = "chat/completions"
)

// classifyOpenAIError wraps err with the provider sentinel and, when the underlying
// error is an OpenAI API error, inserts a provider-agnostic classification sentinel
// (e.g. ErrRateLimited) so callers can use errors.Is.
func classifyOpenAIError(providerSentinel error, err error) error {
	return classifyProviderError(providerSentinel, err)
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
	apiKey := ResolveAPIKey(config)
	if apiKey == "" {
		return nil, fmt.Errorf("%w: %w", ErrOpenAIGenerationFailed, ErrInvalidAPIKey)
	}

	if config.Model == "" {
		return nil, fmt.Errorf("%w: %w", ErrOpenAIGenerationFailed, ErrInvalidModel)
	}

	return &OpenAIModel{
		transport: newOpenAITransport(config, apiKey, &http.Client{}), //nolint:exhaustruct
		config:    config,
	}, nil
}

// newOpenAITransport builds the transport the model sends through. The base
// URL is config.BaseURL, else OPENAI_BASE_URL, else the public API, and
// OPENAI_ORG_ID and OPENAI_PROJECT_ID set the organization and project
// headers, as the SDK read them.
func newOpenAITransport(config *ConfigTarget, apiKey string, client *http.Client) *providerTransport {
	headers := http.Header{}
	headers.Set("Authorization", "Bearer "+apiKey)

	if organization := os.Getenv("OPENAI_ORG_ID"); organization != "" {
		headers.Set("OpenAI-Organization", organization)
	}

	if project := os.Getenv("OPENAI_PROJECT_ID"); project != "" {
		headers.Set("OpenAI-Project", project)
	}

	baseURL := config.BaseURL
	if baseURL == "" {
		baseURL = os.Getenv("OPENAI_BASE_URL")
	}

	if baseURL == "" {
		baseURL = openAIDefaultBaseURL
	}

	return &providerTransport{
		client:    client,
		headers:   headers,
		authorize: nil,
		newStatusError: func(req *http.Request, resp *http.Response, body []byte) error {
			return newProviderStatusError(req, resp, openAIErrorObject(body), "")
		},
		baseURL:       baseURL,
		defaultAccept: mediaTypeJSON,
		timeout:       config.RequestTimeout,
		retry:         providerRetryPolicy{maxRetries: openAIMaxRetries, retryAttemptTimeout: false},
	}
}

// openAIErrorObject is the "error" object of an error body, which is what the
// SDK's message carried, or the whole body when it has none.
func openAIErrorObject(body []byte) string {
	var wrapper struct {
		Error json.RawMessage `json:"error"`
	}

	if json.Unmarshal(body, &wrapper) == nil && len(wrapper.Error) > 0 {
		return string(wrapper.Error)
	}

	return string(body)
}

// OpenAIModel implements LanguageModel and BatchCapableModel for OpenAI.
type OpenAIModel struct {
	transport *providerTransport
	config    *ConfigTarget
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

// GetRawClient returns the *http.Client the model sends through.
func (m *OpenAIModel) GetRawClient() any {
	if m.transport == nil {
		return nil
	}

	return m.transport.client
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

	var completion openAIChatCompletion

	err = m.transport.doJSON(ctx, http.MethodPost, openAIChatPath, nil, params, &completion)
	if err != nil {
		return nil, classifyOpenAIError(ErrOpenAIGenerationFailed, err)
	}

	result := m.mapCompletionToResult(&completion)
	result.RawRequest = params
	result.RawResponse = &completion

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

	params.Stream = true

	body, err := json.Marshal(params)
	if err != nil {
		return nil, classifyOpenAIError(ErrOpenAIStreamFailed, fmt.Errorf("encode chat completion request: %w", err))
	}

	streamCtx, cancel := context.WithCancel(ctx)
	eventCh := make(chan StreamEvent, 64) //nolint:mnd

	go m.processStream(streamCtx, body, eventCh, cancel)

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
	uploadedFile, err := m.uploadBatchFile(ctx, jsonlData)
	if err != nil {
		return nil, fmt.Errorf("file upload: %w", classifyOpenAIError(ErrOpenAIBatchFailed, err))
	}

	// Create the batch.
	var batch openAIBatch

	err = m.transport.doJSON(ctx, http.MethodPost, "batches", nil, &openAIBatchCreateRequest{
		CompletionWindow: "24h",
		Endpoint:         "/v1/chat/completions",
		InputFileID:      uploadedFile.ID,
	}, &batch)
	if err != nil {
		return nil, fmt.Errorf("batch create: %w", classifyOpenAIError(ErrOpenAIBatchFailed, err))
	}

	return mapOpenAIBatchToJob(&batch), nil
}

// uploadBatchFile uploads the JSONL input of a batch with purpose "batch".
func (m *OpenAIModel) uploadBatchFile(ctx context.Context, jsonlData []byte) (*openAIFile, error) {
	var body bytes.Buffer

	writer := multipart.NewWriter(&body)

	header := textproto.MIMEHeader{}
	header.Set("Content-Disposition", `form-data; name="file"; filename="anonymous_file"`)
	header.Set("Content-Type", "application/octet-stream")

	part, err := writer.CreatePart(header)
	if err != nil {
		return nil, fmt.Errorf("build batch upload: %w", err)
	}

	_, err = part.Write(jsonlData)
	if err != nil {
		return nil, fmt.Errorf("build batch upload: %w", err)
	}

	err = writer.WriteField("purpose", "batch")
	if err != nil {
		return nil, fmt.Errorf("build batch upload: %w", err)
	}

	err = writer.Close()
	if err != nil {
		return nil, fmt.Errorf("build batch upload: %w", err)
	}

	resp, err := m.transport.send(ctx, &providerRequest{
		query: nil, method: http.MethodPost, path: "files",
		contentType: writer.FormDataContentType(), accept: "", body: body.Bytes(),
	})
	if err != nil {
		return nil, err
	}

	defer closeResponse(resp)

	var file openAIFile

	err = decodeJSONResponse(resp, http.MethodPost, "files", &file)
	if err != nil {
		return nil, err
	}

	return &file, nil
}

// GetBatchJob retrieves the current status of a batch job.
func (m *OpenAIModel) GetBatchJob(
	ctx context.Context,
	jobID string,
) (*BatchJob, error) {
	var batch openAIBatch

	err := m.transport.doJSON(ctx, http.MethodGet, "batches/"+url.PathEscape(jobID), nil, nil, &batch)
	if err != nil {
		return nil, classifyOpenAIError(ErrOpenAIBatchFailed, err)
	}

	return mapOpenAIBatchToJob(&batch), nil
}

// ListBatchJobs lists batch jobs.
func (m *OpenAIModel) ListBatchJobs(
	ctx context.Context,
	opts *ListBatchOptions,
) ([]*BatchJob, error) {
	query := url.Values{}

	if opts != nil {
		if opts.Limit > 0 {
			query.Set("limit", strconv.Itoa(opts.Limit))
		}

		if opts.After != "" {
			query.Set("after", opts.After)
		}
	}

	var page openAIBatchPage

	err := m.transport.doJSON(ctx, http.MethodGet, "batches", query, nil, &page)
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

	resp, err := m.transport.send(ctx, &providerRequest{
		query: nil, method: http.MethodGet,
		path:        "files/" + url.PathEscape(job.Storage.OutputRef) + "/content",
		contentType: "", accept: "application/binary", body: nil,
	})
	if err != nil {
		return nil, fmt.Errorf(
			"download output: %w",
			classifyOpenAIError(ErrOpenAIBatchFailed, err),
		)
	}

	defer closeResponse(resp)

	body, err := lib.ReadAllLimited(resp.Body, openAIMaxBatchOutputBytes)
	if err != nil {
		return nil, fmt.Errorf(
			"read output file %q of batch %q (limit %d bytes; split the batch into smaller jobs if it is larger): %w",
			job.Storage.OutputRef, job.ID, openAIMaxBatchOutputBytes,
			classifyOpenAIError(ErrOpenAIBatchFailed, err),
		)
	}

	return m.parseBatchResults(body)
}

// CancelBatchJob cancels a running batch job.
func (m *OpenAIModel) CancelBatchJob(
	ctx context.Context,
	jobID string,
) error {
	var batch openAIBatch

	err := m.transport.doJSON(ctx, http.MethodPost, "batches/"+url.PathEscape(jobID)+"/cancel", nil, nil, &batch)
	if err != nil {
		return classifyOpenAIError(ErrOpenAIBatchFailed, err)
	}

	return nil
}

// processStream sends the streaming request and maps the chunks to the
// unified StreamEvent channel.
func (m *OpenAIModel) processStream(
	ctx context.Context,
	body []byte,
	eventCh chan<- StreamEvent,
	cancel context.CancelFunc,
) {
	defer close(eventCh)
	defer cancel()

	resp, err := m.transport.send(ctx, &providerRequest{
		query: nil, method: http.MethodPost, path: openAIChatPath,
		contentType: mediaTypeJSON, accept: "", body: body,
	})
	if err != nil {
		sendStreamEvent(ctx, eventCh, newStreamEventError(classifyOpenAIError(ErrOpenAIStreamFailed, err)))

		return
	}

	defer closeResponse(resp)

	acc := &openAIStreamAccumulator{} //nolint:exhaustruct
	decoder := newSSEDecoder(resp.Body)
	done := false

	for decoder.next() {
		data := decoder.event.data

		// Everything after [DONE] is read and dropped, as the SDK did.
		if done {
			continue
		}

		if bytes.HasPrefix(data, []byte("[DONE]")) {
			done = true

			continue
		}

		err = m.handleStreamChunk(ctx, data, acc, eventCh)
		if err != nil {
			sendStreamEvent(ctx, eventCh, newStreamEventError(classifyOpenAIError(ErrOpenAIStreamFailed, err)))

			return
		}
	}

	if err := decoder.err; err != nil {
		if ctxErr := ctx.Err(); ctxErr != nil {
			err = ctxErr
		}

		sendStreamEvent(ctx, eventCh, newStreamEventError(classifyOpenAIError(ErrOpenAIStreamFailed, err)))

		return
	}

	// Emit the final message-done event with usage and stop reason.
	var usage *Usage
	if acc.usage.TotalTokens > 0 {
		usage = &Usage{
			InputTokens:    int(acc.usage.PromptTokens),
			OutputTokens:   int(acc.usage.CompletionTokens),
			TotalTokens:    int(acc.usage.TotalTokens),
			ThinkingTokens: 0,
		}
	}

	var stopReason StopReason
	if len(acc.choices) > 0 {
		stopReason = mapOpenAIChoiceStopReason(acc.finish[0], acc.choices[0].Refusal)
	}

	sendStreamEvent(ctx, eventCh, newStreamEventDone(stopReason, usage))
}

// handleStreamChunk maps one chunk. A chunk that carries an error, or does not
// decode, ends the stream with an error.
func (m *OpenAIModel) handleStreamChunk(
	ctx context.Context,
	data []byte,
	acc *openAIStreamAccumulator,
	eventCh chan<- StreamEvent,
) error {
	var probe struct {
		Error json.RawMessage `json:"error"`
	}

	if json.Unmarshal(data, &probe) == nil && len(probe.Error) > 0 {
		return fmt.Errorf("%w: %s", ErrStreamErrorEvent, errorObjectText(probe.Error))
	}

	var chunk openAIChunk

	err := json.Unmarshal(data, &chunk)
	if err != nil {
		return fmt.Errorf("%w: chat completion chunk: %w", ErrProviderResponseDecode, err)
	}

	acc.add(&chunk)

	// Emit text content deltas. A refusal arrives in its own field and
	// explains why there is no answer, so it streams as text too.
	if len(chunk.Choices) > 0 {
		delta := chunk.Choices[0].Delta
		if delta.Content != nil && *delta.Content != "" {
			sendStreamEvent(ctx, eventCh, newStreamEventContentDelta(*delta.Content))
		}

		if delta.Refusal != nil && *delta.Refusal != "" {
			sendStreamEvent(ctx, eventCh, newStreamEventContentDelta(*delta.Refusal))
		}
	}

	// Detect finished tool calls via the accumulator.
	if tool, ok := acc.justFinishedToolCall(); ok {
		sendStreamEvent(ctx, eventCh, newStreamEventToolCall(&ToolCall{
			ID:        tool.ID,
			Name:      tool.Function.Name,
			Arguments: json.RawMessage(tool.Function.Arguments),
		}))
	}

	return nil
}

// errorObjectText is an error object as the SDK printed it: a JSON string
// without its quotes, anything else as it was sent.
func errorObjectText(raw json.RawMessage) string {
	var text string
	if json.Unmarshal(raw, &text) == nil {
		return text
	}

	return string(raw)
}

// buildParams maps unified GenerateTextOptions to a Chat Completions request.
func (m *OpenAIModel) buildParams(
	opts *GenerateTextOptions,
) (*openAIChatRequest, error) {
	params := &openAIChatRequest{ //nolint:exhaustruct
		Model: m.config.Model,
	}

	messages, err := m.buildOpenAIMessages(opts)
	if err != nil {
		return params, err
	}

	params.Messages = messages

	err = m.applyOpenAITools(params, opts)
	if err != nil {
		return params, err
	}

	err = m.applyOpenAIOptions(params, opts)
	if err != nil {
		return params, err
	}

	return params, nil
}

func (m *OpenAIModel) buildOpenAIMessages(opts *GenerateTextOptions) ([]any, error) {
	messages := make([]any, 0, len(opts.Messages)+1)

	if opts.System != "" {
		messages = append(messages, openAIDeveloperMessage(opts.System))
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

func openAIDeveloperMessage(text string) *openAITextMessage {
	return &openAITextMessage{Content: text, Role: "developer", ToolCallID: ""}
}

func (m *OpenAIModel) applyOpenAITools(
	params *openAIChatRequest,
	opts *GenerateTextOptions,
) error {
	if len(opts.Tools) > 0 {
		tools := make([]openAITool, 0, len(opts.Tools))

		for idx := range opts.Tools {
			tool := &opts.Tools[idx]

			schemaMap, err := decodeToolParameters(tool)
			if err != nil {
				return err
			}

			tools = append(tools, openAITool{
				Type: "function",
				Function: openAIToolFunction{
					Parameters:  schemaMap,
					Name:        tool.Name,
					Description: tool.Description,
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
	params *openAIChatRequest,
	opts *GenerateTextOptions,
) error {
	if opts.ResponseFormat != nil {
		responseFormat, err := mapOpenAIResponseFormat(opts.ResponseFormat)
		if err != nil {
			return err
		}

		params.ResponseFormat = responseFormat
	}

	err := checkEffort(opts.Effort)
	if err != nil {
		return err
	}

	switch {
	case opts.Effort != EffortDefault:
		// The Effort constants are the API's own reasoning_effort values,
		// including xhigh and max on the models that support them.
		params.ReasoningEffort = string(opts.Effort)
	case opts.ThinkingBudget != nil:
		params.ReasoningEffort = mapOpenAIReasoningEffort(*opts.ThinkingBudget)
	}

	if opts.MaxTokens > 0 {
		maxTokens := int64(opts.MaxTokens)
		params.MaxCompletionTokens = &maxTokens
	}

	if opts.Temperature != nil {
		temperature := *opts.Temperature
		params.Temperature = &temperature
	}

	if opts.TopP != nil {
		topP := *opts.TopP
		params.TopP = &topP
	}

	if len(opts.StopWords) > 0 {
		params.Stop = opts.StopWords
	}

	return nil
}

// mapMessage converts a unified Message to one or more OpenAI messages.
func (m *OpenAIModel) mapMessage(msg Message) ([]any, error) {
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

func (m *OpenAIModel) mapUserMessage(msg Message) ([]any, error) {
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
		return []any{&openAITextMessage{Content: openaiExtractText(msg.Content), Role: "user", ToolCallID: ""}}, nil
	}

	return m.mapMultimodalUserMessage(msg)
}

func (m *OpenAIModel) mapMultimodalUserMessage(msg Message) ([]any, error) {
	parts := make([]any, 0, len(msg.Content))

	for _, block := range msg.Content {
		switch block.Type { //nolint:exhaustive
		case ContentBlockText:
			parts = append(parts, &openAITextPart{Type: "text", Text: block.Text})

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

				parts = append(parts, &openAIImagePart{
					ImageURL: openAIImageURL{URL: block.Image.URL, Detail: detail},
					Type:     "image_url",
				})
			}

		case ContentBlockAudio:
			if block.Audio != nil {
				parts = append(parts, &openAIAudioPart{
					InputAudio: openAIInputAudio{
						Data:   block.Audio.URL,
						Format: mapOpenAIAudioFormat(block.Audio.MIMEType),
					},
					Type: "input_audio",
				})
			}
		}
	}

	return []any{&openAITextMessage{Content: parts, Role: "user", ToolCallID: ""}}, nil
}

func (m *OpenAIModel) mapAssistantMessage(msg Message) ([]any, error) {
	assistantMsg := &openAIAssistantMessage{Content: nil, Role: "assistant", ToolCalls: nil}

	text := ""

	for _, block := range msg.Content {
		switch block.Type { //nolint:exhaustive
		case ContentBlockText:
			text += block.Text

		case ContentBlockToolCall:
			if block.ToolCall != nil {
				assistantMsg.ToolCalls = append(assistantMsg.ToolCalls, openAIToolCallJSON{
					ID:   block.ToolCall.ID,
					Type: "function",
					Function: openAIToolCallFunction{
						Name:      block.ToolCall.Name,
						Arguments: string(block.ToolCall.Arguments),
					},
				})
			}
		}
	}

	if text != "" {
		assistantMsg.Content = &text
	}

	return []any{assistantMsg}, nil
}

func (m *OpenAIModel) mapSystemMessage(msg Message) ([]any, error) {
	return []any{openAIDeveloperMessage(openaiExtractText(msg.Content))}, nil
}

func (m *OpenAIModel) mapToolMessage(msg Message) ([]any, error) {
	var results []any

	for _, block := range msg.Content {
		if block.Type == ContentBlockToolResult && block.ToolResult != nil {
			results = append(results, &openAITextMessage{
				Content:    block.ToolResult.Content,
				Role:       "tool",
				ToolCallID: block.ToolResult.ToolCallID,
			})
		}
	}

	return results, nil
}

// mapCompletionToResult maps an OpenAI chat completion to our unified GenerateTextResult.
func (m *OpenAIModel) mapCompletionToResult(completion *openAIChatCompletion) *GenerateTextResult {
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
	result.StopReason = mapOpenAIChoiceStopReason(choice.FinishReason, choice.Message.Refusal)

	content := make([]ContentBlock, 0, len(choice.Message.ToolCalls)+2) //nolint:mnd

	// Add text content. A refusal comes in its own field instead of the
	// content; it is kept as text, since it explains why there is no answer.
	for _, text := range []string{choice.Message.Content, choice.Message.Refusal} {
		if text == "" {
			continue
		}

		content = append(content, ContentBlock{
			Type:       ContentBlockText,
			Text:       text,
			Image:      nil,
			Audio:      nil,
			File:       nil,
			ToolCall:   nil,
			ToolResult: nil,
			Thinking:   nil,
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
			Thinking:   nil,
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
			Body:     params,
			CustomID: item.CustomID,
			Method:   "POST",
			URL:      "/v1/chat/completions",
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

		// Parse the completion from the response body. A body that is JSON
		// but not an object (the SDK decoded such a body leniently) maps to an
		// empty result rather than an error.
		var completion openAIChatCompletion

		body := bytes.TrimSpace(respLine.Response.Body)
		if len(body) == 0 || body[0] == '{' {
			err = json.Unmarshal(respLine.Response.Body, &completion)
		} else if !json.Valid(body) {
			err = fmt.Errorf("%w: the response body is not JSON", ErrProviderResponseDecode)
		}

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
func mapOpenAIBatchToJob(batch *openAIBatch) *BatchJob {
	job := &BatchJob{
		ID:          batch.ID,
		Status:      mapOpenAIBatchStatus(batch.Status),
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
		job.CreatedAt = time.Unix(batch.CreatedAt, 0)
	}

	if batch.CompletedAt > 0 {
		completed := time.Unix(batch.CompletedAt, 0)
		job.CompletedAt = &completed
	}

	if batch.Errors != nil && len(batch.Errors.Data) > 0 {
		errMsgs := make([]string, 0, len(batch.Errors.Data))
		for _, batchErr := range batch.Errors.Data {
			errMsgs = append(errMsgs, batchErr.Message)
		}

		job.Error = strings.Join(errMsgs, "; ")
	}

	return job
}

// mapOpenAIFinishReason converts OpenAI finish_reason to our unified StopReason.
// content_filter means a filter withheld the answer, so it is a refusal;
// function_call is the deprecated name of tool_calls. A missing reason, which
// some OpenAI-compatible servers send, is taken as a finished answer; any other
// reason has no closer match than stop.
func mapOpenAIFinishReason(reason string) StopReason {
	switch reason {
	case "stop", "":
		return StopReasonEndTurn
	case "length":
		return StopReasonMaxTokens
	case "tool_calls", "function_call":
		return StopReasonToolUse
	case "content_filter":
		return StopReasonRefusal
	default:
		return StopReasonStop
	}
}

// mapOpenAIChoiceStopReason is the stop reason of a choice. A model that
// declines a structured-output request sets message.refusal and still finishes
// with "stop", so a refusal text decides it.
func mapOpenAIChoiceStopReason(finishReason, refusal string) StopReason {
	if refusal != "" {
		return StopReasonRefusal
	}

	return mapOpenAIFinishReason(finishReason)
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
func mapOpenAIToolChoice(choice ToolChoice) string {
	switch choice {
	case ToolChoiceAuto:
		return "auto"
	case ToolChoiceNone:
		return "none"
	case ToolChoiceRequired:
		return "required"
	default:
		return "auto"
	}
}

// mapOpenAIResponseFormat converts our ResponseFormat to OpenAI's
// response_format parameter. A json_schema format whose schema is missing or
// not an object fails here, before the request is sent.
func mapOpenAIResponseFormat(responseFormat *ResponseFormat) (*openAIResponseFormat, error) {
	switch responseFormat.Type {
	case "json_schema":
		schema, err := decodeResponseSchema(responseFormat.JSONSchema)
		if err != nil {
			return nil, err
		}

		return &openAIResponseFormat{
			JSONSchema: &openAIJSONSchemaFormat{Schema: schema, Name: responseFormat.Name, Strict: true},
			Type:       "json_schema",
		}, nil

	case "json_object":
		return &openAIResponseFormat{JSONSchema: nil, Type: "json_object"}, nil

	default:
		return &openAIResponseFormat{JSONSchema: nil, Type: "text"}, nil
	}
}

// mapOpenAIReasoningEffort maps a thinking budget to OpenAI's reasoning_effort parameter.
// Budget values are mapped to low/medium/high effort levels.
func mapOpenAIReasoningEffort(budget int) string {
	const (
		lowThreshold  = 1000
		highThreshold = 10000
	)

	switch {
	case budget <= lowThreshold:
		return openAIReasoningLow
	case budget >= highThreshold:
		return openAIReasoningHigh
	default:
		return openAIReasoningMedium
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
