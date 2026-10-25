package aifx

import (
	"context"
	"errors"
	"io"
	"net/http"
	"net/http/httptest"
	"os"
	"testing"
	"time"
)

// These tests pin cancellation through the context for every HTTP provider: a
// call whose context is cancelled while the request is in flight returns a
// cancelled error, and a stream that is closed or whose context is cancelled
// mid-stream stops and releases the connection. They ran against the vendor
// SDK implementation before the move to net/http and run unchanged after it.

type cancelProvider struct {
	config     func(serverURL string) *ConfigTarget
	env        map[string]string
	name       string
	firstEvent string // one SSE event carrying the text "Hi"
	sentinel   error
	streamErr  error
}

func cancelProviders() []cancelProvider {
	return []cancelProvider{
		{
			config:   anthropicFixtureConfig,
			env:      nil,
			name:     "anthropic",
			sentinel: ErrAnthropicGenerationFailed, streamErr: ErrAnthropicStreamFailed,
			firstEvent: sseNamed("message_start", `{"type":"message_start","message":{"id":"m","type":"message","role":"assistant","model":"claude-test","content":[],"stop_reason":null,"usage":{"input_tokens":1,"output_tokens":1}}}`) +
				sseNamed("content_block_start", `{"type":"content_block_start","index":0,"content_block":{"type":"text","text":""}}`) +
				sseNamed("content_block_delta", `{"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":"Hi"}}`),
		},
		{
			config:     openAIFixtureConfig,
			env:        nil,
			name:       "openai",
			sentinel:   ErrOpenAIGenerationFailed,
			streamErr:  ErrOpenAIStreamFailed,
			firstEvent: sseData(openAIChunkJSON(`{"role":"assistant","content":"Hi"}`, "null")),
		},
		{
			config:     geminiFixtureConfig,
			env:        map[string]string{"GOOGLE_GEMINI_BASE_URL": fixtureServerToken},
			name:       "gemini",
			sentinel:   ErrGeminiGenerationFailed,
			streamErr:  ErrGeminiStreamFailed,
			firstEvent: sseData(`{"candidates":[{"content":{"role":"model","parts":[{"text":"Hi"}]}}]}`),
		},
		{
			config:     vertexAIFixtureConfig,
			env:        map[string]string{"GOOGLE_VERTEX_BASE_URL": fixtureServerToken},
			name:       "vertexai",
			sentinel:   ErrVertexAIGenerationFailed,
			streamErr:  ErrVertexAIStreamFailed,
			firstEvent: sseData(`{"candidates":[{"content":{"role":"model","parts":[{"text":"Hi"}]}}]}`),
		},
	}
}

// blockingServer answers with head (when set) and then holds the connection
// until the client goes away, reporting on arrived and released.
type blockingServer struct {
	server   *httptest.Server
	arrived  chan struct{}
	released chan struct{}
}

func newBlockingServer(t *testing.T, head string) *blockingServer {
	t.Helper()

	bs := &blockingServer{server: nil, arrived: make(chan struct{}, 4), released: make(chan struct{}, 4)} //nolint:mnd

	bs.server = httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		_, _ = io.Copy(io.Discard, r.Body)

		if head != "" {
			w.Header().Set("Content-Type", "text/event-stream")
			w.WriteHeader(http.StatusOK)
			_, _ = io.WriteString(w, head)
			w.(http.Flusher).Flush() //nolint:forcetypeassert // httptest's writer flushes
		}

		bs.arrived <- struct{}{}

		<-r.Context().Done()

		bs.released <- struct{}{}
	}))

	t.Cleanup(bs.server.Close)

	return bs
}

func waitFor(t *testing.T, ch <-chan struct{}, what string) {
	t.Helper()

	select {
	case <-ch:
	case <-time.After(5 * time.Second):
		t.Fatalf("timed out waiting for %s", what)
	}
}

func newCancelModel(t *testing.T, provider *cancelProvider, serverURL string) LanguageModel { //nolint:ireturn
	t.Helper()

	for _, name := range fixtureEnvVars {
		t.Setenv(name, "")
		_ = os.Unsetenv(name)
	}

	for name, value := range provider.env {
		t.Setenv(name, serverURL+value[len(fixtureServerToken):])
	}

	config := provider.config(serverURL)
	config.RequestTimeout = 0

	model, err := NewRegistry(WithDefaultFactories()).AddModel(t.Context(), provider.name, config)
	if err != nil {
		t.Fatalf("create %s model: %v", provider.name, err)
	}

	return model
}

func TestProviderGenerateCancellation(t *testing.T) { //nolint:paralleltest // sets environment variables
	for _, provider := range cancelProviders() {
		t.Run(provider.name, func(t *testing.T) {
			bs := newBlockingServer(t, "")
			model := newCancelModel(t, &provider, bs.server.URL)

			ctx, cancel := context.WithCancel(t.Context())
			defer cancel()

			done := make(chan error, 1)

			go func() {
				_, err := model.GenerateText(ctx, fixtureTextOptions())
				done <- err
			}()

			waitFor(t, bs.arrived, "the request")
			cancel()

			var err error

			select {
			case err = <-done:
			case <-time.After(5 * time.Second):
				t.Fatal("GenerateText did not return after its context was cancelled")
			}

			waitFor(t, bs.released, "the connection to close")

			if !errors.Is(err, context.Canceled) || !errors.Is(err, provider.sentinel) {
				t.Fatalf("error = %v, want context.Canceled wrapped in %v", err, provider.sentinel)
			}

			if kind := ErrorKind(err); kind != "cancelled" {
				t.Fatalf("ErrorKind = %q, want cancelled", kind)
			}
		})
	}
}

func TestProviderStreamClose(t *testing.T) { //nolint:paralleltest // sets environment variables
	for _, provider := range cancelProviders() {
		t.Run(provider.name, func(t *testing.T) {
			bs := newBlockingServer(t, provider.firstEvent)
			model := newCancelModel(t, &provider, bs.server.URL)

			iter, err := model.StreamText(t.Context(), fixtureTextOptions())
			if err != nil {
				t.Fatalf("StreamText: %v", err)
			}

			if !iter.Next() {
				t.Fatalf("no first event: %v", iter.Err())
			}

			if event := iter.Current(); event.Type != StreamEventContentDelta || event.TextDelta != "Hi" {
				t.Fatalf("first event = %+v, want the Hi delta", event)
			}

			waitFor(t, bs.arrived, "the request")

			_ = iter.Close()

			if iter.Next() {
				t.Fatalf("Next returned an event after Close: %+v", iter.Current())
			}

			waitFor(t, bs.released, "the stream connection to close")
		})
	}
}

func TestProviderStreamContextCancel(t *testing.T) { //nolint:paralleltest // sets environment variables
	for _, provider := range cancelProviders() {
		t.Run(provider.name, func(t *testing.T) {
			bs := newBlockingServer(t, provider.firstEvent)
			model := newCancelModel(t, &provider, bs.server.URL)

			ctx, cancel := context.WithCancel(t.Context())
			defer cancel()

			iter, err := model.StreamText(ctx, fixtureTextOptions())
			if err != nil {
				t.Fatalf("StreamText: %v", err)
			}

			defer func() { _ = iter.Close() }()

			if !iter.Next() {
				t.Fatalf("no first event: %v", iter.Err())
			}

			waitFor(t, bs.arrived, "the request")
			cancel()

			finished := make(chan struct{})

			go func() {
				for iter.Next() {
					if event := iter.Current(); event.Type == StreamEventMessageDone {
						t.Errorf("a cancelled stream reported a clean finish: %+v", event)
					}
				}

				close(finished)
			}()

			waitFor(t, finished, "the stream to stop")
			waitFor(t, bs.released, "the stream connection to close")

			// A cancelled stream either stops silently or reports the
			// cancellation; it never reports another failure.
			if err := iter.Err(); err != nil {
				if ErrorKind(err) != "cancelled" || !errors.Is(err, provider.streamErr) {
					t.Fatalf("stream error = %v (kind %q), want a cancelled %v", err, ErrorKind(err), provider.streamErr)
				}
			}
		})
	}
}
