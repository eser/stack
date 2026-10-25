package aifx

import (
	"bytes"
	"context"
	"crypto"
	"crypto/rand"
	"crypto/rsa"
	"crypto/sha256"
	"crypto/x509"
	"encoding/base64"
	"encoding/json"
	"encoding/pem"
	"errors"
	"fmt"
	"io"
	"mime"
	"mime/multipart"
	"net/http"
	"net/http/httptest"
	"net/url"
	"os"
	"path/filepath"
	"reflect"
	"slices"
	"sort"
	"strings"
	"sync"
	"testing"
	"time"
)

// The provider fixtures pin each HTTP provider's wire behaviour: the exact
// requests it sends for a set of option combinations and the results, events
// and errors it maps the replies to.
//
// They were recorded from the vendor SDK implementation (anthropic-sdk-go,
// openai-go and google.golang.org/genai) before aifx moved to net/http
// (TASK-279): every scenario ran against an httptest server that served the
// authored response, and the requests the SDK sent and the outcome the adapter
// produced were written to testdata/fixtures/<provider>/<scenario>.json.
//
// A normal run replays them: the server serves the recorded responses, and the
// test fails when a request or the outcome differs from the recording. Set
// AIFX_RECORD_FIXTURES=1 to record them again; a recording made from the
// current code pins the current code, so re-record only on purpose.

const (
	fixtureRecordEnv   = "AIFX_RECORD_FIXTURES"
	fixtureServerToken = "{{server}}"
	fixtureDir         = "testdata/fixtures"
)

// fixtureFile is one recorded scenario.
type fixtureFile struct {
	Provider string `json:"provider"`
	Scenario string `json:"scenario"`
	// Notes records a deliberate change to what the SDK recording held.
	Notes     []string          `json:"notes,omitempty"`
	Exchanges []fixtureExchange `json:"exchanges"`
	Outcome   json.RawMessage   `json:"outcome"`
}

// fixtureExchange is one HTTP request the provider sent and the reply served.
type fixtureExchange struct {
	Request  fixtureRequest  `json:"request"`
	Response fixtureResponse `json:"response"`
}

type fixtureRequest struct {
	Query   url.Values        `json:"query,omitempty"`
	Headers map[string]string `json:"headers"`
	Form    url.Values        `json:"form,omitempty"`
	Method  string            `json:"method"`
	Path    string            `json:"path"`
	Body    json.RawMessage   `json:"body,omitempty"`
	// Assertion is a token request's JWT assertion, decoded: its header and
	// its claims without the time-dependent iat and exp, plus their distance.
	Assertion map[string]any `json:"assertion,omitempty"`
	Multipart []fixturePart  `json:"multipart,omitempty"`
}

type fixturePart struct {
	Name     string `json:"name"`
	FileName string `json:"fileName,omitempty"`
	Content  string `json:"content"`
}

type fixtureResponse struct {
	Headers map[string]string `json:"headers,omitempty"`
	Body    string            `json:"body"`
	Status  int               `json:"status"`
	// DelayMs holds the reply back, or until the client gives up.
	DelayMs int `json:"delayMs,omitempty"`
}

// fixtureCall names the model method a scenario drives.
type fixtureCall string

const (
	callGenerate      fixtureCall = "generate"
	callGenerateTwice fixtureCall = "generate_twice"
	callStream        fixtureCall = "stream"
	callBatchSubmit   fixtureCall = "batch_submit"
	callBatchGet      fixtureCall = "batch_get"
	callBatchList     fixtureCall = "batch_list"
	callBatchResults  fixtureCall = "batch_results"
	callBatchCancel   fixtureCall = "batch_cancel"
)

// fixtureScenario is one provider call under test. responses are what the
// server sends when recording; a replay serves the recorded ones instead.
type fixtureScenario struct {
	env       map[string]string
	config    func(serverURL string) *ConfigTarget
	options   *GenerateTextOptions
	batch     *BatchRequest
	setup     func(t *testing.T, env *fixtureEnv)
	provider  string
	name      string
	call      fixtureCall
	responses []fixtureResponse
}

// fixtureEnv is the per-run state a scenario's setup can extend.
type fixtureEnv struct {
	serverURL string
	tempDir   string
	publicKey *rsa.PublicKey
}

// fixtureEnvVars are cleared before every scenario, so the machine running the
// tests cannot change what a provider sends.
var fixtureEnvVars = []string{ //nolint:gochecknoglobals
	"ANTHROPIC_API_KEY", "ANTHROPIC_AUTH_TOKEN", "ANTHROPIC_BASE_URL", "ANTHROPIC_PROFILE",
	"ANTHROPIC_CONFIG_DIR",
	"OPENAI_API_KEY", "OPENAI_BASE_URL", "OPENAI_ORG_ID", "OPENAI_PROJECT_ID", "OPENAI_WEBHOOK_SECRET",
	"GOOGLE_API_KEY", "GEMINI_API_KEY", "GOOGLE_GEMINI_BASE_URL", "GOOGLE_VERTEX_BASE_URL",
	"GOOGLE_GENAI_USE_VERTEXAI", "GOOGLE_GENAI_USE_ENTERPRISE", "GOOGLE_CLOUD_PROJECT",
	"GOOGLE_CLOUD_LOCATION", "GOOGLE_CLOUD_REGION", "GOOGLE_APPLICATION_CREDENTIALS",
	"GOOGLE_CLOUD_QUOTA_PROJECT", "GCE_METADATA_HOST", "CLOUDSDK_CONFIG",
	"GOOGLE_API_USE_CLIENT_CERTIFICATE", "GOOGLE_API_PREVENT_AGENT_TOKEN_SHARING_FOR_GCP_SERVICES",
}

func TestProviderFixtures(t *testing.T) { //nolint:paralleltest // scenarios set environment variables
	record := os.Getenv(fixtureRecordEnv) == "1"

	for _, scenario := range fixtureScenarios() {
		t.Run(scenario.provider+"/"+scenario.name, func(t *testing.T) {
			runFixtureScenario(t, &scenario, record)
		})
	}
}

func runFixtureScenario(t *testing.T, scenario *fixtureScenario, record bool) {
	t.Helper()

	path := filepath.Join(fixtureDir, scenario.provider, scenario.name+".json")

	var recorded *fixtureFile

	responses := scenario.responses

	if !record {
		recorded = readFixtureFile(t, path)
		responses = make([]fixtureResponse, 0, len(recorded.Exchanges))

		for _, exchange := range recorded.Exchanges {
			responses = append(responses, exchange.Response)
		}
	}

	server := newFixtureServer(t, responses, record)
	defer server.close()

	env := &fixtureEnv{serverURL: server.url(), tempDir: t.TempDir(), publicKey: nil}
	server.env = env

	for _, name := range fixtureEnvVars {
		t.Setenv(name, "")
		_ = os.Unsetenv(name)
	}

	// The gcloud well-known credentials file lives under HOME.
	t.Setenv("HOME", env.tempDir)

	for name, value := range scenario.env {
		t.Setenv(name, strings.ReplaceAll(value, fixtureServerToken, env.serverURL))
	}

	if scenario.setup != nil {
		scenario.setup(t, env)
	}

	outcome := runFixtureCall(t, scenario, env)

	exchanges := server.exchanges()

	outcomeJSON, err := json.MarshalIndent(outcome, "", "  ")
	if err != nil {
		t.Fatalf("marshal outcome: %v", err)
	}

	outcomeJSON = []byte(strings.ReplaceAll(string(outcomeJSON), env.serverURL, fixtureServerToken))

	if record {
		writeFixtureFile(t, path, &fixtureFile{
			Provider:  scenario.provider,
			Scenario:  scenario.name,
			Exchanges: exchanges,
			Outcome:   outcomeJSON,
		})

		return
	}

	compareFixtureExchanges(t, recorded.Exchanges, exchanges)
	compareJSONValues(t, "outcome", recorded.Outcome, outcomeJSON)
}

func runFixtureCall(t *testing.T, scenario *fixtureScenario, env *fixtureEnv) any {
	t.Helper()

	ctx, cancel := context.WithTimeout(t.Context(), 30*time.Second)
	defer cancel()

	config := scenario.config(env.serverURL)

	model, err := NewRegistry(WithDefaultFactories()).AddModel(ctx, "fixture", config)
	if err != nil {
		return map[string]any{"createError": normalizeFixtureError(err)}
	}

	defer func() { _ = model.Close(ctx) }()

	switch scenario.call {
	case callGenerate:
		return generateOutcome(ctx, model, scenario.options)
	case callGenerateTwice:
		return []any{generateOutcome(ctx, model, scenario.options), generateOutcome(ctx, model, scenario.options)}
	case callStream:
		return streamOutcome(ctx, model, scenario.options)
	case callBatchSubmit, callBatchGet, callBatchList, callBatchResults, callBatchCancel:
		batchModel, ok := model.(BatchCapableModel)
		if !ok {
			t.Fatalf("%s does not implement BatchCapableModel", scenario.provider)
		}

		return batchOutcome(ctx, batchModel, scenario)
	}

	t.Fatalf("unknown call %q", scenario.call)

	return nil
}

func generateOutcome(ctx context.Context, model LanguageModel, opts *GenerateTextOptions) any {
	result, err := model.GenerateText(ctx, opts)
	if err != nil {
		return map[string]any{"error": normalizeFixtureError(err)}
	}

	return map[string]any{"result": normalizeFixtureResult(result)}
}

func streamOutcome(ctx context.Context, model LanguageModel, opts *GenerateTextOptions) any {
	iter, err := model.StreamText(ctx, opts)
	if err != nil {
		return map[string]any{"error": normalizeFixtureError(err)}
	}

	defer func() { _ = iter.Close() }()

	events := make([]any, 0, 8) //nolint:mnd

	for iter.Next() {
		events = append(events, normalizeFixtureEvent(iter.Current()))
	}

	outcome := map[string]any{"events": events}

	if err := iter.Err(); err != nil {
		outcome["error"] = normalizeFixtureError(err)
	}

	return outcome
}

func batchOutcome(ctx context.Context, model BatchCapableModel, scenario *fixtureScenario) any {
	switch scenario.call { //nolint:exhaustive
	case callBatchSubmit:
		job, err := model.SubmitBatch(ctx, scenario.batch)
		if err != nil {
			return map[string]any{"error": normalizeFixtureError(err)}
		}

		return map[string]any{"job": normalizeFixtureBatchJob(job)}
	case callBatchGet:
		job, err := model.GetBatchJob(ctx, "batch_123")
		if err != nil {
			return map[string]any{"error": normalizeFixtureError(err)}
		}

		return map[string]any{"job": normalizeFixtureBatchJob(job)}
	case callBatchList:
		jobs, err := model.ListBatchJobs(ctx, &ListBatchOptions{Limit: 2, After: "batch_000"})
		if err != nil {
			return map[string]any{"error": normalizeFixtureError(err)}
		}

		normalized := make([]any, 0, len(jobs))
		for _, job := range jobs {
			normalized = append(normalized, normalizeFixtureBatchJob(job))
		}

		return map[string]any{"jobs": normalized}
	case callBatchResults:
		results, err := model.DownloadBatchResults(ctx, &BatchJob{ //nolint:exhaustruct
			ID:      "batch_123",
			Storage: &BatchStorage{Type: "", InputRef: "file-in", OutputRef: "file-out", Properties: nil},
		})
		if err != nil {
			return map[string]any{"error": normalizeFixtureError(err)}
		}

		normalized := make([]any, 0, len(results))

		for _, result := range results {
			entry := map[string]any{"customID": result.CustomID, "error": result.Error}
			if result.Result != nil {
				entry["result"] = normalizeFixtureResult(result.Result)
			}

			normalized = append(normalized, entry)
		}

		return map[string]any{"results": normalized}
	case callBatchCancel:
		err := model.CancelBatchJob(ctx, "batch_123")
		if err != nil {
			return map[string]any{"error": normalizeFixtureError(err)}
		}

		return map[string]any{"cancelled": true}
	}

	return nil
}

// fixtureSentinels are the errors an outcome reports membership of. The
// message itself is recorded but not compared: it is prose, and the SDKs and
// net/http word their transport errors differently.
var fixtureSentinels = []struct { //nolint:gochecknoglobals
	err  error
	name string
}{
	{ErrAnthropicGenerationFailed, "ErrAnthropicGenerationFailed"},
	{ErrAnthropicStreamFailed, "ErrAnthropicStreamFailed"},
	{ErrAnthropicBatchFailed, "ErrAnthropicBatchFailed"},
	{ErrOpenAIGenerationFailed, "ErrOpenAIGenerationFailed"},
	{ErrOpenAIStreamFailed, "ErrOpenAIStreamFailed"},
	{ErrOpenAIBatchFailed, "ErrOpenAIBatchFailed"},
	{ErrGeminiGenerationFailed, "ErrGeminiGenerationFailed"},
	{ErrGeminiStreamFailed, "ErrGeminiStreamFailed"},
	{ErrGeminiClientCreate, "ErrGeminiClientCreate"},
	{ErrVertexAIGenerationFailed, "ErrVertexAIGenerationFailed"},
	{ErrVertexAIStreamFailed, "ErrVertexAIStreamFailed"},
	{ErrVertexAIClientCreate, "ErrVertexAIClientCreate"},
	{ErrRateLimited, "ErrRateLimited"},
	{ErrAuthFailed, "ErrAuthFailed"},
	{ErrInsufficientCredits, "ErrInsufficientCredits"},
	{ErrBadRequest, "ErrBadRequest"},
	{ErrServiceUnavailable, "ErrServiceUnavailable"},
	{ErrInvalidAPIKey, "ErrInvalidAPIKey"},
	{ErrInvalidModel, "ErrInvalidModel"},
	{context.Canceled, "context.Canceled"},
	{context.DeadlineExceeded, "context.DeadlineExceeded"},
}

func normalizeFixtureError(err error) map[string]any {
	matched := make([]string, 0, 4) //nolint:mnd

	for _, sentinel := range fixtureSentinels {
		if errors.Is(err, sentinel.err) {
			matched = append(matched, sentinel.name)
		}
	}

	return map[string]any{
		"kind":      ErrorKind(err),
		"status":    ErrorStatus(err),
		"sentinels": matched,
		"message":   err.Error(),
	}
}

func normalizeFixtureResult(result *GenerateTextResult) map[string]any {
	return map[string]any{
		"content":    normalizeFixtureContent(result.Content),
		"stopReason": result.StopReason,
		"usage":      result.Usage,
		"modelID":    result.ModelID,
	}
}

func normalizeFixtureContent(blocks []ContentBlock) []any {
	out := make([]any, 0, len(blocks))

	for _, block := range blocks {
		entry := map[string]any{"type": block.Type}

		if block.Text != "" {
			entry["text"] = block.Text
		}

		if block.ToolCall != nil {
			entry["toolCall"] = normalizeFixtureToolCall(block.ToolCall)
		}

		if block.Thinking != nil {
			entry["thinking"] = *block.Thinking
		}

		if block.Image != nil {
			entry["image"] = map[string]any{
				"url":      block.Image.URL,
				"mimeType": block.Image.MIMEType,
				"data":     base64.StdEncoding.EncodeToString(block.Image.Data),
			}
		}

		out = append(out, entry)
	}

	return out
}

func normalizeFixtureToolCall(call *ToolCall) map[string]any {
	// Arguments are compared byte for byte: a caller replays them verbatim.
	return map[string]any{"id": call.ID, "name": call.Name, "arguments": string(call.Arguments)}
}

func normalizeFixtureEvent(event StreamEvent) map[string]any { //nolint:gocritic // hugeParam: test helper
	entry := map[string]any{"type": event.Type}

	if event.TextDelta != "" {
		entry["text"] = event.TextDelta
	}

	if event.ToolCall != nil {
		entry["toolCall"] = normalizeFixtureToolCall(event.ToolCall)
	}

	if event.Thinking != nil {
		entry["thinking"] = *event.Thinking
	}

	if event.StopReason != "" {
		entry["stopReason"] = event.StopReason
	}

	if event.Usage != nil {
		entry["usage"] = *event.Usage
	}

	return entry
}

func normalizeFixtureBatchJob(job *BatchJob) map[string]any {
	entry := map[string]any{
		"id":          job.ID,
		"status":      job.Status,
		"createdAt":   job.CreatedAt.UTC().Format(time.RFC3339),
		"totalCount":  job.TotalCount,
		"doneCount":   job.DoneCount,
		"failedCount": job.FailedCount,
		"error":       job.Error,
		"storage":     job.Storage,
	}

	if job.CompletedAt != nil {
		entry["completedAt"] = job.CompletedAt.UTC().Format(time.RFC3339)
	}

	return entry
}

// ---------------------------------------------------------------------------
// The fixture server
// ---------------------------------------------------------------------------

type fixtureServer struct {
	t         *testing.T
	env       *fixtureEnv
	server    *httptest.Server
	responses []fixtureResponse
	recorded  []fixtureExchange
	mu        sync.Mutex
	record    bool
}

func newFixtureServer(t *testing.T, responses []fixtureResponse, record bool) *fixtureServer {
	t.Helper()

	fs := &fixtureServer{t: t, env: nil, server: nil, responses: responses, recorded: nil, mu: sync.Mutex{}, record: record}
	fs.server = httptest.NewServer(http.HandlerFunc(fs.handle))

	return fs
}

func (fs *fixtureServer) url() string { return fs.server.URL }

func (fs *fixtureServer) close() { fs.server.Close() }

func (fs *fixtureServer) exchanges() []fixtureExchange {
	fs.mu.Lock()
	defer fs.mu.Unlock()

	return slices.Clone(fs.recorded)
}

func (fs *fixtureServer) handle(w http.ResponseWriter, r *http.Request) {
	request := captureFixtureRequest(fs.t, r, fs.server.URL)

	fs.mu.Lock()
	env := fs.env
	fs.mu.Unlock()

	if assertion := request.Form.Get("assertion"); assertion != "" {
		request.Assertion = decodeFixtureAssertion(fs.t, assertion, fs.server.URL)
		request.Form.Del("assertion")

		if env != nil && env.publicKey != nil {
			verifyFixtureJWT(fs.t, r.URL.Path, assertion, env.publicKey)
		}
	}

	fs.mu.Lock()
	index := len(fs.recorded)

	if index >= len(fs.responses) {
		fs.mu.Unlock()

		if !fs.record {
			fs.t.Errorf("request %d (%s %s) has no recorded exchange", index+1, r.Method, r.URL.Path)
		}

		http.Error(w, "no fixture response", http.StatusTeapot)

		return
	}

	response := fs.responses[index]
	fs.recorded = append(fs.recorded, fixtureExchange{Request: request, Response: response})
	fs.mu.Unlock()

	if response.DelayMs > 0 {
		select {
		case <-time.After(time.Duration(response.DelayMs) * time.Millisecond):
		case <-r.Context().Done():
			return
		}
	}

	for name, value := range response.Headers {
		w.Header().Set(name, value)
	}

	w.WriteHeader(response.Status)
	_, _ = io.WriteString(w, strings.ReplaceAll(response.Body, fixtureServerToken, fs.server.URL))
}

func captureFixtureRequest(t *testing.T, r *http.Request, serverURL string) fixtureRequest {
	t.Helper()

	raw, err := io.ReadAll(r.Body)
	if err != nil {
		t.Errorf("read request body: %v", err)
	}

	raw = []byte(strings.ReplaceAll(string(raw), serverURL, fixtureServerToken))

	request := fixtureRequest{
		Query:     nil,
		Headers:   map[string]string{},
		Form:      nil,
		Method:    r.Method,
		Path:      r.URL.Path,
		Body:      nil,
		Assertion: nil,
		Multipart: nil,
	}

	if query := r.URL.Query(); len(query) > 0 {
		request.Query = query
	}

	for name, values := range r.Header {
		request.Headers[strings.ToLower(name)] = strings.Join(values, ", ")
	}

	mediaType, params, _ := mime.ParseMediaType(r.Header.Get("Content-Type"))

	switch {
	case len(raw) == 0:
	case mediaType == "application/x-www-form-urlencoded":
		form, parseErr := url.ParseQuery(string(raw))
		if parseErr != nil {
			t.Errorf("parse form body: %v", parseErr)
		}

		request.Form = form
	case mediaType == "multipart/form-data":
		request.Multipart = readFixtureMultipart(t, raw, params["boundary"])
	default:
		var compacted bytes.Buffer

		if compactErr := json.Compact(&compacted, raw); compactErr != nil {
			t.Errorf("request body is not JSON (%v): %s", compactErr, raw)
		}

		request.Body = compacted.Bytes()
	}

	return request
}

func readFixtureMultipart(t *testing.T, raw []byte, boundary string) []fixturePart {
	t.Helper()

	reader := multipart.NewReader(bytes.NewReader(raw), boundary)

	var parts []fixturePart

	for {
		part, err := reader.NextPart()
		if errors.Is(err, io.EOF) {
			return parts
		}

		if err != nil {
			t.Errorf("read multipart body: %v", err)

			return parts
		}

		content, _ := io.ReadAll(part)
		parts = append(parts, fixturePart{Name: part.FormName(), FileName: part.FileName(), Content: string(content)})
	}
}

// ---------------------------------------------------------------------------
// Comparison
// ---------------------------------------------------------------------------

// fixtureComparedHeaders are the headers that carry meaning. The rest (user
// agent, SDK telemetry, retry counters) are recorded for reference only.
var fixtureComparedHeaders = []string{ //nolint:gochecknoglobals
	"accept", "anthropic-version", "anthropic-beta", "x-api-key", "authorization",
	"x-goog-api-key", "x-goog-user-project", "openai-organization", "openai-project",
	"metadata-flavor", "anthropic-workspace-id",
}

func compareFixtureExchanges(t *testing.T, want, got []fixtureExchange) {
	t.Helper()

	if len(want) != len(got) {
		t.Errorf("sent %d requests, the recording has %d", len(got), len(want))
	}

	for idx := range min(len(want), len(got)) {
		label := fmt.Sprintf("request %d", idx+1)
		wantReq, gotReq := want[idx].Request, got[idx].Request

		if wantReq.Method != gotReq.Method || wantReq.Path != gotReq.Path {
			t.Errorf("%s: %s %s, recorded %s %s", label, gotReq.Method, gotReq.Path, wantReq.Method, wantReq.Path)
		}

		if !reflect.DeepEqual(wantReq.Query, gotReq.Query) {
			t.Errorf("%s: query %v, recorded %v", label, gotReq.Query, wantReq.Query)
		}

		compareFixtureHeaders(t, label, wantReq.Headers, gotReq.Headers)
		compareFixtureForm(t, label, wantReq.Form, gotReq.Form)

		if !reflect.DeepEqual(wantReq.Assertion, gotReq.Assertion) {
			t.Errorf("%s: assertion %v, recorded %v", label, gotReq.Assertion, wantReq.Assertion)
		}
		compareFixtureMultipart(t, label, wantReq.Multipart, gotReq.Multipart)

		if len(wantReq.Body) > 0 || len(gotReq.Body) > 0 {
			compareJSONValues(t, label+" body", wantReq.Body, gotReq.Body)
		}
	}
}

func compareFixtureHeaders(t *testing.T, label string, want, got map[string]string) {
	t.Helper()

	for _, name := range fixtureComparedHeaders {
		if want[name] != got[name] {
			t.Errorf("%s: header %s = %q, recorded %q", label, name, got[name], want[name])
		}
	}

	wantType, _, _ := mime.ParseMediaType(want["content-type"])
	gotType, _, _ := mime.ParseMediaType(got["content-type"])

	if wantType != gotType {
		t.Errorf("%s: content type %q, recorded %q", label, gotType, wantType)
	}
}

// compareFixtureForm compares a form body, such as a token request.
func compareFixtureForm(t *testing.T, label string, want, got url.Values) {
	t.Helper()

	if len(want) == 0 && len(got) == 0 {
		return
	}

	if !reflect.DeepEqual(want, got) {
		t.Errorf("%s: form %v, recorded %v", label, got, want)
	}
}

// decodeFixtureAssertion decodes a JWT assertion into its header and its
// claims without iat and exp, which change with every run, and their distance.
func decodeFixtureAssertion(t *testing.T, token, serverURL string) map[string]any {
	t.Helper()

	header, claims := decodeFixtureJWT(t, token)

	iat, _ := claims["iat"].(float64)
	exp, _ := claims["exp"].(float64)

	delete(claims, "iat")
	delete(claims, "exp")

	for key, value := range claims {
		if text, ok := value.(string); ok {
			claims[key] = strings.ReplaceAll(text, serverURL, fixtureServerToken)
		}
	}

	return map[string]any{"header": header, "claims": claims, "lifetimeSeconds": exp - iat}
}

func decodeFixtureJWT(t *testing.T, token string) (map[string]any, map[string]any) {
	t.Helper()

	segments := strings.Split(token, ".")
	if len(segments) != 3 { //nolint:mnd
		t.Errorf("assertion %q is not a JWT", token)

		return nil, nil
	}

	decode := func(segment string) map[string]any {
		raw, err := base64.RawURLEncoding.DecodeString(segment)
		if err != nil {
			t.Errorf("decode JWT segment: %v", err)
		}

		var value map[string]any
		if err := json.Unmarshal(raw, &value); err != nil {
			t.Errorf("JWT segment is not JSON: %v", err)
		}

		return value
	}

	return decode(segments[0]), decode(segments[1])
}

func verifyFixtureJWT(t *testing.T, label, token string, key *rsa.PublicKey) {
	t.Helper()

	lastDot := strings.LastIndex(token, ".")
	signingInput := token[:lastDot]

	rawSignature, err := base64.RawURLEncoding.DecodeString(token[lastDot+1:])
	if err != nil {
		t.Errorf("%s: decode assertion signature: %v", label, err)

		return
	}

	digest := sha256.Sum256([]byte(signingInput))

	if err := rsa.VerifyPKCS1v15(key, crypto.SHA256, digest[:], rawSignature); err != nil {
		t.Errorf("%s: assertion signature does not verify: %v", label, err)
	}
}

func compareFixtureMultipart(t *testing.T, label string, want, got []fixturePart) {
	t.Helper()

	if len(want) != len(got) {
		t.Errorf("%s: %d multipart parts, recorded %d", label, len(got), len(want))

		return
	}

	sortParts := func(parts []fixturePart) []fixturePart {
		sorted := slices.Clone(parts)
		sort.Slice(sorted, func(i, j int) bool { return sorted[i].Name < sorted[j].Name })

		return sorted
	}

	want, got = sortParts(want), sortParts(got)

	for idx := range want {
		if want[idx].Name != got[idx].Name || want[idx].FileName != got[idx].FileName {
			t.Errorf("%s: part %q file %q, recorded %q file %q",
				label, got[idx].Name, got[idx].FileName, want[idx].Name, want[idx].FileName)
		}

		wantLines := strings.Split(strings.TrimSpace(want[idx].Content), "\n")
		gotLines := strings.Split(strings.TrimSpace(got[idx].Content), "\n")

		if len(wantLines) != len(gotLines) {
			t.Errorf("%s: part %q has %d lines, recorded %d", label, got[idx].Name, len(gotLines), len(wantLines))

			continue
		}

		for line := range wantLines {
			if json.Valid([]byte(wantLines[line])) {
				compareJSONValues(t, fmt.Sprintf("%s part %q line %d", label, got[idx].Name, line+1),
					[]byte(wantLines[line]), []byte(gotLines[line]))
			} else if wantLines[line] != gotLines[line] {
				t.Errorf("%s: part %q line %d = %q, recorded %q",
					label, got[idx].Name, line+1, gotLines[line], wantLines[line])
			}
		}
	}
}

// compareJSONValues compares two JSON documents by value. A message field of
// an error outcome is prose and is not compared.
func compareJSONValues(t *testing.T, label string, want, got []byte) {
	t.Helper()

	var wantValue, gotValue any

	if err := json.Unmarshal(want, &wantValue); err != nil {
		t.Errorf("%s: recorded value is not JSON: %v", label, err)

		return
	}

	if err := json.Unmarshal(got, &gotValue); err != nil {
		t.Errorf("%s: value is not JSON: %v", label, err)

		return
	}

	dropErrorMessages(wantValue)
	dropErrorMessages(gotValue)

	if !reflect.DeepEqual(wantValue, gotValue) {
		wantPretty, _ := json.MarshalIndent(wantValue, "", "  ")
		gotPretty, _ := json.MarshalIndent(gotValue, "", "  ")

		t.Errorf("%s differs from the recording\n--- recorded\n%s\n--- got\n%s", label, wantPretty, gotPretty)
	}
}

func dropErrorMessages(value any) {
	switch typed := value.(type) {
	case map[string]any:
		if _, isError := typed["sentinels"]; isError {
			delete(typed, "message")
		}

		for _, nested := range typed {
			dropErrorMessages(nested)
		}
	case []any:
		for _, nested := range typed {
			dropErrorMessages(nested)
		}
	}
}

// ---------------------------------------------------------------------------
// Fixture files
// ---------------------------------------------------------------------------

func readFixtureFile(t *testing.T, path string) *fixtureFile {
	t.Helper()

	raw, err := os.ReadFile(path) //nolint:gosec // G304: a fixture path built from the scenario table
	if err != nil {
		t.Fatalf("read fixture %s (record it with %s=1): %v", path, fixtureRecordEnv, err)
	}

	var file fixtureFile
	if err := json.Unmarshal(raw, &file); err != nil {
		t.Fatalf("decode fixture %s: %v", path, err)
	}

	return &file
}

func writeFixtureFile(t *testing.T, path string, file *fixtureFile) {
	t.Helper()

	if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil { //nolint:mnd
		t.Fatalf("create fixture directory: %v", err)
	}

	raw, err := json.MarshalIndent(file, "", "  ")
	if err != nil {
		t.Fatalf("encode fixture: %v", err)
	}

	if err := os.WriteFile(path, append(raw, '\n'), 0o644); err != nil { //nolint:mnd,gosec
		t.Fatalf("write fixture %s: %v", path, err)
	}
}

// ---------------------------------------------------------------------------
// Service account key for the Vertex AI scenarios
// ---------------------------------------------------------------------------

// writeServiceAccountFile writes a service account key whose token_uri is the
// fixture server, and returns its path.
func writeServiceAccountFile(t *testing.T, env *fixtureEnv) string {
	t.Helper()

	key, err := rsa.GenerateKey(rand.Reader, 2048) //nolint:mnd
	if err != nil {
		t.Fatalf("generate RSA key: %v", err)
	}

	env.publicKey = &key.PublicKey

	der, err := x509.MarshalPKCS8PrivateKey(key)
	if err != nil {
		t.Fatalf("marshal RSA key: %v", err)
	}

	keyPEM := pem.EncodeToMemory(&pem.Block{Type: "PRIVATE KEY", Headers: nil, Bytes: der})

	file, err := json.Marshal(map[string]string{
		"type":             "service_account",
		"project_id":       "fixture-project",
		"private_key_id":   "key-1",
		"private_key":      string(keyPEM),
		"client_email":     "aifx@fixture-project.iam.gserviceaccount.com",
		"client_id":        "1234567890",
		"token_uri":        env.serverURL + "/token",
		"quota_project_id": "quota-project",
	})
	if err != nil {
		t.Fatalf("marshal service account: %v", err)
	}

	path := filepath.Join(env.tempDir, "service-account.json")
	if err := os.WriteFile(path, file, 0o600); err != nil { //nolint:mnd
		t.Fatalf("write service account: %v", err)
	}

	return path
}
