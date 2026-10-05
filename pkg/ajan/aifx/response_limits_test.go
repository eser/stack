package aifx

import (
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/eser/stack/pkg/ajan/lib"
)

// These tests pin TASK-32 for the aifx adapters: a response larger than its
// named limit fails with an error that says so, instead of filling memory or
// stopping without a word.

func TestOllamaResponseOverLimitIsReported(t *testing.T) {
	t.Parallel()

	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusOK)
		// One byte over the limit is enough; the body need not be valid JSON.
		_, _ = w.Write([]byte(strings.Repeat("a", ollamaMaxResponseBytes+1)))
	}))
	defer srv.Close()

	model := &OllamaModel{
		client:  srv.Client(),
		config:  &ConfigTarget{Model: "llama3"}, //nolint:exhaustruct
		baseURL: srv.URL,
	}

	_, err := model.GenerateText(t.Context(), &GenerateTextOptions{ //nolint:exhaustruct
		Messages: []Message{NewTextMessage(RoleUser, "hi")},
	})

	if !errors.Is(err, lib.ErrReadLimitExceeded) {
		t.Fatalf("GenerateText error = %v, want one wrapping lib.ErrReadLimitExceeded", err)
	}

	if !errors.Is(err, ErrOllamaGenerationFailed) {
		t.Errorf("GenerateText error = %v, want one wrapping ErrOllamaGenerationFailed", err)
	}
}

func TestParseJsonlStreamReportsAnOverlongLine(t *testing.T) {
	t.Parallel()

	input := `{"text":"ok"}` + "\n" + `{"text":"` + strings.Repeat("a", jsonlMaxLineBytes) + `"}` + "\n"
	ch := make(chan StreamEvent, 10)

	ParseJsonlStream(t.Context(), strings.NewReader(input), ch, func(_ json.RawMessage) *StreamEvent {
		event := newStreamEventContentDelta("ok")

		return &event
	})

	close(ch)

	var got []StreamEventType
	for event := range ch {
		got = append(got, event.Type)
	}

	if len(got) != 2 || got[0] != StreamEventContentDelta || got[1] != StreamEventError {
		t.Fatalf("events = %v, want a content delta then an error", got)
	}
}
