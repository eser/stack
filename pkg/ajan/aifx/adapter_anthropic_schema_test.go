package aifx

import (
	"encoding/json"
	"testing"

	"github.com/anthropics/anthropic-sdk-go"
)

// TestToolSchemaIsNotNestedInsideItself pins the shape the model actually
// receives.
//
// ToolDefinition.Parameters is a whole JSON Schema document, but the SDK's
// ToolInputSchemaParam.Properties is the schema's *inner* properties map.
// Assigning the document to it nested the schema inside itself: the model was
// told the tool had properties named "type", "properties" and "required", and
// was given no required list at all — so every argument looked optional.
func TestToolSchemaIsNotNestedInsideItself(t *testing.T) {
	t.Parallel()

	model := &AnthropicModel{} //nolint:exhaustruct

	tools := model.mapToolDefinitions([]ToolDefinition{{
		Name:        "get_weather",
		Description: "current weather",
		Parameters: json.RawMessage(`{
			"type": "object",
			"properties": {"city": {"type": "string"}},
			"required": ["city"],
			"additionalProperties": false
		}`),
	}})

	if len(tools) != 1 || tools[0].OfTool == nil {
		t.Fatalf("mapToolDefinitions produced %+v", tools)
	}

	schema := tools[0].OfTool.InputSchema

	properties, ok := schema.Properties.(map[string]any)
	if !ok {
		t.Fatalf("properties is %T, want the inner property map", schema.Properties)
	}

	if _, present := properties["city"]; !present {
		t.Fatalf("the tool's own property is missing: %v", properties)
	}

	// The document's own keys must NOT appear as properties. Their presence is
	// the nesting bug.
	for _, leaked := range []string{"type", "properties", "required", "additionalProperties"} {
		if _, present := properties[leaked]; present {
			t.Fatalf(
				"schema document key %q leaked in as a tool property: %v",
				leaked, properties,
			)
		}
	}

	if len(schema.Required) != 1 || schema.Required[0] != "city" {
		t.Fatalf("required = %v, want [city]; without it every argument is optional", schema.Required)
	}
}

// TestToolSchemaWithoutRequiredIsAccepted guards the fix from over-reaching: a
// schema with no required list is legal and must not fail or fabricate one.
func TestToolSchemaWithoutRequiredIsAccepted(t *testing.T) {
	t.Parallel()

	model := &AnthropicModel{} //nolint:exhaustruct

	tools := model.mapToolDefinitions([]ToolDefinition{{
		Name:        "ping",
		Description: "no arguments",
		Parameters:  json.RawMessage(`{"type":"object","properties":{}}`),
	}})

	if got := tools[0].OfTool.InputSchema.Required; len(got) != 0 {
		t.Fatalf("required = %v, want empty", got)
	}
}

func TestSchemaRequiredIgnoresNonStrings(t *testing.T) {
	t.Parallel()

	got := schemaRequired(map[string]any{"required": []any{"a", 7, "b", nil}})

	if len(got) != 2 || got[0] != "a" || got[1] != "b" {
		t.Fatalf("schemaRequired = %v, want [a b]", got)
	}

	if schemaRequired(map[string]any{}) != nil {
		t.Fatal("a schema with no required list produced a non-nil slice")
	}
}

// TestToolCallEmitterDoesNotEndTheStream pins the single-done property.
//
// A message_done emitted from inside the read loop latches StreamIterator
// (iter.done = true), so the error event raised after the loop for a late
// stream failure is never delivered — a stream that failed after its final
// delta was reported as a clean success. There is now exactly one done, emitted
// after stream.Err() has been checked.
//
// It also removes the arithmetic that doubled output tokens: with one emit site
// reading only the accumulated message, there is nowhere left to add a delta's
// usage on top of the usage the SDK already assigned.
func TestToolCallEmitterDoesNotEndTheStream(t *testing.T) {
	t.Parallel()

	model := &AnthropicModel{} //nolint:exhaustruct

	// A real tool_use block, so the emitter's loop body actually runs.
	//
	// This previously passed an empty Message: Content was nil, the range in
	// emitAccumulatedToolCalls never executed, nothing was ever written to
	// eventCh, and the "did not end the stream" assertion below held no matter
	// what the emitter did. The test could not fail.
	accumulated := anthropic.Message{} //nolint:exhaustruct
	accumulated.Usage.InputTokens = 25
	accumulated.Usage.OutputTokens = 57
	accumulated.Content = []anthropic.ContentBlockUnion{
		{ //nolint:exhaustruct
			Type:  "tool_use",
			ID:    "toolu_01",
			Name:  "get_weather",
			Input: json.RawMessage(`{"city":"Istanbul"}`),
		},
	}

	eventCh := make(chan StreamEvent, 8)

	model.emitAccumulatedToolCalls(t.Context(), &accumulated, eventCh)

	close(eventCh)

	sawToolCall := false

	for event := range eventCh {
		if event.Type == StreamEventToolCallDelta {
			sawToolCall = true
		}

		if event.Type == StreamEventMessageDone {
			t.Fatal(
				"the tool-call emitter ended the stream; a done here latches the " +
					"iterator and swallows any late stream error",
			)
		}
	}

	// Guards the assertion above against becoming vacuous again. If the emitter
	// stops producing anything -- an empty fixture, an early return, a changed
	// block type -- the loop has nothing to inspect and "no done was emitted"
	// becomes trivially true. This makes that failure loud.
	if !sawToolCall {
		t.Fatal("no tool call was emitted; the assertion above proved nothing")
	}
}

// TestAccumulatedUsageIsNotDoubled pins the figure the single done reports.
func TestAccumulatedUsageIsNotDoubled(t *testing.T) {
	t.Parallel()

	// The state after Accumulate has applied the final delta: the SDK REPLACES
	// usage, so this already holds the delta's figure.
	accumulated := anthropic.Message{} //nolint:exhaustruct
	accumulated.Usage.InputTokens = 25
	accumulated.Usage.OutputTokens = 57

	usage := newAnthropicUsage(
		accumulated.Usage.InputTokens,
		accumulated.Usage.OutputTokens,
	)

	if usage.OutputTokens != 57 {
		t.Fatalf("output tokens = %d, want 57 (114 means a delta was added twice)",
			usage.OutputTokens)
	}

	if usage.TotalTokens != 82 {
		t.Fatalf("total tokens = %d, want 82", usage.TotalTokens)
	}
}

// TestToolSchemaCarriesTheRestOfTheDocument pins that keys with no dedicated
// SDK field still reach the model.
//
// Only "properties" and "required" have fields on ToolInputSchemaParam.
// Everything else at the top level had nowhere to go and was dropped, so a tool
// declared with `additionalProperties: false` was described to the model as
// accepting anything at all.
//
// The assertion marshals the real param, because ExtraFields is tagged json:"-"
// and only reaches the wire through the SDK's MarshalWithExtras — reading the
// struct field would pass even if it never got serialized.
func TestToolSchemaCarriesTheRestOfTheDocument(t *testing.T) {
	t.Parallel()

	model := &AnthropicModel{} //nolint:exhaustruct

	tools := model.mapToolDefinitions([]ToolDefinition{{
		Name:        "get_weather",
		Description: "current weather",
		Parameters: json.RawMessage(`{
			"type": "object",
			"properties": {"city": {"type": "string"}},
			"required": ["city"],
			"additionalProperties": false,
			"$defs": {"unit": {"enum": ["c", "f"]}},
			"description": "weather args"
		}`),
	}})

	encoded, err := json.Marshal(tools[0].OfTool.InputSchema)
	if err != nil {
		t.Fatalf("marshal input schema: %v", err)
	}

	var wire map[string]any
	if err := json.Unmarshal(encoded, &wire); err != nil {
		t.Fatalf("input schema is not an object: %v", err)
	}

	if wire["additionalProperties"] != false {
		t.Fatalf("additionalProperties was dropped: %s", encoded)
	}

	if _, present := wire["$defs"]; !present {
		t.Fatalf("$defs was dropped: %s", encoded)
	}

	if wire["description"] != "weather args" {
		t.Fatalf("description was dropped: %s", encoded)
	}

	// The dedicated fields must still be there.
	if wire["type"] != "object" {
		t.Fatalf("type = %v, want object: %s", wire["type"], encoded)
	}

	properties, ok := wire["properties"].(map[string]any)
	if !ok || properties["city"] == nil {
		t.Fatalf("properties lost its own key: %s", encoded)
	}
}

// TestToolSchemaTypeIsNotOverridable pins the one key that must never come from
// the document.
//
// ToolInputSchemaParam.Type is a constant that always marshals as "object", but
// an ExtraFields entry of the same name OVERRIDES it rather than duplicating it
// (verified against the SDK's MarshalWithExtras). So a schema declaring
// "type":"array" would emit an input_schema the API rejects — a well-formed
// request replaced by a malformed one.
func TestToolSchemaTypeIsNotOverridable(t *testing.T) {
	t.Parallel()

	model := &AnthropicModel{} //nolint:exhaustruct

	tools := model.mapToolDefinitions([]ToolDefinition{{
		Name:        "odd",
		Description: "a schema that lies about its type",
		Parameters:  json.RawMessage(`{"type":"array","properties":{}}`),
	}})

	encoded, err := json.Marshal(tools[0].OfTool.InputSchema)
	if err != nil {
		t.Fatalf("marshal input schema: %v", err)
	}

	var wire map[string]any
	if err := json.Unmarshal(encoded, &wire); err != nil {
		t.Fatalf("input schema is not an object: %v", err)
	}

	if wire["type"] != "object" {
		t.Fatalf("type = %v; the document overrode the SDK constant: %s",
			wire["type"], encoded)
	}
}
