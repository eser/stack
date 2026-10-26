package aifx

import (
	"context"
	"crypto/rand"
	"crypto/rsa"
	"crypto/x509"
	"encoding/json"
	"encoding/pem"
	"errors"
	"io"
	"net/http"
	"net/http/httptest"
	"net/url"
	"os"
	"path/filepath"
	"strings"
	"sync/atomic"
	"testing"
	"time"

	"github.com/eser/stack/pkg/ajan/lib"
)

// These tests cover the net/http layer the providers share (TASK-279): path
// joining, retry delays, response limits, the event stream decoder, the
// Google URL rules and the Vertex AI credential sources.

func TestProviderTransportEndpoint(t *testing.T) {
	t.Parallel()

	cases := []struct {
		base, path, want string
		query            url.Values
	}{
		{"https://api.openai.com/v1/", "chat/completions", "https://api.openai.com/v1/chat/completions", nil},
		{"https://proxy.example/v1", "chat/completions", "https://proxy.example/v1/chat/completions", nil},
		{"https://api.anthropic.com/", "v1/messages", "https://api.anthropic.com/v1/messages", nil},
		{"https://proxy.example/v1/", "v1/messages", "https://proxy.example/v1/v1/messages", nil},
		{"http://127.0.0.1:1", "/batches", "http://127.0.0.1:1/batches", url.Values{"limit": {"2"}}},
	}

	for _, tc := range cases {
		transport := &providerTransport{baseURL: tc.base} //nolint:exhaustruct

		got, err := transport.endpoint(tc.path, tc.query)
		if err != nil {
			t.Fatalf("endpoint(%q, %q): %v", tc.base, tc.path, err)
		}

		want := tc.want
		if tc.query != nil {
			want += "?" + tc.query.Encode()
		}

		if got != want {
			t.Errorf("endpoint(%q, %q) = %q, want %q", tc.base, tc.path, got, want)
		}
	}
}

func TestRetryDelay(t *testing.T) {
	t.Parallel()

	reply := func(name, value string) *http.Response {
		header := http.Header{}
		header.Set(name, value)

		return &http.Response{Header: header} //nolint:exhaustruct
	}

	if got := retryDelay(reply("Retry-After-Ms", "250"), 0); got != 250*time.Millisecond {
		t.Errorf("Retry-After-Ms 250 waited %v", got)
	}

	if got := retryDelay(reply("Retry-After", "2"), 0); got != 2*time.Second {
		t.Errorf("Retry-After 2 waited %v", got)
	}

	if got := retryDelay(reply("Retry-After", time.Now().Add(3*time.Second).UTC().Format(time.RFC1123)), 0); got <= 0 || got > 3*time.Second {
		t.Errorf("Retry-After as a date waited %v", got)
	}

	// A wait of a minute or more is not honoured; the backoff applies.
	for attempt, ceiling := range []time.Duration{500 * time.Millisecond, time.Second, 2 * time.Second} {
		got := retryDelay(reply("Retry-After", "120"), attempt)
		if got > ceiling || got < ceiling*3/4 {
			t.Errorf("attempt %d waited %v, want a backoff in [%v, %v]", attempt, got, ceiling*3/4, ceiling)
		}
	}

	if got := retryDelay(nil, 10); got > providerMaxBackoff {
		t.Errorf("the backoff grew past its cap: %v", got)
	}
}

func TestSSEDecoderSkipsEventsWithoutData(t *testing.T) {
	t.Parallel()

	decoder := newSSEDecoder(strings.NewReader(": keep-alive\n\nevent: ping\n\ndata: {\"a\":1}\n\nevent: cut off\ndata: x"))

	var events []sseEvent
	for decoder.next() {
		events = append(events, decoder.event)
	}

	if decoder.err != nil {
		t.Fatalf("decoder error: %v", decoder.err)
	}

	if len(events) != 1 || string(events[0].data) != "{\"a\":1}\n" {
		t.Fatalf("events = %+v, want the one data event", events)
	}
}

func TestSSEDecoderReportsAnOverlongLine(t *testing.T) {
	t.Parallel()

	decoder := newSSEDecoder(strings.NewReader("data: " + strings.Repeat("a", sseMaxLineBytes+1) + "\n\n"))

	if decoder.next() {
		t.Fatal("an overlong line was dispatched")
	}

	if decoder.err == nil {
		t.Fatal("an overlong line ended the stream without an error")
	}
}

// An OpenAI-compatible server may send keep-alive comments; the stream
// carries on past them instead of failing to decode an empty event.
func TestOpenAIStreamSkipsKeepAliveComments(t *testing.T) {
	t.Parallel()

	body := ": OPENROUTER PROCESSING\n\n" +
		sseData(openAIChunkJSON(`{"role":"assistant","content":"Hi"}`, "null")) +
		": keep-alive\n\n" +
		sseData(openAIChunkJSON(`{}`, `"stop"`)) +
		sseData("[DONE]")

	srv := serveBytes("text/event-stream", []byte(body))
	defer srv.Close()

	iter, err := makeTestOpenAIModel(t, srv).StreamText(t.Context(), fixtureTextOptions())
	if err != nil {
		t.Fatalf("StreamText: %v", err)
	}

	result, err := iter.Collect()
	if err != nil {
		t.Fatalf("Collect: %v", err)
	}

	if result.Text() != "Hi" || result.StopReason != StopReasonEndTurn {
		t.Fatalf("result = %q %q, want Hi and end_turn", result.Text(), result.StopReason)
	}
}

func TestProviderResponseOverLimitIsReported(t *testing.T) {
	t.Parallel()

	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		_, _ = io.Copy(w, io.LimitReader(neverEnding('a'), providerMaxResponseBytes+1))
	}))
	defer srv.Close()

	_, err := makeTestAnthropicModel(t, srv).GenerateText(t.Context(), fixtureTextOptions())

	if !errors.Is(err, lib.ErrReadLimitExceeded) || !errors.Is(err, ErrAnthropicGenerationFailed) {
		t.Fatalf("error = %v, want ErrReadLimitExceeded wrapped in ErrAnthropicGenerationFailed", err)
	}
}

type neverEnding byte

func (b neverEnding) Read(p []byte) (int, error) {
	for idx := range p {
		p[idx] = byte(b)
	}

	return len(p), nil
}

// The Google providers now apply ConfigTarget.RequestTimeout like the others;
// the genai SDK path sent without one.
func TestGeminiAppliesTheRequestTimeout(t *testing.T) {
	t.Parallel()

	var calls atomic.Int32

	srv := httptest.NewServer(http.HandlerFunc(func(_ http.ResponseWriter, r *http.Request) {
		calls.Add(1)

		// The server notices the client leaving only once the body is read.
		_, _ = io.Copy(io.Discard, r.Body)
		<-r.Context().Done()
	}))
	defer srv.Close()

	model := &GeminiModel{
		client: newGeminiClient(&ConfigTarget{BaseURL: srv.URL, RequestTimeout: 100 * time.Millisecond}, //nolint:exhaustruct
			"test-key", srv.Client()),
		modelID: "gemini-test",
	}

	_, err := model.GenerateText(t.Context(), fixtureTextOptions())

	if !errors.Is(err, context.DeadlineExceeded) || ErrorKind(err) != "cancelled" {
		t.Fatalf("error = %v (kind %q), want a cancelled deadline", err, ErrorKind(err))
	}

	if got := calls.Load(); got != 1 {
		t.Fatalf("sent %d requests, want 1: Google requests are not retried", got)
	}
}

func TestGeminiConfiguredBaseURLWinsOverTheEnvironment(t *testing.T) {
	t.Setenv("GOOGLE_GEMINI_BASE_URL", "https://env.example/")

	client := newGeminiClient(&ConfigTarget{BaseURL: "https://configured.example/"}, "k", http.DefaultClient) //nolint:exhaustruct
	if client.transport.baseURL != "https://configured.example/" {
		t.Fatalf("base URL = %q, want the configured one", client.transport.baseURL)
	}

	client = newGeminiClient(&ConfigTarget{}, "k", http.DefaultClient) //nolint:exhaustruct
	if client.transport.baseURL != "https://env.example/" {
		t.Fatalf("base URL = %q, want GOOGLE_GEMINI_BASE_URL", client.transport.baseURL)
	}
}

func TestVertexAIBaseURL(t *testing.T) {
	t.Parallel()

	cases := []struct {
		location string
		apiKey   bool
		want     string
	}{
		{"global", false, "https://aiplatform.googleapis.com/"},
		{"us-central1", true, "https://aiplatform.googleapis.com/"},
		{"us", false, "https://aiplatform.us.rep.googleapis.com/"},
		{"eu", false, "https://aiplatform.eu.rep.googleapis.com/"},
		{"europe-west4", false, "https://europe-west4-aiplatform.googleapis.com/"},
	}

	for _, tc := range cases {
		if got := vertexAIBaseURL(tc.location, tc.apiKey); got != tc.want {
			t.Errorf("vertexAIBaseURL(%q, %v) = %q, want %q", tc.location, tc.apiKey, got, tc.want)
		}
	}
}

func TestGoogleMethodPath(t *testing.T) {
	t.Parallel()

	gemini := &googleClient{backend: googleBackendGeminiAPI}                             //nolint:exhaustruct
	vertex := &googleClient{backend: googleBackendVertexAI, project: "p", location: "l"} //nolint:exhaustruct

	cases := []struct {
		client *googleClient
		model  string
		want   string
	}{
		{gemini, "gemini-test", "v1beta/models/gemini-test:generateContent"},
		{gemini, "models/gemini-test", "v1beta/models/gemini-test:generateContent"},
		{gemini, "tunedModels/mine", "v1beta/tunedModels/mine:generateContent"},
		{vertex, "gemini-test", "v1beta1/projects/p/locations/l/publishers/google/models/gemini-test:generateContent"},
		{vertex, "meta/llama", "v1beta1/projects/p/locations/l/publishers/meta/models/llama:generateContent"},
		{vertex, "projects/x/locations/y/endpoints/z", "v1beta1/projects/x/locations/y/endpoints/z:generateContent"},
	}

	for _, tc := range cases {
		got, err := tc.client.methodPath(tc.model, "generateContent")
		if err != nil || got != tc.want {
			t.Errorf("methodPath(%q) = %q, %v; want %q", tc.model, got, err, tc.want)
		}
	}

	for _, model := range []string{"", "a?b", "a&b", "../x", "a#b"} {
		if _, err := gemini.methodPath(model, "generateContent"); !errors.Is(err, ErrInvalidGoogleModel) {
			t.Errorf("methodPath(%q) error = %v, want ErrInvalidGoogleModel", model, err)
		}
	}
}

// ---------------------------------------------------------------------------
// Vertex AI credentials
// ---------------------------------------------------------------------------

// tokenServer answers token requests and records their forms.
type tokenServer struct {
	server *httptest.Server
	forms  chan url.Values
	calls  atomic.Int32
}

func newTokenServer(t *testing.T, status int, reply string) *tokenServer {
	t.Helper()

	ts := &tokenServer{server: nil, forms: make(chan url.Values, 8), calls: atomic.Int32{}} //nolint:mnd

	ts.server = httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		ts.calls.Add(1)

		_ = r.ParseForm()
		ts.forms <- r.PostForm

		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(status)
		_, _ = io.WriteString(w, reply)
	}))

	t.Cleanup(ts.server.Close)

	return ts
}

func authorizedUserJSON(t *testing.T, quotaProject string) []byte {
	t.Helper()

	raw, err := json.Marshal(map[string]string{
		"type":             "authorized_user",
		"client_id":        "client-id",
		"client_secret":    "client-secret-value",
		"refresh_token":    "refresh-token-value",
		"quota_project_id": quotaProject,
	})
	if err != nil {
		t.Fatalf("marshal credentials: %v", err)
	}

	return raw
}

func TestAuthorizedUserCredentialsRefreshAndCache(t *testing.T) {
	t.Setenv("GOOGLE_CLOUD_QUOTA_PROJECT", "")

	ts := newTokenServer(t, http.StatusOK, `{"access_token":"user-token","expires_in":3600,"token_type":"Bearer"}`)

	credentials, err := googleCredentialsFromJSON(authorizedUserJSON(t, "user-quota"), ts.server.Client(),
		ts.server.URL+"/token")
	if err != nil {
		t.Fatalf("googleCredentialsFromJSON: %v", err)
	}

	for range 2 {
		req := httptest.NewRequest(http.MethodPost, "https://example.com", nil)

		if err := credentials.authorize(t.Context(), req); err != nil {
			t.Fatalf("authorize: %v", err)
		}

		if got := req.Header.Get("Authorization"); got != "Bearer user-token" {
			t.Fatalf("Authorization = %q", got)
		}

		if got := req.Header.Get("X-Goog-User-Project"); got != "user-quota" {
			t.Fatalf("X-Goog-User-Project = %q, want the file's quota project", got)
		}
	}

	if got := ts.calls.Load(); got != 1 {
		t.Fatalf("fetched %d tokens, want 1: the token is cached", got)
	}

	form := <-ts.forms
	want := url.Values{
		"client_id":     {"client-id"},
		"client_secret": {"client-secret-value"},
		"grant_type":    {"refresh_token"},
		"refresh_token": {"refresh-token-value"},
	}

	if form.Encode() != want.Encode() {
		t.Fatalf("token form = %v, want %v", form, want)
	}

	// A token about to expire is fetched again.
	credentials.now = func() time.Time { return time.Now().Add(time.Hour) }

	if _, err := credentials.accessToken(t.Context()); err != nil {
		t.Fatalf("accessToken: %v", err)
	}

	if got := ts.calls.Load(); got != 2 { //nolint:mnd
		t.Fatalf("fetched %d tokens, want a refresh before expiry", got)
	}
}

func TestQuotaProjectFromTheEnvironmentWins(t *testing.T) {
	t.Setenv("GOOGLE_CLOUD_QUOTA_PROJECT", "env-quota")

	credentials, err := googleCredentialsFromJSON(authorizedUserJSON(t, "file-quota"), http.DefaultClient, "")
	if err != nil {
		t.Fatalf("googleCredentialsFromJSON: %v", err)
	}

	if credentials.quotaProject != "env-quota" {
		t.Fatalf("quota project = %q, want GOOGLE_CLOUD_QUOTA_PROJECT", credentials.quotaProject)
	}
}

// A refused exchange names the endpoint and quotes the OAuth error, and no
// secret of the request appears in the error.
func TestTokenErrorKeepsSecretsOut(t *testing.T) {
	t.Setenv("GOOGLE_CLOUD_QUOTA_PROJECT", "")

	ts := newTokenServer(t, http.StatusBadRequest, `{"error":"invalid_grant","error_description":"Token has been expired or revoked."}`)

	credentials, err := googleCredentialsFromJSON(authorizedUserJSON(t, ""), ts.server.Client(), ts.server.URL+"/token")
	if err != nil {
		t.Fatalf("googleCredentialsFromJSON: %v", err)
	}

	_, err = credentials.accessToken(t.Context())
	if !errors.Is(err, ErrGoogleTokenFetch) || !strings.Contains(err.Error(), "invalid_grant") {
		t.Fatalf("error = %v, want ErrGoogleTokenFetch quoting invalid_grant", err)
	}

	for _, secret := range []string{"client-secret-value", "refresh-token-value"} {
		if strings.Contains(err.Error(), secret) {
			t.Fatalf("the error carries a secret: %v", err)
		}
	}
}

func TestUnsupportedCredentialTypes(t *testing.T) {
	t.Parallel()

	cases := map[string]string{
		"external_account":             `{"type":"external_account","audience":"x"}`,
		"impersonated_service_account": `{"type":"impersonated_service_account"}`,
		"incomplete authorized_user":   `{"type":"authorized_user","client_id":"x"}`,
		"service_account without key":  `{"type":"service_account","client_email":"a@b"}`,
		"service_account with bad key": `{"type":"service_account","client_email":"a@b","private_key":"not pem"}`,
		"not JSON":                     `{`,
	}

	for name, raw := range cases {
		if _, err := googleCredentialsFromJSON([]byte(raw), http.DefaultClient, ""); !errors.Is(err, ErrGoogleCredentialsInvalid) {
			t.Errorf("%s: error = %v, want ErrGoogleCredentialsInvalid", name, err)
		}
	}
}

func TestServiceAccountAcceptsAPKCS1Key(t *testing.T) {
	t.Parallel()

	key, err := rsa.GenerateKey(rand.Reader, 2048) //nolint:mnd
	if err != nil {
		t.Fatalf("generate key: %v", err)
	}

	keyPEM := pem.EncodeToMemory(&pem.Block{Type: "RSA PRIVATE KEY", Headers: nil, Bytes: x509.MarshalPKCS1PrivateKey(key)})

	parsed, err := parseRSAPrivateKey(string(keyPEM))
	if err != nil || !parsed.Equal(key) {
		t.Fatalf("parseRSAPrivateKey: %v", err)
	}
}

// refusingTransport fails every request, standing in for a machine that is
// not on Google Cloud: the metadata probe must not reach the network.
type refusingTransport struct{ calls atomic.Int32 }

func (r *refusingTransport) RoundTrip(*http.Request) (*http.Response, error) {
	r.calls.Add(1)

	return nil, errCaptured
}

func clearGoogleCredentialEnv(t *testing.T) {
	t.Helper()

	for _, name := range []string{"GOOGLE_APPLICATION_CREDENTIALS", "GCE_METADATA_HOST", "GOOGLE_CLOUD_QUOTA_PROJECT"} {
		t.Setenv(name, "")
		_ = os.Unsetenv(name)
	}

	t.Setenv("HOME", t.TempDir())
	t.Setenv("APPDATA", t.TempDir())
}

func vertexWithoutKey() *ConfigTarget {
	return &ConfigTarget{ //nolint:exhaustruct
		Provider: "vertexai", Model: "gemini-test", ProjectID: "p", Location: "us-central1",
		BaseURL: "http://127.0.0.1:1",
	}
}

func TestVertexAIWithoutCredentialsFailsAtCreation(t *testing.T) {
	clearGoogleCredentialEnv(t)

	refusing := &refusingTransport{} //nolint:exhaustruct

	_, err := newVertexAIClient(t.Context(), vertexWithoutKey(), &http.Client{Transport: refusing}) //nolint:exhaustruct
	if !errors.Is(err, ErrGoogleCredentialsNotFound) {
		t.Fatalf("error = %v, want ErrGoogleCredentialsNotFound", err)
	}

	if refusing.calls.Load() != 1 {
		t.Fatalf("probed the metadata server %d times, want once", refusing.calls.Load())
	}
}

func TestVertexAIReportsAMissingCredentialsFile(t *testing.T) {
	clearGoogleCredentialEnv(t)
	t.Setenv("GOOGLE_APPLICATION_CREDENTIALS", filepath.Join(t.TempDir(), "missing.json"))

	_, err := NewVertexAIModelFactory().CreateModel(t.Context(), vertexWithoutKey())
	if !errors.Is(err, ErrVertexAIClientCreate) || !errors.Is(err, ErrGoogleCredentialsInvalid) {
		t.Fatalf("error = %v, want ErrVertexAIClientCreate and ErrGoogleCredentialsInvalid", err)
	}
}

func TestVertexAIReadsTheGcloudFile(t *testing.T) {
	clearGoogleCredentialEnv(t)

	home := t.TempDir()
	t.Setenv("HOME", home)
	t.Setenv("APPDATA", filepath.Join(home, ".config"))

	dir := filepath.Join(home, ".config", "gcloud")
	if err := os.MkdirAll(dir, 0o700); err != nil { //nolint:mnd
		t.Fatalf("create gcloud dir: %v", err)
	}

	err := os.WriteFile(filepath.Join(dir, "application_default_credentials.json"), authorizedUserJSON(t, "gcloud-quota"), 0o600) //nolint:mnd
	if err != nil {
		t.Fatalf("write gcloud file: %v", err)
	}

	refusing := &refusingTransport{} //nolint:exhaustruct

	client, err := newVertexAIClient(t.Context(), vertexWithoutKey(), &http.Client{Transport: refusing}) //nolint:exhaustruct
	if err != nil {
		t.Fatalf("newVertexAIClient: %v", err)
	}

	if client.transport.authorize == nil || refusing.calls.Load() != 0 {
		t.Fatal("the gcloud file was not used, or the metadata server was probed anyway")
	}
}
