package aifx_test

import (
	"encoding/json"
	"testing"

	"github.com/eser/stack/pkg/ajan/aifx"
)

func TestNewTextMessage(t *testing.T) {
	t.Parallel()

	msg := aifx.NewTextMessage(aifx.RoleUser, "hello")

	if msg.Role != aifx.RoleUser {
		t.Errorf("expected role %q, got %q", aifx.RoleUser, msg.Role)
	}

	if len(msg.Content) != 1 {
		t.Fatalf("expected 1 content block, got %d", len(msg.Content))
	}

	if msg.Content[0].Type != aifx.ContentBlockText {
		t.Errorf("expected type text, got %q", msg.Content[0].Type)
	}

	if msg.Content[0].Text != "hello" {
		t.Errorf("expected text 'hello', got %q", msg.Content[0].Text)
	}
}

func TestNewImageMessage(t *testing.T) {
	t.Parallel()

	msg := aifx.NewImageMessage(aifx.RoleUser, "https://example.com/img.jpg", aifx.ImageDetailHigh)

	if len(msg.Content) != 1 {
		t.Fatalf("expected 1 content block, got %d", len(msg.Content))
	}

	block := msg.Content[0]
	if block.Type != aifx.ContentBlockImage {
		t.Errorf("expected type image, got %q", block.Type)
	}

	if block.Image == nil {
		t.Fatal("expected non-nil Image part")
	}

	if block.Image.URL != "https://example.com/img.jpg" {
		t.Errorf("unexpected URL: %s", block.Image.URL)
	}

	if block.Image.Detail != aifx.ImageDetailHigh {
		t.Errorf("expected detail high, got %q", block.Image.Detail)
	}
}

func TestNewToolCallBlock(t *testing.T) {
	t.Parallel()

	args := json.RawMessage(`{"query":"go"}`)
	block := aifx.NewToolCallBlock("tc-1", "search", args)

	if block.Type != aifx.ContentBlockToolCall {
		t.Errorf("expected type tool_call, got %q", block.Type)
	}

	if block.ToolCall == nil {
		t.Fatal("expected non-nil ToolCall")
	}

	if block.ToolCall.ID != "tc-1" || block.ToolCall.Name != "search" {
		t.Errorf("unexpected ToolCall fields: %+v", block.ToolCall)
	}
}

func TestNewToolResultBlock(t *testing.T) {
	t.Parallel()

	block := aifx.NewToolResultBlock("tc-1", "result text", false)

	if block.Type != aifx.ContentBlockToolResult {
		t.Errorf("expected type tool_result, got %q", block.Type)
	}

	if block.ToolResult == nil {
		t.Fatal("expected non-nil ToolResult")
	}

	if block.ToolResult.ToolCallID != "tc-1" || block.ToolResult.Content != "result text" {
		t.Errorf("unexpected ToolResult: %+v", block.ToolResult)
	}

	errorBlock := aifx.NewToolResultBlock("tc-2", "err msg", true)
	if !errorBlock.ToolResult.IsError {
		t.Error("expected IsError=true")
	}
}

func TestDecodeDataURL(t *testing.T) {
	t.Parallel()

	tests := []struct {
		name         string
		dataURL      string
		wantMIME     string
		wantData     string
		wantErrMatch string
	}{
		{
			name:     "base64 jpeg",
			dataURL:  "data:image/jpeg;base64,aGVsbG8=",
			wantMIME: "image/jpeg",
			wantData: "hello",
		},
		{
			name:     "plain text",
			dataURL:  "data:text/plain,hello",
			wantMIME: "text/plain",
			wantData: "hello",
		},
		{
			name:     "no mediatype defaults to octet-stream",
			dataURL:  "data:,content",
			wantMIME: "application/octet-stream",
			wantData: "content",
		},
		{
			name:         "missing comma is invalid",
			dataURL:      "data:image/jpeg;base64",
			wantErrMatch: "invalid",
		},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			t.Parallel()

			mime, data, err := aifx.DecodeDataURL(tc.dataURL)

			if tc.wantErrMatch != "" {
				if err == nil {
					t.Fatal("expected error, got nil")
				}

				return
			}

			if err != nil {
				t.Fatalf("unexpected error: %v", err)
			}

			if mime != tc.wantMIME {
				t.Errorf("MIME: want %q, got %q", tc.wantMIME, mime)
			}

			if string(data) != tc.wantData {
				t.Errorf("data: want %q, got %q", tc.wantData, string(data))
			}
		})
	}
}

func TestDetectMIMEFromURL(t *testing.T) {
	t.Parallel()

	tests := []struct {
		url  string
		want string
	}{
		{"https://example.com/photo.jpg", "image/jpeg"},
		{"https://example.com/photo.jpeg", "image/jpeg"},
		{"https://example.com/icon.png", "image/png"},
		{"https://example.com/anim.gif", "image/gif"},
		{"https://example.com/audio.mp3", "audio/mpeg"},
		{"https://example.com/file.pdf", "application/pdf"},
		{"https://example.com/unknown.xyz", "application/octet-stream"},
		{"https://example.com/noext", "application/octet-stream"},
	}

	for _, tc := range tests {
		t.Run(tc.url, func(t *testing.T) {
			t.Parallel()

			got := aifx.DetectMIMEFromURL(tc.url)
			if got != tc.want {
				t.Errorf("want %q, got %q", tc.want, got)
			}
		})
	}
}
