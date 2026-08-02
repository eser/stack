package aifx

import "testing"

func textOf(r *GenerateTextResult) string {
	out := ""
	for _, b := range r.Content {
		if b.Type == ContentBlockText {
			out += b.Text
		}
	}

	return out
}

// Claude Code CLI v2 `--output-format json` returns a JSON ARRAY of events.
// parseClaudeCodeJsonResult must reduce it to the result text, not dump the
// whole transcript as the message.
func TestParseClaudeCodeJsonResultArray(t *testing.T) {
	t.Parallel()

	raw := `[` +
		`{"type":"system","subtype":"init"},` +
		`{"type":"rate_limit_event","rate_limit_info":{"status":"allowed"}},` +
		`{"type":"system","subtype":"thinking_tokens","estimated_tokens":50},` +
		`{"type":"assistant","message":{"content":[{"type":"thinking","thinking":"","signature":"abc"}]}},` +
		`{"type":"assistant","message":{"content":[{"type":"text","text":"feat(mux): add terminal multiplexer"}]}},` +
		`{"type":"result","subtype":"success","result":"feat(mux): add terminal multiplexer","usage":{"input_tokens":10,"output_tokens":5}}` +
		`]`

	got, err := parseClaudeCodeJsonResult(raw, "opus")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	if want := "feat(mux): add terminal multiplexer"; textOf(got) != want {
		t.Fatalf("got %q, want %q", textOf(got), want)
	}
}

func TestParseClaudeCodeJsonResultSingleObject(t *testing.T) {
	t.Parallel()

	got, err := parseClaudeCodeJsonResult(`{"type":"result","result":"fix: bug"}`, "opus")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	if textOf(got) != "fix: bug" {
		t.Fatalf("got %q", textOf(got))
	}
}

func TestParseClaudeCodeJsonResultPlainText(t *testing.T) {
	t.Parallel()

	got, err := parseClaudeCodeJsonResult("chore: tidy\n", "opus")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	if textOf(got) != "chore: tidy" {
		t.Fatalf("got %q", textOf(got))
	}
}
