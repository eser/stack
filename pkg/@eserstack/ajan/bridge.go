package main

import (
	"bytes"
	"context"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"io"
	"log/slog"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"regexp"
	"strings"
	"sync"
	"sync/atomic"
	"time"

	"github.com/eser/stack/pkg/ajan/aifx"
	"github.com/eser/stack/pkg/ajan/cachefx"
	"github.com/eser/stack/pkg/ajan/codebasefx"
	"github.com/eser/stack/pkg/ajan/collectorfx"
	"github.com/eser/stack/pkg/ajan/configfx"
	"github.com/eser/stack/pkg/ajan/cryptofx"
	"github.com/eser/stack/pkg/ajan/csfx"
	"github.com/eser/stack/pkg/ajan/formatfx"
	"github.com/eser/stack/pkg/ajan/httpclient"
	"github.com/eser/stack/pkg/ajan/kitfx"
	"github.com/eser/stack/pkg/ajan/logfx"
	"github.com/eser/stack/pkg/ajan/noskillsfx"
	"github.com/eser/stack/pkg/ajan/parsingfx"
	"github.com/eser/stack/pkg/ajan/processfx"
	"github.com/eser/stack/pkg/ajan/postsfx"
	"github.com/eser/stack/pkg/ajan/postsfx/bluesky"
	"github.com/eser/stack/pkg/ajan/postsfx/twitter"
	shellfxexec "github.com/eser/stack/pkg/ajan/shellfx/exec"
	shelltui "github.com/eser/stack/pkg/ajan/shellfx/tui"
	"github.com/eser/stack/pkg/ajan/workflowfx"
)

// Version is the current version of the eser-ajan library.
// Injected at build time via: go build -ldflags "-X main.Version=4.1.44"
// Falls back to "dev" if not set.
var Version = "dev"

// ---------------------------------------------------------------------------
// Lifecycle state
// ---------------------------------------------------------------------------

var (
	initialized bool
	initMu      sync.Mutex
)

// ---------------------------------------------------------------------------
// AI bridge state
// ---------------------------------------------------------------------------

var (
	aiRegistry           = aifx.NewRegistry(aifx.WithDefaultFactories())
	modelHandles         = make(map[string]aifx.LanguageModel)
	streamHandles        = make(map[string]*streamState)
	execHandles          = make(map[string]*shellfxexec.ChildProcessHandle)
	tokenizerHandles     = make(map[string]*parsingfx.Tokenizer)
	tuiKeypressHandles   = make(map[string]*shelltui.KeypressReader)
	handleMu             sync.RWMutex
	handleSeq            int64
)

type streamState struct {
	iter   *aifx.StreamIterator
	cancel context.CancelFunc
	wg     sync.WaitGroup
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

type aiContentBlockReq struct {
	Type string `json:"type"`
	Text string `json:"text,omitempty"`
}

type aiGenerateRequest struct {
	Messages   []aiMessageRequest `json:"messages"`
	System     string             `json:"system"`
	ToolChoice string             `json:"toolChoice"`
	MaxTokens  int                `json:"maxTokens"`
}

type aiHandleResponse struct {
	Handle string `json:"handle,omitempty"`
	Error  string `json:"error,omitempty"`
}

type aiContentBlockResp struct {
	Type string `json:"type"`
	Text string `json:"text,omitempty"`
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

type aiStreamEventResponse struct {
	Type       string       `json:"type"`
	TextDelta  string       `json:"textDelta,omitempty"`
	StopReason string       `json:"stopReason,omitempty"`
	Usage      *aiUsageResp `json:"usage,omitempty"`
	Error      string       `json:"error,omitempty"`
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
	Items       []aiBatchItemRequest `json:"items"`
	ModelHandle string               `json:"modelHandle"`
}

type aiBatchHandleRequest struct {
	ModelHandle string `json:"modelHandle"`
	JobID       string `json:"jobId"`
}

type aiBatchListRequest struct {
	After       string `json:"after,omitempty"`
	ModelHandle string `json:"modelHandle"`
	Limit       int    `json:"limit,omitempty"`
}

type aiBatchDownloadRequest struct {
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
	Error   string                  `json:"error,omitempty"`
}

// ---------------------------------------------------------------------------
// Handle helpers
// ---------------------------------------------------------------------------

func newHandle(prefix string) string {
	id := atomic.AddInt64(&handleSeq, 1)
	return fmt.Sprintf("%s-%d", prefix, id)
}

func marshalResponse(v any) string {
	data, err := json.Marshal(v)
	if err != nil {
		return `{"error":"internal marshal error"}`
	}

	return string(data)
}

func errorResponse(msg string) string {
	return marshalResponse(aiHandleResponse{Error: msg}) //nolint:exhaustruct
}

func marshalError(msg string) string {
	return marshalResponse(struct {
		Error string `json:"error"`
	}{Error: msg})
}

// ---------------------------------------------------------------------------
// Lifecycle bridge functions
// ---------------------------------------------------------------------------

func bridgeVersion() string {
	return "eser-ajan version " + Version
}

func bridgeInit() int {
	initMu.Lock()
	defer initMu.Unlock()

	initialized = true

	return 0
}

func bridgeShutdown() {
	initMu.Lock()
	defer initMu.Unlock()

	initialized = false
}

// bridgeDIResolve is a stub for future ajan bridge DI resolution.
func bridgeDIResolve(_ string) string {
	return "null"
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

	timeout := time.Duration(req.RequestTimeoutMs) * time.Millisecond
	if timeout == 0 {
		const defaultTimeout = 60 * time.Second
		timeout = defaultTimeout
	}

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

	model, err := aiRegistry.AddModel(context.Background(), newHandle("cfg"), cfg)
	if err != nil {
		return errorResponse("create model: " + err.Error())
	}

	handle := newHandle("model")

	handleMu.Lock()
	modelHandles[handle] = model
	handleMu.Unlock()

	return marshalResponse(aiHandleResponse{Handle: handle}) //nolint:exhaustruct
}

// bridgeAiGenerateText performs a blocking text generation for the given model handle.
func bridgeAiGenerateText(modelHandle, optionsJSON string) string {
	handleMu.RLock()
	model, ok := modelHandles[modelHandle]
	handleMu.RUnlock()

	if !ok {
		return errorResponse("model handle not found: " + modelHandle)
	}

	opts, err := parseGenerateRequest(optionsJSON)
	if err != nil {
		return errorResponse("invalid options: " + err.Error())
	}

	result, err := model.GenerateText(context.Background(), opts)
	if err != nil {
		return errorResponse("generation failed: " + err.Error())
	}

	return marshalResponse(mapGenerateResult(result))
}

// bridgeAiStreamText starts a streaming text generation and returns a stream handle.
func bridgeAiStreamText(modelHandle, optionsJSON string) string {
	handleMu.RLock()
	model, ok := modelHandles[modelHandle]
	handleMu.RUnlock()

	if !ok {
		return errorResponse("model handle not found: " + modelHandle)
	}

	opts, err := parseGenerateRequest(optionsJSON)
	if err != nil {
		return errorResponse("invalid options: " + err.Error())
	}

	ctx, cancel := context.WithCancel(context.Background())

	iter, err := model.StreamText(ctx, opts)
	if err != nil {
		cancel()

		return errorResponse("stream failed: " + err.Error())
	}

	handle := newHandle("stream")

	handleMu.Lock()
	streamHandles[handle] = &streamState{iter: iter, cancel: cancel}
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

	if !ok {
		return "null"
	}
	defer state.wg.Done()

	if !state.iter.Next() {
		// Stream ended — clean up.
		handleMu.Lock()
		delete(streamHandles, streamHandle)
		handleMu.Unlock()

		if err := state.iter.Err(); err != nil {
			return marshalResponse(aiStreamEventResponse{ //nolint:exhaustruct
				Type:  "error",
				Error: err.Error(),
			})
		}

		return "null"
	}

	event := state.iter.Current()

	return marshalResponse(mapStreamEvent(event))
}

// bridgeAiCloseModel closes and removes a model handle.
func bridgeAiCloseModel(modelHandle string) string {
	handleMu.Lock()
	model, ok := modelHandles[modelHandle]
	if ok {
		delete(modelHandles, modelHandle)
	}
	handleMu.Unlock()

	if !ok {
		return errorResponse("model handle not found: " + modelHandle)
	}

	if err := model.Close(context.Background()); err != nil {
		return errorResponse("close failed: " + err.Error())
	}

	return "{}"
}

// bridgeAiFreeStream cancels and removes a stream handle.
func bridgeAiFreeStream(streamHandle string) string {
	handleMu.Lock()
	state, ok := streamHandles[streamHandle]
	if ok {
		delete(streamHandles, streamHandle)
	}
	handleMu.Unlock()

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

		for _, b := range m.Content {
			if b.Type == "text" {
				blocks = append(blocks, aifx.ContentBlock{ //nolint:exhaustruct
					Type: aifx.ContentBlockText,
					Text: b.Text,
				})
			}
		}

		messages = append(messages, aifx.Message{
			Role:    aifx.Role(m.Role),
			Content: blocks,
		})
	}

	opts := &aifx.GenerateTextOptions{ //nolint:exhaustruct
		Messages:  messages,
		System:    req.System,
		MaxTokens: req.MaxTokens,
	}

	if req.ToolChoice != "" {
		opts.ToolChoice = aifx.ToolChoice(req.ToolChoice)
	}

	return opts
}

func parseGenerateRequest(optionsJSON string) (*aifx.GenerateTextOptions, error) {
	var req aiGenerateRequest
	if err := json.Unmarshal([]byte(optionsJSON), &req); err != nil {
		return nil, err
	}

	return convertOptions(&req), nil
}

func mapGenerateResult(r *aifx.GenerateTextResult) aiGenerateResponse {
	blocks := make([]aiContentBlockResp, 0, len(r.Content))

	for _, b := range r.Content {
		switch b.Type {
		case aifx.ContentBlockText:
			blocks = append(blocks, aiContentBlockResp{Type: "text", Text: b.Text})
		case aifx.ContentBlockToolCall:
			if b.ToolCall != nil {
				blocks = append(blocks, aiContentBlockResp{Type: "tool_call", Text: b.ToolCall.Name})
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

	job, err := batchModel.SubmitBatch(context.Background(), &aifx.BatchRequest{Items: items})
	if err != nil {
		return errorResponse("batch create: " + err.Error())
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

	job, err := batchModel.GetBatchJob(context.Background(), req.JobID)
	if err != nil {
		return errorResponse("batch get: " + err.Error())
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

	jobs, err := batchModel.ListBatchJobs(context.Background(), opts)
	if err != nil {
		return errorResponse("batch list: " + err.Error())
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

	results, err := batchModel.DownloadBatchResults(context.Background(), job)
	if err != nil {
		return errorResponse("batch download: " + err.Error())
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

	if err := batchModel.CancelBatchJob(context.Background(), req.JobID); err != nil {
		return errorResponse("batch cancel: " + err.Error())
	}

	return "{}"
}

// ---------------------------------------------------------------------------
// HTTP bridge state
// ---------------------------------------------------------------------------

var (
	httpClientHandles = make(map[string]*httpClientState)
	httpMu            sync.RWMutex
)

type httpClientState struct {
	client  *httpclient.Client
	baseURL string
	headers map[string]string
}

// ---------------------------------------------------------------------------
// HTTP wire types (camelCase for TypeScript consumers)
// ---------------------------------------------------------------------------

type httpCreateRequest struct {
	Headers               map[string]string `json:"headers,omitempty"`
	BaseURL               string            `json:"baseUrl"`
	RetryEnabled          bool              `json:"retryEnabled"`
	CircuitBreakerEnabled bool              `json:"circuitBreakerEnabled"`
	TimeoutMs             int               `json:"timeoutMs"`
	MaxAttempts           int               `json:"maxAttempts"`
	InitialIntervalMs     int               `json:"initialIntervalMs"`
	MaxIntervalMs         int               `json:"maxIntervalMs"`
	FailureThreshold      int               `json:"failureThreshold"`
	ResetTimeoutMs        int               `json:"resetTimeoutMs"`
}

type httpRequestInput struct {
	Headers map[string]string `json:"headers,omitempty"`
	Handle  string            `json:"handle"`
	Method  string            `json:"method"`
	URL     string            `json:"url"`
	Body    string            `json:"body,omitempty"`
}

type httpResponseOutput struct {
	Headers    map[string]string `json:"headers"`
	StatusText string            `json:"statusText"`
	Body       string            `json:"body"`
	Error      string            `json:"error,omitempty"`
	Status     int               `json:"status"`
	Retries    int               `json:"retries"`
}

// ---------------------------------------------------------------------------
// HTTP bridge functions
// ---------------------------------------------------------------------------

// bridgeHttpCreate parses JSON config, creates an httpclient.Client, and
// stores it under a generated handle. Returns JSON with the handle.
func bridgeHttpCreate(configJSON string) string {
	var req httpCreateRequest
	if err := json.Unmarshal([]byte(configJSON), &req); err != nil {
		return errorResponse("invalid config JSON: " + err.Error())
	}

	failureThreshold := uint(req.FailureThreshold)
	if failureThreshold == 0 {
		failureThreshold = 5
	}

	resetTimeout := time.Duration(req.ResetTimeoutMs) * time.Millisecond
	if resetTimeout == 0 {
		const defaultResetTimeout = 10 * time.Second
		resetTimeout = defaultResetTimeout
	}

	maxAttempts := uint(req.MaxAttempts)
	if maxAttempts == 0 {
		maxAttempts = 3
	}

	initialInterval := time.Duration(req.InitialIntervalMs) * time.Millisecond
	if initialInterval == 0 {
		const defaultInitialInterval = 100 * time.Millisecond
		initialInterval = defaultInitialInterval
	}

	maxInterval := time.Duration(req.MaxIntervalMs) * time.Millisecond
	if maxInterval == 0 {
		const defaultMaxInterval = 10 * time.Second
		maxInterval = defaultMaxInterval
	}

	cfg := &httpclient.Config{ //nolint:exhaustruct
		CircuitBreaker: httpclient.CircuitBreakerConfig{
			Enabled:               req.CircuitBreakerEnabled,
			FailureThreshold:      failureThreshold,
			ResetTimeout:          resetTimeout,
			HalfOpenSuccessNeeded: 2,
		},
		RetryStrategy: httpclient.RetryStrategyConfig{
			Enabled:         req.RetryEnabled,
			MaxAttempts:     maxAttempts,
			InitialInterval: initialInterval,
			MaxInterval:     maxInterval,
			Multiplier:      2.0,
			RandomFactor:    0.1,
		},
		ServerErrorThreshold: httpclient.DefaultServerErrorThreshold,
	}

	opts := []httpclient.NewClientOption{httpclient.WithConfig(cfg)}

	if req.TimeoutMs > 0 {
		opts = append(opts, httpclient.WithTimeout(time.Duration(req.TimeoutMs)*time.Millisecond))
	}

	client := httpclient.NewClient(opts...)

	handle := newHandle("http")

	httpMu.Lock()
	httpClientHandles[handle] = &httpClientState{
		client:  client,
		baseURL: req.BaseURL,
		headers: req.Headers,
	}
	httpMu.Unlock()

	return marshalResponse(aiHandleResponse{Handle: handle}) //nolint:exhaustruct
}

// bridgeHttpRequest performs an HTTP request via a stored client handle.
// Returns JSON: { status, statusText, headers, body, retries } on success,
// or { error, status, statusText, headers, body, retries } on HTTP or transport error.
func bridgeHttpRequest(requestJSON string) string {
	var req httpRequestInput
	if err := json.Unmarshal([]byte(requestJSON), &req); err != nil {
		return marshalResponse(httpResponseOutput{Error: fmt.Errorf("invalid request JSON: %w", err).Error()}) //nolint:exhaustruct
	}

	httpMu.RLock()
	state, ok := httpClientHandles[req.Handle]
	httpMu.RUnlock()

	if !ok {
		return marshalResponse(httpResponseOutput{Error: "http client handle not found: " + req.Handle}) //nolint:exhaustruct
	}

	method := req.Method
	if method == "" {
		method = http.MethodGet
	}

	fullURL := req.URL
	if state.baseURL != "" && !strings.HasPrefix(req.URL, "http://") && !strings.HasPrefix(req.URL, "https://") {
		fullURL = strings.TrimRight(state.baseURL, "/") + "/" + strings.TrimLeft(req.URL, "/")
	}

	var bodyReader io.Reader
	if req.Body != "" {
		bodyReader = bytes.NewBufferString(req.Body)
	}

	var retryCount atomic.Int32
	ctx := httpclient.WithRetryCounter(context.Background(), &retryCount)

	httpReq, err := http.NewRequestWithContext(ctx, method, fullURL, bodyReader)
	if err != nil {
		return marshalResponse(httpResponseOutput{Error: "build request: " + err.Error()}) //nolint:exhaustruct
	}

	for k, v := range state.headers {
		httpReq.Header.Set(k, v)
	}

	for k, v := range req.Headers {
		httpReq.Header.Set(k, v)
	}

	resp, err := state.client.Do(httpReq)
	retries := int(retryCount.Load())
	if err != nil {
		return marshalResponse(httpResponseOutput{Error: "request failed: " + err.Error(), Retries: retries}) //nolint:exhaustruct
	}
	defer resp.Body.Close() //nolint:errcheck

	bodyBytes, err := io.ReadAll(resp.Body)
	if err != nil {
		return marshalResponse(httpResponseOutput{Error: "read response body: " + err.Error(), Retries: retries}) //nolint:exhaustruct
	}

	respHeaders := make(map[string]string, len(resp.Header))
	for k, vals := range resp.Header {
		if len(vals) > 0 {
			respHeaders[k] = vals[0]
		}
	}

	out := httpResponseOutput{
		Status:     resp.StatusCode,
		StatusText: http.StatusText(resp.StatusCode),
		Headers:    respHeaders,
		Body:       string(bodyBytes),
		Retries:    retries,
	}

	if resp.StatusCode >= http.StatusBadRequest {
		out.Error = fmt.Sprintf("HTTP %d %s", resp.StatusCode, http.StatusText(resp.StatusCode))
	}

	return marshalResponse(out)
}

// bridgeHttpClose removes a stored http client handle.
func bridgeHttpClose(handle string) string {
	httpMu.Lock()
	_, ok := httpClientHandles[handle]
	if ok {
		delete(httpClientHandles, handle)
	}
	httpMu.Unlock()

	if !ok {
		return errorResponse("http client handle not found: " + handle)
	}

	return "{}"
}

// ---------------------------------------------------------------------------
// HTTP streaming bridge state
// ---------------------------------------------------------------------------

var (
	httpStreamHandles = make(map[string]*httpStreamEntry)
	httpStreamMu      sync.RWMutex
)

type httpStreamEntry struct {
	body io.ReadCloser
	mu   sync.Mutex
	done bool
}

// ---------------------------------------------------------------------------
// HTTP streaming wire types (camelCase for TypeScript consumers)
// ---------------------------------------------------------------------------

type httpStreamCreateOutput struct {
	Headers    map[string]string `json:"headers"`
	Handle     string            `json:"handle"`
	StatusText string            `json:"statusText"`
	Body       string            `json:"body,omitempty"`
	Error      string            `json:"error,omitempty"`
	Status     int               `json:"status"`
}

type httpStreamReadOutput struct {
	Chunk string `json:"chunk"`
	Error string `json:"error,omitempty"`
	Done  bool   `json:"done"`
}

const httpStreamChunkSize = 8192

// ---------------------------------------------------------------------------
// HTTP streaming bridge functions
// ---------------------------------------------------------------------------

// bridgeHttpRequestStream starts a streaming HTTP request via a stored client handle.
// Blocks until response headers are received, then stores the open body reader.
// Returns JSON: { handle, status, statusText, headers } | { error: string }
func bridgeHttpRequestStream(requestJSON string) string {
	var req httpRequestInput
	if err := json.Unmarshal([]byte(requestJSON), &req); err != nil {
		return errorResponse("invalid request JSON: " + err.Error())
	}

	httpMu.RLock()
	state, ok := httpClientHandles[req.Handle]
	httpMu.RUnlock()

	if !ok {
		return errorResponse("http client handle not found: " + req.Handle)
	}

	method := req.Method
	if method == "" {
		method = http.MethodGet
	}

	fullURL := req.URL
	if state.baseURL != "" && !strings.HasPrefix(req.URL, "http://") && !strings.HasPrefix(req.URL, "https://") {
		fullURL = strings.TrimRight(state.baseURL, "/") + "/" + strings.TrimLeft(req.URL, "/")
	}

	var bodyReader io.Reader
	if req.Body != "" {
		bodyReader = bytes.NewBufferString(req.Body)
	}

	httpReq, err := http.NewRequestWithContext(context.Background(), method, fullURL, bodyReader)
	if err != nil {
		return errorResponse("build request: " + err.Error())
	}

	for k, v := range state.headers {
		httpReq.Header.Set(k, v)
	}

	for k, v := range req.Headers {
		httpReq.Header.Set(k, v)
	}

	resp, err := state.client.Do(httpReq)
	if err != nil {
		return errorResponse("request failed: " + err.Error())
	}

	if resp.StatusCode >= http.StatusBadRequest {
		bodyBytes, _ := io.ReadAll(resp.Body)
		resp.Body.Close() //nolint:errcheck
		respHeaders := make(map[string]string, len(resp.Header))
		for k, vals := range resp.Header {
			if len(vals) > 0 {
				respHeaders[k] = vals[0]
			}
		}
		return marshalResponse(httpStreamCreateOutput{
			Error:      fmt.Sprintf("HTTP %d %s", resp.StatusCode, http.StatusText(resp.StatusCode)),
			Status:     resp.StatusCode,
			StatusText: http.StatusText(resp.StatusCode),
			Headers:    respHeaders,
			Handle:     "",
			Body:       string(bodyBytes),
		})
	}

	streamHandle := newHandle("httpstream")

	httpStreamMu.Lock()
	httpStreamHandles[streamHandle] = &httpStreamEntry{body: resp.Body} //nolint:exhaustruct
	httpStreamMu.Unlock()

	respHeaders := make(map[string]string, len(resp.Header))
	for k, vals := range resp.Header {
		if len(vals) > 0 {
			respHeaders[k] = vals[0]
		}
	}

	return marshalResponse(httpStreamCreateOutput{ //nolint:exhaustruct
		Handle:     streamHandle,
		Status:     resp.StatusCode,
		StatusText: http.StatusText(resp.StatusCode),
		Headers:    respHeaders,
	})
}

// bridgeHttpStreamRead reads the next chunk from an open stream handle.
// Returns JSON: { chunk: "<base64>", done: false } | { done: true } | { error: string }
func bridgeHttpStreamRead(handle string) string {
	httpStreamMu.RLock()
	entry, ok := httpStreamHandles[handle]
	httpStreamMu.RUnlock()

	if !ok {
		return errorResponse("http stream handle not found: " + handle)
	}

	entry.mu.Lock()
	defer entry.mu.Unlock()

	if entry.done {
		return marshalResponse(httpStreamReadOutput{Done: true}) //nolint:exhaustruct
	}

	buf := make([]byte, httpStreamChunkSize)

	n, err := entry.body.Read(buf)
	if n > 0 {
		chunk := base64.StdEncoding.EncodeToString(buf[:n])
		if err == io.EOF {
			entry.done = true
			entry.body.Close() //nolint:errcheck
		}

		return marshalResponse(httpStreamReadOutput{Chunk: chunk, Done: entry.done}) //nolint:exhaustruct
	}

	if err == io.EOF {
		entry.done = true
		entry.body.Close() //nolint:errcheck

		return marshalResponse(httpStreamReadOutput{Done: true}) //nolint:exhaustruct
	}

	if err != nil {
		entry.done = true
		entry.body.Close() //nolint:errcheck

		return errorResponse("stream read error: " + err.Error())
	}

	return marshalResponse(httpStreamReadOutput{Done: false}) //nolint:exhaustruct
}

// bridgeHttpStreamClose cancels an open stream handle and removes it.
func bridgeHttpStreamClose(handle string) string {
	httpStreamMu.Lock()
	entry, ok := httpStreamHandles[handle]

	if ok {
		delete(httpStreamHandles, handle)
	}

	httpStreamMu.Unlock()

	if !ok {
		return errorResponse("http stream handle not found: " + handle)
	}

	entry.mu.Lock()
	defer entry.mu.Unlock()

	if !entry.done {
		entry.done = true
		entry.body.Close() //nolint:errcheck
	}

	return "{}"
}

// ---------------------------------------------------------------------------
// Log bridge state
// ---------------------------------------------------------------------------

type logEntry struct {
	logger    *slog.Logger
	levelVar  *slog.LevelVar
	scopeName string
	filters   logfx.FilterFunc
	formatter logfx.FormatterFunc
}

var (
	logHandles = make(map[string]*logEntry)
	logMu      sync.RWMutex
)

// ---------------------------------------------------------------------------
// Log wire types (camelCase for TypeScript consumers)
// ---------------------------------------------------------------------------

type logCreateRequest struct {
	ScopeName string `json:"scopeName"`
	Level     string `json:"level"`  // TRACE|DEBUG|INFO|WARN|ERROR|FATAL|PANIC
	Format    string `json:"format"` // "json" (default) | "text"
	AddSource bool   `json:"addSource"`
}

type logWriteInput struct {
	Attrs   map[string]any `json:"attrs,omitempty"`
	Handle  string         `json:"handle"`
	Message string         `json:"message"`
	Level   string         `json:"level"`
}

type logShouldLogInput struct {
	Handle string `json:"handle"`
	Level  string `json:"level"`
}

type logShouldLogResponse struct {
	Allowed bool   `json:"allowed"`
	Error   string `json:"error,omitempty"`
}

type logFilterConfig struct {
	Type     string  `json:"type"`     // "level" | "category" | "rateLimit" | "sampling"
	Level    string  `json:"level"`    // for "level"
	Category string  `json:"category"` // for "category"
	Rate     float64 `json:"rate"`     // for "rateLimit" msgs/sec
	Prob     float64 `json:"prob"`     // for "sampling" 0.0-1.0
}

type logConfigureInput struct {
	Filters   []logFilterConfig `json:"filters,omitempty"`
	Handle    string            `json:"handle"`
	Level     string            `json:"level"`
	Formatter string            `json:"formatter"` // "json" | "text" | "span-json" | "span-text"
}

// ---------------------------------------------------------------------------
// Log bridge functions
// ---------------------------------------------------------------------------

// bridgeLogCreate creates a slog.Logger writing JSON to stderr and stores it
// under a generated handle. Returns JSON with the handle.
func bridgeLogCreate(configJSON string) string {
	var req logCreateRequest
	if err := json.Unmarshal([]byte(configJSON), &req); err != nil {
		return errorResponse("invalid config JSON: " + err.Error())
	}

	lv := new(slog.LevelVar)
	lv.Set(parseLogLevel(req.Level))

	opts := &slog.HandlerOptions{ //nolint:exhaustruct
		Level:     lv,
		AddSource: req.AddSource,
	}

	var handler slog.Handler
	if strings.ToLower(req.Format) == "text" {
		handler = slog.NewTextHandler(os.Stderr, opts)
	} else {
		handler = slog.NewJSONHandler(os.Stderr, opts)
	}

	logger := slog.New(handler)

	if req.ScopeName != "" {
		logger = logger.With(slog.String("scope", req.ScopeName))
	}

	handle := newHandle("log")

	logMu.Lock()
	logHandles[handle] = &logEntry{logger: logger, levelVar: lv, scopeName: req.ScopeName} //nolint:exhaustruct
	logMu.Unlock()

	return marshalResponse(aiHandleResponse{Handle: handle}) //nolint:exhaustruct
}

// buildFilterChain constructs a chained FilterFunc from a slice of filter configs.
func buildFilterChain(configs []logFilterConfig) logfx.FilterFunc {
	fns := make([]logfx.FilterFunc, 0, len(configs))

	for _, c := range configs {
		switch c.Type {
		case "level":
			fns = append(fns, logfx.LevelFilter(parseLogLevel(c.Level)))
		case "category":
			fns = append(fns, logfx.CategoryPrefixFilter(c.Category))
		case "rateLimit":
			fns = append(fns, logfx.RateLimitFilter(c.Rate))
		case "sampling":
			fns = append(fns, logfx.SamplingFilter(c.Prob))
		}
	}

	return logfx.ChainFilters(fns...)
}

// buildFormatter returns the FormatterFunc for the given name.
func buildFormatter(name string) logfx.FormatterFunc {
	switch strings.ToLower(name) {
	case "text":
		return logfx.TextFormatter()
	case "span-json":
		return logfx.SpanFormatter(logfx.JSONFormatter())
	case "span-text":
		return logfx.SpanFormatter(logfx.TextFormatter())
	default:
		return logfx.JSONFormatter()
	}
}

// bridgeLogWrite applies the entry's filter chain and formatter, then emits.
func bridgeLogWrite(requestJSON string) string {
	var req logWriteInput
	if err := json.Unmarshal([]byte(requestJSON), &req); err != nil {
		return errorResponse(fmt.Errorf("invalid request JSON: %w", err).Error())
	}

	logMu.RLock()
	entry, ok := logHandles[req.Handle]
	logMu.RUnlock()

	if !ok {
		return errorResponse("log handle not found: " + req.Handle)
	}

	level := parseLogLevel(req.Level)

	// Build slog.Attrs; prepend scope so category filters can match.
	slogAttrs := make([]slog.Attr, 0, len(req.Attrs)+1)
	if entry.scopeName != "" {
		slogAttrs = append(slogAttrs, slog.String("scope", entry.scopeName))
	}

	for k, v := range req.Attrs {
		slogAttrs = append(slogAttrs, slog.Any(k, v))
	}

	// Apply filter chain — drop record without writing.
	if entry.filters != nil && !entry.filters(level, req.Message, slogAttrs) {
		return marshalResponse(map[string]any{"filtered": true})
	}

	// Custom formatter: write formatted string directly to stderr.
	if entry.formatter != nil {
		rec := slog.NewRecord(time.Now(), level, req.Message, 0)
		rec.AddAttrs(slogAttrs...)
		fmt.Fprintln(os.Stderr, entry.formatter(rec))

		return "{}"
	}

	// Default: delegate to the slog.Logger (handles JSON/text via its handler).
	args := make([]any, 0, len(slogAttrs))
	for _, a := range slogAttrs {
		args = append(args, a)
	}

	entry.logger.Log(context.Background(), level, req.Message, args...)

	return "{}"
}

// bridgeLogClose removes a stored logger handle.
func bridgeLogClose(handle string) string {
	logMu.Lock()
	_, ok := logHandles[handle]
	if ok {
		delete(logHandles, handle)
	}
	logMu.Unlock()

	if !ok {
		return errorResponse("log handle not found: " + handle)
	}

	return "{}"
}

// parseLogLevel maps a level name string to a slog.Level.
func parseLogLevel(s string) slog.Level {
	switch strings.ToUpper(s) {
	case "TRACE":
		return logfx.LevelTrace
	case "DEBUG":
		return logfx.LevelDebug
	case "INFO", "":
		return logfx.LevelInfo
	case "WARN":
		return logfx.LevelWarn
	case "ERROR":
		return logfx.LevelError
	case "FATAL":
		return logfx.LevelFatal
	case "PANIC":
		return logfx.LevelPanic
	default:
		return logfx.LevelInfo
	}
}

// bridgeLogShouldLog reports whether the logger would emit a record at level.
func bridgeLogShouldLog(requestJSON string) string {
	var req logShouldLogInput
	if err := json.Unmarshal([]byte(requestJSON), &req); err != nil {
		return errorResponse(fmt.Errorf("invalid request JSON: %w", err).Error())
	}

	logMu.RLock()
	entry, ok := logHandles[req.Handle]
	logMu.RUnlock()

	if !ok {
		return errorResponse("log handle not found: " + req.Handle)
	}

	allowed := entry.logger.Enabled(context.Background(), parseLogLevel(req.Level))

	return marshalResponse(logShouldLogResponse{Allowed: allowed})
}

// bridgeLogConfigure updates level, filter chain, and formatter for a handle.
func bridgeLogConfigure(requestJSON string) string {
	var req logConfigureInput
	if err := json.Unmarshal([]byte(requestJSON), &req); err != nil {
		return errorResponse(fmt.Errorf("invalid request JSON: %w", err).Error())
	}

	logMu.RLock()
	entry, ok := logHandles[req.Handle]
	logMu.RUnlock()

	if !ok {
		return errorResponse("log handle not found: " + req.Handle)
	}

	if req.Level != "" {
		entry.levelVar.Set(parseLogLevel(req.Level))
	}

	if len(req.Filters) > 0 {
		entry.filters = buildFilterChain(req.Filters)
	}

	if req.Formatter != "" {
		entry.formatter = buildFormatter(req.Formatter)
	}

	return "{}"
}

// ---------------------------------------------------------------------------
// Config bridge state (stateless — no handles needed)
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Config wire types (camelCase for TypeScript consumers)
// ---------------------------------------------------------------------------

type configLoadRequest struct {
	// Sources is an ordered list of config source specs:
	//   "system_env"           — reads OS environment variables
	//   "env_file"             — reads .env (auto-resolved by APP_ENV)
	//   "env_file:<filename>"  — reads the named .env file
	//   "json_file"            — reads config.json (auto-resolved by APP_ENV)
	//   "json_file:<filename>" — reads the named JSON file
	//   "json_string:<json>"   — parses an inline JSON string
	Sources         []string `json:"sources"`
	CaseInsensitive bool     `json:"caseInsensitive"`
}

type configLoadResponse struct {
	Values map[string]any `json:"values"`
	Error  string         `json:"error,omitempty"`
}

// ---------------------------------------------------------------------------
// Config bridge functions
// ---------------------------------------------------------------------------

// bridgeConfigLoad loads configuration from the specified sources and returns
// a JSON-encoded flat map of all config values. Stateless — no handle.
func bridgeConfigLoad(optionsJSON string) string {
	var req configLoadRequest
	if err := json.Unmarshal([]byte(optionsJSON), &req); err != nil {
		return marshalResponse(configLoadResponse{Error: "invalid options JSON: " + err.Error()}) //nolint:exhaustruct
	}

	cm := configfx.NewConfigManager()

	resources := make([]configfx.ConfigResource, 0, len(req.Sources))

	for _, src := range req.Sources {
		switch {
		case src == "system_env":
			resources = append(resources, cm.FromSystemEnv(req.CaseInsensitive))

		case src == "env_file":
			resources = append(resources, cm.FromEnvFile(".env", req.CaseInsensitive))

		case strings.HasPrefix(src, "env_file:"):
			filename := strings.TrimPrefix(src, "env_file:")
			resources = append(resources, cm.FromEnvFileDirect(filename, req.CaseInsensitive))

		case src == "json_file":
			resources = append(resources, cm.FromJSONFile("config.json"))

		case strings.HasPrefix(src, "json_file:"):
			filename := strings.TrimPrefix(src, "json_file:")
			resources = append(resources, cm.FromJSONFileDirect(filename))

		case strings.HasPrefix(src, "json_string:"):
			jsonStr := strings.TrimPrefix(src, "json_string:")
			resources = append(resources, cm.FromJSONString(jsonStr))
		}
	}

	values, err := cm.LoadMap(resources...)
	if err != nil {
		return marshalResponse(configLoadResponse{Error: "load config: " + err.Error()}) //nolint:exhaustruct
	}

	return marshalResponse(configLoadResponse{Values: *values, Error: ""})
}

// ---------------------------------------------------------------------------
// Format wire types (camelCase for TypeScript consumers)
// ---------------------------------------------------------------------------

type formatEncodeRequest struct {
	Data    json.RawMessage `json:"data"`
	Format  string          `json:"format"`
	Pretty  bool            `json:"pretty"`
	Indent  int             `json:"indent"`
	IsFirst bool            `json:"isFirst"`
}

type formatEncodeResponse struct {
	Result string `json:"result"`
	Error  string `json:"error,omitempty"`
}

type formatEncodeDocumentRequest struct {
	Format string            `json:"format"`
	Items  []json.RawMessage `json:"items"`
	Pretty bool              `json:"pretty"`
	Indent int               `json:"indent"`
}

type formatEncodeDocumentResponse struct {
	Result string `json:"result"`
	Error  string `json:"error,omitempty"`
}

type formatDecodeRequest struct {
	Format  string   `json:"format"`
	Text    string   `json:"text"`
	Headers []string `json:"headers,omitempty"`
}

type formatDecodeResponse struct {
	Items []json.RawMessage `json:"items"`
	Error string            `json:"error,omitempty"`
}

type formatInfo struct {
	Name       string   `json:"name"`
	Extensions []string `json:"extensions"`
	Streamable bool     `json:"streamable"`
}

type formatListResponse struct {
	Formats []formatInfo `json:"formats"`
	Error   string       `json:"error,omitempty"`
}

// ---------------------------------------------------------------------------
// Format bridge functions
// ---------------------------------------------------------------------------

// initFormats ensures the built-in formats are registered. Idempotent.
var formatOnce sync.Once

// trailingDocSep matches a trailing YAML (---) or TOML (+++) document separator.
var trailingDocSep = regexp.MustCompile(`\n(---|\+\+\+)\n$`)

func ensureFormats() {
	formatOnce.Do(formatfx.RegisterBuiltinFormats)
}

// bridgeFormatEncode serializes the given data value to the named format.
// The data field must be a valid JSON value; it is unmarshalled before
// being passed to the format's WriteItem method.
func bridgeFormatEncode(requestJSON string) string {
	var req formatEncodeRequest
	if err := json.Unmarshal([]byte(requestJSON), &req); err != nil {
		return marshalResponse(formatEncodeResponse{Error: fmt.Errorf("invalid request JSON: %w", err).Error()}) //nolint:exhaustruct
	}

	ensureFormats()

	f, err := formatfx.GetFormat(req.Format)
	if err != nil {
		return marshalResponse(formatEncodeResponse{Error: err.Error()}) //nolint:exhaustruct
	}

	var data any
	if err := json.Unmarshal(req.Data, &data); err != nil {
		return marshalResponse(formatEncodeResponse{Error: "invalid data JSON: " + err.Error()}) //nolint:exhaustruct
	}

	opts := &formatfx.FormatOptions{ //nolint:exhaustruct
		Pretty:  req.Pretty,
		Indent:  req.Indent,
		IsFirst: req.IsFirst,
	}

	result, err := f.WriteItem(data, opts)
	if err != nil {
		return marshalResponse(formatEncodeResponse{Error: err.Error()}) //nolint:exhaustruct
	}

	return marshalResponse(formatEncodeResponse{Result: result, Error: ""})
}

// bridgeFormatEncodeDocument serializes all items to the named format as a
// single document, invoking WriteStart / WriteItem (per item) / WriteEnd.
// The caller passes items as a JSON array; each element is unmarshalled before
// being handed to the format's WriteItem method. IsFirst is set automatically
// for the first item. A trailing YAML/TOML document separator (---/+++) is
// trimmed from the output to match the behaviour of the TypeScript serializer.
func bridgeFormatEncodeDocument(requestJSON string) string {
	var req formatEncodeDocumentRequest
	if err := json.Unmarshal([]byte(requestJSON), &req); err != nil {
		return marshalResponse(formatEncodeDocumentResponse{Error: fmt.Errorf("invalid request JSON: %w", err).Error()}) //nolint:exhaustruct
	}

	ensureFormats()

	f, err := formatfx.GetFormat(req.Format)
	if err != nil {
		return marshalResponse(formatEncodeDocumentResponse{Error: err.Error()}) //nolint:exhaustruct
	}

	baseOpts := &formatfx.FormatOptions{Pretty: req.Pretty, Indent: req.Indent} //nolint:exhaustruct

	var chunks []string

	start, err := f.WriteStart(baseOpts)
	if err != nil {
		return marshalResponse(formatEncodeDocumentResponse{Error: "writeStart: " + err.Error()}) //nolint:exhaustruct
	}

	if start != "" {
		chunks = append(chunks, start)
	}

	for i, raw := range req.Items {
		var item any
		if err := json.Unmarshal(raw, &item); err != nil {
			return marshalResponse(formatEncodeDocumentResponse{Error: fmt.Sprintf("invalid item[%d] JSON: %s", i, err.Error())}) //nolint:exhaustruct
		}

		itemOpts := &formatfx.FormatOptions{ //nolint:exhaustruct
			Pretty:  req.Pretty,
			Indent:  req.Indent,
			IsFirst: i == 0,
		}

		encoded, err := f.WriteItem(item, itemOpts)
		if err != nil {
			return marshalResponse(formatEncodeDocumentResponse{Error: fmt.Sprintf("writeItem[%d]: %s", i, err.Error())}) //nolint:exhaustruct
		}

		chunks = append(chunks, encoded)
	}

	end, err := f.WriteEnd(baseOpts)
	if err != nil {
		return marshalResponse(formatEncodeDocumentResponse{Error: "writeEnd: " + err.Error()}) //nolint:exhaustruct
	}

	if end != "" {
		chunks = append(chunks, end)
	}

	result := strings.Join(chunks, "")

	// Mirror the TypeScript serializer's trimTrailingSeparator: strip a trailing
	// YAML (---) or TOML (+++) document separator followed by a newline.
	result = trailingDocSep.ReplaceAllString(result, "\n")

	return marshalResponse(formatEncodeDocumentResponse{Result: result}) //nolint:exhaustruct
}

// bridgeFormatDecode parses text in the named format and returns all items as
// a JSON array. Each item is marshalled to a JSON value independently.
func bridgeFormatDecode(requestJSON string) string {
	var req formatDecodeRequest
	if err := json.Unmarshal([]byte(requestJSON), &req); err != nil {
		return marshalResponse(formatDecodeResponse{Error: fmt.Errorf("invalid request JSON: %w", err).Error()}) //nolint:exhaustruct
	}

	ensureFormats()

	f, err := formatfx.GetFormat(req.Format)
	if err != nil {
		return marshalResponse(formatDecodeResponse{Error: err.Error()}) //nolint:exhaustruct
	}

	var readerOpts *formatfx.FormatOptions
	if len(req.Headers) > 0 {
		readerOpts = &formatfx.FormatOptions{Headers: req.Headers} //nolint:exhaustruct
	}

	reader := f.CreateReader(readerOpts)

	pushed, err := reader.Push(req.Text)
	if err != nil {
		return marshalResponse(formatDecodeResponse{Error: "parse failed: " + err.Error()}) //nolint:exhaustruct
	}

	flushed, err := reader.Flush()
	if err != nil {
		return marshalResponse(formatDecodeResponse{Error: "flush failed: " + err.Error()}) //nolint:exhaustruct
	}

	all := make([]any, 0, len(pushed)+len(flushed))
	all = append(all, pushed...)
	all = append(all, flushed...)

	rawItems := make([]json.RawMessage, 0, len(all))

	for _, item := range all {
		raw, err := json.Marshal(item)
		if err != nil {
			return marshalResponse(formatDecodeResponse{Error: "marshal item: " + err.Error()}) //nolint:exhaustruct
		}

		rawItems = append(rawItems, raw)
	}

	return marshalResponse(formatDecodeResponse{Items: rawItems, Error: ""})
}

// bridgeFormatList returns metadata for all registered built-in formats.
func bridgeFormatList() string {
	ensureFormats()

	formats := formatfx.DefaultRegistry.List()
	infos := make([]formatInfo, 0, len(formats))

	for _, f := range formats {
		infos = append(infos, formatInfo{
			Name:       f.Name(),
			Extensions: f.Extensions(),
			Streamable: f.Streamable(),
		})
	}

	return marshalResponse(formatListResponse{Formats: infos, Error: ""})
}

// ---------------------------------------------------------------------------

func mapStreamEvent(event aifx.StreamEvent) aiStreamEventResponse {
	resp := aiStreamEventResponse{} //nolint:exhaustruct

	switch event.Type {
	case aifx.StreamEventContentDelta:
		resp.Type = "content_delta"
		resp.TextDelta = event.TextDelta

	case aifx.StreamEventToolCallDelta:
		resp.Type = "tool_call_delta"
		if event.ToolCall != nil {
			resp.TextDelta = event.ToolCall.Name
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
		}
	}

	return resp
}

// ---------------------------------------------------------------------------
// Noskills bridge — wire types
// ---------------------------------------------------------------------------

type noskillsInitRequest struct {
	Root string `json:"root"`
}

type noskillsInitResponse struct {
	Root  string `json:"root,omitempty"`
	Error string `json:"error,omitempty"`
}

type noskillsSpecNewRequest struct {
	Root        string `json:"root"`
	Description string `json:"description,omitempty"`
	SpecName    string `json:"specName,omitempty"`
	PlanPath    string `json:"planPath,omitempty"`
}

type noskillsSpecNewResponse struct {
	SpecName string `json:"specName,omitempty"`
	SpecFile string `json:"specFile,omitempty"`
	Error    string `json:"error,omitempty"`
}

type noskillsNextRequest struct {
	Root     string `json:"root"`
	SpecName string `json:"specName,omitempty"`
	Answer   string `json:"answer,omitempty"`
}

// noskillsErrResponse is used when an error must be returned without any
// NextOutput fields (callers check result.error !== undefined).
type noskillsErrResponse struct {
	Error string `json:"error"`
}

// ---------------------------------------------------------------------------
// bridgeNoskillsInit: scaffold .eser/ + write default manifest.yml
// ---------------------------------------------------------------------------

func bridgeNoskillsInit(requestJSON string) string {
	var req noskillsInitRequest
	if err := json.Unmarshal([]byte(requestJSON), &req); err != nil {
		return marshalResponse(noskillsInitResponse{Error: fmt.Errorf("invalid request JSON: %w", err).Error()}) //nolint:exhaustruct
	}

	root, err := noskillsfx.ResolveProjectRoot(req.Root)
	if err != nil {
		return marshalResponse(noskillsInitResponse{Error: err.Error()}) //nolint:exhaustruct
	}

	if scaffoldErr := noskillsfx.ScaffoldEserDir(root); scaffoldErr != nil {
		return marshalResponse(noskillsInitResponse{Error: scaffoldErr.Error()}) //nolint:exhaustruct
	}

	p := noskillsfx.NewPaths(root)

	if writeErr := os.WriteFile(p.EserGitignore, []byte(".state/\n"), 0o644); writeErr != nil { //nolint:gosec
		return marshalResponse(noskillsInitResponse{Error: fmt.Errorf("write .gitignore: %w", writeErr).Error()}) //nolint:exhaustruct
	}

	if !noskillsfx.IsInitialized(root) {
		manifest := noskillsfx.NosManifest{ //nolint:exhaustruct
			Concerns:                   []string{},
			Tools:                      []noskillsfx.CodingToolID{noskillsfx.CodingToolClaudeCode},
			Providers:                  []string{},
			MaxIterationsBeforeRestart: 15,
			AllowGit:                   false,
			Command:                    "noskills",
		}

		if writeErr := noskillsfx.WriteManifest(root, manifest); writeErr != nil {
			return marshalResponse(noskillsInitResponse{Error: writeErr.Error()}) //nolint:exhaustruct
		}
	}

	return marshalResponse(noskillsInitResponse{Root: root}) //nolint:exhaustruct
}

// ---------------------------------------------------------------------------
// bridgeNoskillsSpecNew: create new spec + generate initial spec.md
// ---------------------------------------------------------------------------

func bridgeNoskillsSpecNew(requestJSON string) string { //nolint:cyclop,funlen
	var req noskillsSpecNewRequest
	if err := json.Unmarshal([]byte(requestJSON), &req); err != nil {
		return marshalResponse(noskillsSpecNewResponse{Error: fmt.Errorf("invalid request JSON: %w", err).Error()}) //nolint:exhaustruct
	}

	root, err := noskillsfx.ResolveProjectRoot(req.Root)
	if err != nil {
		return marshalResponse(noskillsSpecNewResponse{Error: err.Error()}) //nolint:exhaustruct
	}

	if !noskillsfx.IsInitialized(root) {
		return marshalResponse(noskillsSpecNewResponse{Error: "noskills not initialized — call noskillsInit first"}) //nolint:exhaustruct
	}

	specName := req.SpecName
	if (specName == "" || noskillsfx.LooksLikeDescription(specName)) && req.Description != "" {
		specName = noskillsfx.SlugFromDescription(req.Description)
	}

	if specName == "" {
		return marshalResponse(noskillsSpecNewResponse{Error: "specName or description is required"}) //nolint:exhaustruct
	}

	p := noskillsfx.NewPaths(root)

	// Deduplicate slug against existing spec directories.
	candidate := specName
	suffix := 2

	for {
		if noskillsfx.ReservedSpecNames[candidate] {
			candidate = fmt.Sprintf("%s-%d", specName, suffix)
			suffix++

			continue
		}

		if _, statErr := os.Stat(p.SpecDir(candidate)); statErr == nil { //nolint:gosec // validated slug
			candidate = fmt.Sprintf("%s-%d", specName, suffix)
			suffix++
		} else {
			break
		}
	}

	specName = candidate

	if mkErr := os.MkdirAll(p.SpecDir(specName), 0o750); mkErr != nil { //nolint:gosec // validated slug
		return marshalResponse(noskillsSpecNewResponse{Error: fmt.Errorf("mkdir spec: %w", mkErr).Error()}) //nolint:exhaustruct
	}

	state, err := noskillsfx.ReadState(root)
	if err != nil {
		return marshalResponse(noskillsSpecNewResponse{Error: err.Error()}) //nolint:exhaustruct
	}

	desc := req.Description
	var descPtr *string

	if desc != "" {
		descPtr = &desc
	}

	branch := noskillsBridgeDetectBranch(root)

	state, err = noskillsfx.StartSpec(state, specName, branch, descPtr)
	if err != nil {
		return marshalResponse(noskillsSpecNewResponse{Error: err.Error()}) //nolint:exhaustruct
	}

	if req.PlanPath != "" {
		disc := state.Discovery
		disc.PlanPath = &req.PlanPath
		state.Discovery = disc
	}

	if writeErr := noskillsfx.WriteState(root, state); writeErr != nil {
		return marshalResponse(noskillsSpecNewResponse{Error: writeErr.Error()}) //nolint:exhaustruct
	}

	// Generate initial spec.md from concern sections.
	manifest, err := noskillsfx.ReadManifest(root)
	if err != nil {
		return marshalResponse(noskillsSpecNewResponse{Error: err.Error()}) //nolint:exhaustruct
	}

	allConcerns, err := noskillsfx.LoadConcerns(p.ConcernsDir)
	if err != nil {
		return marshalResponse(noskillsSpecNewResponse{Error: err.Error()}) //nolint:exhaustruct
	}

	activeConcerns := noskillsfx.FilterActiveConcerns(allConcerns, manifest.Concerns)
	now := time.Now().UTC().Format(time.RFC3339)

	var creatorName string

	if manifest.User != nil {
		creatorName = manifest.User.Name
	} else {
		creatorName = "unknown"
	}

	specResult, err := noskillsfx.GenerateInitialSpec(noskillsfx.GenerateSpecArgs{
		SpecName:       specName,
		ActiveConcerns: activeConcerns,
		Classification: nil,
		Creator:        struct{ Name, Email string }{Name: creatorName},
		Now:            now,
	})
	if err != nil {
		return marshalResponse(noskillsSpecNewResponse{Error: fmt.Errorf("generate spec.md: %w", err).Error()}) //nolint:exhaustruct
	}

	specFile := p.SpecFile(specName)

	if writeErr := os.WriteFile(specFile, []byte(specResult.Content), 0o644); writeErr != nil { //nolint:gosec
		return marshalResponse(noskillsSpecNewResponse{Error: fmt.Errorf("write spec.md: %w", writeErr).Error()}) //nolint:exhaustruct
	}

	sp := state.SpecState
	sp.Placeholders = specResult.Placeholders
	sp.Metadata = specResult.Metadata
	sp.Path = &specFile
	state.SpecState = sp

	if writeErr := noskillsfx.WriteState(root, state); writeErr != nil {
		return marshalResponse(noskillsSpecNewResponse{Error: writeErr.Error()}) //nolint:exhaustruct
	}

	return marshalResponse(noskillsSpecNewResponse{SpecName: specName, SpecFile: specFile}) //nolint:exhaustruct
}

// ---------------------------------------------------------------------------
// bridgeNoskillsNext: apply answer (optional) + compile next output
// ---------------------------------------------------------------------------

func bridgeNoskillsNext(requestJSON string) string {
	var req noskillsNextRequest
	if err := json.Unmarshal([]byte(requestJSON), &req); err != nil {
		return marshalResponse(noskillsErrResponse{fmt.Errorf("invalid request JSON: %w", err).Error()})
	}

	root, err := noskillsfx.ResolveProjectRoot(req.Root)
	if err != nil {
		return marshalResponse(noskillsErrResponse{err.Error()})
	}

	state, err := noskillsfx.ReadState(root)
	if err != nil {
		return marshalResponse(noskillsErrResponse{err.Error()})
	}

	if req.SpecName != "" && (state.Spec == nil || *state.Spec != req.SpecName) {
		perSpec, psErr := noskillsfx.ReadSpecState(root, req.SpecName)
		if psErr != nil {
			return marshalResponse(noskillsErrResponse{psErr.Error()})
		}

		if perSpec != nil {
			state = *perSpec
		}
	}

	manifest, err := noskillsfx.ReadManifest(root)
	if err != nil {
		return marshalResponse(noskillsErrResponse{err.Error()})
	}

	p := noskillsfx.NewPaths(root)

	allConcerns, err := noskillsfx.LoadConcerns(p.ConcernsDir)
	if err != nil {
		return marshalResponse(noskillsErrResponse{err.Error()})
	}

	activeConcerns := noskillsfx.FilterActiveConcerns(allConcerns, manifest.Concerns)

	if req.Answer != "" {
		state, err = noskillsBridgeApplyAnswer(state, req.Answer, activeConcerns)
		if err != nil {
			return marshalResponse(noskillsErrResponse{err.Error()})
		}

		now := time.Now().UTC().Format(time.RFC3339)
		state.LastCalledAt = &now

		if writeErr := noskillsfx.WriteState(root, state); writeErr != nil {
			return marshalResponse(noskillsErrResponse{writeErr.Error()})
		}
	}

	out := noskillsfx.Compile(state, manifest, noskillsfx.CompileOptions{
		AllConcerns: allConcerns,
	})

	return marshalResponse(out)
}

// noskillsBridgeApplyAnswer mutates state based on the current phase and answer.
func noskillsBridgeApplyAnswer(
	state noskillsfx.StateFile,
	answer string,
	activeConcerns []noskillsfx.ConcernDefinition,
) (noskillsfx.StateFile, error) {
	switch state.Phase {
	case noskillsfx.PhaseDiscovery:
		if state.Discovery.Mode == nil {
			mode := strings.TrimSpace(answer)
			disc := state.Discovery
			disc.Mode = &mode
			state.Discovery = disc

			return state, nil
		}

		questions := noskillsfx.GetQuestionsWithExtras(activeConcerns)
		next := noskillsfx.GetNextUnanswered(questions, state.Discovery.Answers)

		if next != nil {
			state = noskillsfx.AddDiscoveryAnswer(state, noskillsfx.DiscoveryAnswer{
				QuestionID: next.ID,
				Answer:     answer,
			})

			if noskillsfx.IsDiscoveryComplete(state.Discovery.Answers) {
				var compErr error

				state, compErr = noskillsfx.CompleteDiscovery(state)
				if compErr != nil {
					return state, compErr
				}
			}
		}

	case noskillsfx.PhaseExecuting:
		state = noskillsfx.AdvanceExecution(state, answer)

	default:
		state = noskillsfx.AddDecision(state, noskillsfx.Decision{
			ID:        fmt.Sprintf("answer-%d", len(state.Decisions)+1),
			Question:  "agent-answer",
			Choice:    answer,
			Promoted:  false,
			Timestamp: time.Now().UTC().Format(time.RFC3339),
		})
	}

	return state, nil
}

// noskillsBridgeDetectBranch reads .git/HEAD to detect the current branch name.
// Falls back to "main" when detection fails.
func noskillsBridgeDetectBranch(root string) string {
	data, err := os.ReadFile(root + "/.git/HEAD") //nolint:gosec // path from validated root
	if err != nil {
		return "main"
	}

	line := strings.TrimSpace(string(data))

	const headPrefix = "ref: refs/heads/"
	if strings.HasPrefix(line, headPrefix) {
		return strings.TrimPrefix(line, headPrefix)
	}

	return "main"
}

// ---------------------------------------------------------------------------
// Workflow bridge — wire types
// ---------------------------------------------------------------------------

type workflowRunRequest struct {
	ChangedFiles []string           `json:"changedFiles,omitempty"`
	Workflows    []workflowDefInput `json:"workflows"`
	Root         string             `json:"root"`
	Event        string             `json:"event,omitempty"`
	WorkflowID   string             `json:"workflowId,omitempty"`
	Only         string             `json:"only,omitempty"`
	TimeoutMs    int                `json:"timeoutMs,omitempty"`
	Fix          bool               `json:"fix"`
}

type workflowDefInput struct {
	Includes []string              `json:"includes,omitempty"`
	ID       string                `json:"id"`
	On       []string              `json:"on"`
	Steps    []workflowStepInput   `json:"steps"`
}

type workflowStepInput struct {
	Options         map[string]any  `json:"options,omitempty"`
	InputSchema     json.RawMessage `json:"inputSchema,omitempty"`
	Name            string          `json:"name"`
	ContinueOnError bool            `json:"continueOnError,omitempty"`
	TimeoutMs       int             `json:"timeoutMs,omitempty"`
	Bypass          bool            `json:"bypass,omitempty"`
}

type workflowRunResponse struct {
	Results []workflowResultResp `json:"results,omitempty"`
	Error   string               `json:"error,omitempty"`
}

type workflowResultResp struct {
	Steps           []workflowStepResp `json:"steps"`
	Stats           map[string]any     `json:"stats,omitempty"`
	ID              string             `json:"id"`
	TotalDurationMs float64            `json:"totalDurationMs"`
	Passed          bool               `json:"passed"`
}

type workflowStepResp struct {
	Issues     []workflowIssueResp    `json:"issues,omitempty"`
	Mutations  []workflowMutationResp `json:"mutations,omitempty"`
	Stats      map[string]any         `json:"stats,omitempty"`
	Name       string                 `json:"name"`
	DurationMs float64                `json:"durationMs"`
	Passed     bool                   `json:"passed"`
}

type workflowIssueResp struct {
	Path    string `json:"path,omitempty"`
	Message string `json:"message"`
	Line    int    `json:"line,omitempty"`
	Fixed   bool   `json:"fixed,omitempty"`
}

type workflowMutationResp struct {
	Path       string `json:"path"`
	OldContent string `json:"oldContent"`
	NewContent string `json:"newContent"`
}

// ---------------------------------------------------------------------------
// shellWorkflowTool — built-in "shell" tool for FFI workflow execution
// ---------------------------------------------------------------------------

// shellWorkflowTool runs a shell command from step options["command"].
// It is the only tool registered in the FFI workflow registry. TypeScript callers
// must set step name to "shell" and provide options: { command: "..." }.
type shellWorkflowTool struct{}

func (t *shellWorkflowTool) Name() string        { return "shell" }
func (t *shellWorkflowTool) Description() string { return "runs a shell command from options[command]" }

func (t *shellWorkflowTool) Run(ctx context.Context, options map[string]any) (*workflowfx.WorkflowToolResult, error) {
	command, _ := options["command"].(string)
	if command == "" {
		return &workflowfx.WorkflowToolResult{ //nolint:exhaustruct
			Name:   "shell",
			Passed: false,
			Issues: []workflowfx.WorkflowIssue{{Message: `step requires options["command"]`}},
		}, nil
	}

	root := "."
	if r, ok := options["root"].(string); ok && r != "" {
		root = r
	}

	cmd := exec.CommandContext(ctx, "sh", "-c", command) //nolint:gosec // command from trusted caller
	cmd.Dir = root

	out, err := cmd.CombinedOutput()
	if err != nil {
		return &workflowfx.WorkflowToolResult{ //nolint:exhaustruct
			Name:   "shell",
			Passed: false,
			Issues: []workflowfx.WorkflowIssue{{Message: string(out) + ": " + err.Error()}},
		}, nil
	}

	return &workflowfx.WorkflowToolResult{ //nolint:exhaustruct
		Name:   "shell",
		Passed: true,
		Stats:  map[string]any{"output": string(out)},
	}, nil
}

// ---------------------------------------------------------------------------
// Workflow bridge functions
// ---------------------------------------------------------------------------

// bridgeWorkflowRun runs all workflows matching the given event.
// Only the built-in "shell" tool is available for step execution.
// Callers pass workflow definitions inline as JSON; tools must use name "shell".
func bridgeWorkflowRun(requestJSON string) string {
	var req workflowRunRequest
	if err := json.Unmarshal([]byte(requestJSON), &req); err != nil {
		return marshalResponse(workflowRunResponse{Error: fmt.Errorf("invalid request JSON: %w", err).Error()}) //nolint:exhaustruct
	}

	if req.Event == "" && req.WorkflowID == "" {
		return marshalResponse(workflowRunResponse{Error: "event or workflowId is required"}) //nolint:exhaustruct
	}

	registry := workflowfx.NewRegistry()
	registry.Register(&shellWorkflowTool{})

	defs := make([]*workflowfx.WorkflowDefinition, 0, len(req.Workflows))

	for _, wd := range req.Workflows {
		steps := make([]workflowfx.StepConfig, 0, len(wd.Steps))

		for _, s := range wd.Steps {
			opts := s.Options
			if opts == nil {
				opts = make(map[string]any)
			}

			cfg := workflowfx.StepConfig{ //nolint:exhaustruct
				Name:            s.Name,
				Options:         opts,
				ContinueOnError: s.ContinueOnError,
				Bypass:          s.Bypass,
				InputSchema:     s.InputSchema,
			}

			if s.TimeoutMs > 0 {
				cfg.Timeout = time.Duration(s.TimeoutMs) * time.Millisecond
			}

			steps = append(steps, cfg)
		}

		defs = append(defs, &workflowfx.WorkflowDefinition{
			ID:       wd.ID,
			On:       wd.On,
			Steps:    steps,
			Includes: wd.Includes,
		})
	}

	root := req.Root
	if root == "" {
		root = "."
	}

	var defaultTimeout time.Duration
	if req.TimeoutMs > 0 {
		defaultTimeout = time.Duration(req.TimeoutMs) * time.Millisecond
	}

	runOpts := &workflowfx.RunOptions{ //nolint:exhaustruct
		Root:           root,
		Fix:            req.Fix,
		Only:           req.Only,
		ChangedFiles:   req.ChangedFiles,
		DefaultTimeout: defaultTimeout,
	}

	var results []*workflowfx.WorkflowResult

	if req.WorkflowID != "" {
		cfg := &workflowfx.WorkflowsConfig{Workflows: defs} //nolint:exhaustruct
		r, err := workflowfx.RunWorkflowWithConfig(context.Background(), req.WorkflowID, cfg, registry, runOpts)
		if err != nil {
			return marshalResponse(workflowRunResponse{Error: err.Error()}) //nolint:exhaustruct
		}
		results = []*workflowfx.WorkflowResult{r}
	} else {
		var err error
		results, err = workflowfx.RunByEvent(context.Background(), req.Event, defs, registry, runOpts)
		if err != nil {
			return marshalResponse(workflowRunResponse{Error: err.Error()}) //nolint:exhaustruct
		}
	}

	resp := make([]workflowResultResp, 0, len(results))

	for _, r := range results {
		steps := make([]workflowStepResp, 0, len(r.Steps))

		for _, s := range r.Steps {
			issues := make([]workflowIssueResp, 0, len(s.Issues))
			for _, i := range s.Issues {
				issues = append(issues, workflowIssueResp{
					Path:    i.Path,
					Line:    i.Line,
					Message: i.Message,
					Fixed:   i.Fixed,
				})
			}

			mutations := make([]workflowMutationResp, 0, len(s.Mutations))
			for _, m := range s.Mutations {
				mutations = append(mutations, workflowMutationResp{
					Path:       m.Path,
					OldContent: m.OldContent,
					NewContent: m.NewContent,
				})
			}

			steps = append(steps, workflowStepResp{
				Name:       s.Name,
				Passed:     s.Passed,
				Issues:     issues,
				Mutations:  mutations,
				Stats:      s.Stats,
				DurationMs: s.DurationMs,
			})
		}

		resp = append(resp, workflowResultResp{ //nolint:exhaustruct
			ID:              r.ID,
			Passed:          r.Passed,
			Steps:           steps,
			TotalDurationMs: r.TotalDurationMs,
		})
	}

	return marshalResponse(workflowRunResponse{Results: resp}) //nolint:exhaustruct
}

// ---------------------------------------------------------------------------
// Crypto bridge — wire types
// ---------------------------------------------------------------------------

type cryptoHashRequest struct {
	// Data is the base64-encoded binary input. Mutually exclusive with Text.
	Data string `json:"data,omitempty"`
	// Text is the UTF-8 string input. Used by hashString calls.
	Text      string `json:"text,omitempty"`
	Algorithm string `json:"algorithm,omitempty"` // default: "SHA-256"
	Length    int    `json:"length,omitempty"`    // 0 = full digest
}

type cryptoHashResponse struct {
	Hash  string `json:"hash,omitempty"`
	Error string `json:"error,omitempty"`
}

// ---------------------------------------------------------------------------
// Crypto bridge functions
// ---------------------------------------------------------------------------

// bridgeCryptoHash hashes binary (base64-encoded) or text input with the
// requested algorithm. Returns JSON: { hash: string } | { error: string }.
func bridgeCryptoHash(requestJSON string) string {
	var req cryptoHashRequest
	if err := json.Unmarshal([]byte(requestJSON), &req); err != nil {
		return marshalResponse(cryptoHashResponse{Error: fmt.Errorf("invalid request JSON: %w", err).Error()}) //nolint:exhaustruct
	}

	algo := cryptofx.HashAlgorithm(req.Algorithm)
	if algo == "" {
		algo = cryptofx.SHA256
	}

	var result string
	var err error

	switch {
	case req.Text != "":
		result, err = cryptofx.HashString(req.Text, algo, req.Length)

	case req.Data != "":
		raw, decErr := base64.StdEncoding.DecodeString(req.Data)
		if decErr != nil {
			return marshalResponse(cryptoHashResponse{Error: "invalid base64 in data: " + decErr.Error()}) //nolint:exhaustruct
		}

		result, err = cryptofx.HashHex(raw, algo, req.Length)

	default:
		// Empty input — hash zero bytes.
		result, err = cryptofx.HashHex([]byte{}, algo, req.Length)
	}

	if err != nil {
		return marshalResponse(cryptoHashResponse{Error: err.Error()}) //nolint:exhaustruct
	}

	return marshalResponse(cryptoHashResponse{Hash: result}) //nolint:exhaustruct
}

// ---------------------------------------------------------------------------
// Cache bridge — state
// ---------------------------------------------------------------------------

var (
	cacheHandles = make(map[string]*cachefx.Manager)
	cacheMu      sync.RWMutex
)

// ---------------------------------------------------------------------------
// Cache bridge — wire types
// ---------------------------------------------------------------------------

type cacheAppInput struct {
	Org  string `json:"org,omitempty"`
	Name string `json:"name"`
}

type cacheCreateRequest struct {
	App     cacheAppInput `json:"app"`
	BaseDir string        `json:"baseDir,omitempty"`
}

type cacheHandleResponse struct {
	Handle string `json:"handle,omitempty"`
	Error  string `json:"error,omitempty"`
}

type cacheDirResponse struct {
	Dir   string `json:"dir,omitempty"`
	Error string `json:"error,omitempty"`
}

type cachePathResponse struct {
	Path  string `json:"path,omitempty"`
	Error string `json:"error,omitempty"`
}

type cacheEntryJSON struct {
	Path        string `json:"path"`
	Name        string `json:"name"`
	MtimeUnix   int64  `json:"mtimeUnix"`
	Size        int64  `json:"size"`
	IsDirectory bool   `json:"isDirectory"`
}

type cacheListResponse struct {
	Entries []cacheEntryJSON `json:"entries,omitempty"`
	Error   string           `json:"error,omitempty"`
}

type cacheHandleRequest struct {
	Handle string `json:"handle"`
}

type cacheVersionedPathRequest struct {
	Handle  string `json:"handle"`
	Version string `json:"version"`
	Name    string `json:"name"`
}

type cacheRemoveRequest struct {
	Handle string `json:"handle"`
	Path   string `json:"path"`
}

// ---------------------------------------------------------------------------
// Cache bridge functions
// ---------------------------------------------------------------------------

// bridgeCacheCreate creates a Manager and stores it under a new handle.
func bridgeCacheCreate(requestJSON string) string {
	var req cacheCreateRequest
	if err := json.Unmarshal([]byte(requestJSON), &req); err != nil {
		return marshalResponse(cacheHandleResponse{Error: fmt.Errorf("invalid request JSON: %w", err).Error()}) //nolint:exhaustruct
	}

	if req.App.Name == "" {
		return marshalResponse(cacheHandleResponse{Error: "app.name is required"}) //nolint:exhaustruct
	}

	mgr := cachefx.NewManager(cachefx.Options{
		BaseDir: req.BaseDir,
		App:     cachefx.AppIdentifier{Org: req.App.Org, Name: req.App.Name},
	})

	handle := newHandle("cache")

	cacheMu.Lock()
	cacheHandles[handle] = mgr
	cacheMu.Unlock()

	return marshalResponse(cacheHandleResponse{Handle: handle}) //nolint:exhaustruct
}

// bridgeCacheGetDir returns the absolute cache directory for a handle.
func bridgeCacheGetDir(requestJSON string) string {
	var req cacheHandleRequest
	if err := json.Unmarshal([]byte(requestJSON), &req); err != nil {
		return marshalResponse(cacheDirResponse{Error: fmt.Errorf("invalid request JSON: %w", err).Error()}) //nolint:exhaustruct
	}

	cacheMu.RLock()
	mgr, ok := cacheHandles[req.Handle]
	cacheMu.RUnlock()

	if !ok {
		return marshalResponse(cacheDirResponse{Error: "cache handle not found: " + req.Handle}) //nolint:exhaustruct
	}

	return marshalResponse(cacheDirResponse{Dir: mgr.Dir()}) //nolint:exhaustruct
}

// bridgeCacheGetVersionedPath returns the path for a named artefact at a version.
func bridgeCacheGetVersionedPath(requestJSON string) string {
	var req cacheVersionedPathRequest
	if err := json.Unmarshal([]byte(requestJSON), &req); err != nil {
		return marshalResponse(cachePathResponse{Error: fmt.Errorf("invalid request JSON: %w", err).Error()}) //nolint:exhaustruct
	}

	cacheMu.RLock()
	mgr, ok := cacheHandles[req.Handle]
	cacheMu.RUnlock()

	if !ok {
		return marshalResponse(cachePathResponse{Error: "cache handle not found: " + req.Handle}) //nolint:exhaustruct
	}

	return marshalResponse(cachePathResponse{Path: mgr.VersionedPath(req.Version, req.Name)}) //nolint:exhaustruct
}

// bridgeCacheList lists entries in the cache directory.
func bridgeCacheList(requestJSON string) string {
	var req cacheHandleRequest
	if err := json.Unmarshal([]byte(requestJSON), &req); err != nil {
		return marshalResponse(cacheListResponse{Error: fmt.Errorf("invalid request JSON: %w", err).Error()}) //nolint:exhaustruct
	}

	cacheMu.RLock()
	mgr, ok := cacheHandles[req.Handle]
	cacheMu.RUnlock()

	if !ok {
		return marshalResponse(cacheListResponse{Error: "cache handle not found: " + req.Handle}) //nolint:exhaustruct
	}

	entries, err := mgr.List()
	if err != nil {
		return marshalResponse(cacheListResponse{Error: err.Error()}) //nolint:exhaustruct
	}

	jsonEntries := make([]cacheEntryJSON, 0, len(entries))
	for _, e := range entries {
		jsonEntries = append(jsonEntries, cacheEntryJSON{
			Path:        e.Path,
			Name:        e.Name,
			Size:        e.Size,
			MtimeUnix:   e.MtimeUnix,
			IsDirectory: e.IsDirectory,
		})
	}

	return marshalResponse(cacheListResponse{Entries: jsonEntries}) //nolint:exhaustruct
}

// bridgeCacheRemove deletes a specific path from the cache.
func bridgeCacheRemove(requestJSON string) string {
	var req cacheRemoveRequest
	if err := json.Unmarshal([]byte(requestJSON), &req); err != nil {
		return marshalResponse(struct {
			Error string `json:"error,omitempty"`
		}{Error: fmt.Errorf("invalid request JSON: %w", err).Error()})
	}

	cacheMu.RLock()
	mgr, ok := cacheHandles[req.Handle]
	cacheMu.RUnlock()

	if !ok {
		return marshalResponse(struct {
			Error string `json:"error,omitempty"`
		}{Error: "cache handle not found: " + req.Handle})
	}

	if err := mgr.Remove(req.Path); err != nil {
		return marshalResponse(struct {
			Error string `json:"error,omitempty"`
		}{Error: err.Error()})
	}

	return "{}"
}

// bridgeCacheClear deletes the entire cache directory for a handle.
func bridgeCacheClear(requestJSON string) string {
	var req cacheHandleRequest
	if err := json.Unmarshal([]byte(requestJSON), &req); err != nil {
		return marshalResponse(struct {
			Error string `json:"error,omitempty"`
		}{Error: fmt.Errorf("invalid request JSON: %w", err).Error()})
	}

	cacheMu.RLock()
	mgr, ok := cacheHandles[req.Handle]
	cacheMu.RUnlock()

	if !ok {
		return marshalResponse(struct {
			Error string `json:"error,omitempty"`
		}{Error: "cache handle not found: " + req.Handle})
	}

	if err := mgr.Clear(); err != nil {
		return marshalResponse(struct {
			Error string `json:"error,omitempty"`
		}{Error: err.Error()})
	}

	return "{}"
}

// bridgeCacheClose removes a cache handle and frees the reference.
func bridgeCacheClose(requestJSON string) string {
	var req cacheHandleRequest
	if err := json.Unmarshal([]byte(requestJSON), &req); err != nil {
		return "{}"
	}

	cacheMu.Lock()
	delete(cacheHandles, req.Handle)
	cacheMu.Unlock()

	return "{}"
}

// ---------------------------------------------------------------------------
// CS (Kubernetes ConfigMap/Secret) bridge
// ---------------------------------------------------------------------------

// csResourceJSON is the wire representation for a Kubernetes resource reference.
type csResourceJSON struct {
	Type      string `json:"type"`
	Name      string `json:"name"`
	Namespace string `json:"namespace,omitempty"`
}

// csGenerateRequest is the JSON request for EserAjanCsGenerate.
type csGenerateRequest struct {
	Resource  csResourceJSON `json:"resource"`
	EnvFile   string         `json:"envFile,omitempty"`
	CWD       string         `json:"cwd,omitempty"`
	Format    string         `json:"format,omitempty"`
	Namespace string         `json:"namespace,omitempty"`
}

// csSyncRequest is the JSON request for EserAjanCsSync.
type csSyncRequest struct {
	Resource   csResourceJSON `json:"resource"`
	EnvFile    string         `json:"envFile,omitempty"`
	Format     string         `json:"format,omitempty"`
	StringOnly bool           `json:"stringOnly,omitempty"`
}

// csResultResponse wraps a string result for the caller.
type csResultResponse struct {
	Result string `json:"result,omitempty"`
	Error  string `json:"error,omitempty"`
}

// bridgeCsGenerate generates a Kubernetes ConfigMap/Secret manifest from an env file.
func bridgeCsGenerate(requestJSON string) string {
	var req csGenerateRequest
	if err := json.Unmarshal([]byte(requestJSON), &req); err != nil {
		return marshalResponse(csResultResponse{Error: "invalid request JSON: " + err.Error()}) //nolint:exhaustruct
	}

	genOpts := csfx.GenerateOptions{ //nolint:exhaustruct
		Resource: csfx.ResourceReference{
			Type:      csfx.ResourceType(req.Resource.Type),
			Name:      req.Resource.Name,
			Namespace: req.Resource.Namespace,
		},
		Format:    req.Format,
		Namespace: req.Namespace,
	}
	if req.EnvFile != "" {
		genOpts.EnvFile = req.EnvFile
	} else {
		cwd := req.CWD
		if cwd == "" {
			cwd, _ = os.Getwd() //nolint:errcheck
		}
		genOpts.EnvFiles = []string{
			filepath.Join(cwd, ".env"),
			filepath.Join(cwd, ".env.local"),
		}
	}
	result, err := csfx.Generate(genOpts)
	if err != nil {
		return marshalResponse(csResultResponse{Error: err.Error()}) //nolint:exhaustruct
	}

	return marshalResponse(csResultResponse{Result: result}) //nolint:exhaustruct
}

// bridgeCsSync generates a kubectl patch command that syncs env values into a K8s resource.
func bridgeCsSync(requestJSON string) string {
	var req csSyncRequest
	if err := json.Unmarshal([]byte(requestJSON), &req); err != nil {
		return marshalResponse(csResultResponse{Error: "invalid request JSON: " + err.Error()}) //nolint:exhaustruct
	}

	result, err := csfx.Sync(csfx.SyncOptions{
		Resource: csfx.ResourceReference{
			Type:      csfx.ResourceType(req.Resource.Type),
			Name:      req.Resource.Name,
			Namespace: req.Resource.Namespace,
		},
		EnvFile:    req.EnvFile,
		Format:     req.Format,
		StringOnly: req.StringOnly,
	})
	if err != nil {
		return marshalResponse(csResultResponse{Error: err.Error()}) //nolint:exhaustruct
	}

	return marshalResponse(csResultResponse{Result: result}) //nolint:exhaustruct
}

// ---------------------------------------------------------------------------
// Kit (recipe/scaffolding) bridge
// ---------------------------------------------------------------------------

// kitListRecipesRequest is the JSON request for EserAjanKitListRecipes.
type kitListRecipesRequest struct {
	RegistryURL string `json:"registryUrl,omitempty"`
	CWD         string `json:"cwd,omitempty"`
	Language    string `json:"language,omitempty"`
	Scale       string `json:"scale,omitempty"`
	Tag         string `json:"tag,omitempty"`
}

// kitListRecipesManifest carries top-level registry metadata in the list response.
type kitListRecipesManifest struct {
	Name        string `json:"name"`
	Description string `json:"description"`
	Author      string `json:"author"`
	RegistryURL string `json:"registryUrl"`
}

// kitListRecipesResponse is the JSON response for EserAjanKitListRecipes.
type kitListRecipesResponse struct {
	Manifest *kitListRecipesManifest `json:"manifest,omitempty"`
	Recipes  []kitfx.Recipe          `json:"recipes,omitempty"`
	Error    string                  `json:"error,omitempty"`
}

// kitApplyRecipeRequest is the JSON request for EserAjanKitApplyRecipe.
type kitApplyRecipeRequest struct {
	RecipeName  string            `json:"recipeName"`
	RegistryURL string            `json:"registryUrl,omitempty"`
	CWD         string            `json:"cwd,omitempty"`
	Force       bool              `json:"force,omitempty"`
	SkipExisting bool             `json:"skipExisting,omitempty"`
	DryRun      bool              `json:"dryRun,omitempty"`
	Verbose     bool              `json:"verbose,omitempty"`
	Variables   map[string]string `json:"variables,omitempty"`
}

// kitApplyRecipeResponse is the JSON response for EserAjanKitApplyRecipe.
type kitApplyRecipeResponse struct {
	Recipes []kitApplyRecipeResult `json:"recipes,omitempty"`
	Error   string                 `json:"error,omitempty"`
}

// kitApplyRecipeResult mirrors kitfx.NamedApplyResult for JSON serialization.
type kitApplyRecipeResult struct {
	Name           string   `json:"name"`
	Written        []string `json:"written,omitempty"`
	Skipped        []string `json:"skipped,omitempty"`
	Total          int      `json:"total"`
	PostInstallRan []string `json:"postInstallRan,omitempty"`
}

// bridgeKitListRecipes fetches a registry manifest and returns all recipe metadata.
func bridgeKitListRecipes(requestJSON string) string {
	var req kitListRecipesRequest
	if err := json.Unmarshal([]byte(requestJSON), &req); err != nil {
		return marshalResponse(kitListRecipesResponse{Error: "invalid request JSON: " + err.Error()}) //nolint:exhaustruct
	}

	cwd := req.CWD
	if cwd == "" {
		var err error
		cwd, err = os.Getwd()
		if err != nil {
			return marshalResponse(kitListRecipesResponse{Error: "cannot determine cwd: " + err.Error()}) //nolint:exhaustruct
		}
	}

	manifest, err := kitfx.FetchRegistry(cwd, req.RegistryURL)
	if err != nil {
		return marshalResponse(kitListRecipesResponse{Error: err.Error()}) //nolint:exhaustruct
	}

	recipes := kitfx.FilterRecipes(manifest.Recipes, kitfx.FilterOptions{
		Language: req.Language,
		Scale:    req.Scale,
		Tag:      req.Tag,
	})

	return marshalResponse(kitListRecipesResponse{
		Manifest: &kitListRecipesManifest{
			Name:        manifest.Name,
			Description: manifest.Description,
			Author:      manifest.Author,
			RegistryURL: manifest.RegistryURL,
		},
		Recipes: recipes,
	})
}

// bridgeKitApplyRecipe resolves and applies a recipe dependency chain.
func bridgeKitApplyRecipe(requestJSON string) string {
	var req kitApplyRecipeRequest
	if err := json.Unmarshal([]byte(requestJSON), &req); err != nil {
		return marshalResponse(kitApplyRecipeResponse{Error: "invalid request JSON: " + err.Error()}) //nolint:exhaustruct
	}

	if req.RecipeName == "" {
		return marshalResponse(kitApplyRecipeResponse{Error: "recipeName is required"}) //nolint:exhaustruct
	}

	cwd := req.CWD
	if cwd == "" {
		var err error
		cwd, err = os.Getwd()
		if err != nil {
			return marshalResponse(kitApplyRecipeResponse{Error: "cannot determine cwd: " + err.Error()}) //nolint:exhaustruct
		}
	}

	manifest, err := kitfx.FetchRegistry(cwd, req.RegistryURL)
	if err != nil {
		return marshalResponse(kitApplyRecipeResponse{Error: err.Error()}) //nolint:exhaustruct
	}

	chainResult, err := kitfx.ApplyRecipeChain(req.RecipeName, manifest, kitfx.ApplyOptions{
		CWD:          cwd,
		RegistryURL:  req.RegistryURL,
		Force:        req.Force,
		SkipExisting: req.SkipExisting,
		DryRun:       req.DryRun,
		Verbose:      req.Verbose,
		Variables:    req.Variables,
	})
	if err != nil {
		return marshalResponse(kitApplyRecipeResponse{Error: err.Error()}) //nolint:exhaustruct
	}

	results := make([]kitApplyRecipeResult, 0, len(chainResult.Recipes))
	for _, nr := range chainResult.Recipes {
		results = append(results, kitApplyRecipeResult{
			Name:           nr.Name,
			Written:        nr.Result.Written,
			Skipped:        nr.Result.Skipped,
			Total:          nr.Result.Total,
			PostInstallRan: nr.Result.PostInstallRan,
		})
	}

	return marshalResponse(kitApplyRecipeResponse{Recipes: results}) //nolint:exhaustruct
}

// kitCloneRecipeRequest is the JSON request for EserAjanKitCloneRecipe.
type kitCloneRecipeRequest struct {
	Specifier    string            `json:"specifier"`
	CWD          string            `json:"cwd,omitempty"`
	ProjectName  string            `json:"projectName,omitempty"`
	DryRun       bool              `json:"dryRun,omitempty"`
	Force        bool              `json:"force,omitempty"`
	SkipExisting bool              `json:"skipExisting,omitempty"`
	Verbose      bool              `json:"verbose,omitempty"`
	Variables    map[string]string `json:"variables,omitempty"`
}

// kitNewProjectRequest is the JSON request for EserAjanKitNewProject.
type kitNewProjectRequest struct {
	TemplateName   string            `json:"templateName"`
	ProjectName    string            `json:"projectName"`
	TargetDir      string            `json:"targetDir"`
	RegistrySource string            `json:"registrySource,omitempty"`
	Variables      map[string]string `json:"variables,omitempty"`
}

// kitUpdateRecipeRequest is the JSON request for EserAjanKitUpdateRecipe.
type kitUpdateRecipeRequest struct {
	RecipeName     string `json:"recipeName"`
	CWD            string `json:"cwd,omitempty"`
	RegistrySource string `json:"registrySource,omitempty"`
	DryRun         bool   `json:"dryRun,omitempty"`
	Verbose        bool   `json:"verbose,omitempty"`
}

// bridgeKitCloneRecipe fetches a recipe registry from a GitHub repo specifier
// and applies the first recipe (or chain) to cwd.
func bridgeKitCloneRecipe(requestJSON string) string {
	var req kitCloneRecipeRequest
	if err := json.Unmarshal([]byte(requestJSON), &req); err != nil {
		return marshalResponse(kitApplyRecipeResponse{Error: "invalid request JSON: " + err.Error()}) //nolint:exhaustruct
	}

	if req.Specifier == "" {
		return marshalResponse(kitApplyRecipeResponse{Error: "specifier is required"}) //nolint:exhaustruct
	}

	resolved := kitfx.ResolveSpecifier(req.Specifier)
	if resolved.Kind != "repo" {
		return marshalResponse(kitApplyRecipeResponse{Error: "specifier must be a GitHub repo (e.g. gh:owner/repo#ref)"}) //nolint:exhaustruct
	}

	manifest, err := kitfx.FetchRegistryFromRepo(resolved.Owner, resolved.Repo, resolved.Ref)
	if err != nil {
		return marshalResponse(kitApplyRecipeResponse{Error: err.Error()}) //nolint:exhaustruct
	}

	if len(manifest.Recipes) == 0 {
		return marshalResponse(kitApplyRecipeResponse{Error: "no recipes found in registry"}) //nolint:exhaustruct
	}

	cwd := req.CWD
	if cwd == "" {
		cwd, err = os.Getwd()
		if err != nil {
			return marshalResponse(kitApplyRecipeResponse{Error: "cannot determine cwd: " + err.Error()}) //nolint:exhaustruct
		}
	}

	targetDir := cwd
	if req.ProjectName != "" {
		targetDir = cwd + "/" + req.ProjectName
		if mkErr := os.MkdirAll(targetDir, 0o755); mkErr != nil { //nolint:gosec
			return marshalResponse(kitApplyRecipeResponse{Error: "cannot create project dir: " + mkErr.Error()}) //nolint:exhaustruct
		}
	}

	vars := req.Variables
	if req.ProjectName != "" {
		if vars == nil {
			vars = map[string]string{}
		}

		if _, set := vars["project_name"]; !set {
			vars["project_name"] = req.ProjectName
		}
	}

	chainResult, err := kitfx.ApplyRecipeChain(manifest.Recipes[0].Name, manifest, kitfx.ApplyOptions{
		CWD:          targetDir,
		RegistryURL:  manifest.RegistryURL,
		Force:        req.Force,
		SkipExisting: req.SkipExisting,
		DryRun:       req.DryRun,
		Verbose:      req.Verbose,
		Variables:    vars,
	})
	if err != nil {
		return marshalResponse(kitApplyRecipeResponse{Error: err.Error()}) //nolint:exhaustruct
	}

	cloneResults := make([]kitApplyRecipeResult, 0, len(chainResult.Recipes))
	for _, nr := range chainResult.Recipes {
		cloneResults = append(cloneResults, kitApplyRecipeResult{
			Name:           nr.Name,
			Written:        nr.Result.Written,
			Skipped:        nr.Result.Skipped,
			Total:          nr.Result.Total,
			PostInstallRan: nr.Result.PostInstallRan,
		})
	}

	return marshalResponse(kitApplyRecipeResponse{Recipes: cloneResults}) //nolint:exhaustruct
}

// bridgeKitNewProject scaffolds a new project from a registry template.
func bridgeKitNewProject(requestJSON string) string {
	var req kitNewProjectRequest
	if err := json.Unmarshal([]byte(requestJSON), &req); err != nil {
		return marshalResponse(kitApplyRecipeResponse{Error: "invalid request JSON: " + err.Error()}) //nolint:exhaustruct
	}

	if req.TemplateName == "" {
		return marshalResponse(kitApplyRecipeResponse{Error: "templateName is required"}) //nolint:exhaustruct
	}

	if req.TargetDir == "" {
		return marshalResponse(kitApplyRecipeResponse{Error: "targetDir is required"}) //nolint:exhaustruct
	}

	cwd := req.TargetDir
	manifest, err := kitfx.FetchRegistry(cwd, req.RegistrySource)
	if err != nil {
		return marshalResponse(kitApplyRecipeResponse{Error: err.Error()}) //nolint:exhaustruct
	}

	found := false
	for _, r := range manifest.Recipes {
		if r.Name == req.TemplateName {
			found = true

			break
		}
	}

	if !found {
		available := make([]string, 0, len(manifest.Recipes))
		for _, r := range manifest.Recipes {
			available = append(available, r.Name)
		}

		return marshalResponse(kitApplyRecipeResponse{ //nolint:exhaustruct
			Error: "template '" + req.TemplateName + "' not found; available: " + strings.Join(available, ", "),
		})
	}

	if mkErr := os.MkdirAll(req.TargetDir, 0o755); mkErr != nil { //nolint:gosec
		return marshalResponse(kitApplyRecipeResponse{Error: "cannot create target dir: " + mkErr.Error()}) //nolint:exhaustruct
	}

	vars := req.Variables
	if vars == nil {
		vars = map[string]string{}
	}

	if _, set := vars["project_name"]; !set && req.ProjectName != "" {
		vars["project_name"] = req.ProjectName
	}

	chainResult, err := kitfx.ApplyRecipeChain(req.TemplateName, manifest, kitfx.ApplyOptions{
		CWD:         req.TargetDir,
		RegistryURL: manifest.RegistryURL,
		Force:       true,
		Variables:   vars,
	})
	if err != nil {
		return marshalResponse(kitApplyRecipeResponse{Error: err.Error()}) //nolint:exhaustruct
	}

	npResults := make([]kitApplyRecipeResult, 0, len(chainResult.Recipes))
	for _, nr := range chainResult.Recipes {
		npResults = append(npResults, kitApplyRecipeResult{
			Name:           nr.Name,
			Written:        nr.Result.Written,
			Skipped:        nr.Result.Skipped,
			Total:          nr.Result.Total,
			PostInstallRan: nr.Result.PostInstallRan,
		})
	}

	return marshalResponse(kitApplyRecipeResponse{Recipes: npResults}) //nolint:exhaustruct
}

// bridgeKitUpdateRecipe re-applies a recipe chain to an existing project (force mode).
func bridgeKitUpdateRecipe(requestJSON string) string {
	var req kitUpdateRecipeRequest
	if err := json.Unmarshal([]byte(requestJSON), &req); err != nil {
		return marshalResponse(kitApplyRecipeResponse{Error: "invalid request JSON: " + err.Error()}) //nolint:exhaustruct
	}

	if req.RecipeName == "" {
		return marshalResponse(kitApplyRecipeResponse{Error: "recipeName is required"}) //nolint:exhaustruct
	}

	cwd := req.CWD
	if cwd == "" {
		var err error
		cwd, err = os.Getwd()
		if err != nil {
			return marshalResponse(kitApplyRecipeResponse{Error: "cannot determine cwd: " + err.Error()}) //nolint:exhaustruct
		}
	}

	manifest, err := kitfx.FetchRegistry(cwd, req.RegistrySource)
	if err != nil {
		return marshalResponse(kitApplyRecipeResponse{Error: err.Error()}) //nolint:exhaustruct
	}

	found := false
	for _, r := range manifest.Recipes {
		if r.Name == req.RecipeName {
			found = true

			break
		}
	}

	if !found {
		return marshalResponse(kitApplyRecipeResponse{ //nolint:exhaustruct
			Error: "recipe '" + req.RecipeName + "' not found. Run `eser kit list` to see available recipes.",
		})
	}

	chainResult, err := kitfx.ApplyRecipeChain(req.RecipeName, manifest, kitfx.ApplyOptions{
		CWD:         cwd,
		RegistryURL: manifest.RegistryURL,
		Force:       true,
		DryRun:      req.DryRun,
		Verbose:     req.Verbose,
	})
	if err != nil {
		return marshalResponse(kitApplyRecipeResponse{Error: err.Error()}) //nolint:exhaustruct
	}

	upResults := make([]kitApplyRecipeResult, 0, len(chainResult.Recipes))
	for _, nr := range chainResult.Recipes {
		upResults = append(upResults, kitApplyRecipeResult{
			Name:           nr.Name,
			Written:        nr.Result.Written,
			Skipped:        nr.Result.Skipped,
			Total:          nr.Result.Total,
			PostInstallRan: nr.Result.PostInstallRan,
		})
	}

	return marshalResponse(kitApplyRecipeResponse{Recipes: upResults}) //nolint:exhaustruct
}

// ---------------------------------------------------------------------------
// Posts (social media) bridge
// ---------------------------------------------------------------------------

var (
	postsHandles   = make(map[string]*postsfx.DefaultPostService)
	postsHandleMu  sync.RWMutex
	postsHandleSeq atomic.Int64
)

// postsCreateRequest configures platform adapters for a new PostService.
type postsCreateRequest struct {
	Twitter *postsTwitterConfig `json:"twitter,omitempty"`
	Bluesky *postsBskyConfig    `json:"bluesky,omitempty"`
}

type postsTwitterConfig struct {
	AccessToken string `json:"accessToken"`
}

type postsBskyConfig struct {
	AccessJwt string `json:"accessJwt"`
	DID       string `json:"did"`
}

type postsHandleResponse struct {
	Handle string `json:"handle,omitempty"`
	Error  string `json:"error,omitempty"`
}

type postsComposeRequest struct {
	Handle   string `json:"handle"`
	Platform string `json:"platform,omitempty"`
	Text     string `json:"text"`
}

type postsPostJSON struct {
	ID       string `json:"id"`
	Text     string `json:"text"`
	Platform string `json:"platform"`
	Handle   string `json:"authorHandle,omitempty"`
}

type postsPostResponse struct {
	Post  *postsPostJSON   `json:"post,omitempty"`
	Posts []*postsPostJSON `json:"posts,omitempty"`
	Error string           `json:"error,omitempty"`
}

type postsTimelineRequest struct {
	Handle     string `json:"handle"`
	Platform   string `json:"platform,omitempty"`
	MaxResults int    `json:"maxResults,omitempty"`
}

type postsSearchRequest struct {
	Handle     string `json:"handle"`
	Platform   string `json:"platform,omitempty"`
	Query      string `json:"query"`
	MaxResults int    `json:"maxResults,omitempty"`
}

// bridgePostsCreateService creates a PostService from platform credentials and returns a handle.
func bridgePostsCreateService(requestJSON string) string {
	var req postsCreateRequest
	if err := json.Unmarshal([]byte(requestJSON), &req); err != nil {
		return marshalResponse(postsHandleResponse{Error: "invalid request JSON: " + err.Error()}) //nolint:exhaustruct
	}

	reg := postsfx.NewRegistry()

	if req.Twitter != nil && req.Twitter.AccessToken != "" {
		reg.Register(postsfx.PlatformTwitter, twitter.NewAdapter(req.Twitter.AccessToken))
	}

	if req.Bluesky != nil && req.Bluesky.AccessJwt != "" {
		reg.Register(postsfx.PlatformBluesky, bluesky.NewAdapter(req.Bluesky.AccessJwt, req.Bluesky.DID))
	}

	if len(reg.Platforms()) == 0 {
		return marshalResponse(postsHandleResponse{Error: "no platform credentials provided"}) //nolint:exhaustruct
	}

	svc := postsfx.NewPostService(reg)
	id := fmt.Sprintf("posts-%d", postsHandleSeq.Add(1))

	postsHandleMu.Lock()
	postsHandles[id] = svc
	postsHandleMu.Unlock()

	return marshalResponse(postsHandleResponse{Handle: id}) //nolint:exhaustruct
}

// bridgePostsCompose publishes a post using an existing service handle.
func bridgePostsCompose(requestJSON string) string {
	var req postsComposeRequest
	if err := json.Unmarshal([]byte(requestJSON), &req); err != nil {
		return marshalResponse(postsPostResponse{Error: "invalid request JSON: " + err.Error()}) //nolint:exhaustruct
	}

	svc, err := getPostsHandle(req.Handle)
	if err != nil {
		return marshalResponse(postsPostResponse{Error: err.Error()}) //nolint:exhaustruct
	}

	var platform *postsfx.Platform
	if req.Platform != "" {
		p := postsfx.Platform(req.Platform)
		platform = &p
	}

	post, err := svc.ComposePost(context.Background(), postsfx.ComposeOptions{
		Text:     req.Text,
		Platform: platform,
	})
	if err != nil {
		return marshalResponse(postsPostResponse{Error: err.Error()}) //nolint:exhaustruct
	}

	return marshalResponse(postsPostResponse{Post: postToJSON(post)}) //nolint:exhaustruct
}

// bridgePostsGetTimeline fetches the timeline using an existing service handle.
func bridgePostsGetTimeline(requestJSON string) string {
	var req postsTimelineRequest
	if err := json.Unmarshal([]byte(requestJSON), &req); err != nil {
		return marshalResponse(postsPostResponse{Error: "invalid request JSON: " + err.Error()}) //nolint:exhaustruct
	}

	svc, err := getPostsHandle(req.Handle)
	if err != nil {
		return marshalResponse(postsPostResponse{Error: err.Error()}) //nolint:exhaustruct
	}

	platform := postsfx.Platform(req.Platform)
	posts, err := svc.GetTimeline(context.Background(), postsfx.GetTimelineOptions{
		Platform:   platform,
		MaxResults: req.MaxResults,
	})
	if err != nil {
		return marshalResponse(postsPostResponse{Error: err.Error()}) //nolint:exhaustruct
	}

	jsonPosts := make([]*postsPostJSON, 0, len(posts))
	for _, p := range posts {
		jsonPosts = append(jsonPosts, postToJSON(p))
	}

	return marshalResponse(postsPostResponse{Posts: jsonPosts}) //nolint:exhaustruct
}

// bridgePostsSearch searches posts using an existing service handle.
func bridgePostsSearch(requestJSON string) string {
	var req postsSearchRequest
	if err := json.Unmarshal([]byte(requestJSON), &req); err != nil {
		return marshalResponse(postsPostResponse{Error: "invalid request JSON: " + err.Error()}) //nolint:exhaustruct
	}

	svc, err := getPostsHandle(req.Handle)
	if err != nil {
		return marshalResponse(postsPostResponse{Error: err.Error()}) //nolint:exhaustruct
	}

	posts, err := svc.SearchPosts(context.Background(), postsfx.SearchOptions{
		Query:      req.Query,
		Platform:   postsfx.Platform(req.Platform),
		MaxResults: req.MaxResults,
	})
	if err != nil {
		return marshalResponse(postsPostResponse{Error: err.Error()}) //nolint:exhaustruct
	}

	jsonPosts := make([]*postsPostJSON, 0, len(posts))
	for _, p := range posts {
		jsonPosts = append(jsonPosts, postToJSON(p))
	}

	return marshalResponse(postsPostResponse{Posts: jsonPosts}) //nolint:exhaustruct
}

// bridgePostsClose releases a service handle.
func bridgePostsClose(requestJSON string) string {
	var req struct {
		Handle string `json:"handle"`
	}
	if err := json.Unmarshal([]byte(requestJSON), &req); err != nil {
		return marshalResponse(postsHandleResponse{Error: "invalid request JSON: " + err.Error()}) //nolint:exhaustruct
	}

	postsHandleMu.Lock()
	delete(postsHandles, req.Handle)
	postsHandleMu.Unlock()

	return marshalResponse(postsHandleResponse{Handle: req.Handle}) //nolint:exhaustruct
}

// --- helpers ---

func getPostsHandle(id string) (*postsfx.DefaultPostService, error) {
	postsHandleMu.RLock()
	svc, ok := postsHandles[id]
	postsHandleMu.RUnlock()

	if !ok {
		return nil, fmt.Errorf("posts handle %q not found", id)
	}

	return svc, nil
}

func postToJSON(p *postsfx.Post) *postsPostJSON {
	if p == nil {
		return nil
	}

	return &postsPostJSON{
		ID:       string(p.ID),
		Text:     p.Text,
		Platform: string(p.Platform),
		Handle:   string(p.AuthorHandle),
	}
}

// ---------------------------------------------------------------------------
// Codebase bridge
// ---------------------------------------------------------------------------

type codebaseGitRequest struct {
	Dir   string `json:"dir"`
	Start string `json:"start"`
	End   string `json:"end"`
	Since string `json:"since"`
}

type codebaseGitResponse struct {
	Branch  string               `json:"branch,omitempty"`
	Tag     string               `json:"tag,omitempty"`
	Commits []codebaseCommitJSON `json:"commits,omitempty"`
	Error   string               `json:"error,omitempty"`
}

type codebaseCommitJSON struct {
	Hash    string `json:"hash"`
	Subject string `json:"subject"`
	Body    string `json:"body,omitempty"`
}

type codebaseCommitMsgRequest struct {
	Message             string   `json:"message"`
	AllowAsterisk       bool     `json:"allowAsterisk"`
	AllowMultipleScopes bool     `json:"allowMultipleScopes"`
	ForceScope          bool     `json:"forceScope"`
	Types               []string `json:"types,omitempty"`
}

type codebaseCommitMsgResponse struct {
	Valid  bool     `json:"valid"`
	Issues []string `json:"issues,omitempty"`
	Error  string   `json:"error,omitempty"`
}

type codebaseChangelogRequest struct {
	Dir    string `json:"dir"`
	DryRun bool   `json:"dryRun"`
}

type codebaseChangelogResponse struct {
	Version     string `json:"version,omitempty"`
	CommitCount int    `json:"commitCount,omitempty"`
	EntryCount  int    `json:"entryCount,omitempty"`
	Content     string `json:"content,omitempty"`
	DryRun      bool   `json:"dryRun"`
	Error       string `json:"error,omitempty"`
}

type codebaseBumpRequest struct {
	Current  string `json:"current"`
	Command  string `json:"command"`
	Explicit string `json:"explicit,omitempty"`
}

type codebaseBumpResponse struct {
	Version string `json:"version,omitempty"`
	Error   string `json:"error,omitempty"`
}

type codebaseWalkRequest struct {
	Dir        string   `json:"dir"`
	Extensions []string `json:"extensions,omitempty"`
	Exclude    []string `json:"exclude,omitempty"`
	GitAware   bool     `json:"gitAware"`
}

type codebaseFileJSON struct {
	Path      string `json:"path"`
	Name      string `json:"name"`
	Size      int64  `json:"size"`
	IsSymlink bool   `json:"isSymlink,omitempty"`
}

type codebaseWalkResponse struct {
	Files []codebaseFileJSON `json:"files,omitempty"`
	Error string             `json:"error,omitempty"`
}

type codebaseValidateRequest struct {
	Dir              string                 `json:"dir"`
	Validators       []string               `json:"validators,omitempty"`
	Extensions       []string               `json:"extensions,omitempty"`
	ValidatorOptions map[string]interface{} `json:"validatorOptions,omitempty"`
	GitAware         bool                   `json:"gitAware"`
}

type codebaseValidatorResultJSON struct {
	Name         string                     `json:"name"`
	Passed       bool                       `json:"passed"`
	Issues       []codebaseValidatorIssueJSON `json:"issues,omitempty"`
	FilesChecked int                        `json:"filesChecked"`
}

type codebaseValidatorIssueJSON struct {
	Severity string `json:"severity"`
	File     string `json:"file"`
	Line     int    `json:"line,omitempty"`
	Message  string `json:"message"`
}

type codebaseValidateResponse struct {
	Results []codebaseValidatorResultJSON `json:"results,omitempty"`
	Error   string                        `json:"error,omitempty"`
}

// bridgeCodebaseGitCurrentBranch returns the current git branch.
func bridgeCodebaseGitCurrentBranch(requestJSON string) string {
	var req codebaseGitRequest
	if err := json.Unmarshal([]byte(requestJSON), &req); err != nil {
		return marshalResponse(codebaseGitResponse{Error: "invalid request JSON: " + err.Error()}) //nolint:exhaustruct
	}

	dir := req.Dir
	if dir == "" {
		dir = "."
	}

	branch, err := codebasefx.GetCurrentBranch(context.Background(), dir)
	if err != nil {
		return marshalResponse(codebaseGitResponse{Error: err.Error()}) //nolint:exhaustruct
	}

	return marshalResponse(codebaseGitResponse{Branch: branch}) //nolint:exhaustruct
}

// bridgeCodebaseGitLatestTag returns the most recent git tag.
func bridgeCodebaseGitLatestTag(requestJSON string) string {
	var req codebaseGitRequest
	if err := json.Unmarshal([]byte(requestJSON), &req); err != nil {
		return marshalResponse(codebaseGitResponse{Error: "invalid request JSON: " + err.Error()}) //nolint:exhaustruct
	}

	dir := req.Dir
	if dir == "" {
		dir = "."
	}

	tag, err := codebasefx.GetLatestTag(context.Background(), dir)
	if err != nil {
		return marshalResponse(codebaseGitResponse{Error: err.Error()}) //nolint:exhaustruct
	}

	return marshalResponse(codebaseGitResponse{Tag: tag}) //nolint:exhaustruct
}

// bridgeCodebaseGitLog returns commits between two refs or since a date.
func bridgeCodebaseGitLog(requestJSON string) string {
	var req codebaseGitRequest
	if err := json.Unmarshal([]byte(requestJSON), &req); err != nil {
		return marshalResponse(codebaseGitResponse{Error: "invalid request JSON: " + err.Error()}) //nolint:exhaustruct
	}

	dir := req.Dir
	if dir == "" {
		dir = "."
	}

	var commits []codebasefx.Commit
	var err error

	switch {
	case req.Start != "" && req.End != "":
		commits, err = codebasefx.GetCommitsBetween(context.Background(), dir, req.Start, req.End)
	case req.Since != "":
		commits, err = codebasefx.GetCommitsSinceDate(context.Background(), dir, req.Since)
	default:
		commits, err = codebasefx.GetCommitsSinceDate(context.Background(), dir, "1970-01-01")
	}

	if err != nil {
		return marshalResponse(codebaseGitResponse{Error: err.Error()}) //nolint:exhaustruct
	}

	jsonCommits := make([]codebaseCommitJSON, 0, len(commits))
	for _, c := range commits {
		jsonCommits = append(jsonCommits, codebaseCommitJSON{
			Hash:    c.Hash,
			Subject: c.Subject,
			Body:    c.Body,
		})
	}

	return marshalResponse(codebaseGitResponse{Commits: jsonCommits}) //nolint:exhaustruct
}

// bridgeCodebaseValidateCommitMsg validates a commit message.
func bridgeCodebaseValidateCommitMsg(requestJSON string) string {
	var req codebaseCommitMsgRequest
	if err := json.Unmarshal([]byte(requestJSON), &req); err != nil {
		return marshalResponse(codebaseCommitMsgResponse{Error: "invalid request JSON: " + err.Error()}) //nolint:exhaustruct
	}

	result := codebasefx.ValidateCommitMsg(req.Message, codebasefx.CommitMsgOptions{
		AllowAsterisk:       req.AllowAsterisk,
		AllowMultipleScopes: req.AllowMultipleScopes,
		ForceScope:          req.ForceScope,
		Types:               req.Types,
	})

	return marshalResponse(codebaseCommitMsgResponse{Valid: result.Valid, Issues: result.Issues}) //nolint:exhaustruct
}

// bridgeCodebaseGenerateChangelog generates a changelog section from git history.
func bridgeCodebaseGenerateChangelog(requestJSON string) string {
	var req codebaseChangelogRequest
	if err := json.Unmarshal([]byte(requestJSON), &req); err != nil {
		return marshalResponse(codebaseChangelogResponse{Error: "invalid request JSON: " + err.Error()}) //nolint:exhaustruct
	}

	result, err := codebasefx.GenerateChangelog(context.Background(), codebasefx.GenerateChangelogOptions{
		Root:   req.Dir,
		DryRun: req.DryRun,
	})
	if err != nil {
		return marshalResponse(codebaseChangelogResponse{Error: err.Error()}) //nolint:exhaustruct
	}

	return marshalResponse(codebaseChangelogResponse{
		Version:     result.Version,
		CommitCount: result.CommitCount,
		EntryCount:  result.EntryCount,
		Content:     result.Content,
		DryRun:      result.DryRun,
	})
}

// bridgeCodebaseBumpVersion bumps a semver version string.
func bridgeCodebaseBumpVersion(requestJSON string) string {
	var req codebaseBumpRequest
	if err := json.Unmarshal([]byte(requestJSON), &req); err != nil {
		return marshalResponse(codebaseBumpResponse{Error: "invalid request JSON: " + err.Error()}) //nolint:exhaustruct
	}

	version, err := codebasefx.BumpVersion(req.Current, codebasefx.VersionCommand(req.Command), req.Explicit)
	if err != nil {
		return marshalResponse(codebaseBumpResponse{Error: err.Error()}) //nolint:exhaustruct
	}

	return marshalResponse(codebaseBumpResponse{Version: version}) //nolint:exhaustruct
}

// bridgeCodebaseWalkFiles walks source files under a directory.
func bridgeCodebaseWalkFiles(requestJSON string) string {
	var req codebaseWalkRequest
	if err := json.Unmarshal([]byte(requestJSON), &req); err != nil {
		return marshalResponse(codebaseWalkResponse{Error: "invalid request JSON: " + err.Error()}) //nolint:exhaustruct
	}

	entries, err := codebasefx.WalkSourceFiles(context.Background(), codebasefx.WalkOptions{
		Root:       req.Dir,
		Extensions: req.Extensions,
		Exclude:    req.Exclude,
		GitAware:   req.GitAware,
	})
	if err != nil {
		return marshalResponse(codebaseWalkResponse{Error: err.Error()}) //nolint:exhaustruct
	}

	files := make([]codebaseFileJSON, 0, len(entries))
	for _, e := range entries {
		files = append(files, codebaseFileJSON{
			Path:      e.Path,
			Name:      e.Name,
			Size:      e.Size,
			IsSymlink: e.IsSymlink,
		})
	}

	return marshalResponse(codebaseWalkResponse{Files: files}) //nolint:exhaustruct
}

// bridgeCodebaseValidateFiles runs built-in or named validators over a directory.
func bridgeCodebaseValidateFiles(requestJSON string) string {
	var req codebaseValidateRequest
	if err := json.Unmarshal([]byte(requestJSON), &req); err != nil {
		return marshalResponse(codebaseValidateResponse{Error: "invalid request JSON: " + err.Error()}) //nolint:exhaustruct
	}

	files, err := codebasefx.WalkSourceFiles(context.Background(), codebasefx.WalkOptions{
		Root:       req.Dir,
		Extensions: req.Extensions,
		GitAware:   req.GitAware,
	})
	if err != nil {
		return marshalResponse(codebaseValidateResponse{Error: err.Error()}) //nolint:exhaustruct
	}

	// Resolve requested validators (nil = all builtins).
	validators := resolveValidators(req.Validators, req.ValidatorOptions)
	rawResults := codebasefx.RunValidators(files, validators)
	names := validatorNames(req.Validators)

	jsonResults := make([]codebaseValidatorResultJSON, len(rawResults))

	for i, r := range rawResults {
		name := ""
		if i < len(names) {
			name = names[i]
		}

		issues := make([]codebaseValidatorIssueJSON, 0, len(r.Issues))
		for _, iss := range r.Issues {
			issues = append(issues, codebaseValidatorIssueJSON{
				Severity: iss.Severity,
				File:     iss.File,
				Line:     iss.Line,
				Message:  iss.Message,
			})
		}

		jsonResults[i] = codebaseValidatorResultJSON{
			Name:         name,
			Passed:       r.Passed,
			Issues:       issues,
			FilesChecked: r.FilesChecked,
		}
	}

	return marshalResponse(codebaseValidateResponse{Results: jsonResults}) //nolint:exhaustruct
}

// resolveFilenameValidator extracts FilenameRule slice and excludes from opts.
func resolveFilenameValidator(opts map[string]interface{}) codebasefx.ValidatorFunc {
	var rules []codebasefx.FilenameRule
	var excludes []string

	if fnOpts, ok := opts["filenames"].(map[string]interface{}); ok {
		if rawRules, ok := fnOpts["rules"].([]interface{}); ok {
			for _, r := range rawRules {
				rm, ok := r.(map[string]interface{})
				if !ok {
					continue
				}
				rule := codebasefx.FilenameRule{} //nolint:exhaustruct
				if d, ok := rm["directory"].(string); ok {
					rule.Directory = d
				}
				if c, ok := rm["convention"].(string); ok {
					rule.Convention = c
				}
				if rawExcl, ok := rm["exclude"].([]interface{}); ok {
					for _, e := range rawExcl {
						if s, ok := e.(string); ok {
							rule.Exclude = append(rule.Exclude, s)
						}
					}
				}
				rules = append(rules, rule)
			}
		}
		if rawExcl, ok := fnOpts["exclude"].([]interface{}); ok {
			for _, e := range rawExcl {
				if s, ok := e.(string); ok {
					excludes = append(excludes, s)
				}
			}
		}
	}

	return codebasefx.ValidateFilenames(rules, excludes)
}

// resolveValidators maps names to ValidatorFuncs. Empty/nil = all builtins.
func resolveValidators(names []string, opts map[string]interface{}) []codebasefx.ValidatorFunc {
	all := map[string]codebasefx.ValidatorFunc{
		"eof":              codebasefx.ValidateEOF,
		"bom":              codebasefx.ValidateBOM,
		"trailing":         codebasefx.ValidateTrailingWhitespace,
		"line-endings":     codebasefx.ValidateLineEndings,
		"merge-conflicts":  codebasefx.ValidateMergeConflicts,
		"secrets":          codebasefx.ValidateSecrets,
		"large-file":       codebasefx.ValidateLargeFile(1024 * 1024),
		"json":             codebasefx.ValidateJSON,
		"yaml":             codebasefx.ValidateYAML,
		"toml":             codebasefx.ValidateTOML,
		"license":          codebasefx.ValidateLicenseHeader,
		"case-conflict":    codebasefx.ValidateCaseConflict(),
		"symlinks":         codebasefx.ValidateSymlinks(),
		"submodules":       codebasefx.ValidateSubmodules(),
		"shebangs":         codebasefx.ValidateShebangs,
		"runtime-js-apis":  codebasefx.ValidateRuntimeJSAPIs,
		"filenames":        resolveFilenameValidator(opts),
	}

	if len(names) == 0 {
		return codebasefx.BuiltinValidators()
	}

	var out []codebasefx.ValidatorFunc

	for _, name := range names {
		if vf, ok := all[name]; ok {
			out = append(out, vf)
		}
	}

	return out
}

// validatorNames returns names for the resolved set, falling back to builtin names.
func validatorNames(requested []string) []string {
	if len(requested) > 0 {
		return requested
	}

	return []string{"eof", "bom", "trailing", "line-endings", "merge-conflicts", "secrets"}
}

// ---------------------------------------------------------------------------
// Workspace check bridge
// ---------------------------------------------------------------------------

type workspaceCheckRequest struct {
	Dir             string   `json:"dir"`
	IgnoreWords     []string `json:"ignoreWords,omitempty"`
	RequireExamples bool     `json:"requireExamples"`
}

// bridgeCodebaseCheckCircularDeps detects inter-package circular dependencies.
func bridgeCodebaseCheckCircularDeps(requestJSON string) string {
	var req workspaceCheckRequest
	if err := json.Unmarshal([]byte(requestJSON), &req); err != nil {
		return marshalError("invalid request JSON: " + err.Error())
	}

	root := req.Dir
	if root == "" {
		root = "."
	}

	result, err := codebasefx.CheckCircularDeps(root)
	if err != nil {
		return marshalError(err.Error())
	}

	return marshalResponse(result)
}

// bridgeCodebaseCheckExportNames validates deno.json export path naming.
func bridgeCodebaseCheckExportNames(requestJSON string) string {
	var req workspaceCheckRequest
	if err := json.Unmarshal([]byte(requestJSON), &req); err != nil {
		return marshalError("invalid request JSON: " + err.Error())
	}

	root := req.Dir
	if root == "" {
		root = "."
	}

	result, err := codebasefx.CheckExportNames(root, req.IgnoreWords)
	if err != nil {
		return marshalError(err.Error())
	}

	return marshalResponse(result)
}

// bridgeCodebaseCheckModExports validates mod.ts export completeness.
func bridgeCodebaseCheckModExports(requestJSON string) string {
	var req workspaceCheckRequest
	if err := json.Unmarshal([]byte(requestJSON), &req); err != nil {
		return marshalError("invalid request JSON: " + err.Error())
	}

	root := req.Dir
	if root == "" {
		root = "."
	}

	result, err := codebasefx.CheckModExports(root)
	if err != nil {
		return marshalError(err.Error())
	}

	return marshalResponse(result)
}

// bridgeCodebaseCheckPackageConfigs validates deno.json / package.json consistency.
func bridgeCodebaseCheckPackageConfigs(requestJSON string) string {
	var req workspaceCheckRequest
	if err := json.Unmarshal([]byte(requestJSON), &req); err != nil {
		return marshalError("invalid request JSON: " + err.Error())
	}

	root := req.Dir
	if root == "" {
		root = "."
	}

	result, err := codebasefx.CheckPackageConfigs(root)
	if err != nil {
		return marshalError(err.Error())
	}

	return marshalResponse(result)
}

// bridgeCodebaseCheckDocs validates JSDoc documentation on exported symbols.
func bridgeCodebaseCheckDocs(requestJSON string) string {
	var req workspaceCheckRequest
	if err := json.Unmarshal([]byte(requestJSON), &req); err != nil {
		return marshalError("invalid request JSON: " + err.Error())
	}

	root := req.Dir
	if root == "" {
		root = "."
	}

	result, err := codebasefx.CheckDocs(root, req.RequireExamples)
	if err != nil {
		return marshalError(err.Error())
	}

	return marshalResponse(result)
}

// ---------------------------------------------------------------------------
// Codebase streaming bridges
// ---------------------------------------------------------------------------

type codebaseWalkStreamState struct {
	ch     chan string
	cancel context.CancelFunc
	wg     sync.WaitGroup
}

type codebaseValidateStreamState struct {
	ch     chan string
	cancel context.CancelFunc
	wg     sync.WaitGroup
}

var (
	codebaseWalkStreamMu      sync.RWMutex
	codebaseWalkStreamHandles = make(map[string]*codebaseWalkStreamState)

	codebaseValidateStreamMu      sync.RWMutex
	codebaseValidateStreamHandles = make(map[string]*codebaseValidateStreamState)
)

// bridgeCodebaseWalkFilesStreamCreate starts a streaming file walk and returns a handle.
func bridgeCodebaseWalkFilesStreamCreate(requestJSON string) string {
	var req codebaseWalkRequest
	if err := json.Unmarshal([]byte(requestJSON), &req); err != nil {
		return marshalError("invalid request JSON: " + err.Error())
	}

	ctx, cancel := context.WithCancel(context.Background())

	state := &codebaseWalkStreamState{
		ch:     make(chan string, 64),
		cancel: cancel,
	}
	state.wg.Add(1)

	go func() {
		defer state.wg.Done()
		defer close(state.ch)

		entries, err := codebasefx.WalkSourceFiles(ctx, codebasefx.WalkOptions{
			Root:       req.Dir,
			Extensions: req.Extensions,
			Exclude:    req.Exclude,
			GitAware:   req.GitAware,
		})
		if err != nil {
			select {
			case state.ch <- marshalError(err.Error()):
			case <-ctx.Done():
			}

			return
		}

		for _, e := range entries {
			item := marshalResponse(codebaseFileJSON{
				Path:      e.Path,
				Name:      e.Name,
				Size:      e.Size,
				IsSymlink: e.IsSymlink,
			})

			select {
			case state.ch <- item:
			case <-ctx.Done():
				return
			}
		}
	}()

	handle := newHandle("cbwalk")

	codebaseWalkStreamMu.Lock()
	codebaseWalkStreamHandles[handle] = state
	codebaseWalkStreamMu.Unlock()

	return marshalResponse(aiHandleResponse{Handle: handle}) //nolint:exhaustruct
}

// bridgeCodebaseWalkFilesStreamRead reads the next file entry from a walk stream.
// Returns "null" when the stream is complete or the handle is gone.
func bridgeCodebaseWalkFilesStreamRead(handle string) string {
	codebaseWalkStreamMu.RLock()
	state, ok := codebaseWalkStreamHandles[handle]

	if ok {
		state.wg.Add(1)
	}
	codebaseWalkStreamMu.RUnlock()

	if !ok {
		return "null"
	}
	defer state.wg.Done()

	item, open := <-state.ch
	if !open {
		codebaseWalkStreamMu.Lock()
		delete(codebaseWalkStreamHandles, handle)
		codebaseWalkStreamMu.Unlock()

		return "null"
	}

	return item
}

// bridgeCodebaseWalkFilesStreamClose cancels and removes a walk stream handle.
func bridgeCodebaseWalkFilesStreamClose(handle string) string {
	codebaseWalkStreamMu.Lock()
	state, ok := codebaseWalkStreamHandles[handle]

	if ok {
		delete(codebaseWalkStreamHandles, handle)
	}
	codebaseWalkStreamMu.Unlock()

	if !ok {
		return "{}"
	}

	state.cancel()
	state.wg.Wait()

	return "{}"
}

// bridgeCodebaseValidateFilesStreamCreate starts a streaming validator run and returns a handle.
func bridgeCodebaseValidateFilesStreamCreate(requestJSON string) string {
	var req codebaseValidateRequest
	if err := json.Unmarshal([]byte(requestJSON), &req); err != nil {
		return marshalError("invalid request JSON: " + err.Error())
	}

	ctx, cancel := context.WithCancel(context.Background())

	state := &codebaseValidateStreamState{
		ch:     make(chan string, 16),
		cancel: cancel,
	}
	state.wg.Add(1)

	go func() {
		defer state.wg.Done()
		defer close(state.ch)

		files, err := codebasefx.WalkSourceFiles(ctx, codebasefx.WalkOptions{
			Root:       req.Dir,
			Extensions: req.Extensions,
			GitAware:   req.GitAware,
		})
		if err != nil {
			select {
			case state.ch <- marshalError(err.Error()):
			case <-ctx.Done():
			}

			return
		}

		validators := resolveValidators(req.Validators, req.ValidatorOptions)
		rawResults := codebasefx.RunValidators(files, validators)
		names := validatorNames(req.Validators)

		for i, r := range rawResults {
			name := ""
			if i < len(names) {
				name = names[i]
			}

			issues := make([]codebaseValidatorIssueJSON, 0, len(r.Issues))
			for _, iss := range r.Issues {
				issues = append(issues, codebaseValidatorIssueJSON{
					Severity: iss.Severity,
					File:     iss.File,
					Line:     iss.Line,
					Message:  iss.Message,
				})
			}

			item := marshalResponse(codebaseValidatorResultJSON{
				Name:         name,
				Passed:       r.Passed,
				Issues:       issues,
				FilesChecked: r.FilesChecked,
			})

			select {
			case state.ch <- item:
			case <-ctx.Done():
				return
			}
		}
	}()

	handle := newHandle("cbval")

	codebaseValidateStreamMu.Lock()
	codebaseValidateStreamHandles[handle] = state
	codebaseValidateStreamMu.Unlock()

	return marshalResponse(aiHandleResponse{Handle: handle}) //nolint:exhaustruct
}

// bridgeCodebaseValidateFilesStreamRead reads the next validator result from a validate stream.
// Returns "null" when the stream is complete or the handle is gone.
func bridgeCodebaseValidateFilesStreamRead(handle string) string {
	codebaseValidateStreamMu.RLock()
	state, ok := codebaseValidateStreamHandles[handle]

	if ok {
		state.wg.Add(1)
	}
	codebaseValidateStreamMu.RUnlock()

	if !ok {
		return "null"
	}
	defer state.wg.Done()

	item, open := <-state.ch
	if !open {
		codebaseValidateStreamMu.Lock()
		delete(codebaseValidateStreamHandles, handle)
		codebaseValidateStreamMu.Unlock()

		return "null"
	}

	return item
}

// bridgeCodebaseValidateFilesStreamClose cancels and removes a validate stream handle.
func bridgeCodebaseValidateFilesStreamClose(handle string) string {
	codebaseValidateStreamMu.Lock()
	state, ok := codebaseValidateStreamHandles[handle]

	if ok {
		delete(codebaseValidateStreamHandles, handle)
	}
	codebaseValidateStreamMu.Unlock()

	if !ok {
		return "{}"
	}

	state.cancel()
	state.wg.Wait()

	return "{}"
}

// ---------------------------------------------------------------------------
// Collector bridge
// ---------------------------------------------------------------------------

type collectorSpecifierRequest struct {
	Specifier string   `json:"specifier"`
	Used      []string `json:"used,omitempty"`
}

type collectorSpecifierResponse struct {
	Identifier string `json:"identifier,omitempty"`
	Error      string `json:"error,omitempty"`
}

type collectorWalkRequest struct {
	Dir               string `json:"dir"`
	IgnoreFilePattern string `json:"ignoreFilePattern,omitempty"`
}

type collectorFileJSON struct {
	RelPath string `json:"relPath"`
	AbsPath string `json:"absPath"`
}

type collectorWalkResponse struct {
	Files []collectorFileJSON `json:"files,omitempty"`
	Error string              `json:"error,omitempty"`
}

type collectorManifestRequest struct {
	Entries []collectorManifestEntryJSON `json:"entries"`
}

type collectorManifestEntryJSON struct {
	RelPath string   `json:"relPath"`
	Exports []string `json:"exports,omitempty"`
}

type collectorManifestResponse struct {
	Source string `json:"source,omitempty"`
	Error  string `json:"error,omitempty"`
}

// bridgeCollectorSpecifierToIdentifier converts a file-path specifier to a valid JS identifier.
func bridgeCollectorSpecifierToIdentifier(requestJSON string) string {
	var req collectorSpecifierRequest
	if err := json.Unmarshal([]byte(requestJSON), &req); err != nil {
		return marshalResponse(collectorSpecifierResponse{Error: "invalid request JSON: " + err.Error()}) //nolint:exhaustruct
	}

	// Rebuild the used set from the provided slice.
	used := make(map[string]struct{}, len(req.Used))
	for _, u := range req.Used {
		used[u] = struct{}{}
	}

	ident := collectorfx.SpecifierToIdentifier(req.Specifier, used)

	return marshalResponse(collectorSpecifierResponse{Identifier: ident}) //nolint:exhaustruct
}

// bridgeCollectorWalkFiles walks a directory for collectible JS/TS files.
func bridgeCollectorWalkFiles(requestJSON string) string {
	var req collectorWalkRequest
	if err := json.Unmarshal([]byte(requestJSON), &req); err != nil {
		return marshalResponse(collectorWalkResponse{Error: "invalid request JSON: " + err.Error()}) //nolint:exhaustruct
	}

	files, err := collectorfx.WalkCollectableFiles(context.Background(), collectorfx.WalkOptions{
		BaseDir:           req.Dir,
		IgnoreFilePattern: req.IgnoreFilePattern,
	})
	if err != nil {
		return marshalResponse(collectorWalkResponse{Error: err.Error()}) //nolint:exhaustruct
	}

	jsonFiles := make([]collectorFileJSON, 0, len(files))
	for _, f := range files {
		jsonFiles = append(jsonFiles, collectorFileJSON{
			RelPath: f.RelPath,
			AbsPath: f.AbsPath,
		})
	}

	return marshalResponse(collectorWalkResponse{Files: jsonFiles}) //nolint:exhaustruct
}

// bridgeCollectorGenerateManifest generates TypeScript manifest source from entries.
func bridgeCollectorGenerateManifest(requestJSON string) string {
	var req collectorManifestRequest
	if err := json.Unmarshal([]byte(requestJSON), &req); err != nil {
		return marshalResponse(collectorManifestResponse{Error: "invalid request JSON: " + err.Error()}) //nolint:exhaustruct
	}

	entries := make([]collectorfx.ManifestEntry, 0, len(req.Entries))
	for _, e := range req.Entries {
		entries = append(entries, collectorfx.ManifestEntry{
			RelPath: e.RelPath,
			Exports: e.Exports,
		})
	}

	src := collectorfx.GenerateManifestSource(entries)

	return marshalResponse(collectorManifestResponse{Source: src}) //nolint:exhaustruct
}

// ---------------------------------------------------------------------------
// Parsing bridge
// ---------------------------------------------------------------------------

type parsingDefinitionJSON struct {
	Name    string `json:"name"`
	Pattern string `json:"pattern"`
}

type parsingTokenJSON struct {
	Kind   string `json:"kind"`
	Value  string `json:"value"`
	Offset int    `json:"offset"`
	Length int    `json:"length"`
}

type parsingTokenizeRequest struct {
	Input       string                  `json:"input"`
	Definitions []parsingDefinitionJSON `json:"definitions,omitempty"`
}

type parsingTokenizeResponse struct {
	Tokens []parsingTokenJSON `json:"tokens,omitempty"`
	Error  string             `json:"error,omitempty"`
}

type parsingSimpleTokensResponse struct {
	Definitions []parsingDefinitionJSON `json:"definitions,omitempty"`
}

// bridgeParsingTokenize tokenizes an input string using provided or built-in definitions.
func bridgeParsingTokenize(requestJSON string) string {
	var req parsingTokenizeRequest
	if err := json.Unmarshal([]byte(requestJSON), &req); err != nil {
		return marshalResponse(parsingTokenizeResponse{Error: "invalid request JSON: " + err.Error()}) //nolint:exhaustruct
	}

	var defs []parsingfx.TokenDefinition

	if len(req.Definitions) > 0 {
		defs = make([]parsingfx.TokenDefinition, len(req.Definitions))
		for i, d := range req.Definitions {
			defs[i] = parsingfx.TokenDefinition{Name: d.Name, Pattern: d.Pattern}
		}
	} else {
		defs = parsingfx.SimpleTokens()
	}

	tokens, err := parsingfx.Tokenize(req.Input, defs)
	if err != nil {
		return marshalResponse(parsingTokenizeResponse{Error: err.Error()}) //nolint:exhaustruct
	}

	jsonTokens := make([]parsingTokenJSON, len(tokens))
	for i, t := range tokens {
		jsonTokens[i] = parsingTokenJSON{Kind: t.Kind, Value: t.Value, Offset: t.Offset, Length: t.Length}
	}

	return marshalResponse(parsingTokenizeResponse{Tokens: jsonTokens}) //nolint:exhaustruct
}

// bridgeParsingSimpleTokens returns the built-in SimpleTokens definitions.
func bridgeParsingSimpleTokens() string {
	simple := parsingfx.SimpleTokens()
	defs := make([]parsingDefinitionJSON, len(simple))

	for i, d := range simple {
		defs[i] = parsingDefinitionJSON{Name: d.Name, Pattern: d.Pattern}
	}

	return marshalResponse(parsingSimpleTokensResponse{Definitions: defs})
}

// ---------------------------------------------------------------------------
// Parsing streaming tokenizer bridge (handle-based)
// ---------------------------------------------------------------------------

type parsingTokenizerCreateRequest struct {
	Definitions []parsingDefinitionJSON `json:"definitions,omitempty"`
}

type parsingTokenizerHandleResponse struct {
	Handle string `json:"handle,omitempty"`
	Error  string `json:"error,omitempty"`
}

type parsingTokenizerPushRequest struct {
	Handle string `json:"handle"`
	Chunk  string `json:"chunk"`
}

// bridgeParsingTokenizerCreate creates a streaming tokenizer handle.
func bridgeParsingTokenizerCreate(requestJSON string) string {
	var req parsingTokenizerCreateRequest
	if err := json.Unmarshal([]byte(requestJSON), &req); err != nil {
		return marshalResponse(parsingTokenizerHandleResponse{Error: "invalid request JSON: " + err.Error()}) //nolint:exhaustruct
	}

	var defs []parsingfx.TokenDefinition

	for _, d := range req.Definitions {
		defs = append(defs, parsingfx.TokenDefinition{Name: d.Name, Pattern: d.Pattern})
	}

	if len(defs) == 0 {
		defs = parsingfx.SimpleTokens()
	}

	tok, err := parsingfx.NewTokenizer(defs)
	if err != nil {
		return marshalResponse(parsingTokenizerHandleResponse{Error: err.Error()}) //nolint:exhaustruct
	}

	handle := newHandle("tokenizer")

	handleMu.Lock()
	tokenizerHandles[handle] = tok
	handleMu.Unlock()

	return marshalResponse(parsingTokenizerHandleResponse{Handle: handle}) //nolint:exhaustruct
}

// bridgeParsingTokenizerPush pushes a chunk into the tokenizer and returns
// any tokens that could be matched so far.
func bridgeParsingTokenizerPush(requestJSON string) string {
	var req parsingTokenizerPushRequest
	if err := json.Unmarshal([]byte(requestJSON), &req); err != nil {
		return marshalResponse(parsingTokenizeResponse{Error: "invalid request JSON: " + err.Error()}) //nolint:exhaustruct
	}

	handleMu.RLock()
	tok, ok := tokenizerHandles[req.Handle]
	handleMu.RUnlock()

	if !ok {
		return marshalResponse(parsingTokenizeResponse{Error: "unknown tokenizer handle: " + req.Handle}) //nolint:exhaustruct
	}

	tokens, err := tok.Push(req.Chunk)
	if err != nil {
		return marshalResponse(parsingTokenizeResponse{Error: err.Error()}) //nolint:exhaustruct
	}

	jsonTokens := make([]parsingTokenJSON, len(tokens))
	for i, t := range tokens {
		jsonTokens[i] = parsingTokenJSON{Kind: t.Kind, Value: t.Value, Offset: t.Offset, Length: t.Length}
	}

	return marshalResponse(parsingTokenizeResponse{Tokens: jsonTokens}) //nolint:exhaustruct
}

// bridgeParsingTokenizerClose flushes remaining buffer and releases the handle.
func bridgeParsingTokenizerClose(requestJSON string) string {
	var req struct {
		Handle string `json:"handle"`
	}

	if err := json.Unmarshal([]byte(requestJSON), &req); err != nil {
		return marshalResponse(parsingTokenizeResponse{Error: "invalid request JSON: " + err.Error()}) //nolint:exhaustruct
	}

	handleMu.Lock()
	tok, ok := tokenizerHandles[req.Handle]

	if ok {
		delete(tokenizerHandles, req.Handle)
	}

	handleMu.Unlock()

	if !ok {
		return marshalResponse(parsingTokenizeResponse{Error: "unknown tokenizer handle: " + req.Handle}) //nolint:exhaustruct
	}

	tokens, err := tok.Flush()
	if err != nil {
		return marshalResponse(parsingTokenizeResponse{Error: err.Error()}) //nolint:exhaustruct
	}

	jsonTokens := make([]parsingTokenJSON, len(tokens))
	for i, t := range tokens {
		jsonTokens[i] = parsingTokenJSON{Kind: t.Kind, Value: t.Value, Offset: t.Offset, Length: t.Length}
	}

	return marshalResponse(parsingTokenizeResponse{Tokens: jsonTokens}) //nolint:exhaustruct
}

// ---------------------------------------------------------------------------
// Shell exec bridge
// ---------------------------------------------------------------------------

type shellExecRequest struct {
	Command string        `json:"command"`
	Args    []string      `json:"args,omitempty"`
	Cwd     string        `json:"cwd,omitempty"`
	Env     []string      `json:"env,omitempty"`
	Stdin   string        `json:"stdin,omitempty"`
	Timeout string        `json:"timeout,omitempty"` // Go duration string e.g. "30s"
}

type shellExecResponse struct {
	Stdout string `json:"stdout,omitempty"`
	Stderr string `json:"stderr,omitempty"`
	Code   int    `json:"code"`
	Error  string `json:"error,omitempty"`
}

// bridgeShellExec executes a shell command and returns stdout/stderr/exit-code.
func bridgeShellExec(requestJSON string) string {
	var req shellExecRequest
	if err := json.Unmarshal([]byte(requestJSON), &req); err != nil {
		return marshalResponse(shellExecResponse{Error: "invalid request JSON: " + err.Error()}) //nolint:exhaustruct
	}

	opts := processfx.ExecOptions{
		Args: req.Args,
		Cwd:  req.Cwd,
		Env:  req.Env,
	}

	if req.Stdin != "" {
		opts.Stdin = []byte(req.Stdin)
	}

	if req.Timeout != "" {
		d, err := time.ParseDuration(req.Timeout)
		if err != nil {
			return marshalResponse(shellExecResponse{Error: "invalid timeout: " + err.Error()}) //nolint:exhaustruct
		}

		opts.Timeout = d
	}

	result, err := processfx.Exec(context.Background(), req.Command, opts)
	if err != nil {
		return marshalResponse(shellExecResponse{Error: err.Error()}) //nolint:exhaustruct
	}

	return marshalResponse(shellExecResponse{
		Stdout: result.Stdout,
		Stderr: result.Stderr,
		Code:   result.Code,
	})
}

// ---------------------------------------------------------------------------
// Shell TUI bridge — keypress event source, raw mode, terminal size
// ---------------------------------------------------------------------------

type tuiKeypressCreateResponse struct {
	Handle string `json:"handle,omitempty"`
	Error  string `json:"error,omitempty"`
}

type tuiKeypressEventResponse struct {
	Name  string `json:"name"`
	Char  string `json:"char,omitempty"`
	Ctrl  bool   `json:"ctrl"`
	Meta  bool   `json:"meta"`
	Shift bool   `json:"shift"`
	Raw   string `json:"raw,omitempty"`
	Cols  int    `json:"cols,omitempty"`
	Rows  int    `json:"rows,omitempty"`
	Error string `json:"error,omitempty"`
}

type tuiSetStdinRawRequest struct {
	Enable bool `json:"enable"`
}

type tuiGetSizeResponse struct {
	Cols  int    `json:"cols"`
	Rows  int    `json:"rows"`
	Error string `json:"error,omitempty"`
}

// bridgeShellTuiKeypressCreate creates a keypress reader from os.Stdin
// and returns a handle for use with Read/Close.
func bridgeShellTuiKeypressCreate(_ string) string {
	handle := newHandle("tuikeypress")
	reader := shelltui.NewKeypressReader(context.Background(), os.Stdin)

	handleMu.Lock()
	tuiKeypressHandles[handle] = reader
	handleMu.Unlock()

	return marshalResponse(tuiKeypressCreateResponse{Handle: handle})
}

// bridgeShellTuiKeypressRead blocks until the next keypress event.
// Returns "null" when the reader is closed (§20 stream done sentinel).
func bridgeShellTuiKeypressRead(handle string) string {
	handleMu.RLock()
	reader, ok := tuiKeypressHandles[handle]
	handleMu.RUnlock()

	if !ok {
		return marshalError("handle not found: " + handle)
	}

	ev, alive := reader.Read()
	if !alive {
		return "null"
	}

	return marshalResponse(tuiKeypressEventResponse{
		Name:  ev.Name,
		Char:  ev.Char,
		Ctrl:  ev.Ctrl,
		Meta:  ev.Meta,
		Shift: ev.Shift,
		Raw:   ev.Raw,
		Cols:  ev.Cols,
		Rows:  ev.Rows,
	})
}

// bridgeShellTuiKeypressClose cancels and removes a keypress handle.
func bridgeShellTuiKeypressClose(handle string) string {
	handleMu.Lock()
	reader, ok := tuiKeypressHandles[handle]

	if ok {
		delete(tuiKeypressHandles, handle)
	}

	handleMu.Unlock()

	if !ok {
		return marshalError("handle not found: " + handle)
	}

	reader.Close()

	return "{}"
}

// bridgeShellTuiSetStdinRaw enables or disables raw mode on os.Stdin.
func bridgeShellTuiSetStdinRaw(requestJSON string) string {
	var req tuiSetStdinRawRequest
	if err := json.Unmarshal([]byte(requestJSON), &req); err != nil {
		return marshalError("invalid request: " + err.Error())
	}

	if err := shelltui.SetStdinRaw(req.Enable); err != nil {
		return marshalError(err.Error())
	}

	return "{}"
}

// bridgeShellTuiGetSize returns the current terminal dimensions.
func bridgeShellTuiGetSize(_ string) string {
	size, err := shelltui.GetTerminalSize()
	if err != nil {
		return marshalError(err.Error())
	}

	return marshalResponse(tuiGetSizeResponse{Cols: size.Cols, Rows: size.Rows})
}

// ---------------------------------------------------------------------------
// Shell exec spawn bridge — bidirectional child process (§20 streaming)
// ---------------------------------------------------------------------------

type shellExecSpawnRequest struct {
	Command string   `json:"command"`
	Args    []string `json:"args,omitempty"`
	Cwd     string   `json:"cwd,omitempty"`
	Env     []string `json:"env,omitempty"`
}

type shellExecSpawnResponse struct {
	Handle string `json:"handle,omitempty"`
	Pid    int    `json:"pid,omitempty"`
	Error  string `json:"error,omitempty"`
}

type shellExecReadResponse struct {
	Stream string `json:"stream,omitempty"`
	Chunk  string `json:"chunk,omitempty"` // base64
	Error  string `json:"error,omitempty"`
}

type shellExecWriteRequest struct {
	Handle string `json:"handle"`
	Data   string `json:"data"` // base64
}

type shellExecCloseResponse struct {
	Code  int    `json:"code"`
	Error string `json:"error,omitempty"`
}

// bridgeShellExecSpawn starts a child process and returns a handle + pid.
func bridgeShellExecSpawn(requestJSON string) string {
	var req shellExecSpawnRequest
	if err := json.Unmarshal([]byte(requestJSON), &req); err != nil {
		return marshalResponse(shellExecSpawnResponse{Error: "invalid request JSON: " + err.Error()}) //nolint:exhaustruct
	}

	h, err := shellfxexec.SpawnChildProcess(shellfxexec.SpawnOptions{
		Command: req.Command,
		Args:    req.Args,
		Cwd:     req.Cwd,
		Env:     req.Env,
	})
	if err != nil {
		return marshalResponse(shellExecSpawnResponse{Error: err.Error()}) //nolint:exhaustruct
	}

	handle := newHandle("exec")

	handleMu.Lock()
	execHandles[handle] = h
	handleMu.Unlock()

	return marshalResponse(shellExecSpawnResponse{Handle: handle, Pid: h.Pid()})
}

// bridgeShellExecRead returns the next output chunk. Returns "null" when done (§20).
func bridgeShellExecRead(handle string) string {
	handleMu.RLock()
	h := execHandles[handle]
	handleMu.RUnlock()

	if h == nil {
		return marshalResponse(shellExecReadResponse{Error: "unknown handle: " + handle}) //nolint:exhaustruct
	}

	chunk, ok := h.Read()
	if !ok {
		return "null"
	}

	return marshalResponse(shellExecReadResponse{
		Stream: chunk.Stream,
		Chunk:  shellfxexec.EncodeChunk(chunk.Data),
	})
}

// bridgeShellExecWrite sends base64-encoded data to the child process stdin.
func bridgeShellExecWrite(requestJSON string) string {
	var req shellExecWriteRequest
	if err := json.Unmarshal([]byte(requestJSON), &req); err != nil {
		return marshalError("invalid request JSON: " + err.Error())
	}

	handleMu.RLock()
	h := execHandles[req.Handle]
	handleMu.RUnlock()

	if h == nil {
		return marshalError("unknown handle: " + req.Handle)
	}

	data, err := shellfxexec.DecodeChunk(req.Data)
	if err != nil {
		return marshalError("invalid base64 data: " + err.Error())
	}

	if err := h.Write(data); err != nil {
		return marshalError("write failed: " + err.Error())
	}

	return "{}"
}

// bridgeShellExecClose terminates the process and removes the handle.
func bridgeShellExecClose(handle string) string {
	handleMu.Lock()
	h := execHandles[handle]
	delete(execHandles, handle)
	handleMu.Unlock()

	if h == nil {
		return marshalResponse(shellExecCloseResponse{Error: "unknown handle: " + handle}) //nolint:exhaustruct
	}

	code := h.Close()

	return marshalResponse(shellExecCloseResponse{Code: code})
}
