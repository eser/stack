package main

import (
	"encoding/json"
	"strings"
	"testing"
)

func TestBridgeVersion(t *testing.T) {
	t.Run("returns version string", func(t *testing.T) {
		got := bridgeVersion()
		want := "eser-ajan version " + Version

		if got != want {
			t.Errorf("bridgeVersion() = %q, want %q", got, want)
		}
	})

	t.Run("contains version constant", func(t *testing.T) {
		got := bridgeVersion()

		if !strings.Contains(got, Version) {
			t.Errorf("bridgeVersion() = %q, does not contain Version %q", got, Version)
		}
	})
}

func TestBridgeInit(t *testing.T) {
	t.Run("returns zero on success", func(t *testing.T) {
		got := bridgeInit()
		if got != 0 {
			t.Errorf("bridgeInit() = %d, want 0", got)
		}
	})

	t.Run("idempotent calls succeed", func(t *testing.T) {
		got := bridgeInit()
		if got != 0 {
			t.Errorf("second bridgeInit() = %d, want 0", got)
		}

		bridgeShutdown()
	})
}

func TestBridgeShutdown(t *testing.T) {
	t.Run("does not panic", func(t *testing.T) {
		bridgeInit()
		bridgeShutdown()
	})
}

func TestEserAjanFree(t *testing.T) {
	t.Run("does not panic on nil", func(t *testing.T) {
		EserAjanFree(nil)
	})
}

func TestBridgeConfigLoad(t *testing.T) {
	t.Run("returns empty values for no sources", func(t *testing.T) {
		got := bridgeConfigLoad(`{"sources":[]}`)
		if got != `{"values":{}}` {
			t.Errorf("bridgeConfigLoad() = %q, want %q", got, `{"values":{}}`)
		}
	})

	t.Run("returns error for invalid JSON", func(t *testing.T) {
		got := bridgeConfigLoad("not-json")
		var resp struct {
			Error string `json:"error"`
		}
		if err := json.Unmarshal([]byte(got), &resp); err != nil || resp.Error == "" {
			t.Errorf("bridgeConfigLoad() should return error JSON for invalid input, got %q", got)
		}
	})
}

func TestBridgeDIResolve(t *testing.T) {
	t.Run("returns null string", func(t *testing.T) {
		got := bridgeDIResolve("SomeService")
		if got != "null" {
			t.Errorf("bridgeDIResolve() = %q, want %q", got, "null")
		}
	})
}

func TestBridgeWorkflowRun(t *testing.T) {
	t.Parallel()

	t.Run("returns error when event is missing", func(t *testing.T) {
		t.Parallel()
		got := bridgeWorkflowRun(`{"workflows":[]}`)
		var resp workflowRunResponse
		if err := json.Unmarshal([]byte(got), &resp); err != nil {
			t.Fatalf("unmarshal response: %v", err)
		}
		if resp.Error == "" {
			t.Error("expected error when event is missing")
		}
	})

	t.Run("returns error for invalid JSON", func(t *testing.T) {
		t.Parallel()
		got := bridgeWorkflowRun("not-json")
		var resp workflowRunResponse
		if err := json.Unmarshal([]byte(got), &resp); err != nil {
			t.Fatalf("unmarshal response: %v", err)
		}
		if resp.Error == "" {
			t.Error("expected error for invalid JSON input")
		}
	})

	t.Run("runs shell step and returns results", func(t *testing.T) {
		t.Parallel()
		req := `{
			"event": "test",
			"workflows": [{
				"id": "test-wf",
				"on": ["test"],
				"steps": [{
					"name": "shell",
					"options": {"command": "echo hello"}
				}]
			}]
		}`
		got := bridgeWorkflowRun(req)
		var resp workflowRunResponse
		if err := json.Unmarshal([]byte(got), &resp); err != nil {
			t.Fatalf("unmarshal response: %v", err)
		}
		if resp.Error != "" {
			t.Errorf("unexpected error: %s", resp.Error)
		}
		if len(resp.Results) != 1 {
			t.Fatalf("expected 1 result, got %d", len(resp.Results))
		}
		if !resp.Results[0].Passed {
			t.Error("expected workflow to pass")
		}
	})

	t.Run("runs shell step by workflowId and returns results", func(t *testing.T) {
		t.Parallel()
		req := `{
			"workflowId": "named-wf",
			"workflows": [{
				"id": "named-wf",
				"on": [],
				"steps": [{
					"name": "shell",
					"options": {"command": "echo named"}
				}]
			}]
		}`
		got := bridgeWorkflowRun(req)
		var resp workflowRunResponse
		if err := json.Unmarshal([]byte(got), &resp); err != nil {
			t.Fatalf("unmarshal response: %v", err)
		}
		if resp.Error != "" {
			t.Errorf("unexpected error: %s", resp.Error)
		}
		if len(resp.Results) != 1 {
			t.Fatalf("expected 1 result, got %d", len(resp.Results))
		}
		if !resp.Results[0].Passed {
			t.Error("expected named-workflow to pass")
		}
	})

	t.Run("reports failure for non-zero exit command", func(t *testing.T) {
		t.Parallel()
		req := `{
			"event": "test",
			"workflows": [{
				"id": "fail-wf",
				"on": ["test"],
				"steps": [{
					"name": "shell",
					"options": {"command": "exit 1"}
				}]
			}]
		}`
		got := bridgeWorkflowRun(req)
		var resp workflowRunResponse
		if err := json.Unmarshal([]byte(got), &resp); err != nil {
			t.Fatalf("unmarshal response: %v", err)
		}
		// Engine returns error (not results) because ContinueOnError defaults to false.
		if resp.Error == "" && (len(resp.Results) == 0 || resp.Results[0].Passed) {
			t.Error("expected workflow failure to be reported")
		}
	})
}

func TestBridgeParsingTokenize(t *testing.T) {
	t.Parallel()

	t.Run("tokenizes identifier using built-in definitions", func(t *testing.T) {
		t.Parallel()
		req := `{"input":"hello"}`
		got := bridgeParsingTokenize(req)
		var resp parsingTokenizeResponse
		if err := json.Unmarshal([]byte(got), &resp); err != nil {
			t.Fatalf("unmarshal: %v", err)
		}
		if resp.Error != "" {
			t.Fatalf("unexpected error: %s", resp.Error)
		}
		if len(resp.Tokens) != 1 || resp.Tokens[0].Kind != "identifier" || resp.Tokens[0].Value != "hello" {
			t.Fatalf("unexpected tokens: %+v", resp.Tokens)
		}
	})

	t.Run("tokenizes with custom definitions", func(t *testing.T) {
		t.Parallel()
		req := `{"input":"42","definitions":[{"name":"num","pattern":"\\d+"}]}`
		got := bridgeParsingTokenize(req)
		var resp parsingTokenizeResponse
		if err := json.Unmarshal([]byte(got), &resp); err != nil {
			t.Fatalf("unmarshal: %v", err)
		}
		if resp.Error != "" {
			t.Fatalf("unexpected error: %s", resp.Error)
		}
		if len(resp.Tokens) != 1 || resp.Tokens[0].Kind != "num" {
			t.Fatalf("unexpected tokens: %+v", resp.Tokens)
		}
	})

	t.Run("returns error for invalid JSON", func(t *testing.T) {
		t.Parallel()
		got := bridgeParsingTokenize("not-json")
		var resp parsingTokenizeResponse
		json.Unmarshal([]byte(got), &resp) //nolint:errcheck
		if resp.Error == "" {
			t.Fatal("expected error for invalid JSON input")
		}
	})
}

func TestBridgeParsingSimpleTokens(t *testing.T) {
	t.Parallel()
	got := bridgeParsingSimpleTokens()
	var resp parsingSimpleTokensResponse
	if err := json.Unmarshal([]byte(got), &resp); err != nil {
		t.Fatalf("unmarshal: %v", err)
	}
	if len(resp.Definitions) == 0 {
		t.Fatal("expected non-empty definitions")
	}
	// Spot-check a few well-known built-in token names
	names := make(map[string]bool, len(resp.Definitions))
	for _, d := range resp.Definitions {
		names[d.Name] = true
	}
	for _, want := range []string{"identifier", "integer", "whitespace"} {
		if !names[want] {
			t.Errorf("missing built-in token %q in SimpleTokens", want)
		}
	}
}
