package main

import (
	"encoding/base64"
	"encoding/json"
	"testing"

	"github.com/eser/stack/pkg/ajan/aifx"
)

// These tests pin the AI generation wire contract: the JSON TypeScript emits in
// ajan-bridge.ts must decode into the aifx options Go actually calls providers
// with.
//
// The contract had no tests, and it showed. Everything below was silently lost
// in transit: an unknown JSON key is discarded by encoding/json without error,
// so each loss presented as a model that ignored an instruction rather than as
// a transport that never delivered it.

// wireRequest is the payload buildOptionsJSON produces, written out here as
// literal JSON rather than built from Go structs. A test that constructed the
// request through the same types it verifies would pass no matter what the key
// names were -- and wrong key names are exactly the defect this guards.
const wireRequest = `{
  "messages": [
    {"role": "user", "content": [
      {"type": "text", "text": "look at this"},
      {"type": "image", "image": {"mimeType": "image/png", "detail": "high", "data": "aGVsbG8="}},
      {"type": "audio", "audio": {"mimeType": "audio/mp3", "data": "d29ybGQ="}},
      {"type": "file", "file": {"uri": "gs://bucket/x", "mimeType": "text/plain"}}
    ]},
    {"role": "assistant", "content": [
      {"type": "tool_call", "toolCall": {"id": "tc-1", "name": "get_weather", "arguments": {"city": "Ankara"}}}
    ]},
    {"role": "user", "content": [
      {"type": "tool_result", "toolResult": {"toolCallId": "tc-1", "content": "17C", "isError": false}}
    ]}
  ],
  "system": "be brief",
  "maxTokens": 512,
  "toolChoice": "required",
  "tools": [{"name": "get_weather", "description": "current weather", "parameters": {"type": "object"}}],
  "temperature": 0,
  "topP": 0.9,
  "stopWords": ["END"],
  "responseFormat": {"type": "json_schema", "name": "reply", "jsonSchema": {"type": "object"}},
  "thinkingBudget": 2048,
  "safetySettings": [{"category": "HARM_CATEGORY_HARASSMENT", "threshold": "BLOCK_NONE"}],
  "extensions": {"vendorFlag": true}
}`

func decodeWireRequest(t *testing.T) *aifx.GenerateTextOptions {
	t.Helper()

	opts, err := parseGenerateRequest(wireRequest)
	if err != nil {
		t.Fatalf("parseGenerateRequest: %v", err)
	}

	return opts
}

// TestWireCarriesEveryGenerationOption pins the eight options that used to be
// dropped. Only messages, system, maxTokens and toolChoice crossed.
func TestWireCarriesEveryGenerationOption(t *testing.T) {
	opts := decodeWireRequest(t)

	if opts.System != "be brief" || opts.MaxTokens != 512 {
		t.Fatalf("system/maxTokens = %q/%d", opts.System, opts.MaxTokens)
	}

	if opts.ToolChoice != aifx.ToolChoiceRequired {
		t.Fatalf("toolChoice = %q", opts.ToolChoice)
	}

	// Temperature is a POINTER on purpose, and this fixture sends 0. A
	// non-pointer field, or a `?? 0` default on the TS side, makes "unset" and
	// "deliberately zero" the same value -- and zero is a real setting.
	if opts.Temperature == nil || *opts.Temperature != 0 {
		t.Fatalf("temperature = %v, want a pointer to 0", opts.Temperature)
	}

	if opts.TopP == nil || *opts.TopP != 0.9 {
		t.Fatalf("topP = %v", opts.TopP)
	}

	if opts.ThinkingBudget == nil || *opts.ThinkingBudget != 2048 {
		t.Fatalf("thinkingBudget = %v", opts.ThinkingBudget)
	}

	if len(opts.StopWords) != 1 || opts.StopWords[0] != "END" {
		t.Fatalf("stopWords = %v", opts.StopWords)
	}

	if opts.ResponseFormat == nil || opts.ResponseFormat.Type != "json_schema" ||
		opts.ResponseFormat.Name != "reply" {
		t.Fatalf("responseFormat = %+v", opts.ResponseFormat)
	}

	if len(opts.ResponseFormat.JSONSchema) == 0 {
		t.Fatal("responseFormat.jsonSchema was dropped")
	}

	if len(opts.SafetySettings) != 1 ||
		opts.SafetySettings[0].Category != "HARM_CATEGORY_HARASSMENT" {
		t.Fatalf("safetySettings = %+v", opts.SafetySettings)
	}

	if opts.Extensions["vendorFlag"] != true {
		t.Fatalf("extensions = %v", opts.Extensions)
	}
}

// TestWireCarriesToolDefinitions pins the request half of tool calling. Without
// tools the model is never told the tools exist, so it cannot call one however
// well the response side works.
func TestWireCarriesToolDefinitions(t *testing.T) {
	opts := decodeWireRequest(t)

	if len(opts.Tools) != 1 {
		t.Fatalf("tools = %+v, want one definition", opts.Tools)
	}

	tool := opts.Tools[0]
	if tool.Name != "get_weather" || tool.Description != "current weather" {
		t.Fatalf("tool = %+v", tool)
	}

	// Parameters is the JSON Schema. json.RawMessage rather than []byte: []byte
	// would demand a base64 string and reject the object TS sends.
	var schema map[string]any
	if err := json.Unmarshal(tool.Parameters, &schema); err != nil {
		t.Fatalf("tool parameters are not a JSON object: %v", err)
	}

	if schema["type"] != "object" {
		t.Fatalf("tool parameters = %v", schema)
	}
}

// TestWireCarriesToolCallsAndResults pins conversation history containing tool
// use. Without it a multi-turn tool exchange cannot be replayed to the model:
// the assistant's call and the result both vanished, so the model saw a user
// turn answering a question it never asked.
func TestWireCarriesToolCallsAndResults(t *testing.T) {
	opts := decodeWireRequest(t)

	if len(opts.Messages) != 3 {
		t.Fatalf("got %d messages, want 3", len(opts.Messages))
	}

	assistant := opts.Messages[1]
	if len(assistant.Content) != 1 {
		t.Fatalf("assistant content = %+v", assistant.Content)
	}

	call := assistant.Content[0]
	if call.Type != aifx.ContentBlockToolCall || call.ToolCall == nil {
		t.Fatalf("assistant block = %+v", call)
	}

	if call.ToolCall.ID != "tc-1" || call.ToolCall.Name != "get_weather" {
		t.Fatalf("tool call = %+v", call.ToolCall)
	}

	var args map[string]any
	if err := json.Unmarshal(call.ToolCall.Arguments, &args); err != nil {
		t.Fatalf("tool call arguments are not JSON: %v", err)
	}

	if args["city"] != "Ankara" {
		t.Fatalf("tool call arguments = %v", args)
	}

	result := opts.Messages[2].Content[0]
	if result.Type != aifx.ContentBlockToolResult || result.ToolResult == nil {
		t.Fatalf("tool result block = %+v", result)
	}

	if result.ToolResult.ToolCallID != "tc-1" || result.ToolResult.Content != "17C" {
		t.Fatalf("tool result = %+v", result.ToolResult)
	}
}

// TestWireCarriesBinaryPayloads pins multimodal content.
//
// Image, audio and file blocks used to arrive as `{"type":"image"}` with no
// payload, so the model was asked to describe a picture it was never sent and
// answered confidently about nothing.
func TestWireCarriesBinaryPayloads(t *testing.T) {
	opts := decodeWireRequest(t)

	blocks := opts.Messages[0].Content
	if len(blocks) != 4 {
		t.Fatalf("got %d blocks, want text + image + audio + file", len(blocks))
	}

	image := blocks[1]
	if image.Type != aifx.ContentBlockImage || image.Image == nil {
		t.Fatalf("image block = %+v", image)
	}

	if string(image.Image.Data) != "hello" {
		t.Fatalf("image data = %q, want the decoded base64", string(image.Image.Data))
	}

	if image.Image.MIMEType != "image/png" || image.Image.Detail != aifx.ImageDetailHigh {
		t.Fatalf("image part = %+v", image.Image)
	}

	audio := blocks[2]
	if audio.Type != aifx.ContentBlockAudio || audio.Audio == nil ||
		string(audio.Audio.Data) != "world" {
		t.Fatalf("audio block = %+v", audio)
	}

	file := blocks[3]
	if file.Type != aifx.ContentBlockFile || file.File == nil ||
		file.File.URI != "gs://bucket/x" {
		t.Fatalf("file block = %+v", file)
	}
}

// TestMalformedBlockIsSkippedNotPanicked pins the nil-payload guard. A block
// naming a kind with nothing in it is a malformed request; forwarding it would
// ask the provider to look at nothing, and dereferencing it would take the
// process down.
func TestMalformedBlockIsSkippedNotPanicked(t *testing.T) {
	opts, err := parseGenerateRequest(`{
      "messages": [{"role": "user", "content": [
        {"type": "image"},
        {"type": "tool_call"},
        {"type": "unheard_of"},
        {"type": "text", "text": "kept"}
      ]}],
      "system": "", "maxTokens": 0, "toolChoice": ""
    }`)
	if err != nil {
		t.Fatalf("parseGenerateRequest: %v", err)
	}

	blocks := opts.Messages[0].Content
	if len(blocks) != 1 || blocks[0].Text != "kept" {
		t.Fatalf("blocks = %+v, want only the well-formed text block", blocks)
	}
}

// TestUnsetOptionsStayUnset guards the pointer fields from the other direction.
//
// TypeScript omits an unset option entirely, so the absence has to survive as
// nil. Defaulting it to a zero value here would silently pin temperature and
// topP to 0 on every request that did not mention them.
func TestUnsetOptionsStayUnset(t *testing.T) {
	opts, err := parseGenerateRequest(
		`{"messages": [], "system": "", "maxTokens": 0, "toolChoice": ""}`,
	)
	if err != nil {
		t.Fatalf("parseGenerateRequest: %v", err)
	}

	if opts.Temperature != nil || opts.TopP != nil || opts.ThinkingBudget != nil {
		t.Fatalf(
			"absent options became values: temperature=%v topP=%v thinkingBudget=%v",
			opts.Temperature, opts.TopP, opts.ThinkingBudget,
		)
	}

	if opts.ResponseFormat != nil || len(opts.Tools) != 0 {
		t.Fatalf("absent responseFormat/tools became values")
	}
}

// TestResponseCarriesToolCalls pins the answer half.
//
// A tool call used to be flattened to {"type":"tool_call","text":"<name>"},
// which names the tool and discards the id and the arguments -- everything a
// caller needs to actually run it.
func TestResponseCarriesToolCalls(t *testing.T) {
	resp := mapGenerateResult(&aifx.GenerateTextResult{ //nolint:exhaustruct
		Content: []aifx.ContentBlock{
			{Type: aifx.ContentBlockText, Text: "calling a tool"}, //nolint:exhaustruct
			{ //nolint:exhaustruct
				Type: aifx.ContentBlockToolCall,
				ToolCall: &aifx.ToolCall{
					ID:        "tc-9",
					Name:      "get_weather",
					Arguments: json.RawMessage(`{"city":"Izmir"}`),
				},
			},
		},
		StopReason: aifx.StopReasonEndTurn,
	})

	if len(resp.Content) != 2 {
		t.Fatalf("content = %+v", resp.Content)
	}

	call := resp.Content[1]
	if call.Type != "tool_call" || call.ID != "tc-9" || call.Name != "get_weather" {
		t.Fatalf("tool call block = %+v", call)
	}

	var args map[string]any
	if err := json.Unmarshal(call.Arguments, &args); err != nil {
		t.Fatalf("arguments are not JSON: %v", err)
	}

	if args["city"] != "Izmir" {
		t.Fatalf("arguments = %v", args)
	}

	// The name must not be smuggled through Text any more: a consumer joining
	// text blocks would splice the tool name into the prose.
	if call.Text != "" {
		t.Fatalf("tool call still carries text %q", call.Text)
	}
}

// TestStreamedToolCallKeepsItsFields pins the streaming half, which stayed
// broken even after the non-streaming path was fixed: the tool's NAME was put
// in textDelta, so a consumer concatenating deltas spliced tool names into the
// answer and never received the arguments.
func TestStreamedToolCallKeepsItsFields(t *testing.T) {
	event := mapStreamEvent(aifx.StreamEvent{ //nolint:exhaustruct
		Type: aifx.StreamEventToolCallDelta,
		ToolCall: &aifx.ToolCall{
			ID:        "tc-3",
			Name:      "search",
			Arguments: json.RawMessage(`{"q":"go"}`),
		},
	})

	if event.Type != "tool_call_delta" {
		t.Fatalf("type = %q", event.Type)
	}

	if event.ToolCallID != "tc-3" || event.ToolCallName != "search" {
		t.Fatalf("event = %+v", event)
	}

	if len(event.ArgumentsDelta) == 0 {
		t.Fatal("argumentsDelta is empty; the arguments never reach the consumer")
	}

	if event.TextDelta != "" {
		t.Fatalf("textDelta = %q; the tool name must not ride in the prose", event.TextDelta)
	}
}

// TestBase64PayloadRoundTrips is a direct check on the encoding both sides
// agreed on, since a mismatch there is invisible until a model sees garbage.
func TestBase64PayloadRoundTrips(t *testing.T) {
	original := []byte{0x00, 0xff, 0x10, 0x89, 0x7f}

	decoded := decodeBase64Payload(base64.StdEncoding.EncodeToString(original))

	if string(decoded) != string(original) {
		t.Fatalf("round trip gave %v, want %v", decoded, original)
	}

	// Absent and undecodable both yield nil rather than failing the request:
	// the URL field is the alternative carrier for the same content.
	if decodeBase64Payload("") != nil || decodeBase64Payload("not base64!!") != nil {
		t.Fatal("a missing or malformed payload should decode to nil")
	}
}
