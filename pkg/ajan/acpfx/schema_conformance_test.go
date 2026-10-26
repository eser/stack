package acpfx_test

import (
	"bytes"
	"encoding/json"
	"os"
	"testing"

	"github.com/santhosh-tekuri/jsonschema/v6"

	"github.com/eser/stack/pkg/ajan/acpfx"
)

// This file is the structural half of ACP conformance.
//
// The fake agent in spawn_test.go proves the client agrees with *itself*: I
// wrote both ends, so a misreading of the spec would be reproduced identically
// on both sides and every test would still pass. The vendored schema is the
// independent authority -- it is the published contract, pinned at v1.6.0, and
// it is what a real agent validates against.
//
// What this cannot cover is behaviour: whether updates really precede the
// prompt response, whether cancel really yields stopReason "cancelled". Those
// need a live agent, and are deliberately left to the end-to-end pass.

const schemaResource = "acp.json"

// compileDef compiles one definition out of the vendored schema.
func compileDef(t *testing.T, def string) *jsonschema.Schema {
	t.Helper()

	raw, err := os.ReadFile("schema/schema.json")
	if err != nil {
		t.Fatalf("read vendored schema: %v", err)
	}

	doc, err := jsonschema.UnmarshalJSON(bytes.NewReader(raw))
	if err != nil {
		t.Fatalf("parse vendored schema: %v", err)
	}

	compiler := jsonschema.NewCompiler()

	if err := compiler.AddResource(schemaResource, doc); err != nil {
		t.Fatalf("add schema resource: %v", err)
	}

	sch, err := compiler.Compile(schemaResource + "#/$defs/" + def)
	if err != nil {
		t.Fatalf("compile %s: %v", def, err)
	}

	return sch
}

// validateAgainst marshals value the way the wire would and validates the
// result against the named schema definition.
func validateAgainst(t *testing.T, def string, value any) {
	t.Helper()

	encoded, err := json.Marshal(value)
	if err != nil {
		t.Fatalf("marshal %s: %v", def, err)
	}

	inst, err := jsonschema.UnmarshalJSON(bytes.NewReader(encoded))
	if err != nil {
		t.Fatalf("reparse %s: %v", def, err)
	}

	if err := compileDef(t, def).Validate(inst); err != nil {
		t.Fatalf("%s does not satisfy the published schema:\n%v\npayload: %s", def, err, encoded)
	}
}

// TestOutboundPayloadsMatchSchema validates every client -> agent message.
//
// A field we name wrong, or a required field dropped by omitempty, is rejected
// by a real agent mid-session. Here it fails at build time instead.
func TestOutboundPayloadsMatchSchema(t *testing.T) {
	t.Parallel()

	cases := []struct {
		value any
		name  string
		def   string
	}{
		{
			name: "initialize",
			def:  "InitializeRequest",
			value: &acpfx.InitializeRequest{
				ProtocolVersion: acpfx.ProtocolVersion,
				ClientInfo: &acpfx.Implementation{
					Name: "eserstack", Title: "eserstack", Version: "1.0.0",
				},
				ClientCapabilities: acpfx.ClientCapabilities{
					Fs:       acpfx.FileSystemCapability{ReadTextFile: true, WriteTextFile: true},
					Terminal: true,
				},
			},
		},
		{
			name: "initialize minimal",
			def:  "InitializeRequest",
			value: &acpfx.InitializeRequest{ //nolint:exhaustruct
				ProtocolVersion: acpfx.ProtocolVersion,
			},
		},
		{
			name:  "authenticate",
			def:   "AuthenticateRequest",
			value: &acpfx.AuthenticateRequest{MethodID: "oauth"},
		},
		{
			name: "session/new",
			def:  "NewSessionRequest",
			value: &acpfx.NewSessionRequest{
				Cwd:                   "/work",
				McpServers:            []acpfx.McpServer{},
				AdditionalDirectories: []string{"/extra"},
			},
		},
		{
			name: "session/load",
			def:  "LoadSessionRequest",
			value: &acpfx.LoadSessionRequest{ //nolint:exhaustruct
				SessionID:  "sess-1",
				Cwd:        "/work",
				McpServers: []acpfx.McpServer{},
			},
		},
		{
			name: "session/prompt",
			def:  "PromptRequest",
			value: &acpfx.PromptRequest{
				SessionID: "sess-1",
				Prompt:    []acpfx.ContentBlock{acpfx.TextBlock("hello")},
			},
		},
		{
			name:  "session/cancel",
			def:   "CancelNotification",
			value: &acpfx.CancelNotification{SessionID: "sess-1"},
		},
		{
			name:  "session/set_mode",
			def:   "SetSessionModeRequest",
			value: &acpfx.SetSessionModeRequest{SessionID: "sess-1", ModeID: "plan"},
		},
		{
			name:  "permission selected",
			def:   "RequestPermissionResponse",
			value: &acpfx.RequestPermissionResponse{Outcome: acpfx.SelectOption("opt-1")},
		},
		{
			name:  "permission cancelled",
			def:   "RequestPermissionResponse",
			value: &acpfx.RequestPermissionResponse{Outcome: acpfx.CancelPermission()},
		},
		{
			name:  "text content block",
			def:   "ContentBlock",
			value: acpfx.TextBlock("hello"),
		},
		// The agent half emits these. They belong here because ToolCall is
		// tagged "-" and reassembled by hand in both directions: encoding is
		// where that can silently lose every field of a tool call, and only a
		// schema check catches an update that names a call it never describes.
		{
			name: "session/update agent message chunk",
			def:  "SessionNotification",
			value: &acpfx.SessionNotification{
				SessionID: "sess-1",
				Update: acpfx.SessionUpdate{ //nolint:exhaustruct
					SessionUpdate: acpfx.UpdateAgentMessageChunk,
					Content:       &acpfx.ContentBlock{Type: acpfx.ContentBlockText, Text: "hi"}, //nolint:exhaustruct
				},
			},
		},
		{
			name: "session/update tool call",
			def:  "SessionNotification",
			value: &acpfx.SessionNotification{
				SessionID: "sess-1",
				Update: acpfx.SessionUpdate{ //nolint:exhaustruct
					SessionUpdate: acpfx.UpdateToolCall,
					ToolCall: &acpfx.ToolCall{ //nolint:exhaustruct
						ToolCallID: "call-1",
						Title:      "Write file",
						Kind:       "edit",
						Status:     acpfx.ToolCallPending,
					},
				},
			},
		},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			t.Parallel()

			validateAgainst(t, tc.def, tc.value)
		})
	}
}

// TestInboundFixturesMatchSchemaAndDecode covers the agent -> client direction.
//
// Each fixture is validated against the published schema *first*, so a fixture
// that encodes my own misreading is rejected before it can prop up a passing
// decode. Only then is it decoded, and the fields we depend on asserted.
func TestInboundFixturesMatchSchemaAndDecode(t *testing.T) {
	t.Parallel()

	t.Run("initialize response", func(t *testing.T) {
		t.Parallel()

		fixture := `{
			"protocolVersion": 1,
			"agentInfo": {"name": "gemini", "version": "0.1.0"},
			"agentCapabilities": {
				"loadSession": true,
				"promptCapabilities": {"image": true, "embeddedContext": true}
			},
			"authMethods": [{"id": "oauth", "name": "OAuth"}]
		}`

		requireValid(t, "InitializeResponse", fixture)

		var resp acpfx.InitializeResponse
		decodeInto(t, fixture, &resp)

		if resp.ProtocolVersion != acpfx.ProtocolVersion {
			t.Fatalf("protocolVersion = %d, want %d", resp.ProtocolVersion, acpfx.ProtocolVersion)
		}

		if !resp.AgentCapabilities.LoadSession {
			t.Fatal("loadSession did not decode")
		}

		if !resp.AgentCapabilities.Prompt.Image {
			t.Fatal("promptCapabilities.image did not decode")
		}

		if len(resp.AuthMethods) != 1 || resp.AuthMethods[0].ID != "oauth" {
			t.Fatalf("authMethods = %+v", resp.AuthMethods)
		}
	})

	t.Run("agent message chunk", func(t *testing.T) {
		t.Parallel()

		fixture := `{
			"sessionId": "sess-1",
			"update": {
				"sessionUpdate": "agent_message_chunk",
				"content": {"type": "text", "text": "hello"}
			}
		}`

		requireValid(t, "SessionNotification", fixture)

		var note acpfx.SessionNotification
		decodeInto(t, fixture, &note)

		if note.Update.SessionUpdate != acpfx.UpdateAgentMessageChunk {
			t.Fatalf("kind = %q", note.Update.SessionUpdate)
		}

		if note.Update.Content == nil || note.Update.Content.Text != "hello" {
			t.Fatalf("content = %+v", note.Update.Content)
		}
	})

	t.Run("tool call", func(t *testing.T) {
		t.Parallel()

		fixture := `{
			"sessionId": "sess-1",
			"update": {
				"sessionUpdate": "tool_call",
				"toolCallId": "call-1",
				"title": "Read file",
				"kind": "read",
				"status": "pending"
			}
		}`

		requireValid(t, "SessionNotification", fixture)

		var note acpfx.SessionNotification
		decodeInto(t, fixture, &note)

		if note.Update.ToolCall == nil {
			t.Fatal("tool_call did not populate ToolCall")
		}

		if note.Update.ToolCall.ToolCallID != "call-1" {
			t.Fatalf("toolCallId = %q", note.Update.ToolCall.ToolCallID)
		}

		if note.Update.ToolCall.Kind != "read" {
			t.Fatalf("kind = %q -- this is the read/write signal the durability split needs",
				note.Update.ToolCall.Kind)
		}
	})

	t.Run("permission request", func(t *testing.T) {
		t.Parallel()

		fixture := `{
			"sessionId": "sess-1",
			"toolCall": {"toolCallId": "call-1", "title": "Write file", "kind": "edit"},
			"options": [
				{"optionId": "yes", "name": "Allow", "kind": "allow_once"},
				{"optionId": "no", "name": "Reject", "kind": "reject_once"}
			]
		}`

		requireValid(t, "RequestPermissionRequest", fixture)

		var req acpfx.RequestPermissionRequest
		decodeInto(t, fixture, &req)

		if req.ToolCall.ToolCallID != "call-1" {
			t.Fatalf("toolCallId = %q -- Cancel needs it to answer outstanding prompts",
				req.ToolCall.ToolCallID)
		}

		if len(req.Options) != 2 || req.Options[0].Kind != acpfx.PermissionAllowOnce {
			t.Fatalf("options = %+v", req.Options)
		}
	})

	t.Run("prompt response stop reasons", func(t *testing.T) {
		t.Parallel()

		for _, reason := range []acpfx.StopReason{
			acpfx.StopReasonEndTurn, acpfx.StopReasonMaxTokens,
			acpfx.StopReasonMaxTurnRequests, acpfx.StopReasonRefusal,
			acpfx.StopReasonCancelled,
		} {
			fixture := `{"stopReason": "` + string(reason) + `"}`

			// A stop reason we invented would be rejected by the enum here.
			requireValid(t, "PromptResponse", fixture)

			var resp acpfx.PromptResponse
			decodeInto(t, fixture, &resp)

			if resp.StopReason != reason {
				t.Fatalf("stopReason = %q, want %q", resp.StopReason, reason)
			}
		}
	})
}

// TestUnknownSessionUpdateVariantIsPreserved pins forward compatibility.
//
// An agent on a newer point release may send a variant this package predates.
// Dropping the connection over one would take down a working session, so the
// decode must survive and keep the payload reachable.
func TestUnknownSessionUpdateVariantIsPreserved(t *testing.T) {
	t.Parallel()

	fixture := `{
		"sessionId": "sess-1",
		"update": {"sessionUpdate": "some_future_variant", "somethingNew": {"a": 1}}
	}`

	var note acpfx.SessionNotification
	decodeInto(t, fixture, &note)

	if note.Update.SessionUpdate != "some_future_variant" {
		t.Fatalf("kind = %q", note.Update.SessionUpdate)
	}

	if !bytes.Contains(note.Update.Raw, []byte("somethingNew")) {
		t.Fatalf("Raw dropped the unmodelled payload: %s", note.Update.Raw)
	}
}

func requireValid(t *testing.T, def, fixture string) {
	t.Helper()

	inst, err := jsonschema.UnmarshalJSON(bytes.NewReader([]byte(fixture)))
	if err != nil {
		t.Fatalf("parse fixture: %v", err)
	}

	if err := compileDef(t, def).Validate(inst); err != nil {
		t.Fatalf("fixture is not a valid %s -- the test's own assumption is wrong:\n%v", def, err)
	}
}

func decodeInto(t *testing.T, fixture string, target any) {
	t.Helper()

	if err := json.Unmarshal([]byte(fixture), target); err != nil {
		t.Fatalf("decode: %v", err)
	}
}
