package aifx_test

import (
	"errors"
	"testing"

	"github.com/eser/stack/pkg/ajan/aifx"
)

func TestGenerateTextResult_Text(t *testing.T) {
	t.Parallel()

	tests := []struct {
		name    string
		content []aifx.ContentBlock
		want    string
	}{
		{
			name: "single text block",
			content: []aifx.ContentBlock{
				{Type: "text", Text: "hello"},
			},
			want: "hello",
		},
		{
			name: "multiple text blocks concatenated",
			content: []aifx.ContentBlock{
				{Type: "text", Text: "foo"},
				{Type: "text", Text: " bar"},
			},
			want: "foo bar",
		},
		{
			name: "non-text blocks skipped",
			content: []aifx.ContentBlock{
				{Type: "text", Text: "hello"},
				{Type: "tool_call"},
				{Type: "text", Text: " world"},
			},
			want: "hello world",
		},
		{
			name:    "empty content",
			content: []aifx.ContentBlock{},
			want:    "",
		},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			t.Parallel()

			r := &aifx.GenerateTextResult{Content: tc.content}
			got := r.Text()

			if got != tc.want {
				t.Errorf("Text() = %q, want %q", got, tc.want)
			}
		})
	}
}

func TestGenerateTextResult_ToolCalls(t *testing.T) {
	t.Parallel()

	toolCall := &aifx.ToolCall{ID: "tc-1", Name: "search"}
	r := &aifx.GenerateTextResult{
		Content: []aifx.ContentBlock{
			{Type: "text", Text: "here you go"},
			{Type: "tool_call", ToolCall: toolCall},
			{Type: "tool_call"},
		},
	}

	calls := r.ToolCalls()
	if len(calls) != 1 {
		t.Fatalf("expected 1 tool call (nil ToolCall filtered), got %d", len(calls))
	}

	if calls[0].ID != "tc-1" {
		t.Errorf("expected ID tc-1, got %s", calls[0].ID)
	}
}

func TestStreamIterator_Sequence(t *testing.T) {
	t.Parallel()

	ch := make(chan aifx.StreamEvent, 3)
	ch <- aifx.StreamEvent{Type: "content_delta", TextDelta: "he"}
	ch <- aifx.StreamEvent{Type: "content_delta", TextDelta: "llo"}
	ch <- aifx.StreamEvent{Type: "message_done", StopReason: "end_turn"}
	close(ch)

	iter := aifx.NewStreamIterator(ch, func() {})

	var deltas []string

	for iter.Next() {
		ev := iter.Current()
		if ev.Type == "content_delta" {
			deltas = append(deltas, ev.TextDelta)
		}
	}

	if iter.Err() != nil {
		t.Fatalf("unexpected error: %v", iter.Err())
	}

	if len(deltas) != 2 || deltas[0] != "he" || deltas[1] != "llo" {
		t.Errorf("unexpected deltas: %v", deltas)
	}
}

func TestStreamIterator_ErrorEvent(t *testing.T) {
	t.Parallel()

	sentErr := errors.New("stream failed")
	ch := make(chan aifx.StreamEvent, 1)
	ch <- aifx.StreamEvent{Type: "error", Error: sentErr}
	close(ch)

	iter := aifx.NewStreamIterator(ch, func() {})

	if iter.Next() {
		t.Fatal("Next() should return false on error event")
	}

	if !errors.Is(iter.Err(), sentErr) {
		t.Errorf("expected sentErr, got %v", iter.Err())
	}
}

func TestStreamIterator_ClosedChannel(t *testing.T) {
	t.Parallel()

	ch := make(chan aifx.StreamEvent)
	close(ch)

	iter := aifx.NewStreamIterator(ch, func() {})

	if iter.Next() {
		t.Fatal("Next() should return false on closed empty channel")
	}

	if iter.Err() != nil {
		t.Fatalf("unexpected error: %v", iter.Err())
	}
}

func TestStreamIterator_Collect(t *testing.T) {
	t.Parallel()

	toolCall := &aifx.ToolCall{ID: "tc-1", Name: "fetch"}
	usage := &aifx.Usage{InputTokens: 10, OutputTokens: 5, TotalTokens: 15}

	ch := make(chan aifx.StreamEvent, 4)
	ch <- aifx.StreamEvent{Type: "content_delta", TextDelta: "Hello"}
	ch <- aifx.StreamEvent{Type: "content_delta", TextDelta: " world"}
	ch <- aifx.StreamEvent{Type: "tool_call_delta", ToolCall: toolCall}
	ch <- aifx.StreamEvent{Type: "message_done", StopReason: "end_turn", Usage: usage}
	close(ch)

	iter := aifx.NewStreamIterator(ch, func() {})

	result, err := iter.Collect()
	if err != nil {
		t.Fatalf("Collect() error: %v", err)
	}

	if result.Text() != "Hello world" {
		t.Errorf("expected 'Hello world', got %q", result.Text())
	}

	if len(result.ToolCalls()) != 1 {
		t.Errorf("expected 1 tool call, got %d", len(result.ToolCalls()))
	}

	if result.StopReason != "end_turn" {
		t.Errorf("expected stop_reason end_turn, got %q", result.StopReason)
	}

	if result.Usage.TotalTokens != 15 {
		t.Errorf("expected 15 total tokens, got %d", result.Usage.TotalTokens)
	}
}

func TestStreamIterator_Collect_Error(t *testing.T) {
	t.Parallel()

	sentErr := errors.New("mid-stream failure")
	ch := make(chan aifx.StreamEvent, 2)
	ch <- aifx.StreamEvent{Type: "content_delta", TextDelta: "partial"}
	ch <- aifx.StreamEvent{Type: "error", Error: sentErr}
	close(ch)

	iter := aifx.NewStreamIterator(ch, func() {})

	_, err := iter.Collect()
	if !errors.Is(err, sentErr) {
		t.Errorf("expected sentErr, got %v", err)
	}
}

func TestStreamIterator_Close(t *testing.T) {
	t.Parallel()

	cancelled := false
	ch := make(chan aifx.StreamEvent, 1)
	ch <- aifx.StreamEvent{Type: "content_delta", TextDelta: "x"}

	iter := aifx.NewStreamIterator(ch, func() { cancelled = true })

	if err := iter.Close(); err != nil {
		t.Fatalf("Close() error: %v", err)
	}

	if !cancelled {
		t.Error("cancel function should have been called")
	}

	if iter.Next() {
		t.Error("Next() should return false after Close()")
	}
}
