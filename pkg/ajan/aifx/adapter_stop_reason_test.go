package aifx

import (
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"google.golang.org/genai"
)

// These tests pin TASK-156: a declined or filtered answer is a refusal and a
// truncated one is max_tokens, on OpenAI and Gemini as on Anthropic. OpenAI
// reports a filter as finish_reason content_filter and a declined structured
// output as message.refusal; Gemini reports a filter as a finish reason such
// as SAFETY, and a blocked prompt as promptFeedback.blockReason with no
// candidates.

// openAIChoiceResponse is a chat completion whose single choice has message
// and finishReason.
func openAIChoiceResponse(t *testing.T, message map[string]any, finishReason string) []byte {
	t.Helper()

	message["role"] = "assistant"

	data, err := json.Marshal(map[string]any{
		"id":      "chatcmpl-test",
		"object":  "chat.completion",
		"created": 1700000000,
		"model":   "gpt-4o",
		"choices": []map[string]any{{
			"index":         0,
			"message":       message,
			"finish_reason": finishReason,
		}},
		"usage": map[string]any{"prompt_tokens": 5, "completion_tokens": 3, "total_tokens": 8},
	})
	if err != nil {
		t.Fatalf("marshal completion: %v", err)
	}

	return data
}

func serveBytes(contentType string, body []byte) *httptest.Server {
	return httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		w.Header().Set("Content-Type", contentType)
		w.WriteHeader(http.StatusOK)
		_, _ = w.Write(body)
	}))
}

func TestOpenAIStopReasonResult(t *testing.T) {
	t.Parallel()

	cases := []struct {
		name         string
		message      map[string]any
		finishReason string
		want         StopReason
		text         string
	}{
		{
			name:         "a content filter is a refusal",
			message:      map[string]any{"content": ""},
			finishReason: "content_filter",
			want:         StopReasonRefusal,
			text:         "",
		},
		{
			name:         "a declined structured output is a refusal, with its text",
			message:      map[string]any{"content": nil, "refusal": "I can't help with that."},
			finishReason: "stop",
			want:         StopReasonRefusal,
			text:         "I can't help with that.",
		},
		{
			name:         "the output limit is max_tokens",
			message:      map[string]any{"content": "cut sho"},
			finishReason: "length",
			want:         StopReasonMaxTokens,
			text:         "cut sho",
		},
		{
			name:         "a normal answer is end_turn",
			message:      map[string]any{"content": "done"},
			finishReason: "stop",
			want:         StopReasonEndTurn,
			text:         "done",
		},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			t.Parallel()

			srv := serveBytes("application/json", openAIChoiceResponse(t, tc.message, tc.finishReason))
			defer srv.Close()

			result, err := makeTestOpenAIModel(t, srv).GenerateText(t.Context(), &GenerateTextOptions{ //nolint:exhaustruct
				Messages: []Message{NewTextMessage(RoleUser, "hi")},
			})
			if err != nil {
				t.Fatalf("GenerateText: %v", err)
			}

			if result.StopReason != tc.want {
				t.Errorf("StopReason = %q, want %q", result.StopReason, tc.want)
			}

			if got := result.Text(); got != tc.text {
				t.Errorf("Text() = %q, want %q", got, tc.text)
			}
		})
	}
}

// openAIStreamBody is an SSE body of chat completion chunks, one per delta,
// with finishReason on the last.
func openAIStreamBody(t *testing.T, finishReason string, deltas ...map[string]any) []byte {
	t.Helper()

	var body strings.Builder

	for idx, delta := range deltas {
		choice := map[string]any{"index": 0, "delta": delta, "finish_reason": nil}
		if idx == len(deltas)-1 {
			choice["finish_reason"] = finishReason
		}

		data, err := json.Marshal(map[string]any{
			"id":      "chatcmpl-test",
			"object":  "chat.completion.chunk",
			"created": 1700000000,
			"model":   "gpt-4o",
			"choices": []map[string]any{choice},
		})
		if err != nil {
			t.Fatalf("marshal chunk: %v", err)
		}

		fmt.Fprintf(&body, "data: %s\n\n", data)
	}

	body.WriteString("data: [DONE]\n\n")

	return []byte(body.String())
}

func TestOpenAIStopReasonStream(t *testing.T) {
	t.Parallel()

	cases := []struct {
		name         string
		finishReason string
		deltas       []map[string]any
		want         StopReason
		text         string
	}{
		{
			name:         "a streamed refusal is a refusal, with its text",
			finishReason: "stop",
			deltas: []map[string]any{
				{"role": "assistant", "refusal": "I can't "},
				{"refusal": "help with that."},
			},
			want: StopReasonRefusal,
			text: "I can't help with that.",
		},
		{
			name:         "a content filter is a refusal",
			finishReason: "content_filter",
			deltas:       []map[string]any{{"role": "assistant", "content": "Partial"}},
			want:         StopReasonRefusal,
			text:         "Partial",
		},
		{
			name:         "the output limit is max_tokens",
			finishReason: "length",
			deltas:       []map[string]any{{"role": "assistant", "content": "cut sho"}},
			want:         StopReasonMaxTokens,
			text:         "cut sho",
		},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			t.Parallel()

			srv := serveBytes("text/event-stream", openAIStreamBody(t, tc.finishReason, tc.deltas...))
			defer srv.Close()

			iter, err := makeTestOpenAIModel(t, srv).StreamText(t.Context(), &StreamTextOptions{ //nolint:exhaustruct
				Messages: []Message{NewTextMessage(RoleUser, "hi")},
			})
			if err != nil {
				t.Fatalf("StreamText: %v", err)
			}

			result, err := iter.Collect()
			if err != nil {
				t.Fatalf("Collect: %v", err)
			}

			if result.StopReason != tc.want {
				t.Errorf("StopReason = %q, want %q", result.StopReason, tc.want)
			}

			if got := result.Text(); got != tc.text {
				t.Errorf("Text() = %q, want %q", got, tc.text)
			}
		})
	}
}

func genAITextCandidate(text string, reason genai.FinishReason) *genai.Candidate {
	var content *genai.Content

	if text != "" {
		content = &genai.Content{Role: genaiRoleModel, Parts: []*genai.Part{{Text: text}}} //nolint:exhaustruct
	}

	return &genai.Candidate{Content: content, FinishReason: reason} //nolint:exhaustruct
}

func genAIBlockedPrompt() *genai.GenerateContentResponse {
	return &genai.GenerateContentResponse{ //nolint:exhaustruct
		PromptFeedback: &genai.GenerateContentResponsePromptFeedback{ //nolint:exhaustruct
			BlockReason: genai.BlockedReasonSafety,
		},
	}
}

func TestMapGenAIResponseStopReason(t *testing.T) {
	t.Parallel()

	toolCall := &genai.Candidate{ //nolint:exhaustruct
		Content: &genai.Content{ //nolint:exhaustruct
			Role: genaiRoleModel,
			Parts: []*genai.Part{{ //nolint:exhaustruct
				FunctionCall: &genai.FunctionCall{Name: "get_weather", Args: map[string]any{"city": "Istanbul"}}, //nolint:exhaustruct
			}},
		},
		FinishReason: genai.FinishReasonStop,
	}

	cases := []struct {
		name string
		resp *genai.GenerateContentResponse
		want StopReason
	}{
		{
			name: "a safety filter is a refusal",
			resp: &genai.GenerateContentResponse{ //nolint:exhaustruct
				Candidates: []*genai.Candidate{genAITextCandidate("Partial", genai.FinishReasonSafety)},
			},
			want: StopReasonRefusal,
		},
		{
			name: "prohibited content is a refusal",
			resp: &genai.GenerateContentResponse{ //nolint:exhaustruct
				Candidates: []*genai.Candidate{genAITextCandidate("", genai.FinishReasonProhibitedContent)},
			},
			want: StopReasonRefusal,
		},
		{
			name: "a blocklist match is a refusal",
			resp: &genai.GenerateContentResponse{ //nolint:exhaustruct
				Candidates: []*genai.Candidate{genAITextCandidate("", genai.FinishReasonBlocklist)},
			},
			want: StopReasonRefusal,
		},
		{
			name: "a blocked prompt is a refusal",
			resp: genAIBlockedPrompt(),
			want: StopReasonRefusal,
		},
		{
			name: "the output limit is max_tokens",
			resp: &genai.GenerateContentResponse{ //nolint:exhaustruct
				Candidates: []*genai.Candidate{genAITextCandidate("cut sho", genai.FinishReasonMaxTokens)},
			},
			want: StopReasonMaxTokens,
		},
		{
			name: "a turn that called a tool is tool_use",
			resp: &genai.GenerateContentResponse{Candidates: []*genai.Candidate{toolCall}}, //nolint:exhaustruct
			want: StopReasonToolUse,
		},
		{
			name: "a normal answer is end_turn",
			resp: &genai.GenerateContentResponse{ //nolint:exhaustruct
				Candidates: []*genai.Candidate{genAITextCandidate("done", genai.FinishReasonStop)},
			},
			want: StopReasonEndTurn,
		},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			t.Parallel()

			result, err := mapGenAIResponse(tc.resp)
			if err != nil {
				t.Fatalf("mapGenAIResponse: %v", err)
			}

			if result.StopReason != tc.want {
				t.Errorf("StopReason = %q, want %q", result.StopReason, tc.want)
			}
		})
	}
}

func TestGenAIStreamStopReason(t *testing.T) {
	t.Parallel()

	functionCall := &genai.GenerateContentResponse{ //nolint:exhaustruct
		Candidates: []*genai.Candidate{{ //nolint:exhaustruct
			Content: &genai.Content{ //nolint:exhaustruct
				Role: genaiRoleModel,
				Parts: []*genai.Part{{ //nolint:exhaustruct
					FunctionCall: &genai.FunctionCall{Name: "get_weather"}, //nolint:exhaustruct
				}},
			},
		}},
	}

	chunk := func(candidate *genai.Candidate) *genai.GenerateContentResponse {
		return &genai.GenerateContentResponse{Candidates: []*genai.Candidate{candidate}} //nolint:exhaustruct
	}

	cases := []struct {
		name   string
		chunks []*genai.GenerateContentResponse
		want   StopReason
	}{
		{
			name: "a filter that blocks the rest of the answer is a refusal",
			chunks: []*genai.GenerateContentResponse{
				chunk(genAITextCandidate("Partial", "")),
				// The filtered chunk has a finish reason and no content.
				chunk(genAITextCandidate("", genai.FinishReasonSafety)),
			},
			want: StopReasonRefusal,
		},
		{
			name:   "a blocked prompt is a refusal",
			chunks: []*genai.GenerateContentResponse{genAIBlockedPrompt()},
			want:   StopReasonRefusal,
		},
		{
			name: "the output limit is max_tokens",
			chunks: []*genai.GenerateContentResponse{
				chunk(genAITextCandidate("cut sho", genai.FinishReasonMaxTokens)),
			},
			want: StopReasonMaxTokens,
		},
		{
			name: "a tool call in an earlier chunk makes the turn tool_use",
			chunks: []*genai.GenerateContentResponse{
				functionCall,
				chunk(genAITextCandidate("", genai.FinishReasonStop)),
			},
			want: StopReasonToolUse,
		},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			t.Parallel()

			events := make(chan StreamEvent, 16)
			mapper := &genAIStreamMapper{calledTool: false}

			for _, resp := range tc.chunks {
				mapper.emit(t.Context(), events, resp)
			}

			close(events)

			result, err := NewStreamIterator(events, func() {}).Collect()
			if err != nil {
				t.Fatalf("Collect: %v", err)
			}

			if result.StopReason != tc.want {
				t.Errorf("StopReason = %q, want %q", result.StopReason, tc.want)
			}
		})
	}
}

// newGenAITestClient builds a Gemini API client that sends to srv.
func newGenAITestClient(t *testing.T, srv *httptest.Server) *genai.Client {
	t.Helper()

	client, err := genai.NewClient(t.Context(), &genai.ClientConfig{ //nolint:exhaustruct
		APIKey:      "test-key",
		Backend:     genai.BackendGeminiAPI,
		HTTPOptions: genai.HTTPOptions{BaseURL: srv.URL}, //nolint:exhaustruct
	})
	if err != nil {
		t.Fatalf("genai.NewClient: %v", err)
	}

	return client
}

// TestGeminiStreamReportsAFilteredAnswer runs the SSE stream end to end: the
// filtered chunk carries no content, and the stream must still end with
// refusal rather than with the empty stop reason sent after the last chunk.
func TestGeminiStreamReportsAFilteredAnswer(t *testing.T) {
	t.Parallel()

	body := "data: " + `{"candidates":[{"content":{"role":"model","parts":[{"text":"Partial"}]}}]}` + "\n\n" +
		"data: " + `{"candidates":[{"finishReason":"SAFETY"}],"usageMetadata":{"promptTokenCount":4,"candidatesTokenCount":1,"totalTokenCount":5}}` + "\n\n"

	srv := serveBytes("text/event-stream", []byte(body))
	defer srv.Close()

	model := &GeminiModel{client: newGenAITestClient(t, srv), modelID: "gemini-test"}

	iter, err := model.StreamText(t.Context(), &StreamTextOptions{ //nolint:exhaustruct
		Messages: []Message{NewTextMessage(RoleUser, "hi")},
	})
	if err != nil {
		t.Fatalf("StreamText: %v", err)
	}

	result, err := iter.Collect()
	if err != nil {
		t.Fatalf("Collect: %v", err)
	}

	if result.StopReason != StopReasonRefusal {
		t.Errorf("StopReason = %q, want %q", result.StopReason, StopReasonRefusal)
	}

	if got := result.Text(); got != "Partial" {
		t.Errorf("Text() = %q, want %q", got, "Partial")
	}

	if result.Usage.TotalTokens != 5 {
		t.Errorf("Usage = %+v, want 5 total tokens", result.Usage)
	}
}
