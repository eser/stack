package aifx

import (
	"bytes"
	"encoding/json"
	"errors"
	"runtime"
	"testing"
)

// The subprocess helpers this file used to carry -- shell/cat/echo script
// builders for driving a real CLI -- went with SpawnCliProcess and the three
// CLI adapters that were its only callers. What remains covers the helpers that
// are still on a production path: ResolveBinary, FormatMessagesAsText and
// ParseJsonlStream.

func TestFormatMessagesAsText(t *testing.T) {
	t.Parallel()

	t.Run("messages only", func(t *testing.T) {
		t.Parallel()

		msgs := []Message{
			NewTextMessage(RoleUser, "hello"),
			NewTextMessage(RoleAssistant, "world"),
		}

		got := FormatMessagesAsText(msgs, "")
		if got != "hello\nworld" {
			t.Errorf("unexpected output: %q", got)
		}
	})

	t.Run("with system prompt", func(t *testing.T) {
		t.Parallel()

		msgs := []Message{NewTextMessage(RoleUser, "hi")}
		got := FormatMessagesAsText(msgs, "you are helpful")

		if got != "you are helpful\n\nhi" {
			t.Errorf("unexpected output: %q", got)
		}
	})

	t.Run("non-text blocks skipped", func(t *testing.T) {
		t.Parallel()

		msgs := []Message{
			{
				Role: RoleUser,
				Content: []ContentBlock{
					{Type: ContentBlockImage, Image: &ImagePart{URL: "https://example.com/img.jpg"}},
					{Type: ContentBlockText, Text: "describe this"},
				},
			},
		}

		got := FormatMessagesAsText(msgs, "")
		if got != "describe this" {
			t.Errorf("unexpected output: %q", got)
		}
	})

	t.Run("empty messages and no system", func(t *testing.T) {
		t.Parallel()

		got := FormatMessagesAsText([]Message{}, "")
		if got != "" {
			t.Errorf("expected empty string, got %q", got)
		}
	})
}

func TestParseJsonlStream(t *testing.T) {
	t.Parallel()

	t.Run("valid JSONL lines emit events", func(t *testing.T) {
		t.Parallel()

		input := `{"text":"hello"}
{"text":"world"}
`
		reader := bytes.NewBufferString(input)
		ch := make(chan StreamEvent, 10)

		ParseJsonlStream(t.Context(), reader, ch, func(raw json.RawMessage) *StreamEvent {
			var m map[string]string
			_ = json.Unmarshal(raw, &m)

			return &StreamEvent{Type: StreamEventContentDelta, TextDelta: m["text"]}
		})

		close(ch)

		var deltas []string
		for ev := range ch {
			deltas = append(deltas, ev.TextDelta)
		}

		if len(deltas) != 2 || deltas[0] != "hello" || deltas[1] != "world" {
			t.Errorf("unexpected deltas: %v", deltas)
		}
	})

	t.Run("malformed lines are skipped", func(t *testing.T) {
		t.Parallel()

		input := "not json\n{\"text\":\"ok\"}\n"
		reader := bytes.NewBufferString(input)
		ch := make(chan StreamEvent, 10)

		ParseJsonlStream(t.Context(), reader, ch, func(raw json.RawMessage) *StreamEvent {
			var m map[string]string
			_ = json.Unmarshal(raw, &m)

			ev := StreamEvent{Type: StreamEventContentDelta, TextDelta: m["text"]}

			return &ev
		})

		close(ch)

		var count int
		for range ch {
			count++
		}

		if count != 1 {
			t.Errorf("expected 1 valid event, got %d", count)
		}
	})

	t.Run("nil return from mapper is skipped", func(t *testing.T) {
		t.Parallel()

		input := "{\"skip\":true}\n"
		reader := bytes.NewBufferString(input)
		ch := make(chan StreamEvent, 10)

		ParseJsonlStream(t.Context(), reader, ch, func(_ json.RawMessage) *StreamEvent {
			return nil
		})

		close(ch)

		if len(ch) != 0 {
			t.Errorf("expected 0 events for nil mapper return, got %d", len(ch))
		}
	})

	t.Run("empty lines are skipped", func(t *testing.T) {
		t.Parallel()

		input := "\n\n{\"text\":\"x\"}\n\n"
		reader := bytes.NewBufferString(input)
		ch := make(chan StreamEvent, 10)

		ParseJsonlStream(t.Context(), reader, ch, func(raw json.RawMessage) *StreamEvent {
			var m map[string]string
			_ = json.Unmarshal(raw, &m)

			ev := StreamEvent{TextDelta: m["text"]}

			return &ev
		})

		close(ch)

		if len(ch) != 1 {
			t.Errorf("expected 1 event, got %d", len(ch))
		}
	})
}

func TestResolveBinary_FromConfig(t *testing.T) {
	t.Parallel()

	config := &ConfigTarget{
		Properties: map[string]any{
			"binPath": "/usr/local/bin/myprog",
		},
	}

	path, err := ResolveBinary("myprog", config)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	if path != "/usr/local/bin/myprog" {
		t.Errorf("expected /usr/local/bin/myprog, got %q", path)
	}
}

func TestResolveBinary_NotFound(t *testing.T) {
	t.Parallel()

	_, err := ResolveBinary("this-binary-does-not-exist-9876", nil)
	if err == nil {
		t.Fatal("expected error for missing binary")
	}

	if !errors.Is(err, ErrBinaryNotFound) {
		t.Errorf("expected ErrBinaryNotFound, got %v", err)
	}
}

func TestResolveBinary_FromPath(t *testing.T) {
	t.Parallel()

	// "sh" exists on all POSIX systems; "cmd" is always on PATH on Windows.
	name := "sh"
	if runtime.GOOS == "windows" {
		name = "cmd"
	}

	path, err := ResolveBinary(name, nil)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	if path == "" {
		t.Errorf("expected non-empty path for %q", name)
	}
}
