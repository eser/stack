package aifx

import (
	"context"
	"encoding/json"
	"errors"
	"testing"
)

// TestClaudeCode_Factory covers factory-level methods and model metadata.
func TestClaudeCode_Factory(t *testing.T) {
	t.Parallel()

	f := NewClaudeCodeModelFactory()

	if f.GetProvider() != claudeCodeProviderName {
		t.Errorf("expected %q, got %q", claudeCodeProviderName, f.GetProvider())
	}
}

func TestClaudeCode_CreateModel_EmptyModel(t *testing.T) {
	t.Parallel()

	f := NewClaudeCodeModelFactory()

	_, err := f.CreateModel(context.Background(), &ConfigTarget{})
	if !errors.Is(err, ErrInvalidModel) {
		t.Errorf("expected ErrInvalidModel, got %v", err)
	}
}

func TestClaudeCode_CreateModel_BinaryNotFound(t *testing.T) {
	t.Parallel()

	f := NewClaudeCodeModelFactory()

	_, err := f.CreateModel(context.Background(), &ConfigTarget{
		Model: "claude-opus-4-5",
		// No binPath, 'claude' not expected to be in PATH on CI
	})

	// Either succeeds (claude is on PATH) or fails with ErrBinaryNotFound
	if err != nil && !errors.Is(err, ErrBinaryNotFound) {
		t.Errorf("expected ErrBinaryNotFound or nil, got %v", err)
	}
}

func TestClaudeCode_CreateModel_WithBinPath(t *testing.T) {
	t.Parallel()

	f := NewClaudeCodeModelFactory()

	model, err := f.CreateModel(context.Background(), &ConfigTarget{
		Model: "claude-opus-4-5",
		Properties: map[string]any{
			"binPath": "/bin/sh",
		},
	})

	if err != nil {
		t.Fatalf("CreateModel: %v", err)
	}

	if model.GetProvider() != claudeCodeProviderName {
		t.Errorf("wrong provider: %s", model.GetProvider())
	}

	if model.GetModelID() != "claude-opus-4-5" {
		t.Errorf("wrong model ID: %s", model.GetModelID())
	}

	if model.GetRawClient() != nil {
		t.Error("expected nil raw client for CLI adapter")
	}

	caps := model.GetCapabilities()
	if len(caps) == 0 {
		t.Error("expected non-empty capabilities")
	}

	if err := model.Close(context.Background()); err != nil {
		t.Errorf("Close() error: %v", err)
	}
}

func TestClaudeCode_BuildArgs(t *testing.T) {
	t.Parallel()

	model := &ClaudeCodeModel{
		binaryPath: "/bin/claude",
		config: &ConfigTarget{
			Model:      "claude-opus-4-5",
			Properties: map[string]any{},
		},
	}

	t.Run("json format", func(t *testing.T) {
		t.Parallel()

		args := model.buildArgs(&GenerateTextOptions{}, "json")

		if !containsSequence(args, "--output-format", "json") {
			t.Errorf("expected --output-format json, got %v", args)
		}

		if !containsSequence(args, "--model", "claude-opus-4-5") {
			t.Errorf("expected --model claude-opus-4-5, got %v", args)
		}
	})

	t.Run("text format omits --output-format flag", func(t *testing.T) {
		t.Parallel()

		args := model.buildArgs(&GenerateTextOptions{}, "text")

		if containsArg(args, "--output-format") {
			t.Error("text format should not include --output-format flag")
		}
	})

	t.Run("stream-json format adds --verbose", func(t *testing.T) {
		t.Parallel()

		args := model.buildArgs(&GenerateTextOptions{}, "stream-json")

		if !containsArg(args, "--verbose") {
			t.Errorf("stream-json format should include --verbose, got %v", args)
		}
	})

	t.Run("maxTurns property", func(t *testing.T) {
		t.Parallel()

		m := &ClaudeCodeModel{
			binaryPath: "/bin/claude",
			config: &ConfigTarget{
				Model: "claude-opus-4-5",
				Properties: map[string]any{
					"maxTurns": 3,
				},
			},
		}

		args := m.buildArgs(&GenerateTextOptions{}, "json")
		if !containsSequence(args, "--max-turns", "3") {
			t.Errorf("expected --max-turns 3, got %v", args)
		}
	})

	t.Run("allowedTools property", func(t *testing.T) {
		t.Parallel()

		m := &ClaudeCodeModel{
			binaryPath: "/bin/claude",
			config: &ConfigTarget{
				Model: "claude-opus-4-5",
				Properties: map[string]any{
					"allowedTools": []string{"bash", "read"},
				},
			},
		}

		args := m.buildArgs(&GenerateTextOptions{}, "json")
		if !containsSequence(args, "--allowedTools", "bash") {
			t.Errorf("expected --allowedTools bash, got %v", args)
		}
	})

	t.Run("extra args property", func(t *testing.T) {
		t.Parallel()

		m := &ClaudeCodeModel{
			binaryPath: "/bin/claude",
			config: &ConfigTarget{
				Model: "claude-opus-4-5",
				Properties: map[string]any{
					"args": []string{"--dangerously-skip-permissions"},
				},
			},
		}

		args := m.buildArgs(&GenerateTextOptions{}, "json")
		if !containsArg(args, "--dangerously-skip-permissions") {
			t.Errorf("expected extra arg, got %v", args)
		}
	})
}

func TestParseClaudeCodeJsonResult(t *testing.T) {
	t.Parallel()

	t.Run("plain text fallback on parse failure", func(t *testing.T) {
		t.Parallel()

		result, err := parseClaudeCodeJsonResult("just plain text output", "claude-opus-4-5")
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}

		if result.Text() != "just plain text output" {
			t.Errorf("unexpected text: %q", result.Text())
		}

		if result.StopReason != StopReasonEndTurn {
			t.Errorf("expected end_turn, got %q", result.StopReason)
		}
	})

	t.Run("result format", func(t *testing.T) {
		t.Parallel()

		output, _ := json.Marshal(map[string]any{
			"result":      "Here is the answer",
			"stop_reason": "end_turn",
		})

		result, err := parseClaudeCodeJsonResult(string(output), "claude-opus-4-5")
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}

		if result.Text() != "Here is the answer" {
			t.Errorf("unexpected text: %q", result.Text())
		}
	})

	t.Run("message format with text block", func(t *testing.T) {
		t.Parallel()

		output, _ := json.Marshal(map[string]any{
			"message": map[string]any{
				"content": []map[string]any{
					{"type": "text", "text": "Hello from message format"},
				},
			},
		})

		result, err := parseClaudeCodeJsonResult(string(output), "claude-opus-4-5")
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}

		if result.Text() != "Hello from message format" {
			t.Errorf("unexpected text: %q", result.Text())
		}
	})

	t.Run("message format with tool_use block", func(t *testing.T) {
		t.Parallel()

		output, _ := json.Marshal(map[string]any{
			"message": map[string]any{
				"content": []map[string]any{
					{
						"type":  "tool_use",
						"id":    "tc-1",
						"name":  "search",
						"input": map[string]any{"query": "test"},
					},
				},
			},
		})

		result, err := parseClaudeCodeJsonResult(string(output), "claude-opus-4-5")
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}

		if len(result.ToolCalls()) != 1 || result.ToolCalls()[0].Name != "search" {
			t.Errorf("unexpected tool calls: %+v", result.ToolCalls())
		}
	})
}

// --- OpenCode adapter tests ---

func TestOpenCode_Factory(t *testing.T) {
	t.Parallel()

	f := NewOpenCodeModelFactory()

	if f.GetProvider() != openCodeProviderName {
		t.Errorf("expected %q, got %q", openCodeProviderName, f.GetProvider())
	}
}

func TestOpenCode_CreateModel_EmptyModel(t *testing.T) {
	t.Parallel()

	f := NewOpenCodeModelFactory()

	_, err := f.CreateModel(context.Background(), &ConfigTarget{})
	if !errors.Is(err, ErrInvalidModel) {
		t.Errorf("expected ErrInvalidModel, got %v", err)
	}
}

func TestOpenCode_CreateModel_WithBinPath(t *testing.T) {
	t.Parallel()

	f := NewOpenCodeModelFactory()
	model, err := f.CreateModel(context.Background(), &ConfigTarget{
		Model: "gpt-4o",
		Properties: map[string]any{
			"binPath": "/bin/sh",
		},
	})

	if err != nil {
		t.Fatalf("CreateModel: %v", err)
	}

	if model.GetProvider() != openCodeProviderName {
		t.Errorf("wrong provider: %s", model.GetProvider())
	}

	if model.GetModelID() != "gpt-4o" {
		t.Errorf("wrong model ID: %s", model.GetModelID())
	}

	if err := model.Close(context.Background()); err != nil {
		t.Errorf("Close() error: %v", err)
	}
}

func TestOpenCode_BuildArgs(t *testing.T) {
	t.Parallel()

	model := &OpenCodeModel{
		binaryPath: "/bin/opencode",
		config: &ConfigTarget{
			Model:      "gpt-4o",
			Properties: map[string]any{},
		},
	}

	args := model.buildArgs(&GenerateTextOptions{}, "json")

	if !containsSequence(args, "--output-format", "json") {
		t.Errorf("expected --output-format json, got %v", args)
	}

	if !containsSequence(args, "--model", "gpt-4o") {
		t.Errorf("expected --model gpt-4o, got %v", args)
	}
}

func TestOpenCode_BuildArgs_MaxTokens(t *testing.T) {
	t.Parallel()

	model := &OpenCodeModel{
		binaryPath: "/bin/opencode",
		config:     &ConfigTarget{Model: "gpt-4o", Properties: map[string]any{}},
	}

	args := model.buildArgs(&GenerateTextOptions{MaxTokens: 256}, "json")
	if !containsSequence(args, "--max-tokens", "256") {
		t.Errorf("expected --max-tokens 256, got %v", args)
	}
}

func TestMapOpenCodeStreamEvent(t *testing.T) {
	t.Parallel()

	t.Run("content_block_delta type", func(t *testing.T) {
		t.Parallel()

		raw := json.RawMessage(`{"type":"content_block_delta","delta":{"text":"hello"}}`)
		ev := mapOpenCodeStreamEvent(raw)

		if ev == nil || ev.Type != StreamEventContentDelta {
			t.Errorf("expected content_delta, got %+v", ev)
		}

		if ev.TextDelta != "hello" {
			t.Errorf("expected 'hello', got %q", ev.TextDelta)
		}
	})

	t.Run("assistant type with message content", func(t *testing.T) {
		t.Parallel()

		raw := json.RawMessage(`{"type":"assistant","message":{"content":[{"text":"world"}]}}`)
		ev := mapOpenCodeStreamEvent(raw)

		if ev == nil || ev.TextDelta != "world" {
			t.Errorf("expected 'world', got %+v", ev)
		}
	})

	t.Run("result type (done)", func(t *testing.T) {
		t.Parallel()

		raw := json.RawMessage(`{"type":"result","usage":{"input_tokens":5,"output_tokens":3}}`)
		ev := mapOpenCodeStreamEvent(raw)

		if ev == nil || ev.Type != StreamEventMessageDone {
			t.Errorf("expected message_done, got %+v", ev)
		}

		if ev.Usage == nil || ev.Usage.InputTokens != 5 {
			t.Errorf("unexpected usage: %+v", ev.Usage)
		}
	})

	t.Run("content field fallback", func(t *testing.T) {
		t.Parallel()

		raw := json.RawMessage(`{"type":"unknown","content":"fallback text"}`)
		ev := mapOpenCodeStreamEvent(raw)

		if ev == nil || ev.TextDelta != "fallback text" {
			t.Errorf("expected 'fallback text', got %+v", ev)
		}
	})

	t.Run("done flag style", func(t *testing.T) {
		t.Parallel()

		raw := json.RawMessage(`{"done":true}`)
		ev := mapOpenCodeStreamEvent(raw)

		if ev == nil || ev.Type != StreamEventMessageDone {
			t.Errorf("expected message_done for done flag, got %+v", ev)
		}
	})

	t.Run("malformed returns nil", func(t *testing.T) {
		t.Parallel()

		raw := json.RawMessage(`{invalid}`)
		ev := mapOpenCodeStreamEvent(raw)

		if ev != nil {
			t.Error("expected nil for malformed JSON")
		}
	})
}

// --- Kiro adapter tests ---

func TestKiro_Factory(t *testing.T) {
	t.Parallel()

	f := NewKiroModelFactory()

	if f.GetProvider() != kiroProviderName {
		t.Errorf("expected %q, got %q", kiroProviderName, f.GetProvider())
	}
}

func TestKiro_CreateModel_EmptyModel(t *testing.T) {
	t.Parallel()

	f := NewKiroModelFactory()

	_, err := f.CreateModel(context.Background(), &ConfigTarget{})
	if !errors.Is(err, ErrInvalidModel) {
		t.Errorf("expected ErrInvalidModel, got %v", err)
	}
}

func TestKiro_CreateModel_WithBinPath(t *testing.T) {
	t.Parallel()

	f := NewKiroModelFactory()
	model, err := f.CreateModel(context.Background(), &ConfigTarget{
		Model: "claude-opus-4-5",
		Properties: map[string]any{
			"binPath": "/bin/sh",
		},
	})

	if err != nil {
		t.Fatalf("CreateModel: %v", err)
	}

	if model.GetProvider() != kiroProviderName {
		t.Errorf("wrong provider: %s", model.GetProvider())
	}

	if err := model.Close(context.Background()); err != nil {
		t.Errorf("Close() error: %v", err)
	}
}

func TestKiro_BuildArgs(t *testing.T) {
	t.Parallel()

	model := &KiroModel{
		binaryPath: "/bin/kiro",
		config:     &ConfigTarget{Model: "claude-opus-4-5", Properties: map[string]any{}},
	}

	args := model.buildArgs(&GenerateTextOptions{})
	if !containsSequence(args, "--model", "claude-opus-4-5") {
		t.Errorf("expected --model, got %v", args)
	}

	if !containsSequence(args, "--output", "json") {
		t.Errorf("expected --output json, got %v", args)
	}
}

func TestKiro_BuildArgs_MaxTokens(t *testing.T) {
	t.Parallel()

	model := &KiroModel{
		binaryPath: "/bin/kiro",
		config:     &ConfigTarget{Model: "claude-opus-4-5", Properties: map[string]any{}},
	}

	args := model.buildArgs(&GenerateTextOptions{MaxTokens: 512})
	if !containsSequence(args, "--max-tokens", "512") {
		t.Errorf("expected --max-tokens 512, got %v", args)
	}
}

func TestMapKiroStreamEvent(t *testing.T) {
	t.Parallel()

	t.Run("content type", func(t *testing.T) {
		t.Parallel()

		raw := json.RawMessage(`{"type":"content","text":"kiro text"}`)
		ev := mapKiroStreamEvent(raw)

		if ev == nil || ev.Type != StreamEventContentDelta {
			t.Errorf("expected content_delta, got %+v", ev)
		}

		if ev.TextDelta != "kiro text" {
			t.Errorf("expected 'kiro text', got %q", ev.TextDelta)
		}
	})

	t.Run("text type fallback field", func(t *testing.T) {
		t.Parallel()

		raw := json.RawMessage(`{"type":"text","content":"from content field"}`)
		ev := mapKiroStreamEvent(raw)

		if ev == nil || ev.TextDelta != "from content field" {
			t.Errorf("expected 'from content field', got %+v", ev)
		}
	})

	t.Run("result/done type", func(t *testing.T) {
		t.Parallel()

		raw := json.RawMessage(`{"type":"result","usage":{"input_tokens":10,"output_tokens":5}}`)
		ev := mapKiroStreamEvent(raw)

		if ev == nil || ev.Type != StreamEventMessageDone {
			t.Errorf("expected message_done, got %+v", ev)
		}

		if ev.Usage == nil || ev.Usage.TotalTokens != 15 {
			t.Errorf("unexpected usage: %+v", ev.Usage)
		}
	})

	t.Run("error type", func(t *testing.T) {
		t.Parallel()

		raw := json.RawMessage(`{"type":"error","error":{"message":"something failed"}}`)
		ev := mapKiroStreamEvent(raw)

		if ev == nil || ev.Type != StreamEventError {
			t.Errorf("expected error event, got %+v", ev)
		}
	})

	t.Run("done flag style", func(t *testing.T) {
		t.Parallel()

		raw := json.RawMessage(`{"done":true}`)
		ev := mapKiroStreamEvent(raw)

		if ev == nil || ev.Type != StreamEventMessageDone {
			t.Errorf("expected message_done for done flag, got %+v", ev)
		}
	})

	t.Run("malformed returns nil", func(t *testing.T) {
		t.Parallel()

		raw := json.RawMessage(`{invalid}`)
		ev := mapKiroStreamEvent(raw)

		if ev != nil {
			t.Error("expected nil for malformed JSON")
		}
	})
}

// containsArg checks if a string slice contains the given argument.
func containsArg(args []string, arg string) bool {
	for _, a := range args {
		if a == arg {
			return true
		}
	}

	return false
}

// containsSequence checks if args contains the pair (key, value) in order.
func containsSequence(args []string, key, value string) bool {
	for i := 0; i < len(args)-1; i++ {
		if args[i] == key && args[i+1] == value {
			return true
		}
	}

	return false
}
