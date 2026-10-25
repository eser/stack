package aifx

import (
	"encoding/json"
	"strings"
	"testing"
	"time"
)

// The scenarios behind testdata/fixtures. The responses are authored from the
// providers' API references; the requests and outcomes in the fixture files
// were recorded from the vendor SDK implementation (see
// provider_fixtures_test.go).

const (
	fixtureTimeout = 10 * time.Second

	fixtureWeatherSchema = `{
		"type": "object",
		"properties": {"city": {"type": "string"}, "unit": {"$ref": "#/$defs/unit"}},
		"required": ["city"],
		"additionalProperties": false,
		"$defs": {"unit": {"enum": ["c", "f"]}},
		"description": "weather arguments"
	}`

	fixtureAnswerSchema = `{"type":"object","properties":{"answer":{"type":"string"}},"required":["answer"],"additionalProperties":false}`

	// fixturePNG is the PNG signature, enough to stand for image bytes.
	fixturePNG = "\x89PNG\r\n\x1a\n"
)

func fixtureScenarios() []fixtureScenario {
	scenarios := make([]fixtureScenario, 0, 96) //nolint:mnd
	scenarios = append(scenarios, anthropicFixtureScenarios()...)
	scenarios = append(scenarios, openAIFixtureScenarios()...)
	scenarios = append(scenarios, geminiFixtureScenarios()...)
	scenarios = append(scenarios, vertexAIFixtureScenarios()...)

	return scenarios
}

// ---------------------------------------------------------------------------
// Shared options
// ---------------------------------------------------------------------------

func fixtureFloat(value float64) *float64 { return &value }

func fixtureInt(value int) *int { return &value }

func fixtureTextOptions() *GenerateTextOptions {
	return &GenerateTextOptions{ //nolint:exhaustruct
		System:    "Be brief.",
		Messages:  []Message{NewTextMessage(RoleUser, "Hello")},
		MaxTokens: 256,
	}
}

func fixtureTools() []ToolDefinition {
	return []ToolDefinition{
		{Name: "get_weather", Description: "Current weather for a city", Parameters: json.RawMessage(fixtureWeatherSchema)},
		{Name: "ping", Description: "Takes no arguments", Parameters: nil},
	}
}

func fixtureAnswerFormat() *ResponseFormat {
	return &ResponseFormat{Type: "json_schema", Name: "answer", JSONSchema: []byte(fixtureAnswerSchema)}
}

func fixtureImageBlock(image *ImagePart) ContentBlock {
	return ContentBlock{Type: ContentBlockImage, Image: image} //nolint:exhaustruct
}

func fixtureAudioBlock(audio *AudioPart) ContentBlock {
	return ContentBlock{Type: ContentBlockAudio, Audio: audio} //nolint:exhaustruct
}

func fixtureTextBlock(text string) ContentBlock {
	return ContentBlock{Type: ContentBlockText, Text: text} //nolint:exhaustruct
}

// fixtureFullOptions sets every option aifx exposes, with a conversation that
// carries each content kind, so each provider's mapping of all of them is
// pinned in one request.
func fixtureFullOptions(role Role) *GenerateTextOptions {
	return &GenerateTextOptions{ //nolint:exhaustruct
		System: "Answer as JSON.",
		Messages: []Message{
			NewTextMessage(RoleSystem, "A system message inside the conversation."),
			{Role: RoleUser, Content: []ContentBlock{
				fixtureTextBlock("What is in these images, and what is the weather?"),
				fixtureImageBlock(&ImagePart{URL: "https://example.com/cat.jpg", MIMEType: "", Detail: ImageDetailHigh, Data: nil}),
				fixtureImageBlock(&ImagePart{URL: "https://example.com/dog.png", MIMEType: "image/png", Detail: ImageDetailLow, Data: nil}),
				fixtureImageBlock(&ImagePart{URL: "", MIMEType: "", Detail: "", Data: []byte(fixturePNG)}),
				fixtureImageBlock(&ImagePart{URL: "data:image/jpeg;base64,aGVsbG8=", MIMEType: "", Detail: ImageDetailAuto, Data: nil}),
				fixtureAudioBlock(&AudioPart{URL: "https://example.com/clip.mp3", MIMEType: "", Data: nil}),
				fixtureAudioBlock(&AudioPart{URL: "data:audio/wav;base64,UklGRg==", MIMEType: "audio/wav", Data: nil}),
				fixtureAudioBlock(&AudioPart{URL: "", MIMEType: "audio/wav", Data: []byte("RIFF")}),
				{Type: ContentBlockFile, File: &FilePart{URI: "gs://bucket/report.pdf", MIMEType: ""}}, //nolint:exhaustruct
			}},
			{Role: RoleAssistant, Content: []ContentBlock{
				NewThinkingBlock(ThinkingPart{Text: "Earlier reasoning.", Signature: "sig-0", RedactedData: ""}),
				NewThinkingBlock(ThinkingPart{Text: "", Signature: "", RedactedData: "redacted-0"}),
				NewThinkingBlock(ThinkingPart{Text: "Unsigned reasoning from another provider.", Signature: "", RedactedData: ""}),
				fixtureTextBlock("Let me check."),
				NewToolCallBlock("call_0", "get_weather", json.RawMessage(`{"city": "Ankara"}`)),
			}},
			{Role: role, Content: []ContentBlock{
				NewToolResultBlock("call_0", "18C and sunny", false),
				NewToolResultBlock("call_9", "the service failed", true),
			}},
			NewTextMessage(RoleUser, "Thanks, now Istanbul."),
		},
		Tools:          fixtureTools(),
		ToolChoice:     ToolChoiceRequired,
		Temperature:    fixtureFloat(0.25),
		TopP:           fixtureFloat(0.5),
		MaxTokens:      300,
		StopWords:      []string{"END", "STOP"},
		ResponseFormat: fixtureAnswerFormat(),
		ThinkingBudget: fixtureInt(5000),
		Effort:         EffortHigh,
		SafetySettings: []SafetySetting{
			{Category: "HARM_CATEGORY_HARASSMENT", Threshold: "BLOCK_NONE"},
			{Category: "HARM_CATEGORY_DANGEROUS_CONTENT", Threshold: "BLOCK_ONLY_HIGH"},
		},
	}
}

func jsonReply(status int, body string, headers ...string) fixtureResponse {
	reply := fixtureResponse{
		Headers: map[string]string{"Content-Type": "application/json"},
		Body:    body,
		Status:  status,
		DelayMs: 0,
	}

	for idx := 0; idx+1 < len(headers); idx += 2 {
		reply.Headers[headers[idx]] = headers[idx+1]
	}

	return reply
}

func sseReply(events ...string) fixtureResponse {
	return fixtureResponse{
		Headers: map[string]string{"Content-Type": "text/event-stream"},
		Body:    strings.Join(events, ""),
		Status:  200, //nolint:mnd
		DelayMs: 0,
	}
}

func sseNamed(event, data string) string { return "event: " + event + "\ndata: " + data + "\n\n" }

func sseData(data string) string { return "data: " + data + "\n\n" }

// slowReply holds the reply back longer than the request timeout
// withRequestTimeout sets.
func slowReply() fixtureResponse {
	return fixtureResponse{Headers: nil, Body: "{}", Status: 200, DelayMs: 3000} //nolint:mnd
}

// ---------------------------------------------------------------------------
// Anthropic
// ---------------------------------------------------------------------------

func anthropicFixtureConfig(serverURL string) *ConfigTarget {
	return &ConfigTarget{ //nolint:exhaustruct
		Provider:       "anthropic",
		APIKey:         "test-anthropic-key",
		Model:          "claude-test",
		BaseURL:        serverURL,
		MaxTokens:      1024,
		Temperature:    0.7,
		RequestTimeout: fixtureTimeout,
	}
}

const anthropicTextReply = `{"id":"msg_01","type":"message","role":"assistant","model":"claude-test-20261001",` +
	`"content":[{"type":"text","text":"Hi there."}],"stop_reason":"end_turn","stop_sequence":null,` +
	`"usage":{"input_tokens":12,"output_tokens":4,"cache_read_input_tokens":0}}`

func anthropicError(errType, message string) string {
	return `{"type":"error","error":{"type":"` + errType + `","message":"` + message + `"},"request_id":"req_fixture"}`
}

// withRequestTimeout shortens a scenario's request timeout so a slow reply
// times out.
func withRequestTimeout(scenario *fixtureScenario) fixtureScenario {
	config := scenario.config
	scenario.config = func(serverURL string) *ConfigTarget {
		target := config(serverURL)
		target.RequestTimeout = 200 * time.Millisecond

		return target
	}

	return *scenario
}

func anthropicBatchJSON(id, status string, extra string) string {
	return `{"id":"` + id + `","type":"message_batch","processing_status":"` + status + `",` +
		`"request_counts":{"processing":1,"succeeded":3,"errored":1,"canceled":0,"expired":1},` +
		`"created_at":"2026-10-24T10:00:00Z","expires_at":"2026-10-25T10:00:00Z",` +
		`"cancel_initiated_at":null,"archived_at":null` + extra + `}`
}

func anthropicFixtureScenarios() []fixtureScenario { //nolint:funlen,maintidx // one table
	base := func(name string, call fixtureCall, opts *GenerateTextOptions, replies ...fixtureResponse) fixtureScenario {
		return fixtureScenario{
			env: nil, config: anthropicFixtureConfig, options: opts, batch: nil, setup: nil,
			provider: "anthropic", name: name, call: call, responses: replies,
		}
	}

	rateLimited := jsonReply(429, anthropicError("rate_limit_error", "Number of requests has exceeded your rate limit"),
		"retry-after-ms", "0", "request-id", "req_429")
	overloaded := jsonReply(529, anthropicError("overloaded_error", "Overloaded"), "retry-after-ms", "0")

	toolChoiceNone := &GenerateTextOptions{ //nolint:exhaustruct
		Messages:       []Message{NewTextMessage(RoleUser, "Just talk.")},
		Tools:          fixtureTools()[:1],
		ToolChoice:     ToolChoiceNone,
		ThinkingBudget: fixtureInt(500),
		ResponseFormat: &ResponseFormat{Type: "json_object", Name: "", JSONSchema: nil},
	}

	toolChoiceAuto := &GenerateTextOptions{ //nolint:exhaustruct
		Messages:       []Message{NewTextMessage(RoleUser, "Think hard.")},
		Tools:          fixtureTools()[1:],
		ToolChoice:     ToolChoiceAuto,
		ThinkingBudget: fixtureInt(20000),
		Effort:         EffortDefault,
	}

	effortOnly := &GenerateTextOptions{ //nolint:exhaustruct
		Messages: []Message{NewTextMessage(RoleUser, "Quick.")},
		Effort:   EffortMax,
	}

	batchItems := &BatchRequest{Items: []BatchRequestItem{
		{CustomID: "req-1", Options: *fixtureTextOptions()},
		{CustomID: "req-2", Options: GenerateTextOptions{ //nolint:exhaustruct
			Messages:       []Message{NewTextMessage(RoleUser, "Name this post.")},
			Tools:          fixtureTools(),
			ToolChoice:     ToolChoiceAuto,
			ResponseFormat: fixtureAnswerFormat(),
			Effort:         EffortMedium,
			ThinkingBudget: fixtureInt(3000),
			StopWords:      []string{"END"},
			System:         "Title writer.",
		}},
	}}

	scenarios := []fixtureScenario{ //nolint:prealloc // a table literal, extended below
		base("generate_text", callGenerate, fixtureTextOptions(), jsonReply(200, anthropicTextReply, "request-id", "req_1")),
		base("generate_full_options", callGenerate, fixtureFullOptions(RoleUser), jsonReply(200,
			`{"id":"msg_02","type":"message","role":"assistant","model":"claude-test","content":[`+
				`{"type":"thinking","thinking":"Plan the call.","signature":"sig-1"},`+
				`{"type":"redacted_thinking","data":"redacted-1"},`+
				`{"type":"text","text":"Checking the weather."},`+
				`{"type":"tool_use","id":"toolu_1","name":"get_weather","input":{ "city" : "Istanbul", "unit": "c" }}`+
				`],"stop_reason":"tool_use","stop_sequence":null,"usage":{"input_tokens":120,"output_tokens":45}}`)),
		base("generate_tool_choice_none", callGenerate, toolChoiceNone, jsonReply(200,
			`{"id":"msg_03","type":"message","role":"assistant","model":"claude-test","content":[`+
				`{"type":"text","text":"Cut"}],"stop_reason":"model_context_window_exceeded","stop_sequence":null,`+
				`"usage":{"input_tokens":5,"output_tokens":1}}`)),
		base("generate_tool_choice_auto", callGenerate, toolChoiceAuto, jsonReply(200,
			`{"id":"msg_04","type":"message","role":"assistant","model":"claude-test","content":[`+
				`{"type":"thinking","thinking":"","signature":"sig-empty"},`+
				`{"type":"text","text":"Stopped"}],"stop_reason":"stop_sequence","stop_sequence":"END",`+
				`"usage":{"input_tokens":5,"output_tokens":2}}`)),
		base("generate_effort_refusal", callGenerate, effortOnly, jsonReply(200,
			`{"id":"msg_05","type":"message","role":"assistant","model":"claude-test","content":[`+
				`{"type":"text","text":"I can't help with that."}],"stop_reason":"refusal","stop_sequence":null,`+
				`"usage":{"input_tokens":5,"output_tokens":6}}`)),
		base("generate_max_tokens", callGenerate, fixtureTextOptions(), jsonReply(200,
			`{"id":"msg_06","type":"message","role":"assistant","model":"claude-test","content":[`+
				`{"type":"text","text":"Cut sho"},{"type":"server_tool_use","id":"srvtoolu_1","name":"web_search","input":{}}],`+
				`"stop_reason":"max_tokens","stop_sequence":null,"usage":{"input_tokens":5,"output_tokens":256}}`)),
		base("stream_text", callStream, fixtureTextOptions(), sseReply(
			sseNamed("message_start", `{"type":"message_start","message":{"id":"msg_s1","type":"message","role":"assistant","model":"claude-test","content":[],"stop_reason":null,"stop_sequence":null,"usage":{"input_tokens":11,"output_tokens":1}}}`),
			sseNamed("content_block_start", `{"type":"content_block_start","index":0,"content_block":{"type":"text","text":""}}`),
			sseNamed("ping", `{"type": "ping"}`),
			sseNamed("content_block_delta", `{"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":"Hi"}}`),
			sseNamed("content_block_delta", `{"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":" there."}}`),
			sseNamed("content_block_stop", `{"type":"content_block_stop","index":0}`),
			sseNamed("message_delta", `{"type":"message_delta","delta":{"stop_reason":"end_turn","stop_sequence":null},"usage":{"output_tokens":7}}`),
			sseNamed("message_stop", `{"type":"message_stop"}`),
		)),
		base("stream_tool_call", callStream, fixtureFullOptions(RoleUser), sseReply(
			sseNamed("message_start", `{"type":"message_start","message":{"id":"msg_s2","type":"message","role":"assistant","model":"claude-test","content":[],"stop_reason":null,"stop_sequence":null,"usage":{"input_tokens":30,"output_tokens":1}}}`),
			sseNamed("content_block_start", `{"type":"content_block_start","index":0,"content_block":{"type":"redacted_thinking","data":"redacted-s"}}`),
			sseNamed("content_block_stop", `{"type":"content_block_stop","index":0}`),
			sseNamed("content_block_start", `{"type":"content_block_start","index":1,"content_block":{"type":"thinking","thinking":"","signature":""}}`),
			sseNamed("content_block_delta", `{"type":"content_block_delta","index":1,"delta":{"type":"thinking_delta","thinking":"Need the "}}`),
			sseNamed("content_block_delta", `{"type":"content_block_delta","index":1,"delta":{"type":"thinking_delta","thinking":"weather."}}`),
			sseNamed("content_block_delta", `{"type":"content_block_delta","index":1,"delta":{"type":"signature_delta","signature":"sig-s"}}`),
			sseNamed("content_block_stop", `{"type":"content_block_stop","index":1}`),
			sseNamed("content_block_start", `{"type":"content_block_start","index":2,"content_block":{"type":"text","text":""}}`),
			sseNamed("content_block_delta", `{"type":"content_block_delta","index":2,"delta":{"type":"text_delta","text":"Checking."}}`),
			sseNamed("content_block_stop", `{"type":"content_block_stop","index":2}`),
			sseNamed("content_block_start", `{"type":"content_block_start","index":3,"content_block":{"type":"tool_use","id":"toolu_s","name":"get_weather","input":{}}}`),
			sseNamed("content_block_delta", `{"type":"content_block_delta","index":3,"delta":{"type":"input_json_delta","partial_json":""}}`),
			sseNamed("content_block_delta", `{"type":"content_block_delta","index":3,"delta":{"type":"input_json_delta","partial_json":"{\"city\": \"Ist"}}`),
			sseNamed("content_block_delta", `{"type":"content_block_delta","index":3,"delta":{"type":"input_json_delta","partial_json":"anbul\"}"}}`),
			sseNamed("content_block_stop", `{"type":"content_block_stop","index":3}`),
			sseNamed("content_block_start", `{"type":"content_block_start","index":4,"content_block":{"type":"tool_use","id":"toolu_p","name":"ping","input":{}}}`),
			sseNamed("content_block_stop", `{"type":"content_block_stop","index":4}`),
			sseNamed("message_delta", `{"type":"message_delta","delta":{"stop_reason":"tool_use","stop_sequence":null},"usage":{"input_tokens":32,"output_tokens":40}}`),
			sseNamed("message_stop", `{"type":"message_stop"}`),
		)),
		base("generate_tool_use_without_input", callGenerate, fixtureTextOptions(), jsonReply(200,
			`{"id":"msg_07","type":"message","role":"assistant","model":"claude-test","content":[`+
				`{"type":"tool_use","id":"toolu_7","name":"ping"}],`+
				`"stop_reason":"tool_use","stop_sequence":null,"usage":{"input_tokens":5,"output_tokens":3}}`)),
		base("stream_tool_input_cut_off", callStream, fixtureTextOptions(), sseReply(
			sseNamed("message_start", `{"type":"message_start","message":{"id":"msg_s5","type":"message","role":"assistant","model":"claude-test","content":[],"stop_reason":null,"stop_sequence":null,"usage":{"input_tokens":9,"output_tokens":1}}}`),
			sseNamed("content_block_start", `{"type":"content_block_start","index":0,"content_block":{"type":"tool_use","id":"toolu_c","name":"get_weather","input":{}}}`),
			sseNamed("content_block_delta", `{"type":"content_block_delta","index":0,"delta":{"type":"input_json_delta","partial_json":"{\"city\": \"Ist"}}`),
			sseNamed("content_block_stop", `{"type":"content_block_stop","index":0}`),
			sseNamed("message_delta", `{"type":"message_delta","delta":{"stop_reason":"max_tokens","stop_sequence":null},"usage":{"output_tokens":4}}`),
			sseNamed("message_stop", `{"type":"message_stop"}`),
		)),
		base("stream_error_event", callStream, fixtureTextOptions(), sseReply(
			sseNamed("message_start", `{"type":"message_start","message":{"id":"msg_s3","type":"message","role":"assistant","model":"claude-test","content":[],"stop_reason":null,"stop_sequence":null,"usage":{"input_tokens":11,"output_tokens":1}}}`),
			sseNamed("content_block_start", `{"type":"content_block_start","index":0,"content_block":{"type":"text","text":""}}`),
			sseNamed("content_block_delta", `{"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":"Partial"}}`),
			sseNamed("error", `{"type":"error","error":{"type":"overloaded_error","message":"Overloaded"}}`),
		)),
		base("stream_error_status", callStream, fixtureTextOptions(),
			jsonReply(401, anthropicError("authentication_error", "invalid x-api-key"), "request-id", "req_401")),
		base("stream_truncated", callStream, fixtureTextOptions(), sseReply(
			sseNamed("message_start", `{"type":"message_start","message":{"id":"msg_s4","type":"message","role":"assistant","model":"claude-test","content":[],"stop_reason":null,"stop_sequence":null,"usage":{"input_tokens":11,"output_tokens":1}}}`),
			sseNamed("content_block_delta", `{"type":"content_block_delta","index":5,"delta":{"type":"text_delta","text":"orphan"}}`),
		)),
		base("error_bad_request", callGenerate, fixtureTextOptions(),
			jsonReply(400, anthropicError("invalid_request_error", "max_tokens: field required"), "request-id", "req_400")),
		base("error_not_found", callGenerate, fixtureTextOptions(),
			jsonReply(404, anthropicError("not_found_error", "model: claude-test"))),
		base("error_rate_limited_retries", callGenerate, fixtureTextOptions(), rateLimited, rateLimited, rateLimited),
		base("error_retry_then_success", callGenerate, fixtureTextOptions(), overloaded,
			jsonReply(200, anthropicTextReply)),
		base("error_no_retry_header", callGenerate, fixtureTextOptions(),
			jsonReply(500, anthropicError("api_error", "Internal server error"), "x-should-retry", "false")),
		withRequestTimeout(new(base("error_request_timeout", callGenerate, fixtureTextOptions(),
			slowReply(), slowReply(), slowReply()))),
		base("batch_get", callBatchGet, nil, jsonReply(200, anthropicBatchJSON("batch_123", "ended",
			`,"ended_at":"2026-10-24T11:30:00Z","results_url":"{{server}}/v1/messages/batches/batch_123/results"`))),
		base("batch_list", callBatchList, nil, jsonReply(200, `{"data":[`+
			anthropicBatchJSON("batch_a", "canceling", `,"ended_at":null,"results_url":null`)+`,`+
			anthropicBatchJSON("batch_b", "in_progress", `,"ended_at":null,"results_url":null`)+
			`],"has_more":true,"first_id":"batch_a","last_id":"batch_b"}`)),
		base("batch_results", callBatchResults, nil, fixtureResponse{
			Headers: map[string]string{"Content-Type": "application/binary"},
			Body: `{"custom_id":"req-1","result":{"type":"succeeded","message":` + anthropicTextReply + `}}` + "\n" +
				`{"custom_id":"req-2","result":{"type":"errored","error":{"type":"error","error":{"type":"invalid_request_error","message":"bad"}}}}` + "\n" +
				`{"custom_id":"req-3","result":{"type":"expired"}}` + "\n",
			Status:  200, //nolint:mnd
			DelayMs: 0,
		}),
		base("batch_results_error", callBatchResults, nil, jsonReply(404, anthropicError("not_found_error", "batch not found"))),
		base("batch_cancel", callBatchCancel, nil, jsonReply(200, anthropicBatchJSON("batch_123", "canceling",
			`,"ended_at":null,"results_url":null`))),
		base("batch_cancel_error", callBatchCancel, nil, jsonReply(401, anthropicError("authentication_error", "invalid x-api-key"))),
	}

	submit := base("batch_submit", callBatchSubmit, nil, jsonReply(200, anthropicBatchJSON("msgbatch_2", "in_progress",
		`,"ended_at":null,"results_url":null`)))
	submit.batch = batchItems

	authToken := base("auth_token_from_env", callGenerate, fixtureTextOptions(), jsonReply(200, anthropicTextReply))
	authToken.env = map[string]string{"ANTHROPIC_AUTH_TOKEN": "test-auth-token"}
	authToken.config = func(serverURL string) *ConfigTarget {
		config := anthropicFixtureConfig(serverURL)
		config.APIKey = ""

		return config
	}

	baseURLEnv := base("base_url_from_env", callGenerate, fixtureTextOptions(), jsonReply(200, anthropicTextReply))
	baseURLEnv.env = map[string]string{"ANTHROPIC_BASE_URL": fixtureServerToken + "/proxy/", "ANTHROPIC_AUTH_TOKEN": "ambient"}
	baseURLEnv.config = func(serverURL string) *ConfigTarget {
		config := anthropicFixtureConfig(serverURL)
		config.BaseURL = ""

		return config
	}

	return append(scenarios, submit, authToken, baseURLEnv)
}

// ---------------------------------------------------------------------------
// OpenAI
// ---------------------------------------------------------------------------

func openAIFixtureConfig(serverURL string) *ConfigTarget {
	return &ConfigTarget{ //nolint:exhaustruct
		Provider:       "openai",
		APIKey:         "test-openai-key",
		Model:          "gpt-test",
		BaseURL:        serverURL,
		MaxTokens:      1024,
		Temperature:    0.7,
		RequestTimeout: fixtureTimeout,
	}
}

const openAITextReply = `{"id":"chatcmpl-1","object":"chat.completion","created":1761300000,"model":"gpt-test-2026",` +
	`"choices":[{"index":0,"message":{"role":"assistant","content":"Hi there.","refusal":null},` +
	`"logprobs":null,"finish_reason":"stop"}],"usage":{"prompt_tokens":12,"completion_tokens":4,"total_tokens":16}}`

func openAIError(status, errType, code, message string) string {
	_ = status

	return `{"error":{"message":"` + message + `","type":"` + errType + `","param":null,"code":` + code + `}}`
}

func openAIChunkJSON(delta string, finish string) string {
	return `{"id":"chatcmpl-s1","object":"chat.completion.chunk","created":1761300000,"model":"gpt-test",` +
		`"choices":[{"index":0,"delta":` + delta + `,"logprobs":null,"finish_reason":` + finish + `}]}`
}

func openAIBatchJSON(id, status, extra string) string {
	if !strings.Contains(extra, `"errors"`) {
		extra += `,"errors":null`
	}

	return `{"id":"` + id + `","object":"batch","endpoint":"/v1/chat/completions",` +
		`"input_file_id":"file-in","completion_window":"24h","status":"` + status + `",` +
		`"created_at":1761300000,"request_counts":{"total":4,"completed":2,"failed":1}` + extra + `}`
}

func openAIFixtureScenarios() []fixtureScenario { //nolint:funlen // one table
	base := func(name string, call fixtureCall, opts *GenerateTextOptions, replies ...fixtureResponse) fixtureScenario {
		return fixtureScenario{
			env: nil, config: openAIFixtureConfig, options: opts, batch: nil, setup: nil,
			provider: "openai", name: name, call: call, responses: replies,
		}
	}

	rateLimited := jsonReply(429, openAIError("429", "requests", `"rate_limit_exceeded"`, "Rate limit reached"),
		"retry-after-ms", "0", "x-request-id", "req_429")

	jsonObject := &GenerateTextOptions{ //nolint:exhaustruct
		Messages:       []Message{NewTextMessage(RoleUser, "Refuse this.")},
		Tools:          fixtureTools()[:1],
		ToolChoice:     ToolChoiceNone,
		ThinkingBudget: fixtureInt(20000),
		ResponseFormat: &ResponseFormat{Type: "json_object", Name: "", JSONSchema: nil},
	}

	textFormat := &GenerateTextOptions{ //nolint:exhaustruct
		Messages:       []Message{NewTextMessage(RoleUser, "Filter this.")},
		ToolChoice:     ToolChoiceAuto,
		ThinkingBudget: fixtureInt(500),
		ResponseFormat: &ResponseFormat{Type: "text", Name: "", JSONSchema: nil},
	}

	batchItems := &BatchRequest{Items: []BatchRequestItem{
		{CustomID: "req-1", Options: *fixtureTextOptions()},
		{CustomID: "req-2", Options: GenerateTextOptions{ //nolint:exhaustruct
			Messages:       []Message{NewTextMessage(RoleUser, "Name this post.")},
			Tools:          fixtureTools(),
			ToolChoice:     ToolChoiceRequired,
			ResponseFormat: fixtureAnswerFormat(),
			Effort:         EffortLow,
			Temperature:    fixtureFloat(0),
		}},
	}}

	scenarios := []fixtureScenario{ //nolint:prealloc // a table literal, extended below
		base("generate_text", callGenerate, fixtureTextOptions(), jsonReply(200, openAITextReply)),
		base("generate_full_options", callGenerate, fixtureFullOptions(RoleTool), jsonReply(200,
			`{"id":"chatcmpl-2","object":"chat.completion","created":1761300000,"model":"gpt-test","choices":[{"index":0,`+
				`"message":{"role":"assistant","content":"Checking.","refusal":null,"tool_calls":[`+
				`{"id":"call_1","type":"function","function":{"name":"get_weather","arguments":"{\"city\": \"Istanbul\"}"}},`+
				`{"id":"call_2","type":"function","function":{"name":"ping","arguments":"{}"}}]},`+
				`"logprobs":null,"finish_reason":"tool_calls"}],"usage":{"prompt_tokens":100,"completion_tokens":20,"total_tokens":120,`+
				`"completion_tokens_details":{"reasoning_tokens":12}}}`)),
		base("generate_refusal", callGenerate, jsonObject, jsonReply(200,
			`{"id":"chatcmpl-3","object":"chat.completion","created":1761300000,"model":"gpt-test","choices":[{"index":0,`+
				`"message":{"role":"assistant","content":null,"refusal":"I can't help with that."},`+
				`"logprobs":null,"finish_reason":"stop"}],"usage":{"prompt_tokens":5,"completion_tokens":6,"total_tokens":11}}`)),
		base("generate_content_filter", callGenerate, textFormat, jsonReply(200,
			`{"id":"chatcmpl-4","object":"chat.completion","created":1761300000,"model":"gpt-test","choices":[{"index":0,`+
				`"message":{"role":"assistant","content":""},"finish_reason":"content_filter"}],`+
				`"usage":{"prompt_tokens":5,"completion_tokens":0,"total_tokens":5}}`)),
		base("generate_no_choices", callGenerate, fixtureTextOptions(), jsonReply(200,
			`{"id":"chatcmpl-5","object":"chat.completion","created":1761300000,"model":"gpt-test","choices":[],`+
				`"usage":{"prompt_tokens":5,"completion_tokens":0,"total_tokens":5}}`)),
		base("stream_text", callStream, fixtureTextOptions(), sseReply(
			sseData(openAIChunkJSON(`{"role":"assistant","content":"","refusal":null}`, "null")),
			sseData(openAIChunkJSON(`{"content":"Hi"}`, "null")),
			sseData(openAIChunkJSON(`{"content":" there."}`, "null")),
			sseData(openAIChunkJSON(`{}`, `"stop"`)),
			sseData(`{"id":"chatcmpl-s1","object":"chat.completion.chunk","created":1761300000,"model":"gpt-test","choices":[],"usage":{"prompt_tokens":5,"completion_tokens":3,"total_tokens":8}}`),
			sseData("[DONE]"),
		)),
		base("stream_tool_call", callStream, fixtureFullOptions(RoleTool), sseReply(
			sseData(openAIChunkJSON(`{"role":"assistant","content":null,"tool_calls":[{"index":0,"id":"call_1","type":"function","function":{"name":"get_weather","arguments":""}}]}`, "null")),
			sseData(openAIChunkJSON(`{"tool_calls":[{"index":0,"function":{"arguments":"{\"city\": "}}]}`, "null")),
			sseData(openAIChunkJSON(`{"tool_calls":[{"index":0,"function":{"arguments":"\"Istanbul\"}"}}]}`, "null")),
			sseData(openAIChunkJSON(`{"tool_calls":[{"index":1,"id":"call_2","type":"function","function":{"name":"ping","arguments":"{}"}}]}`, "null")),
			sseData(openAIChunkJSON(`{}`, `"tool_calls"`)),
			sseData("[DONE]"),
		)),
		base("stream_refusal", callStream, jsonObject, sseReply(
			sseData(openAIChunkJSON(`{"role":"assistant","refusal":"I can't "}`, "null")),
			sseData(openAIChunkJSON(`{"refusal":"help with that."}`, "null")),
			sseData(openAIChunkJSON(`{}`, `"stop"`)),
			sseData("[DONE]"),
		)),
		base("stream_error_event", callStream, fixtureTextOptions(), sseReply(
			sseData(openAIChunkJSON(`{"role":"assistant","content":"Partial"}`, "null")),
			sseData(`{"error":{"message":"The server had an error while processing your request.","type":"server_error"}}`),
		)),
		base("stream_error_status", callStream, fixtureTextOptions(),
			jsonReply(401, openAIError("401", "invalid_request_error", `"invalid_api_key"`, "Incorrect API key provided"))),
		base("error_bad_request", callGenerate, fixtureTextOptions(),
			jsonReply(400, openAIError("400", "invalid_request_error", "null", "Unrecognized request argument"), "x-request-id", "req_400")),
		base("error_insufficient_credits", callGenerate, fixtureTextOptions(),
			jsonReply(402, openAIError("402", "billing_error", `"payment_required"`, "Payment required"))),
		base("error_rate_limited_retries", callGenerate, fixtureTextOptions(), rateLimited, rateLimited, rateLimited),
		base("error_retry_then_success", callGenerate, fixtureTextOptions(),
			jsonReply(503, openAIError("503", "server_error", "null", "Service unavailable"), "retry-after", "0"),
			jsonReply(200, openAITextReply)),
		withRequestTimeout(new(base("error_request_timeout", callGenerate, fixtureTextOptions(),
			slowReply(), slowReply(), slowReply()))),
		base("batch_get", callBatchGet, nil, jsonReply(200, openAIBatchJSON("batch_123", "completed",
			`,"output_file_id":"file-out","completed_at":1761303600,"errors":{"object":"list","data":[{"code":"invalid","message":"line 3 failed","line":3},{"code":"invalid","message":"line 4 failed","line":4}]}`))),
		base("batch_list", callBatchList, nil, jsonReply(200, `{"object":"list","data":[`+
			openAIBatchJSON("batch_a", "in_progress", "")+`,`+openAIBatchJSON("batch_b", "cancelling", "")+
			`],"first_id":"batch_a","last_id":"batch_b","has_more":false}`)),
		base("batch_results", callBatchResults, nil, fixtureResponse{
			Headers: map[string]string{"Content-Type": "application/octet-stream"},
			Body: `{"id":"batch_req_1","custom_id":"req-1","response":{"status_code":200,"request_id":"r1","body":` + openAITextReply + `},"error":null}` + "\n" +
				`{"id":"batch_req_2","custom_id":"req-2","response":null,"error":{"code":"rate_limit_exceeded","message":"too many requests"}}` + "\n" +
				`{"id":"batch_req_3","custom_id":"req-3","response":{"status_code":200,"body":"not a completion"},"error":null}` + "\n",
			Status:  200, //nolint:mnd
			DelayMs: 0,
		}),
		base("batch_cancel", callBatchCancel, nil, jsonReply(200, openAIBatchJSON("batch_123", "cancelling", ""))),
		base("batch_cancel_error", callBatchCancel, nil,
			jsonReply(404, openAIError("404", "invalid_request_error", "null", "No batch found"))),
	}

	submit := base("batch_submit", callBatchSubmit, nil,
		jsonReply(200, `{"id":"file-in","object":"file","bytes":512,"created_at":1761300000,"filename":"upload","purpose":"batch","status":"processed"}`),
		jsonReply(200, openAIBatchJSON("batch_1", "validating", "")))
	submit.batch = batchItems

	submitError := base("batch_submit_upload_error", callBatchSubmit, nil,
		jsonReply(400, openAIError("400", "invalid_request_error", "null", "Invalid file format")))
	submitError.batch = batchItems

	envDefaults := base("env_defaults", callGenerate, fixtureTextOptions(), jsonReply(200, openAITextReply))
	envDefaults.env = map[string]string{
		"OPENAI_BASE_URL":   fixtureServerToken + "/env/v1",
		"OPENAI_ORG_ID":     "org-fixture",
		"OPENAI_PROJECT_ID": "proj-fixture",
		"OPENAI_API_KEY":    "ambient-key-not-sent",
	}
	envDefaults.config = func(serverURL string) *ConfigTarget {
		config := openAIFixtureConfig(serverURL)
		config.BaseURL = ""

		return config
	}

	return append(scenarios, submit, submitError, envDefaults)
}

// ---------------------------------------------------------------------------
// Gemini and Vertex AI
// ---------------------------------------------------------------------------

func geminiFixtureConfig(_ string) *ConfigTarget {
	return &ConfigTarget{ //nolint:exhaustruct
		Provider:    "gemini",
		APIKey:      "test-gemini-key",
		Model:       "gemini-test",
		MaxTokens:   1024,
		Temperature: 0.7,
	}
}

func vertexAIFixtureConfig(_ string) *ConfigTarget {
	return &ConfigTarget{ //nolint:exhaustruct
		Provider:    "vertexai",
		APIKey:      "test-vertex-key",
		Model:       "gemini-test",
		ProjectID:   "fixture-project",
		Location:    "us-central1",
		MaxTokens:   1024,
		Temperature: 0.7,
	}
}

const (
	genAITextReply = `{"candidates":[{"content":{"role":"model","parts":[{"text":"Hi there."}]},"finishReason":"STOP","index":0}],` +
		`"usageMetadata":{"promptTokenCount":12,"candidatesTokenCount":4,"totalTokenCount":20,"thoughtsTokenCount":4},` +
		`"modelVersion":"gemini-test-001","responseId":"resp-1"}`

	genAIToolReply = `{"candidates":[{"content":{"role":"model","parts":[` +
		`{"text":"Thinking about it.","thought":true},` +
		`{"text":"Checking."},` +
		`{"functionCall":{"name":"get_weather","args":{"unit":"c","city":"Istanbul","days":2}}},` +
		`{"functionCall":{"name":"ping"}},` +
		`{"inlineData":{"mimeType":"image/png","data":"iVBORw0KGgo="}}]},"finishReason":"STOP"}],` +
		`"usageMetadata":{"promptTokenCount":100,"candidatesTokenCount":20,"totalTokenCount":120}}`
)

func genAIError(code int, status, message string) string {
	return `{"error":{"code":` + jsonNumber(code) + `,"message":"` + message + `","status":"` + status + `"}}`
}

func jsonNumber(value int) string {
	raw, _ := json.Marshal(value)

	return string(raw)
}

func genAIFixtureScenarios(provider string, config func(string) *ConfigTarget) []fixtureScenario {
	base := func(name string, call fixtureCall, opts *GenerateTextOptions, replies ...fixtureResponse) fixtureScenario {
		return fixtureScenario{
			env: nil, config: config, options: opts, batch: nil, setup: nil,
			provider: provider, name: name, call: call, responses: replies,
		}
	}

	budgetOnly := &GenerateTextOptions{ //nolint:exhaustruct
		Messages:       []Message{NewTextMessage(RoleUser, "Think.")},
		ThinkingBudget: fixtureInt(2048),
		ResponseFormat: &ResponseFormat{Type: "json_object", Name: "", JSONSchema: nil},
	}

	effortMax := &GenerateTextOptions{ //nolint:exhaustruct
		Messages:       []Message{NewTextMessage(RoleUser, "Think harder.")},
		Effort:         EffortMax,
		ResponseFormat: &ResponseFormat{Type: "text", Name: "", JSONSchema: nil},
	}

	effortLow := &GenerateTextOptions{ //nolint:exhaustruct
		Messages: []Message{NewTextMessage(RoleUser, "Quick.")},
		Effort:   EffortLow,
	}

	noOptions := &GenerateTextOptions{ //nolint:exhaustruct
		Messages: []Message{NewTextMessage(RoleUser, "Hello")},
	}

	return []fixtureScenario{
		base("generate_text", callGenerate, fixtureTextOptions(), jsonReply(200, genAITextReply)),
		base("generate_no_options", callGenerate, noOptions, jsonReply(200, genAITextReply)),
		base("generate_full_options", callGenerate, fixtureFullOptions(RoleTool), jsonReply(200, genAIToolReply)),
		base("generate_thinking_budget", callGenerate, budgetOnly, jsonReply(200,
			`{"candidates":[{"content":{"role":"model","parts":[{"text":"{}"}]},"finishReason":"MAX_TOKENS"}]}`)),
		base("generate_effort_max", callGenerate, effortMax, jsonReply(200,
			`{"candidates":[{"content":{"role":"model","parts":[{"text":"Partial"}]},"finishReason":"SAFETY"}],`+
				`"usageMetadata":{"promptTokenCount":3,"totalTokenCount":3}}`)),
		base("generate_effort_low", callGenerate, effortLow, jsonReply(200,
			`{"candidates":[{"finishReason":"MALFORMED_FUNCTION_CALL"}]}`)),
		base("generate_blocked_prompt", callGenerate, fixtureTextOptions(), jsonReply(200,
			`{"promptFeedback":{"blockReason":"SAFETY"},"usageMetadata":{"promptTokenCount":3,"totalTokenCount":3}}`)),
		base("stream_text", callStream, fixtureTextOptions(), sseReply(
			sseData(`{"candidates":[{"content":{"role":"model","parts":[{"text":"Hi"}]}}],"usageMetadata":{"promptTokenCount":5,"totalTokenCount":5}}`),
			sseData(`{"candidates":[{"content":{"role":"model","parts":[{"text":" there."}]},"finishReason":"STOP"}],"usageMetadata":{"promptTokenCount":5,"candidatesTokenCount":3,"totalTokenCount":8,"thoughtsTokenCount":1}}`),
		)),
		base("stream_tool_call", callStream, fixtureFullOptions(RoleTool), sseReply(
			sseData(`{"candidates":[{"content":{"role":"model","parts":[{"text":"Checking."},{"functionCall":{"name":"get_weather","args":{"city":"Istanbul"}}}]}}]}`),
			sseData(`{"candidates":[{"content":{"role":"model","parts":[{"text":""}]},"finishReason":"STOP"}],"usageMetadata":{"promptTokenCount":50,"candidatesTokenCount":10,"totalTokenCount":60}}`),
		)),
		base("stream_blocked_prompt", callStream, fixtureTextOptions(), sseReply(
			sseData(`{"promptFeedback":{"blockReason":"PROHIBITED_CONTENT"},"usageMetadata":{"promptTokenCount":3,"totalTokenCount":3}}`),
		)),
		base("stream_no_finish", callStream, fixtureTextOptions(), sseReply(
			sseData(`{"candidates":[{"content":{"role":"model","parts":[{"text":"No end"}]}}]}`),
		)),
		base("stream_error_chunk", callStream, fixtureTextOptions(), sseReply(
			sseData(`{"candidates":[{"content":{"role":"model","parts":[{"text":"Partial"}]}}]}`),
			`{"error": {"code": 500, "message": "Internal error encountered.", "status": "INTERNAL"}}`+"\n\n",
		)),
		base("stream_error_status", callStream, fixtureTextOptions(),
			jsonReply(401, genAIError(401, "UNAUTHENTICATED", "API key not valid."))),
		base("error_bad_request", callGenerate, fixtureTextOptions(),
			jsonReply(400, genAIError(400, "INVALID_ARGUMENT", "Invalid value at 'contents'"))),
		base("error_rate_limited", callGenerate, fixtureTextOptions(),
			jsonReply(429, genAIError(429, "RESOURCE_EXHAUSTED", "Resource has been exhausted"))),
		base("error_plain_text", callGenerate, fixtureTextOptions(), fixtureResponse{
			Headers: map[string]string{"Content-Type": "text/html"},
			Body:    "<html>Service Unavailable</html>",
			Status:  503, //nolint:mnd
			DelayMs: 0,
		}),
	}
}

func geminiFixtureScenarios() []fixtureScenario {
	scenarios := genAIFixtureScenarios("gemini", geminiFixtureConfig)

	for idx := range scenarios {
		scenarios[idx].env = map[string]string{"GOOGLE_GEMINI_BASE_URL": fixtureServerToken}
	}

	return scenarios
}

func vertexAIFixtureScenarios() []fixtureScenario {
	scenarios := genAIFixtureScenarios("vertexai", vertexAIFixtureConfig)

	withoutKey := func(serverURL string) *ConfigTarget {
		config := vertexAIFixtureConfig(serverURL)
		config.APIKey = ""

		return config
	}

	tokenReply := jsonReply(200, `{"access_token":"ya29.fixture-token","expires_in":3599,"token_type":"Bearer"}`)

	serviceAccount := fixtureScenario{
		env: nil, config: withoutKey, options: fixtureTextOptions(), batch: nil,
		setup: func(t *testing.T, env *fixtureEnv) {
			t.Helper()
			t.Setenv("GOOGLE_APPLICATION_CREDENTIALS", writeServiceAccountFile(t, env))
		},
		provider: "vertexai", name: "auth_service_account", call: callGenerateTwice,
		responses: []fixtureResponse{tokenReply, jsonReply(200, genAITextReply), jsonReply(200, genAITextReply)},
	}

	serviceAccountStream := serviceAccount
	serviceAccountStream.name = "auth_service_account_stream"
	serviceAccountStream.call = callStream
	serviceAccountStream.responses = []fixtureResponse{tokenReply, sseReply(
		sseData(`{"candidates":[{"content":{"role":"model","parts":[{"text":"Hi"}]},"finishReason":"STOP"}]}`),
	)}

	tokenError := serviceAccount
	tokenError.name = "auth_service_account_token_error"
	tokenError.call = callGenerate
	tokenError.responses = []fixtureResponse{
		jsonReply(400, `{"error":"invalid_grant","error_description":"Invalid JWT Signature."}`),
	}

	metadataServer := fixtureScenario{
		env: nil, config: withoutKey, options: fixtureTextOptions(), batch: nil,
		setup: func(t *testing.T, env *fixtureEnv) {
			t.Helper()
			t.Setenv("GCE_METADATA_HOST", strings.TrimPrefix(env.serverURL, "http://"))
			t.Setenv("GOOGLE_CLOUD_QUOTA_PROJECT", "quota-from-env")
		},
		provider: "vertexai", name: "auth_metadata_server", call: callGenerate,
		responses: []fixtureResponse{tokenReply, jsonReply(200, genAITextReply)},
	}

	scenarios = append(scenarios, serviceAccount, serviceAccountStream, tokenError, metadataServer)

	for idx := range scenarios {
		scenarios[idx].env = map[string]string{"GOOGLE_VERTEX_BASE_URL": fixtureServerToken}
	}

	return scenarios
}
