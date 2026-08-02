package aifx

import (
	"testing"
	"time"

	"github.com/anthropics/anthropic-sdk-go"
)

func TestMapAnthropicBatchStatus(t *testing.T) {
	t.Parallel()

	tests := []struct {
		input anthropic.MessageBatchProcessingStatus
		want  BatchStatus
	}{
		{anthropic.MessageBatchProcessingStatusInProgress, BatchStatusProcessing},
		{anthropic.MessageBatchProcessingStatusCanceling, BatchStatusProcessing},
		{anthropic.MessageBatchProcessingStatusEnded, BatchStatusCompleted},
		{"unknown_status", BatchStatusPending},
	}

	for _, tc := range tests {
		t.Run(string(tc.input), func(t *testing.T) {
			t.Parallel()

			got := mapAnthropicBatchStatus(tc.input)
			if got != tc.want {
				t.Errorf("mapAnthropicBatchStatus(%q) = %q, want %q", tc.input, got, tc.want)
			}
		})
	}
}

func TestMapAnthropicBatchJob_InProgress(t *testing.T) {
	t.Parallel()

	now := time.Now().UTC()

	batch := &anthropic.MessageBatch{ //nolint:exhaustruct
		ID:               "batch-1",
		ProcessingStatus: anthropic.MessageBatchProcessingStatusInProgress,
		RequestCounts: anthropic.MessageBatchRequestCounts{
			Processing: 5,
			Succeeded:  3,
			Errored:    1,
			Canceled:   0,
			Expired:    0,
		},
		CreatedAt:  now,
		ResultsURL: "https://api.anthropic.com/v1/batches/batch-1/results",
	}

	job := mapAnthropicBatchJob(batch)

	if job.ID != "batch-1" {
		t.Errorf("expected ID 'batch-1', got %q", job.ID)
	}

	if job.Status != BatchStatusProcessing {
		t.Errorf("expected processing status, got %q", job.Status)
	}

	if job.TotalCount != 9 {
		t.Errorf("expected total 9, got %d", job.TotalCount)
	}

	if job.DoneCount != 3 {
		t.Errorf("expected done 3, got %d", job.DoneCount)
	}

	if job.FailedCount != 1 {
		t.Errorf("expected failed 1, got %d", job.FailedCount)
	}

	if job.CompletedAt != nil {
		t.Error("expected nil CompletedAt for in-progress batch")
	}
}

func TestMapAnthropicBatchJob_Ended(t *testing.T) {
	t.Parallel()

	now := time.Now().UTC()
	endedAt := now.Add(5 * time.Minute)

	batch := &anthropic.MessageBatch{ //nolint:exhaustruct
		ID:               "batch-2",
		ProcessingStatus: anthropic.MessageBatchProcessingStatusEnded,
		RequestCounts: anthropic.MessageBatchRequestCounts{
			Processing: 0,
			Succeeded:  10,
			Errored:    0,
			Canceled:   0,
			Expired:    0,
		},
		CreatedAt: now,
		EndedAt:   endedAt,
	}

	job := mapAnthropicBatchJob(batch)

	if job.Status != BatchStatusCompleted {
		t.Errorf("expected completed status, got %q", job.Status)
	}

	if job.CompletedAt == nil {
		t.Fatal("expected non-nil CompletedAt for ended batch")
	}
}

func TestNewAnthropicUsage(t *testing.T) {
	t.Parallel()

	u := newAnthropicUsage(10, 5)

	if u.InputTokens != 10 {
		t.Errorf("expected 10 input tokens, got %d", u.InputTokens)
	}

	if u.OutputTokens != 5 {
		t.Errorf("expected 5 output tokens, got %d", u.OutputTokens)
	}

	if u.TotalTokens != 15 {
		t.Errorf("expected 15 total tokens, got %d", u.TotalTokens)
	}
}

func TestNewEmptyAnthropicMessage(t *testing.T) {
	t.Parallel()

	msg := newEmptyAnthropicMessage()
	// Just verify it's a zero-value message without panicking.
	_ = msg
}

func TestNewAnthropicBatchRequest(t *testing.T) {
	t.Parallel()

	params := anthropic.MessageNewParams{ //nolint:exhaustruct
		Model:     "claude-opus-4-5",
		MaxTokens: 256,
	}

	req := newAnthropicBatchRequest("req-1", params)

	if req.CustomID != "req-1" {
		t.Errorf("expected custom ID 'req-1', got %q", req.CustomID)
	}

	if req.Params.Model != "claude-opus-4-5" {
		t.Errorf("expected model 'claude-opus-4-5', got %q", req.Params.Model)
	}
}
