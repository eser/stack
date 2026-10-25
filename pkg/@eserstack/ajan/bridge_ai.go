// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

//go:build !wasip1

package main

import (
	"context"
	"encoding/base64"
	"encoding/json"
	"sync"
	"sync/atomic"
	"time"

	"github.com/eser/stack/pkg/ajan/aifx"
)

// ---------------------------------------------------------------------------
// AI bridge state
// ---------------------------------------------------------------------------

// aiRegistry is created on first use, not at package init: creating it
// registers every provider factory, work a process that loads the bridge
// without calling AI should not pay for (TASK-272).
var (
	aiRegistryOnce     sync.Once
	aiRegistryInstance atomic.Pointer[aifx.Registry]
)

// aiRegistry returns the bridge's model registry, creating it on first use.
func aiRegistry() *aifx.Registry {
	aiRegistryOnce.Do(func() {
		aiRegistryInstance.Store(aifx.NewRegistry(aifx.WithDefaultFactories()))
	})

	return aiRegistryInstance.Load()
}

var (
	modelHandles = make(map[string]aifx.LanguageModel)
	// modelRegistryNames maps a model handle to the name aiRegistry knows it by.
	//
	// The two identifiers differ: AddModel is called with a generated "cfg-N"
	// name and the caller is handed a separate "model-N" handle, so without this
	// there is no way to reach back into the registry to remove the entry. That
	// is why every model created ever since has stayed in aiRegistry for the
	// process lifetime, closed but still referenced.
	modelRegistryNames = make(map[string]string)
	// modelInFlight counts the calls currently running against each model
	// handle, keyed by that handle.
	//
	// bridgeAiCloseModel removes the handle and then waits for the count to
	// drain, so a model can never be closed out from under a generation that is
	// already running -- the protection streamState.wg gives streams.
	modelInFlight = make(map[string]*sync.WaitGroup)
	streamHandles = make(map[string]*streamState)
)

type streamState struct {
	iter   *aifx.StreamIterator
	cancel context.CancelFunc

	// requestID names this stream for cancellation. Its registration lives as
	// long as the stream does, not as long as the call that created it.
	requestID string

	// mu serializes reads on one handle. StreamIterator is not safe for
	// concurrent use, and FFI calls from worker threads (decision-37) let two
	// reads of the same handle land on different threads.
	mu sync.Mutex

	wg sync.WaitGroup
}

// acquireModel resolves a model handle and registers a call as in flight
// against it. The returned release func must run when the call finishes.
//
// Taking the reference and marking it in use happen under one lock, so a close
// that removes the handle either loses the race (and waits for this call) or
// wins it (and this call reports the handle as gone).
func acquireModel(handle string) (aifx.LanguageModel, func(), bool) {
	handleMu.Lock()
	defer handleMu.Unlock()

	model, ok := modelHandles[handle]
	if !ok {
		return nil, func() {}, false
	}

	wg, ok := modelInFlight[handle]
	if !ok {
		// Created on first use so handles registered directly into modelHandles
		// (as tests do) are still covered.
		wg = &sync.WaitGroup{}
		modelInFlight[handle] = wg
	}

	wg.Add(1)

	return model, wg.Done, true
}

// ---------------------------------------------------------------------------
// JSON wire types (camelCase for TypeScript consumers)
// ---------------------------------------------------------------------------

type aiConfigRequest struct {
	Properties       map[string]any `json:"properties"`
	Provider         string         `json:"provider"`
	APIKey           string         `json:"apiKey"`
	Model            string         `json:"model"`
	BaseURL          string         `json:"baseUrl"`
	ProjectID        string         `json:"projectId"`
	Location         string         `json:"location"`
	MaxTokens        int            `json:"maxTokens"`
	Temperature      float64        `json:"temperature"`
	RequestTimeoutMs int            `json:"requestTimeoutMs"`
}

type aiMessageRequest struct {
	Role    string              `json:"role"`
	Content []aiContentBlockReq `json:"content"`
}

// aiImagePartReq mirrors aifx.ImagePart. Data is base64 because a Uint8Array
// does not survive JSON.stringify -- it serialises as {"0":..,"1":..}.
type aiImagePartReq struct {
	URL      string `json:"url,omitempty"`
	MIMEType string `json:"mimeType,omitempty"`
	Detail   string `json:"detail,omitempty"`
	Data     string `json:"data,omitempty"`
}

type aiAudioPartReq struct {
	URL      string `json:"url,omitempty"`
	MIMEType string `json:"mimeType,omitempty"`
	Data     string `json:"data,omitempty"`
}

type aiFilePartReq struct {
	URI      string `json:"uri,omitempty"`
	MIMEType string `json:"mimeType,omitempty"`
}

// aiToolCallReq is a tool call travelling *into* the model, i.e. replayed as
// part of an assistant turn in the message history.
type aiToolCallReq struct {
	Arguments json.RawMessage `json:"arguments,omitempty"`
	ID        string          `json:"id"`
	Name      string          `json:"name"`
}

type aiToolResultReq struct {
	ToolCallID string `json:"toolCallId"`
	Content    string `json:"content"`
	IsError    bool   `json:"isError,omitempty"`
}

// aiThinkingPart mirrors aifx.ThinkingPart in both directions: a thinking
// block in a model's answer, and the same block replayed in the next request.
// Its fields cross unchanged, because the provider checks them.
type aiThinkingPart struct {
	Text         string `json:"text,omitempty"`
	Signature    string `json:"signature,omitempty"`
	RedactedData string `json:"redactedData,omitempty"`
}

// aiContentBlockReq carries one block of a message.
//
// Everything but Text used to be missing, and the effect was not a decode
// error: a block of any other kind arrived as {"type":"image"} with no payload,
// so the model was asked to describe an image it was never sent and answered
// confidently about nothing.
type aiContentBlockReq struct {
	Image      *aiImagePartReq  `json:"image,omitempty"`
	Audio      *aiAudioPartReq  `json:"audio,omitempty"`
	File       *aiFilePartReq   `json:"file,omitempty"`
	ToolCall   *aiToolCallReq   `json:"toolCall,omitempty"`
	ToolResult *aiToolResultReq `json:"toolResult,omitempty"`
	Thinking   *aiThinkingPart  `json:"thinking,omitempty"`
	Type       string           `json:"type"`
	Text       string           `json:"text,omitempty"`
}

// aiToolDefinitionReq mirrors aifx.ToolDefinition.
//
// Parameters is json.RawMessage rather than []byte: []byte would demand a
// base64 string and reject the JSON Schema object TypeScript actually sends.
type aiToolDefinitionReq struct {
	Parameters  json.RawMessage `json:"parameters,omitempty"`
	Name        string          `json:"name"`
	Description string          `json:"description,omitempty"`
}

type aiResponseFormatReq struct {
	JSONSchema json.RawMessage `json:"jsonSchema,omitempty"`
	Type       string          `json:"type"`
	Name       string          `json:"name,omitempty"`
}

type aiSafetySettingReq struct {
	Category  string `json:"category"`
	Threshold string `json:"threshold"`
}

// aiGenerateRequest is the full generation request.
//
// Temperature, TopP and ThinkingBudget are pointers so that "unset" stays
// distinguishable from a deliberate zero -- temperature 0 is a real, meaningful
// setting, and a non-pointer field would pin every request to it.
type aiGenerateRequest struct {
	Extensions     map[string]any        `json:"extensions,omitempty"`
	Temperature    *float64              `json:"temperature,omitempty"`
	TopP           *float64              `json:"topP,omitempty"`
	ThinkingBudget *int                  `json:"thinkingBudget,omitempty"`
	ResponseFormat *aiResponseFormatReq  `json:"responseFormat,omitempty"`
	Messages       []aiMessageRequest    `json:"messages"`
	Tools          []aiToolDefinitionReq `json:"tools,omitempty"`
	StopWords      []string              `json:"stopWords,omitempty"`
	SafetySettings []aiSafetySettingReq  `json:"safetySettings,omitempty"`
	System         string                `json:"system"`
	ToolChoice     string                `json:"toolChoice"`
	// Effort is one of low, medium, high, xhigh and max, or empty for the
	// provider default. The adapter that uses it rejects any other value.
	Effort string `json:"effort,omitempty"`
	// RequestID names this call so it can be cancelled while it runs. Optional:
	// a caller that supplies none gets an uncancellable request, which is what
	// every caller got before cancellation existed.
	RequestID string `json:"requestId,omitempty"`
	MaxTokens int    `json:"maxTokens"`
}

// aiContentBlockResp carries one block of a model's answer.
//
// ID/Name/Arguments exist because a tool call used to be flattened into Text:
// the response said `{"type":"tool_call","text":"get_weather"}`, which names the
// tool and discards the call id and the arguments -- everything a caller needs
// to actually run it. TypeScript then dropped the block entirely, so the loss
// was invisible from either end.
//
// Thinking carries a thinking block whole, so the caller can send it back in
// the next request of a multi-turn call; Text stays the answer text only.
type aiContentBlockResp struct {
	Thinking  *aiThinkingPart `json:"thinking,omitempty"`
	Arguments json.RawMessage `json:"arguments,omitempty"`
	Type      string          `json:"type"`
	Text      string          `json:"text,omitempty"`
	ID        string          `json:"id,omitempty"`
	Name      string          `json:"name,omitempty"`
}

type aiUsageResp struct {
	InputTokens    int `json:"inputTokens"`
	OutputTokens   int `json:"outputTokens"`
	TotalTokens    int `json:"totalTokens"`
	ThinkingTokens int `json:"thinkingTokens,omitempty"`
}

type aiGenerateResponse struct {
	Content    []aiContentBlockResp `json:"content,omitempty"`
	StopReason string               `json:"stopReason,omitempty"`
	Usage      aiUsageResp          `json:"usage"`
	ModelID    string               `json:"modelId,omitempty"`
	Error      string               `json:"error,omitempty"`
}

// aiStreamEventResponse is one streamed event.
//
// The tool-call fields are separate from TextDelta on purpose: a tool-call
// delta used to be sent by putting the tool's *name* in TextDelta, so a
// consumer concatenating deltas into the answer spliced tool names into the
// prose, and the arguments never arrived at all.
type aiStreamEventResponse struct {
	Usage          *aiUsageResp    `json:"usage,omitempty"`
	Thinking       *aiThinkingPart `json:"thinking,omitempty"`
	ArgumentsDelta json.RawMessage `json:"argumentsDelta,omitempty"`
	Type           string          `json:"type"`
	TextDelta      string          `json:"textDelta,omitempty"`
	StopReason     string          `json:"stopReason,omitempty"`
	Error          string          `json:"error,omitempty"`
	ErrorKind      string          `json:"errorKind,omitempty"`
	ToolCallID     string          `json:"toolCallId,omitempty"`
	ToolCallName   string          `json:"toolCallName,omitempty"`
	ErrorStatus    int             `json:"errorStatus,omitempty"`
}

// ---------------------------------------------------------------------------
// AI batch wire types
// ---------------------------------------------------------------------------

type aiBatchStorageJSON struct {
	Properties map[string]any `json:"properties,omitempty"`
	Type       string         `json:"type"`
	InputRef   string         `json:"inputRef,omitempty"`
	OutputRef  string         `json:"outputRef,omitempty"`
}

type aiBatchJobJSON struct {
	CompletedAt *time.Time          `json:"completedAt,omitempty"`
	Storage     *aiBatchStorageJSON `json:"storage,omitempty"`
	Error       string              `json:"error,omitempty"`
	ID          string              `json:"id"`
	Status      string              `json:"status"`
	CreatedAt   time.Time           `json:"createdAt"`
	TotalCount  int                 `json:"totalCount"`
	DoneCount   int                 `json:"doneCount"`
	FailedCount int                 `json:"failedCount"`
}

type aiBatchItemRequest struct {
	Options  aiGenerateRequest `json:"options"`
	CustomID string            `json:"customId"`
}

type aiBatchSubmitRequest struct {
	// RequestID names this call so it can be cancelled while it runs.
	RequestID   string               `json:"requestId,omitempty"`
	Items       []aiBatchItemRequest `json:"items"`
	ModelHandle string               `json:"modelHandle"`
}

type aiBatchHandleRequest struct {
	// RequestID names this call so it can be cancelled while it runs.
	RequestID   string `json:"requestId,omitempty"`
	ModelHandle string `json:"modelHandle"`
	JobID       string `json:"jobId"`
}

type aiBatchListRequest struct {
	// RequestID names this call so it can be cancelled while it runs.
	RequestID   string `json:"requestId,omitempty"`
	After       string `json:"after,omitempty"`
	ModelHandle string `json:"modelHandle"`
	Limit       int    `json:"limit,omitempty"`
}

type aiBatchDownloadRequest struct {
	// RequestID names this call so it can be cancelled while it runs.
	RequestID   string         `json:"requestId,omitempty"`
	Job         aiBatchJobJSON `json:"job"`
	ModelHandle string         `json:"modelHandle"`
}

type aiBatchJobResponse struct {
	Job   *aiBatchJobJSON `json:"job,omitempty"`
	Error string          `json:"error,omitempty"`
}

type aiBatchListResponse struct {
	Jobs  []*aiBatchJobJSON `json:"jobs,omitempty"`
	Error string            `json:"error,omitempty"`
}

type aiBatchResultItemJSON struct {
	Result   *aiGenerateResponse `json:"result,omitempty"`
	CustomID string              `json:"customId"`
	Error    string              `json:"error,omitempty"`
}

type aiBatchDownloadResponse struct {
	Results []*aiBatchResultItemJSON `json:"results,omitempty"`
	Error   string                   `json:"error,omitempty"`
}

// aiErrorResponse is errorResponse for AI failures: it takes the error VALUE.
//
// That distinction is the whole point. errorResponse's parameter is a string,
// so every AI call site had already run err.Error() before calling it -- the
// classification was destroyed at the call site, and widening the envelope
// alone would have produced fields that were empty on every response.
func aiErrorResponse(prefix string, err error) string {
	return marshalResponse(aiHandleResponse{ //nolint:exhaustruct
		Error:       prefix + err.Error(),
		ErrorKind:   aifx.ErrorKind(err),
		ErrorStatus: aifx.ErrorStatus(err),
	})
}

// drainAIHandles snapshots and clears the stream and model registries. Streams
// are cancelled and waited for, then generations already in flight finish
// before their models are torn down.
func drainAIHandles() shutdownStep {
	handleMu.Lock()

	streams := make([]*streamState, 0, len(streamHandles))
	for _, s := range streamHandles {
		streams = append(streams, s)
	}

	modelCalls := make([]*sync.WaitGroup, 0, len(modelInFlight))
	for _, wg := range modelInFlight {
		modelCalls = append(modelCalls, wg)
	}

	clear(streamHandles)
	clear(modelHandles)
	clear(modelRegistryNames)
	clear(modelInFlight)
	handleMu.Unlock()

	return shutdownStep{
		cancel: func() {
			for _, s := range streams {
				s.cancel()
			}
		},
		wait: func() {
			for _, s := range streams {
				s.wg.Wait()
			}

			for _, wg := range modelCalls {
				wg.Wait()
			}
		},
		release: func() {
			// Through the registry, which owns every model this bridge created
			// and closes each one itself. Closing a snapshot of modelHandles here
			// as well would close each model twice. A registry that was never
			// created has no models.
			if registry := aiRegistryInstance.Load(); registry != nil {
				_ = registry.Close(context.Background())
			}
		},
	}
}

// ---------------------------------------------------------------------------
// AI bridge functions
// ---------------------------------------------------------------------------

// bridgeAiCreateModel parses a JSON config, creates a model via aifx, and
// stores it under a generated handle. Returns JSON with the handle.
func bridgeAiCreateModel(configJSON string) string {
	var req aiConfigRequest
	if err := json.Unmarshal([]byte(configJSON), &req); err != nil {
		return errorResponse("invalid config JSON: " + err.Error())
	}

	const defaultTimeout = 60 * time.Second

	timeout := durationOrDefault(req.RequestTimeoutMs, defaultTimeout)

	cfg := &aifx.ConfigTarget{ //nolint:exhaustruct
		Provider:       req.Provider,
		APIKey:         req.APIKey,
		Model:          req.Model,
		BaseURL:        req.BaseURL,
		ProjectID:      req.ProjectID,
		Location:       req.Location,
		MaxTokens:      req.MaxTokens,
		Temperature:    req.Temperature,
		RequestTimeout: timeout,
		Properties:     req.Properties,
	}

	registryName := newHandle("cfg")

	model, err := aiRegistry().AddModel(context.Background(), registryName, cfg)
	if err != nil {
		return aiErrorResponse("create model: ", err)
	}

	handle := newHandle("model")

	handleMu.Lock()
	modelHandles[handle] = model
	modelRegistryNames[handle] = registryName
	modelInFlight[handle] = &sync.WaitGroup{}
	handleMu.Unlock()

	return marshalResponse(aiHandleResponse{Handle: handle}) //nolint:exhaustruct
}

// bridgeAiGenerateText performs a blocking text generation for the given model handle.
func bridgeAiGenerateText(modelHandle, optionsJSON string) string {
	model, release, ok := acquireModel(modelHandle)
	if !ok {
		return errorResponse("model handle not found: " + modelHandle)
	}
	defer release()

	opts, requestID, err := parseGenerateRequestWithID(optionsJSON)
	if err != nil {
		return errorResponse("invalid options: " + err.Error())
	}

	// Registered before any provider work starts, so a cancel that arrives
	// first is honoured rather than racing past an unregistered request.
	ctx, done, ok := beginCancellable(requestID)
	defer done()

	if !ok {
		return aiErrorResponse("generation cancelled: ", context.Canceled)
	}

	result, err := model.GenerateText(ctx, opts)
	if err != nil {
		return aiErrorResponse("generation failed: ", err)
	}

	return marshalResponse(mapGenerateResult(result))
}

// bridgeAiStreamText starts a streaming text generation and returns a stream handle.
func bridgeAiStreamText(modelHandle, optionsJSON string) string {
	// Held for the duration of the StreamText call itself, which is where the
	// provider connection is established. Iteration afterwards is governed by
	// the stream handle, whose own lifetime (streamState.wg) a caller ends with
	// bridgeAiFreeStream.
	model, release, ok := acquireModel(modelHandle)
	if !ok {
		return errorResponse("model handle not found: " + modelHandle)
	}
	defer release()

	opts, requestID, err := parseGenerateRequestWithID(optionsJSON)
	if err != nil {
		return errorResponse("invalid options: " + err.Error())
	}

	ctx, cancel := context.WithCancel(context.Background()) //nolint:gosec // cancel is stored in state.cancel and invoked by Close and by the drain path in ...StreamRead

	// A stream's cancel outlives this function -- it is what stops the
	// iterator mid-flight -- so the registration is dropped when the stream is
	// freed rather than when this returns.
	if !beginAIRequest(requestID, cancel) {
		return aiErrorResponse("stream cancelled: ", context.Canceled)
	}

	iter, err := model.StreamText(ctx, opts)
	if err != nil {
		endAIRequest(requestID)
		cancel()

		return aiErrorResponse("stream failed: ", err)
	}

	handle := newHandle("stream")

	handleMu.Lock()
	streamHandles[handle] = &streamState{iter: iter, cancel: cancel, requestID: requestID}
	handleMu.Unlock()

	return marshalResponse(aiHandleResponse{Handle: handle}) //nolint:exhaustruct
}

// bridgeAiStreamRead reads the next event from a stream. Returns JSON event
// or "null" when the stream is complete or the handle is gone.
func bridgeAiStreamRead(streamHandle string) string {
	handleMu.RLock()
	state, ok := streamHandles[streamHandle]
	if ok {
		state.wg.Add(1)
	}
	handleMu.RUnlock()

	// "null" for an unknown handle is the deliberate stream-done sentinel:
	// draining past the end and reading after a close both look the same to the
	// caller. Close, not this read, is the authoritative lifecycle signal.
	if !ok {
		return "null"
	}
	defer state.wg.Done()

	// The iterator carries mutable position state, so reads on one handle are
	// serialized rather than allowed to race.
	state.mu.Lock()
	defer state.mu.Unlock()

	if !state.iter.Next() {
		// Stream ended — clean up.
		handleMu.Lock()
		delete(streamHandles, streamHandle)
		handleMu.Unlock()

		endAIRequest(state.requestID)

		if err := state.iter.Err(); err != nil {
			return marshalResponse(aiStreamEventResponse{ //nolint:exhaustruct
				Type:        "error",
				Error:       err.Error(),
				ErrorKind:   aifx.ErrorKind(err),
				ErrorStatus: aifx.ErrorStatus(err),
			})
		}

		return "null"
	}

	event := state.iter.Current()

	return marshalResponse(mapStreamEvent(event))
}

// bridgeAiCloseModel closes and removes a model handle.
//
// Closing an unknown or already-closed handle succeeds: close is idempotent
// across every handle kind in this bridge.
func bridgeAiCloseModel(modelHandle string) string {
	handleMu.Lock()
	model, ok := modelHandles[modelHandle]
	registryName := modelRegistryNames[modelHandle]
	inFlight := modelInFlight[modelHandle]

	if ok {
		delete(modelHandles, modelHandle)
		delete(modelRegistryNames, modelHandle)
		delete(modelInFlight, modelHandle)
	}

	handleMu.Unlock()

	if !ok {
		return "{}"
	}

	// The handle is already unreachable, so no new call can start; wait for the
	// ones still running rather than closing the model underneath them.
	if inFlight != nil {
		inFlight.Wait()
	}

	// Through the registry when we know its name: RemoveModel closes the model
	// itself, so calling Close here as well would close it twice. Providers
	// mostly tolerate that today, which is exactly why it would go unnoticed
	// until one of them did not.
	if registryName != "" {
		if err := aiRegistry().RemoveModel(context.Background(), registryName); err != nil {
			return aiErrorResponse("close failed: ", err)
		}

		return "{}"
	}

	if err := model.Close(context.Background()); err != nil {
		return aiErrorResponse("close failed: ", err)
	}

	return "{}"
}

// bridgeAiFreeStream cancels and removes a stream handle.
//
// Freeing an unknown or already-freed handle succeeds: close is idempotent
// across every handle kind in this bridge.
//
//nolint:unparam // uniform string return is part of the exported C ABI
func bridgeAiFreeStream(streamHandle string) string {
	handleMu.Lock()
	state, ok := streamHandles[streamHandle]
	if ok {
		delete(streamHandles, streamHandle)
	}
	handleMu.Unlock()

	if ok {
		endAIRequest(state.requestID)
	}

	if !ok {
		return "{}"
	}

	state.cancel()
	state.wg.Wait()

	return "{}"
}

// ---------------------------------------------------------------------------
// Mapping helpers
// ---------------------------------------------------------------------------

func convertOptions(req *aiGenerateRequest) *aifx.GenerateTextOptions {
	messages := make([]aifx.Message, 0, len(req.Messages))

	for _, m := range req.Messages {
		blocks := make([]aifx.ContentBlock, 0, len(m.Content))

		for i := range m.Content {
			if block, ok := convertContentBlock(&m.Content[i]); ok {
				blocks = append(blocks, block)
			}
		}

		messages = append(messages, aifx.Message{
			Role:    aifx.Role(m.Role),
			Content: blocks,
		})
	}

	opts := &aifx.GenerateTextOptions{ //nolint:exhaustruct
		Messages:       messages,
		System:         req.System,
		MaxTokens:      req.MaxTokens,
		Temperature:    req.Temperature,
		TopP:           req.TopP,
		StopWords:      req.StopWords,
		ThinkingBudget: req.ThinkingBudget,
		Effort:         aifx.Effort(req.Effort),
		Extensions:     req.Extensions,
	}

	if req.ToolChoice != "" {
		opts.ToolChoice = aifx.ToolChoice(req.ToolChoice)
	}

	for _, tool := range req.Tools {
		opts.Tools = append(opts.Tools, aifx.ToolDefinition{
			Name:        tool.Name,
			Description: tool.Description,
			Parameters:  tool.Parameters,
		})
	}

	for _, setting := range req.SafetySettings {
		opts.SafetySettings = append(opts.SafetySettings, aifx.SafetySetting{
			Category:  setting.Category,
			Threshold: setting.Threshold,
		})
	}

	if req.ResponseFormat != nil {
		opts.ResponseFormat = &aifx.ResponseFormat{
			Type:       req.ResponseFormat.Type,
			Name:       req.ResponseFormat.Name,
			JSONSchema: []byte(req.ResponseFormat.JSONSchema),
		}
	}

	return opts
}

// convertContentBlock turns one wire block into an aifx block.
//
// A block whose payload is missing is skipped rather than passed through empty:
// `{"type":"image"}` with no image is a malformed request, and forwarding it
// would ask the provider to look at nothing. The false return says so instead
// of panicking on the nil pointer.
func convertContentBlock(b *aiContentBlockReq) (aifx.ContentBlock, bool) {
	switch b.Type {
	case "text":
		return aifx.ContentBlock{Type: aifx.ContentBlockText, Text: b.Text}, true //nolint:exhaustruct

	case "image":
		if b.Image == nil {
			return aifx.ContentBlock{}, false //nolint:exhaustruct
		}

		return aifx.ContentBlock{ //nolint:exhaustruct
			Type: aifx.ContentBlockImage,
			Image: &aifx.ImagePart{
				URL:      b.Image.URL,
				MIMEType: b.Image.MIMEType,
				Detail:   aifx.ImageDetail(b.Image.Detail),
				Data:     decodeBase64Payload(b.Image.Data),
			},
		}, true

	case "audio":
		if b.Audio == nil {
			return aifx.ContentBlock{}, false //nolint:exhaustruct
		}

		return aifx.ContentBlock{ //nolint:exhaustruct
			Type: aifx.ContentBlockAudio,
			Audio: &aifx.AudioPart{
				URL:      b.Audio.URL,
				MIMEType: b.Audio.MIMEType,
				Data:     decodeBase64Payload(b.Audio.Data),
			},
		}, true

	case "file":
		if b.File == nil {
			return aifx.ContentBlock{}, false //nolint:exhaustruct
		}

		return aifx.ContentBlock{ //nolint:exhaustruct
			Type: aifx.ContentBlockFile,
			File: &aifx.FilePart{URI: b.File.URI, MIMEType: b.File.MIMEType},
		}, true

	case "tool_call":
		if b.ToolCall == nil {
			return aifx.ContentBlock{}, false //nolint:exhaustruct
		}

		return aifx.ContentBlock{ //nolint:exhaustruct
			Type: aifx.ContentBlockToolCall,
			ToolCall: &aifx.ToolCall{
				ID:        b.ToolCall.ID,
				Name:      b.ToolCall.Name,
				Arguments: b.ToolCall.Arguments,
			},
		}, true

	case "tool_result":
		if b.ToolResult == nil {
			return aifx.ContentBlock{}, false //nolint:exhaustruct
		}

		return aifx.ContentBlock{ //nolint:exhaustruct
			Type: aifx.ContentBlockToolResult,
			ToolResult: &aifx.ToolResult{
				ToolCallID: b.ToolResult.ToolCallID,
				Content:    b.ToolResult.Content,
				IsError:    b.ToolResult.IsError,
			},
		}, true

	case "thinking":
		if b.Thinking == nil {
			return aifx.ContentBlock{}, false //nolint:exhaustruct
		}

		return aifx.NewThinkingBlock(aifx.ThinkingPart{
			Text:         b.Thinking.Text,
			Signature:    b.Thinking.Signature,
			RedactedData: b.Thinking.RedactedData,
		}), true

	default:
		return aifx.ContentBlock{}, false //nolint:exhaustruct
	}
}

// newThinkingPartResp carries an aifx thinking block to the wire unchanged.
func newThinkingPartResp(part *aifx.ThinkingPart) *aiThinkingPart {
	return &aiThinkingPart{
		Text:         part.Text,
		Signature:    part.Signature,
		RedactedData: part.RedactedData,
	}
}

// decodeBase64Payload decodes an inline binary payload, yielding nil for both
// "absent" and "undecodable" -- the URL field is the alternative carrier, so a
// bad blob should not fail the whole request.
func decodeBase64Payload(encoded string) []byte {
	if encoded == "" {
		return nil
	}

	decoded, err := base64.StdEncoding.DecodeString(encoded)
	if err != nil {
		return nil
	}

	return decoded
}

func parseGenerateRequest(optionsJSON string) (*aifx.GenerateTextOptions, error) {
	opts, _, err := parseGenerateRequestWithID(optionsJSON)

	return opts, err
}

// parseGenerateRequestWithID also yields the caller's request id, which names
// the call for cancellation.
func parseGenerateRequestWithID(
	optionsJSON string,
) (*aifx.GenerateTextOptions, string, error) {
	var req aiGenerateRequest
	if err := json.Unmarshal([]byte(optionsJSON), &req); err != nil {
		return nil, "", err
	}

	return convertOptions(&req), req.RequestID, nil
}

func mapGenerateResult(r *aifx.GenerateTextResult) aiGenerateResponse {
	blocks := make([]aiContentBlockResp, 0, len(r.Content))

	for _, b := range r.Content {
		switch b.Type {
		case aifx.ContentBlockText:
			blocks = append(blocks, aiContentBlockResp{Type: "text", Text: b.Text})
		case aifx.ContentBlockToolCall:
			if b.ToolCall != nil {
				blocks = append(blocks, aiContentBlockResp{ //nolint:exhaustruct
					Type:      "tool_call",
					ID:        b.ToolCall.ID,
					Name:      b.ToolCall.Name,
					Arguments: b.ToolCall.Arguments,
				})
			}

		case aifx.ContentBlockToolResult:
			if b.ToolResult != nil {
				blocks = append(blocks, aiContentBlockResp{ //nolint:exhaustruct
					Type: "tool_result",
					ID:   b.ToolResult.ToolCallID,
					Text: b.ToolResult.Content,
				})
			}

		case aifx.ContentBlockThinking:
			if b.Thinking != nil {
				blocks = append(blocks, aiContentBlockResp{ //nolint:exhaustruct
					Type:     "thinking",
					Thinking: newThinkingPartResp(b.Thinking),
				})
			}
		}
	}

	return aiGenerateResponse{
		Content:    blocks,
		StopReason: string(r.StopReason),
		Usage: aiUsageResp{
			InputTokens:    r.Usage.InputTokens,
			OutputTokens:   r.Usage.OutputTokens,
			TotalTokens:    r.Usage.TotalTokens,
			ThinkingTokens: r.Usage.ThinkingTokens,
		},
		ModelID: r.ModelID,
		Error:   "",
	}
}

// ---------------------------------------------------------------------------
// AI batch bridge helpers
// ---------------------------------------------------------------------------

func aiBatchLookup(modelHandle string) (aifx.BatchCapableModel, string) {
	handleMu.RLock()
	model, ok := modelHandles[modelHandle]
	handleMu.RUnlock()

	if !ok {
		return nil, "model handle not found: " + modelHandle
	}

	batchModel, ok := model.(aifx.BatchCapableModel)
	if !ok {
		return nil, "model does not support batch processing"
	}

	return batchModel, ""
}

func mapBatchJob(job *aifx.BatchJob) *aiBatchJobJSON {
	r := &aiBatchJobJSON{ //nolint:exhaustruct
		ID:          job.ID,
		Status:      string(job.Status),
		CreatedAt:   job.CreatedAt,
		CompletedAt: job.CompletedAt,
		TotalCount:  job.TotalCount,
		DoneCount:   job.DoneCount,
		FailedCount: job.FailedCount,
		Error:       job.Error,
	}

	if job.Storage != nil {
		r.Storage = &aiBatchStorageJSON{
			Type:       job.Storage.Type,
			InputRef:   job.Storage.InputRef,
			OutputRef:  job.Storage.OutputRef,
			Properties: job.Storage.Properties,
		}
	}

	return r
}

func unmapBatchJob(j *aiBatchJobJSON) *aifx.BatchJob {
	job := &aifx.BatchJob{ //nolint:exhaustruct
		ID:          j.ID,
		Status:      aifx.BatchStatus(j.Status),
		CreatedAt:   j.CreatedAt,
		CompletedAt: j.CompletedAt,
		TotalCount:  j.TotalCount,
		DoneCount:   j.DoneCount,
		FailedCount: j.FailedCount,
		Error:       j.Error,
	}

	if j.Storage != nil {
		job.Storage = &aifx.BatchStorage{
			Type:       j.Storage.Type,
			InputRef:   j.Storage.InputRef,
			OutputRef:  j.Storage.OutputRef,
			Properties: j.Storage.Properties,
		}
	}

	return job
}

// ---------------------------------------------------------------------------
// AI batch bridge functions
// ---------------------------------------------------------------------------

// bridgeAiBatchCreate submits a batch of generation requests and returns the job.
func bridgeAiBatchCreate(requestJSON string) string {
	var req aiBatchSubmitRequest
	if err := json.Unmarshal([]byte(requestJSON), &req); err != nil {
		return errorResponse("invalid request JSON: " + err.Error())
	}

	batchModel, errMsg := aiBatchLookup(req.ModelHandle)
	if errMsg != "" {
		return errorResponse(errMsg)
	}

	items := make([]aifx.BatchRequestItem, 0, len(req.Items))

	for _, item := range req.Items {
		opts := convertOptions(&item.Options)
		items = append(items, aifx.BatchRequestItem{
			CustomID: item.CustomID,
			Options:  *opts,
		})
	}

	ctx, done, ok := beginCancellable(req.RequestID)
	defer done()

	if !ok {
		return aiErrorResponse("batch submit cancelled: ", context.Canceled)
	}

	job, err := batchModel.SubmitBatch(ctx, &aifx.BatchRequest{Items: items})
	if err != nil {
		return aiErrorResponse("batch create: ", err)
	}

	return marshalResponse(aiBatchJobResponse{Job: mapBatchJob(job)}) //nolint:exhaustruct
}

// bridgeAiBatchGet retrieves the current status of a batch job.
func bridgeAiBatchGet(requestJSON string) string {
	var req aiBatchHandleRequest
	if err := json.Unmarshal([]byte(requestJSON), &req); err != nil {
		return errorResponse("invalid request JSON: " + err.Error())
	}

	batchModel, errMsg := aiBatchLookup(req.ModelHandle)
	if errMsg != "" {
		return errorResponse(errMsg)
	}

	ctx, done, ok := beginCancellable(req.RequestID)
	defer done()

	if !ok {
		return aiErrorResponse("batch get cancelled: ", context.Canceled)
	}

	job, err := batchModel.GetBatchJob(ctx, req.JobID)
	if err != nil {
		return aiErrorResponse("batch get: ", err)
	}

	return marshalResponse(aiBatchJobResponse{Job: mapBatchJob(job)}) //nolint:exhaustruct
}

// bridgeAiBatchList lists batch jobs for a model.
func bridgeAiBatchList(requestJSON string) string {
	var req aiBatchListRequest
	if err := json.Unmarshal([]byte(requestJSON), &req); err != nil {
		return errorResponse("invalid request JSON: " + err.Error())
	}

	batchModel, errMsg := aiBatchLookup(req.ModelHandle)
	if errMsg != "" {
		return errorResponse(errMsg)
	}

	var opts *aifx.ListBatchOptions
	if req.Limit > 0 || req.After != "" {
		opts = &aifx.ListBatchOptions{
			Limit: req.Limit,
			After: req.After,
		}
	}

	ctx, done, ok := beginCancellable(req.RequestID)
	defer done()

	if !ok {
		return aiErrorResponse("batch list cancelled: ", context.Canceled)
	}

	jobs, err := batchModel.ListBatchJobs(ctx, opts)
	if err != nil {
		return aiErrorResponse("batch list: ", err)
	}

	jsonJobs := make([]*aiBatchJobJSON, 0, len(jobs))

	for _, j := range jobs {
		jsonJobs = append(jsonJobs, mapBatchJob(j))
	}

	return marshalResponse(aiBatchListResponse{Jobs: jsonJobs}) //nolint:exhaustruct
}

// bridgeAiBatchDownload downloads the results of a completed batch job.
func bridgeAiBatchDownload(requestJSON string) string {
	var req aiBatchDownloadRequest
	if err := json.Unmarshal([]byte(requestJSON), &req); err != nil {
		return errorResponse("invalid request JSON: " + err.Error())
	}

	batchModel, errMsg := aiBatchLookup(req.ModelHandle)
	if errMsg != "" {
		return errorResponse(errMsg)
	}

	job := unmapBatchJob(&req.Job)

	ctx, done, ok := beginCancellable(req.RequestID)
	defer done()

	if !ok {
		return aiErrorResponse("batch download cancelled: ", context.Canceled)
	}

	results, err := batchModel.DownloadBatchResults(ctx, job)
	if err != nil {
		return aiErrorResponse("batch download: ", err)
	}

	jsonResults := make([]*aiBatchResultItemJSON, 0, len(results))

	for _, r := range results {
		item := &aiBatchResultItemJSON{CustomID: r.CustomID, Error: r.Error} //nolint:exhaustruct

		if r.Result != nil {
			mapped := mapGenerateResult(r.Result)
			item.Result = &mapped
		}

		jsonResults = append(jsonResults, item)
	}

	return marshalResponse(aiBatchDownloadResponse{Results: jsonResults}) //nolint:exhaustruct
}

// bridgeAiBatchCancel cancels a running batch job.
func bridgeAiBatchCancel(requestJSON string) string {
	var req aiBatchHandleRequest
	if err := json.Unmarshal([]byte(requestJSON), &req); err != nil {
		return errorResponse("invalid request JSON: " + err.Error())
	}

	batchModel, errMsg := aiBatchLookup(req.ModelHandle)
	if errMsg != "" {
		return errorResponse(errMsg)
	}

	ctx, done, ok := beginCancellable(req.RequestID)
	defer done()

	if !ok {
		return aiErrorResponse("batch cancel aborted: ", context.Canceled)
	}

	if err := batchModel.CancelBatchJob(ctx, req.JobID); err != nil {
		return aiErrorResponse("batch cancel: ", err)
	}

	return "{}"
}

// ---------------------------------------------------------------------------

func mapStreamEvent(event aifx.StreamEvent) aiStreamEventResponse { //nolint:gocritic // hugeParam: existing signature, written before this check was enabled
	resp := aiStreamEventResponse{} //nolint:exhaustruct

	switch event.Type {
	case aifx.StreamEventContentDelta:
		resp.Type = "content_delta"
		resp.TextDelta = event.TextDelta

	case aifx.StreamEventToolCallDelta:
		resp.Type = "tool_call_delta"
		if event.ToolCall != nil {
			resp.ToolCallID = event.ToolCall.ID
			resp.ToolCallName = event.ToolCall.Name
			resp.ArgumentsDelta = event.ToolCall.Arguments
		}

	case aifx.StreamEventThinking:
		resp.Type = "thinking"
		if event.Thinking != nil {
			resp.Thinking = newThinkingPartResp(event.Thinking)
		}

	case aifx.StreamEventMessageDone:
		resp.Type = "message_done"
		resp.StopReason = string(event.StopReason)

		if event.Usage != nil {
			resp.Usage = &aiUsageResp{
				InputTokens:    event.Usage.InputTokens,
				OutputTokens:   event.Usage.OutputTokens,
				TotalTokens:    event.Usage.TotalTokens,
				ThinkingTokens: event.Usage.ThinkingTokens,
			}
		}

	case aifx.StreamEventError:
		resp.Type = "error"
		if event.Error != nil {
			resp.Error = event.Error.Error()
			resp.ErrorKind = aifx.ErrorKind(event.Error)
			resp.ErrorStatus = aifx.ErrorStatus(event.Error)
		}
	}

	return resp
}

func init() {
	registerShutdownDrain(drainAIHandles)
	register("aiCreateModel", []string{"configJSON"}, func(a []string) string { return bridgeAiCreateModel(a[0]) })
	register("aiGenerateText", []string{"modelHandle", "optionsJSON"}, func(a []string) string { return bridgeAiGenerateText(a[0], a[1]) })
	register("aiStreamText", []string{"modelHandle", "optionsJSON"}, func(a []string) string { return bridgeAiStreamText(a[0], a[1]) })
	register("aiStreamRead", []string{"streamHandle"}, func(a []string) string { return bridgeAiStreamRead(a[0]) })
	register("aiCancelRequest", []string{"requestJSON"}, func(a []string) string { return bridgeAiCancelRequest(a[0]) })
	register("aiCloseModel", []string{"modelHandle"}, func(a []string) string { return bridgeAiCloseModel(a[0]) })
	register("aiFreeStream", []string{"streamHandle"}, func(a []string) string { return bridgeAiFreeStream(a[0]) })
	register("aiBatchCreate", []string{"requestJSON"}, func(a []string) string { return bridgeAiBatchCreate(a[0]) })
	register("aiBatchGet", []string{"requestJSON"}, func(a []string) string { return bridgeAiBatchGet(a[0]) })
	register("aiBatchList", []string{"requestJSON"}, func(a []string) string { return bridgeAiBatchList(a[0]) })
	register("aiBatchDownload", []string{"requestJSON"}, func(a []string) string { return bridgeAiBatchDownload(a[0]) })
	register("aiBatchCancel", []string{"requestJSON"}, func(a []string) string { return bridgeAiBatchCancel(a[0]) })
}
